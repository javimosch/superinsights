const mongoose = require('mongoose');

const OpenAI = require('openai');

const AiAnalysisPreset = require('../models/AiAnalysisPreset');
const { logAudit } = require('../utils/auditLogger');
const { ACTION_CODES } = require('../utils/actionCodes');
const {
  BUILTIN_PRESETS,
  isBuiltinPresetId,
  getBuiltinPreset,
} = require('../utils/aiAnalysisPresets');
const { getModel } = require('../utils/saasbackend');

function safeStr(v, maxLen) {
  const s = v == null ? '' : String(v);
  if (!maxLen) return s;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function getActor(req) {
  const actorId = req?.session?.user?.id;
  const actorEmail = req?.session?.user?.email;
  return {
    actorId: actorId ? String(actorId) : null,
    actorEmail: actorEmail ? String(actorEmail) : null,
  };
}

function audit(req, actionCode, status) {
  try {
    const { actorId, actorEmail } = getActor(req);
    logAudit(actionCode, {
      userId: actorId,
      email: actorEmail,
      status,
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
    });
  } catch (e) {
    // ignore
  }
}

async function getOpenAiClient() {
  const GlobalSetting = getModel('GlobalSetting');
  
  // Try to get API key from global settings first
  const setting = await GlobalSetting.findOne({ key: 'OPENROUTER_API_KEY' }).lean();
  let apiKey = setting && setting.value ? setting.value : null;
  
  // Fallback to environment variable if not found in global settings
  if (!apiKey) {
    apiKey = process.env.OPENROUTER_API_KEY;
  }
  
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured in global settings or environment');
  }

  return new OpenAI({
    apiKey,
    baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
  });
}

async function callPresetJsonFromLlm({ prompt }) {
  const model = process.env.AI_ANALYSIS_MODEL || 'google/gemini-2.5-flash-lite';
  const temperature = process.env.AI_ANALYSIS_TEMPERATURE != null ? Number(process.env.AI_ANALYSIS_TEMPERATURE) : 0.2;
  const maxTokens = process.env.AI_ANALYSIS_MAX_TOKENS != null ? Number(process.env.AI_ANALYSIS_MAX_TOKENS) : 900;
  const timeoutMs = process.env.AI_ANALYSIS_TIMEOUT_MS != null ? Number(process.env.AI_ANALYSIS_TIMEOUT_MS) : 25000;

  const client = await getOpenAiClient();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await client.chat.completions.create(
      {
        model,
        temperature: Number.isFinite(temperature) ? temperature : 0.2,
        max_tokens: Number.isFinite(maxTokens) ? maxTokens : 900,
        messages: [
          { role: 'system', content: 'Return ONLY JSON. No Markdown. No code fences.' },
          { role: 'user', content: prompt },
        ],
      },
      { signal: controller.signal }
    );

    const content =
      resp && resp.choices && resp.choices[0] && resp.choices[0].message
        ? resp.choices[0].message.content
        : '';

    return {
      model,
      text: typeof content === 'string' ? content : String(content || ''),
      usage: resp && resp.usage ? resp.usage : null,
    };
  } finally {
    clearTimeout(t);
  }
}

function parseJsonStrict(text) {
  const raw = (text || '').trim();
  if (!raw) return { error: 'Empty LLM response' };

  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return { error: 'LLM response did not contain JSON object' };
  }

  const slice = raw.slice(start, end + 1);
  try {
    return { value: JSON.parse(slice) };
  } catch (e) {
    return { error: 'Failed to parse JSON from LLM response' };
  }
}

function validatePresetJson(preset) {
  if (!preset || typeof preset !== 'object') {
    return { error: 'Preset must be an object' };
  }

  const name = safeStr(preset.name, 120).trim();
  const description = safeStr(preset.description, 1000).trim();
  const visibility = preset.visibility === 'public' ? 'public' : 'private';
  const definition = preset.definition;

  if (!name) return { error: 'Preset JSON missing name' };
  if (!definition || typeof definition !== 'object') return { error: 'Preset JSON missing definition object' };

  const promptTemplate = definition.promptTemplate != null ? String(definition.promptTemplate) : '';
  const focusAreas = Array.isArray(definition.focusAreas)
    ? definition.focusAreas.map((x) => safeStr(x, 40)).filter(Boolean)
    : [];

  const normalized = {
    name,
    description,
    visibility,
    definition: {
      ...definition,
      promptTemplate: safeStr(promptTemplate, 4000),
      focusAreas,
    },
  };

  return { value: normalized };
}

function normalizePresetResponse(doc) {
  if (!doc) return null;
  return {
    _id: String(doc._id),
    ownerUserId: doc.ownerUserId ? String(doc.ownerUserId) : null,
    ownerEmail: doc.ownerEmail || null,
    visibility: doc.visibility,
    name: doc.name,
    description: doc.description || '',
    tags: Array.isArray(doc.tags) ? doc.tags : [],
    version: doc.version || 1,
    definition: doc.definition,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    readonly: false,
  };
}

exports.getPresets = async (req, res, next) => {
  try {
    const { actorId } = getActor(req);
    if (!actorId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const ownerObjectId = new mongoose.Types.ObjectId(actorId);

    const [mine, publicOthers] = await Promise.all([
      AiAnalysisPreset.find({ ownerUserId: ownerObjectId }).sort({ updatedAt: -1 }).lean(),
      AiAnalysisPreset.find({ visibility: 'public', ownerUserId: { $ne: ownerObjectId } })
        .sort({ updatedAt: -1 })
        .limit(200)
        .lean(),
    ]);

    const builtins = BUILTIN_PRESETS;

    return res.json({
      success: true,
      data: {
        builtins,
        mine: (mine || []).map(normalizePresetResponse),
        public: (publicOthers || []).map(normalizePresetResponse),
      },
    });
  } catch (err) {
    return next(err);
  }
};

exports.getPreset = async (req, res, next) => {
  try {
    const { actorId } = getActor(req);
    if (!actorId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const presetId = req.params.presetId;

    if (isBuiltinPresetId(presetId)) {
      const p = getBuiltinPreset(presetId);
      if (!p) return res.status(404).json({ success: false, error: 'Preset not found' });
      return res.json({ success: true, data: p });
    }

    const preset = await AiAnalysisPreset.findById(presetId).lean();
    if (!preset) {
      return res.status(404).json({ success: false, error: 'Preset not found' });
    }

    const isOwner = String(preset.ownerUserId) === String(actorId);
    const canRead = isOwner || preset.visibility === 'public';

    if (!canRead) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    return res.json({ success: true, data: normalizePresetResponse(preset) });
  } catch (err) {
    return next(err);
  }
};

exports.postCreatePreset = async (req, res, next) => {
  try {
    const { actorId, actorEmail } = getActor(req);
    if (!actorId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const name = safeStr(req.body && req.body.name, 120).trim();
    const description = safeStr(req.body && req.body.description, 1000).trim();
    const visibility = req.body && req.body.visibility === 'public' ? 'public' : 'private';
    const definition = req.body && req.body.definition;

    if (!name) {
      audit(req, ACTION_CODES.AI_ANALYSIS_PRESET_CREATED, 400);
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    if (!definition || typeof definition !== 'object') {
      audit(req, ACTION_CODES.AI_ANALYSIS_PRESET_CREATED, 400);
      return res.status(400).json({ success: false, error: 'definition is required (object)' });
    }

    const preset = await AiAnalysisPreset.create({
      ownerUserId: new mongoose.Types.ObjectId(actorId),
      ownerEmail: actorEmail,
      visibility,
      name,
      description,
      tags: Array.isArray(req.body && req.body.tags) ? req.body.tags.map((t) => safeStr(t, 40)).filter(Boolean) : [],
      version: 1,
      definition,
    });

    audit(req, ACTION_CODES.AI_ANALYSIS_PRESET_CREATED, 200);

    return res.json({ success: true, data: normalizePresetResponse(preset.toObject()) });
  } catch (err) {
    return next(err);
  }
};

exports.postAiGeneratePreset = async (req, res, next) => {
  try {
    const { actorId, actorEmail } = getActor(req);
    if (!actorId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const goal = safeStr(req.body && req.body.goal, 2000).trim();
    const visibility = req.body && req.body.visibility === 'public' ? 'public' : 'private';

    if (!goal) {
      audit(req, ACTION_CODES.AI_ANALYSIS_PRESET_AI_GENERATED, 400);
      return res.status(400).json({ success: false, error: 'goal is required' });
    }

    const prompt = [
      'Create a SuperInsights AI Analysis preset as strict JSON.',
      'Return ONLY a JSON object. Do not include Markdown. Do not include code fences.',
      '',
      'User goal:',
      goal,
      '',
      'JSON schema:',
      '{',
      '  "name": string,',
      '  "description": string,',
      '  "visibility": "private"|"public",',
      '  "definition": {',
      '    "focusAreas": string[],',
      '    "promptTemplate": string',
      '  }',
      '}',
      '',
      'Guidelines:',
      '- Make the preset specific and actionable.',
      '- If ecommerce-related, include instruction to infer candidate conversion events from event names/properties.',
      '- Keep promptTemplate concise but specific.',
      '',
      `Set visibility to "${visibility}".`,
    ].join('\n');

    const llm = await callPresetJsonFromLlm({ prompt });
    const parsed = parseJsonStrict(llm.text);
    if (parsed.error) {
      audit(req, ACTION_CODES.AI_ANALYSIS_PRESET_AI_GENERATED, 500);
      return res.status(500).json({ success: false, error: parsed.error });
    }

    const validated = validatePresetJson(parsed.value);
    if (validated.error) {
      audit(req, ACTION_CODES.AI_ANALYSIS_PRESET_AI_GENERATED, 500);
      return res.status(500).json({ success: false, error: validated.error });
    }

    const preset = await AiAnalysisPreset.create({
      ownerUserId: new mongoose.Types.ObjectId(actorId),
      ownerEmail: actorEmail,
      visibility: validated.value.visibility,
      name: validated.value.name,
      description: validated.value.description,
      tags: [],
      version: 1,
      definition: validated.value.definition,
    });

    audit(req, ACTION_CODES.AI_ANALYSIS_PRESET_AI_GENERATED, 200);

    return res.json({
      success: true,
      data: normalizePresetResponse(preset.toObject()),
    });
  } catch (err) {
    return next(err);
  }
};

exports.postAiRefinePreset = async (req, res, next) => {
  try {
    const { actorId } = getActor(req);
    if (!actorId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const presetId = req.params.presetId;
    if (isBuiltinPresetId(presetId)) {
      return res.status(403).json({ success: false, error: 'Builtin presets are read-only' });
    }

    const goal = safeStr(req.body && req.body.goal, 2000).trim();
    if (!goal) {
      audit(req, ACTION_CODES.AI_ANALYSIS_PRESET_AI_REFINED, 400);
      return res.status(400).json({ success: false, error: 'goal is required' });
    }

    const preset = await AiAnalysisPreset.findById(presetId);
    if (!preset) {
      return res.status(404).json({ success: false, error: 'Preset not found' });
    }

    if (String(preset.ownerUserId) !== String(actorId)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const currentJson = {
      name: preset.name,
      description: preset.description || '',
      visibility: preset.visibility,
      definition: preset.definition,
    };

    const prompt = [
      'Refine an existing SuperInsights AI Analysis preset as strict JSON.',
      'Return ONLY a JSON object. Do not include Markdown. Do not include code fences.',
      '',
      'User refinement goal:',
      goal,
      '',
      'Current preset JSON:',
      JSON.stringify(currentJson),
      '',
      'Return the FULL updated preset JSON with the same schema:',
      '{"name": string, "description": string, "visibility": "private"|"public", "definition": {"focusAreas": string[], "promptTemplate": string}}',
    ].join('\n');

    const llm = await callPresetJsonFromLlm({ prompt });
    const parsed = parseJsonStrict(llm.text);
    if (parsed.error) {
      audit(req, ACTION_CODES.AI_ANALYSIS_PRESET_AI_REFINED, 500);
      return res.status(500).json({ success: false, error: parsed.error });
    }

    const validated = validatePresetJson(parsed.value);
    if (validated.error) {
      audit(req, ACTION_CODES.AI_ANALYSIS_PRESET_AI_REFINED, 500);
      return res.status(500).json({ success: false, error: validated.error });
    }

    preset.name = validated.value.name;
    preset.description = validated.value.description;
    preset.visibility = validated.value.visibility;
    preset.definition = validated.value.definition;
    preset.version = (preset.version || 1) + 1;
    await preset.save();

    audit(req, ACTION_CODES.AI_ANALYSIS_PRESET_AI_REFINED, 200);

    return res.json({ success: true, data: normalizePresetResponse(preset.toObject()) });
  } catch (err) {
    return next(err);
  }
};

exports.putUpdatePreset = async (req, res, next) => {
  try {
    const { actorId } = getActor(req);
    if (!actorId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const presetId = req.params.presetId;
    if (isBuiltinPresetId(presetId)) {
      return res.status(403).json({ success: false, error: 'Builtin presets are read-only' });
    }

    const preset = await AiAnalysisPreset.findById(presetId);
    if (!preset) {
      return res.status(404).json({ success: false, error: 'Preset not found' });
    }

    if (String(preset.ownerUserId) !== String(actorId)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const name = safeStr(req.body && req.body.name, 120).trim();
    const description = safeStr(req.body && req.body.description, 1000).trim();
    const definition = req.body && req.body.definition;

    if (!name) {
      audit(req, ACTION_CODES.AI_ANALYSIS_PRESET_UPDATED, 400);
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    if (!definition || typeof definition !== 'object') {
      audit(req, ACTION_CODES.AI_ANALYSIS_PRESET_UPDATED, 400);
      return res.status(400).json({ success: false, error: 'definition is required (object)' });
    }

    preset.name = name;
    preset.description = description;
    preset.definition = definition;
    preset.tags = Array.isArray(req.body && req.body.tags) ? req.body.tags.map((t) => safeStr(t, 40)).filter(Boolean) : [];
    preset.version = (preset.version || 1) + 1;

    await preset.save();

    audit(req, ACTION_CODES.AI_ANALYSIS_PRESET_UPDATED, 200);

    return res.json({ success: true, data: normalizePresetResponse(preset.toObject()) });
  } catch (err) {
    return next(err);
  }
};

exports.deletePreset = async (req, res, next) => {
  try {
    const { actorId } = getActor(req);
    if (!actorId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const presetId = req.params.presetId;
    if (isBuiltinPresetId(presetId)) {
      return res.status(403).json({ success: false, error: 'Builtin presets are read-only' });
    }

    const preset = await AiAnalysisPreset.findById(presetId);
    if (!preset) {
      return res.status(404).json({ success: false, error: 'Preset not found' });
    }

    if (String(preset.ownerUserId) !== String(actorId)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    await preset.deleteOne();

    audit(req, ACTION_CODES.AI_ANALYSIS_PRESET_DELETED, 200);

    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
};

exports.postPublishPreset = async (req, res, next) => {
  try {
    const { actorId } = getActor(req);
    if (!actorId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const presetId = req.params.presetId;
    if (isBuiltinPresetId(presetId)) {
      return res.status(403).json({ success: false, error: 'Builtin presets are read-only' });
    }

    const preset = await AiAnalysisPreset.findById(presetId);
    if (!preset) {
      return res.status(404).json({ success: false, error: 'Preset not found' });
    }

    if (String(preset.ownerUserId) !== String(actorId)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    preset.visibility = 'public';
    preset.version = (preset.version || 1) + 1;
    await preset.save();

    audit(req, ACTION_CODES.AI_ANALYSIS_PRESET_PUBLISHED, 200);

    return res.json({ success: true, data: normalizePresetResponse(preset.toObject()) });
  } catch (err) {
    return next(err);
  }
};

exports.postUnpublishPreset = async (req, res, next) => {
  try {
    const { actorId } = getActor(req);
    if (!actorId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const presetId = req.params.presetId;
    if (isBuiltinPresetId(presetId)) {
      return res.status(403).json({ success: false, error: 'Builtin presets are read-only' });
    }

    const preset = await AiAnalysisPreset.findById(presetId);
    if (!preset) {
      return res.status(404).json({ success: false, error: 'Preset not found' });
    }

    if (String(preset.ownerUserId) !== String(actorId)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    preset.visibility = 'private';
    preset.version = (preset.version || 1) + 1;
    await preset.save();

    audit(req, ACTION_CODES.AI_ANALYSIS_PRESET_UNPUBLISHED, 200);

    return res.json({ success: true, data: normalizePresetResponse(preset.toObject()) });
  } catch (err) {
    return next(err);
  }
};

exports._internals = {
  isBuiltinPresetId,
  getBuiltinPreset,
  BUILTIN_PRESETS,
};
