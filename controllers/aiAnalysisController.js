const OpenAI = require('openai');

const PageView = require('../models/PageView');
const Event = require('../models/Event');
const ErrorModel = require('../models/Error');
const PerformanceMetric = require('../models/PerformanceMetric');
const AiAnalysisRun = require('../models/AiAnalysisRun');
const AiAnalysisPreset = require('../models/AiAnalysisPreset');

const { logAudit } = require('../utils/auditLogger');
const { ACTION_CODES } = require('../utils/actionCodes');
const { isBuiltinPresetId, getBuiltinPreset } = require('../utils/aiAnalysisPresets');
const {
  parseSegmentFilters,
  buildEventMetadataMatch,
  buildPerformanceMetadataMatch,
  buildPageViewMetadataMatch,
  buildErrorMetadataMatch,
} = require('../utils/segmentFilters');

const SAMPLE_LIMITS = {
  maxPatterns: 10,
  maxSamplesPerPattern: 5,
  maxStringLen: 2000,
};

function getDateRange(timeframe) {
  const now = new Date();
  const allowed = ['5m', '30m', '1h', '6h', '12h', '24h', '7d', '30d', '3m', '1y'];
  const tf = allowed.includes(timeframe) ? timeframe : '7d';

  let start;
  if (tf === '5m') {
    start = new Date(now.getTime() - 5 * 60 * 1000);
  } else if (tf === '30m') {
    start = new Date(now.getTime() - 30 * 60 * 1000);
  } else if (tf === '1h') {
    start = new Date(now.getTime() - 60 * 60 * 1000);
  } else if (tf === '6h') {
    start = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  } else if (tf === '12h') {
    start = new Date(now.getTime() - 12 * 60 * 60 * 1000);
  } else if (tf === '24h') {
    start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  } else if (tf === '30d') {
    start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else if (tf === '3m') {
    start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  } else if (tf === '1y') {
    start = new Date(new Date().getFullYear(), 0, 1); // Start of current year
  } else {
    start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }

  return { timeframe: tf, start, end: now };
}

function parseCustomRange({ start, end }) {
  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : null;

  if (!startDate || Number.isNaN(startDate.getTime())) {
    return { error: 'Invalid start date' };
  }

  if (!endDate || Number.isNaN(endDate.getTime())) {
    return { error: 'Invalid end date' };
  }

  if (startDate.getTime() >= endDate.getTime()) {
    return { error: 'Start date must be before end date' };
  }

  const maxRangeMs = 90 * 24 * 60 * 60 * 1000;
  if (endDate.getTime() - startDate.getTime() > maxRangeMs) {
    return { error: 'Range too large (max 90 days)' };
  }

  return { start: startDate, end: endDate };
}

function normalizeRange(req) {
  const rawTimeframe = (req.body && req.body.timeframe) || (req.query && req.query.timeframe) || '7d';
  const mode = (req.body && req.body.mode) || (req.query && req.query.mode) || 'preset';

  if (mode === 'custom') {
    const parsed = parseCustomRange({
      start: req.body && req.body.start,
      end: req.body && req.body.end,
    });

    if (parsed.error) return { error: parsed.error };

    return {
      mode: 'custom',
      timeframe: null,
      start: parsed.start,
      end: parsed.end,
    };
  }

  const { timeframe, start, end } = getDateRange(rawTimeframe);
  return {
    mode: 'preset',
    timeframe,
    start,
    end,
  };
}

function safeStr(v, maxLen) {
  const s = v == null ? '' : String(v);
  if (!maxLen) return s;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k)) {
      out[k] = obj[k];
    }
  }
  return out;
}

function clamp(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

async function buildSamples({ projectId, start, end, aggregates, matchers }) {
  const maxPatterns = SAMPLE_LIMITS.maxPatterns;
  const maxSamples = SAMPLE_LIMITS.maxSamplesPerPattern;

  const m = matchers || {};
  const eventMatch = m.eventMatch || {};
  const pageViewMatch = m.pageViewMatch || {};
  const perfMatch = m.perfMatch || {};
  const errorMatch = m.errorMatch || {};

  const samples = {
    errors: {},
    timedEvents: {},
    events: {},
    pages: {},
    performance: {},
  };

  const errorFingerprints = (aggregates?.errors?.topFingerprints || [])
    .map((r) => r && r.fingerprint)
    .filter(Boolean)
    .slice(0, maxPatterns);

  const timedEventNames = (aggregates?.timedEvents || [])
    .map((r) => r && r.eventName)
    .filter(Boolean)
    .slice(0, maxPatterns);

  const eventNames = (aggregates?.events?.topEvents || [])
    .map((r) => r && r.eventName)
    .filter(Boolean)
    .slice(0, maxPatterns);

  const pageUrls = (aggregates?.pageviews?.topPages || [])
    .map((r) => r && r.url)
    .filter(Boolean)
    .slice(0, maxPatterns);

  const errorTasks = errorFingerprints.map(async (fingerprint) => {
    const rows = await ErrorModel.find({
      projectId,
      timestamp: { $gte: start, $lte: end },
      fingerprint,
      ...errorMatch,
    })
      .sort({ timestamp: -1 })
      .limit(maxSamples)
      .lean();

    samples.errors[fingerprint] = (rows || []).map((e) => ({
      _id: e && e._id ? String(e._id) : null,
      timestamp: e.timestamp,
      message: safeStr(e.message, SAMPLE_LIMITS.maxStringLen),
      errorType: safeStr(e.errorType, 120),
      url: safeStr(e.url, 500),
      stackTrace: safeStr(e.stackTrace, SAMPLE_LIMITS.maxStringLen),
      fingerprint: safeStr(e.fingerprint, 120),
      browser: e.browser || null,
      deviceType: e.deviceType || null,
      os: e.os || null,
      userAgent: safeStr(e.userAgent, 400),
      context: pick(e, ['sessionId', 'clientId', 'utmSource', 'utmMedium', 'utmCampaign']),
    }));
  });

  const timedEventTasks = timedEventNames.map(async (eventName) => {
    const rows = await Event.find({
      projectId,
      timestamp: { $gte: start, $lte: end },
      eventName,
      durationMs: { $ne: null, $exists: true },
      ...eventMatch,
    })
      .sort({ durationMs: -1, timestamp: -1 })
      .limit(maxSamples)
      .lean();

    samples.timedEvents[eventName] = (rows || []).map((ev) => ({
      _id: ev && ev._id ? String(ev._id) : null,
      timestamp: ev.timestamp,
      eventName: safeStr(ev.eventName, 200),
      durationMs: ev.durationMs,
      url: safeStr(ev.url, 500),
      referrer: safeStr(ev.referrer, 500),
      properties: ev.properties || null,
      sessionId: ev.sessionId || null,
      clientId: ev.clientId || null,
      deviceType: ev.deviceType || null,
      browser: ev.browser || null,
      os: ev.os || null,
    }));
  });

  const eventTasks = eventNames.map(async (eventName) => {
    const rows = await Event.find({
      projectId,
      timestamp: { $gte: start, $lte: end },
      eventName,
      ...eventMatch,
    })
      .sort({ timestamp: -1 })
      .limit(maxSamples)
      .lean();

    samples.events[eventName] = (rows || []).map((ev) => ({
      _id: ev && ev._id ? String(ev._id) : null,
      timestamp: ev.timestamp,
      eventName: safeStr(ev.eventName, 200),
      durationMs: ev.durationMs != null ? ev.durationMs : null,
      url: safeStr(ev.url, 500),
      referrer: safeStr(ev.referrer, 500),
      properties: ev.properties || null,
      sessionId: ev.sessionId || null,
      clientId: ev.clientId || null,
      deviceType: ev.deviceType || null,
      browser: ev.browser || null,
      os: ev.os || null,
    }));
  });

  const pageTasks = pageUrls.map(async (url) => {
    const rows = await PageView.find({
      projectId,
      timestamp: { $gte: start, $lte: end },
      url,
      ...pageViewMatch,
    })
      .sort({ timestamp: -1 })
      .limit(maxSamples)
      .lean();

    samples.pages[url] = (rows || []).map((pv) => ({
      _id: pv && pv._id ? String(pv._id) : null,
      timestamp: pv.timestamp,
      url: safeStr(pv.url, 700),
      title: safeStr(pv.title, 300),
      referrer: safeStr(pv.referrer, 700),
      utmSource: pv.utmSource || null,
      utmMedium: pv.utmMedium || null,
      utmCampaign: pv.utmCampaign || null,
      deviceType: pv.deviceType || null,
      browser: pv.browser || null,
      os: pv.os || null,
      sessionId: pv.sessionId || null,
      clientId: pv.clientId || null,
    }));
  });

  const perf = aggregates?.performance;
  const thresholds = {
    lcp: perf && perf.percentiles ? perf.percentiles.lcp_p95 : null,
    cls: perf && perf.percentiles ? perf.percentiles.cls_p95 : null,
    fid: perf && perf.percentiles ? perf.percentiles.fid_p95 : null,
    ttfb: perf && perf.percentiles ? perf.percentiles.ttfb_p95 : null,
  };

  const perfTasks = Object.entries(thresholds)
    .filter(([, v]) => v != null && Number.isFinite(Number(v)))
    .slice(0, maxPatterns)
    .map(async ([metric, threshold]) => {
      const t = Number(threshold);
      const limit = clamp(maxSamples, 1, 20);

      const q = {
        projectId,
        timestamp: { $gte: start, $lte: end },
        ...perfMatch,
      };

      q[metric] = { $gte: t };

      const rows = await PerformanceMetric.find(q)
        .sort({ [metric]: -1, timestamp: -1 })
        .limit(limit)
        .lean();

      samples.performance[`${metric}_gte_p95`] = {
        threshold: t,
        samples: (rows || []).map((m) => ({
          _id: m && m._id ? String(m._id) : null,
          timestamp: m.timestamp,
          url: safeStr(m.url, 700),
          lcp: m.lcp != null ? m.lcp : null,
          cls: m.cls != null ? m.cls : null,
          fid: m.fid != null ? m.fid : null,
          ttfb: m.ttfb != null ? m.ttfb : null,
          deviceType: m.deviceType || null,
          browser: m.browser || null,
          os: m.os || null,
        })),
      };
    });

  await Promise.all([...errorTasks, ...timedEventTasks, ...eventTasks, ...pageTasks, ...perfTasks]);

  return samples;
}

async function buildPageViewsAgg({ projectId, start, end, pageViewMatch }) {
  const match = { projectId, timestamp: { $gte: start, $lte: end }, ...(pageViewMatch || {}) };

  const [totalViews, uniqueRows, viewsByDay, topPages] = await Promise.all([
    PageView.countDocuments(match),
    PageView.aggregate([
      { $match: match },
      { $group: { _id: '$clientId' } },
      { $count: 'uniqueVisitors' },
    ]),
    PageView.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$timestamp',
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: '$_id', count: 1 } },
    ]),
    PageView.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$url',
          views: { $sum: 1 },
          uniqueClientIds: { $addToSet: '$clientId' },
        },
      },
      {
        $project: {
          _id: 0,
          url: '$_id',
          views: 1,
          uniqueVisitors: { $size: '$uniqueClientIds' },
        },
      },
      { $sort: { views: -1 } },
      { $limit: 10 },
    ]),
  ]);

  return {
    totalViews: totalViews || 0,
    uniqueVisitors: uniqueRows && uniqueRows.length ? uniqueRows[0].uniqueVisitors : 0,
    viewsByDay: (viewsByDay || []).slice(0, 90),
    topPages: (topPages || []).map((p) => ({
      url: safeStr(p.url, 300),
      views: p.views || 0,
      uniqueVisitors: p.uniqueVisitors || 0,
    })),
  };
}

async function buildEventsAgg({ projectId, start, end, eventMatch }) {
  const match = { projectId, timestamp: { $gte: start, $lte: end }, ...(eventMatch || {}) };

  const [totalEvents, eventsByDay, topEvents] = await Promise.all([
    Event.countDocuments(match),
    Event.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$timestamp',
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: '$_id', count: 1 } },
    ]),
    Event.aggregate([
      { $match: match },
      { $group: { _id: '$eventName', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $project: { _id: 0, eventName: '$_id', count: 1 } },
    ]),
  ]);

  return {
    totalEvents: totalEvents || 0,
    eventsByDay: (eventsByDay || []).slice(0, 90),
    topEvents: (topEvents || []).map((e) => ({
      eventName: safeStr(e.eventName, 120),
      count: e.count || 0,
    })),
  };
}

async function buildTimedEventsAgg({ projectId, start, end, eventMatch }) {
  const match = {
    projectId,
    timestamp: { $gte: start, $lte: end },
    durationMs: { $ne: null, $exists: true },
    ...(eventMatch || {}),
  };

  try {
    const rows = await Event.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$eventName',
          count: { $sum: 1 },
          avgMs: { $avg: '$durationMs' },
          maxMs: { $max: '$durationMs' },
          percentiles: {
            $percentile: {
              input: '$durationMs',
              p: [0.5, 0.95],
              method: 'approximate',
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          eventName: '$_id',
          count: 1,
          avgMs: 1,
          maxMs: 1,
          p50Ms: { $arrayElemAt: ['$percentiles', 0] },
          p95Ms: { $arrayElemAt: ['$percentiles', 1] },
        },
      },
      { $sort: { p95Ms: -1, avgMs: -1, maxMs: -1 } },
      { $limit: 10 },
    ]);

    return (rows || []).map((r) => ({
      eventName: safeStr(r.eventName, 120),
      count: r.count || 0,
      avgMs: r.avgMs != null ? Math.round(r.avgMs) : null,
      p50Ms: r.p50Ms != null ? Math.round(r.p50Ms) : null,
      p95Ms: r.p95Ms != null ? Math.round(r.p95Ms) : null,
      maxMs: r.maxMs != null ? Math.round(r.maxMs) : null,
    }));
  } catch (err) {
    const rows = await Event.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$eventName',
          count: { $sum: 1 },
          avgMs: { $avg: '$durationMs' },
          maxMs: { $max: '$durationMs' },
        },
      },
      {
        $project: {
          _id: 0,
          eventName: '$_id',
          count: 1,
          avgMs: 1,
          maxMs: 1,
        },
      },
      { $sort: { avgMs: -1, maxMs: -1 } },
      { $limit: 10 },
    ]);

    return (rows || []).map((r) => ({
      eventName: safeStr(r.eventName, 120),
      count: r.count || 0,
      avgMs: r.avgMs != null ? Math.round(r.avgMs) : null,
      p50Ms: null,
      p95Ms: null,
      maxMs: r.maxMs != null ? Math.round(r.maxMs) : null,
    }));
  }
}

async function buildErrorsAgg({ projectId, start, end, errorMatch }) {
  const match = { projectId, timestamp: { $gte: start, $lte: end }, ...(errorMatch || {}) };

  const [totalErrors, uniqueFpRows, errorsByDay, topFingerprints] = await Promise.all([
    ErrorModel.countDocuments(match),
    ErrorModel.aggregate([
      { $match: match },
      { $group: { _id: '$fingerprint' } },
      { $count: 'unique' },
    ]),
    ErrorModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$timestamp',
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: '$_id', count: 1 } },
    ]),
    ErrorModel.aggregate([
      { $match: match },
      { $sort: { timestamp: 1 } },
      {
        $group: {
          _id: '$fingerprint',
          count: { $sum: 1 },
          message: { $first: '$message' },
          errorType: { $first: '$errorType' },
          firstSeen: { $first: '$timestamp' },
          lastSeen: { $last: '$timestamp' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
      {
        $project: {
          _id: 0,
          fingerprint: '$_id',
          count: 1,
          message: 1,
          errorType: 1,
          firstSeen: 1,
          lastSeen: 1,
        },
      },
    ]),
  ]);

  return {
    totalErrors: totalErrors || 0,
    uniqueFingerprints: uniqueFpRows && uniqueFpRows.length ? uniqueFpRows[0].unique : 0,
    errorsByDay: (errorsByDay || []).slice(0, 90),
    topFingerprints: (topFingerprints || []).map((r) => ({
      fingerprint: safeStr(r.fingerprint, 80),
      count: r.count || 0,
      message: safeStr(r.message, 220),
      errorType: safeStr(r.errorType, 80),
      firstSeen: r.firstSeen,
      lastSeen: r.lastSeen,
    })),
  };
}

async function buildPerformanceAgg({ projectId, start, end, perfMatch }) {
  const match = { projectId, timestamp: { $gte: start, $lte: end }, ...(perfMatch || {}) };

  const [totalMeasurements, metricsByDay, percentilesRows] = await Promise.all([
    PerformanceMetric.countDocuments(match),
    PerformanceMetric.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$timestamp',
            },
          },
          lcp: { $avg: '$lcp' },
          cls: { $avg: '$cls' },
          fid: { $avg: '$fid' },
          ttfb: { $avg: '$ttfb' },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: '$_id', lcp: 1, cls: 1, fid: 1, ttfb: 1 } },
    ]),
    PerformanceMetric.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          lcp: {
            $percentile: {
              input: {
                $cond: [{ $and: [{ $ne: ['$lcp', null] }, { $ne: ['$lcp', undefined] }] }, '$lcp', '$$REMOVE'],
              },
              p: [0.5, 0.75, 0.95],
              method: 'approximate',
            },
          },
          cls: {
            $percentile: {
              input: {
                $cond: [{ $and: [{ $ne: ['$cls', null] }, { $ne: ['$cls', undefined] }] }, '$cls', '$$REMOVE'],
              },
              p: [0.5, 0.75, 0.95],
              method: 'approximate',
            },
          },
          fid: {
            $percentile: {
              input: {
                $cond: [{ $and: [{ $ne: ['$fid', null] }, { $ne: ['$fid', undefined] }] }, '$fid', '$$REMOVE'],
              },
              p: [0.5, 0.75, 0.95],
              method: 'approximate',
            },
          },
          ttfb: {
            $percentile: {
              input: {
                $cond: [{ $and: [{ $ne: ['$ttfb', null] }, { $ne: ['$ttfb', undefined] }] }, '$ttfb', '$$REMOVE'],
              },
              p: [0.5, 0.75, 0.95],
              method: 'approximate',
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          lcp_p50: { $arrayElemAt: ['$lcp', 0] },
          lcp_p75: { $arrayElemAt: ['$lcp', 1] },
          lcp_p95: { $arrayElemAt: ['$lcp', 2] },
          cls_p50: { $arrayElemAt: ['$cls', 0] },
          cls_p75: { $arrayElemAt: ['$cls', 1] },
          cls_p95: { $arrayElemAt: ['$cls', 2] },
          fid_p50: { $arrayElemAt: ['$fid', 0] },
          fid_p75: { $arrayElemAt: ['$fid', 1] },
          fid_p95: { $arrayElemAt: ['$fid', 2] },
          ttfb_p50: { $arrayElemAt: ['$ttfb', 0] },
          ttfb_p75: { $arrayElemAt: ['$ttfb', 1] },
          ttfb_p95: { $arrayElemAt: ['$ttfb', 2] },
        },
      },
    ]).catch(() => []),
  ]);

  const percentiles = percentilesRows && percentilesRows.length ? percentilesRows[0] : null;

  return {
    totalMeasurements: totalMeasurements || 0,
    percentiles: percentiles || {
      lcp_p50: null,
      lcp_p75: null,
      lcp_p95: null,
      cls_p50: null,
      cls_p75: null,
      cls_p95: null,
      fid_p50: null,
      fid_p75: null,
      fid_p95: null,
      ttfb_p50: null,
      ttfb_p75: null,
      ttfb_p95: null,
    },
    metricsByDay: (metricsByDay || []).slice(0, 90),
  };
}

async function buildAiPayload({ project, start, end, matchers }) {
  const projectId = project._id;

  const m = matchers || {};

  const [pageviews, events, timedEvents, errors, performance] = await Promise.all([
    buildPageViewsAgg({ projectId, start, end, pageViewMatch: m.pageViewMatch }),
    buildEventsAgg({ projectId, start, end, eventMatch: m.eventMatch }),
    buildTimedEventsAgg({ projectId, start, end, eventMatch: m.eventMatch }),
    buildErrorsAgg({ projectId, start, end, errorMatch: m.errorMatch }),
    buildPerformanceAgg({ projectId, start, end, perfMatch: m.perfMatch }),
  ]);

  const aggregates = { pageviews, events, timedEvents, errors, performance };
  const samples = await buildSamples({ projectId, start, end, aggregates, matchers });

  return {
    meta: {
      projectId: String(project._id),
      projectName: safeStr(project.name, 120),
      environment: safeStr(project.environment, 40),
      start: start.toISOString(),
      end: end.toISOString(),
    },
    pageviews,
    events,
    timedEvents,
    errors,
    performance,
    samples,
  };
}

function buildPrompt(payload) {
  return [
    'You are an expert product analytics and web performance engineer.',
    'Analyze the following SuperInsights project aggregates for the given time range.',
    'Return ONLY Markdown.',
    '',
    'Use these headings (exact):',
    '## Summary',
    '## Highlights / anomalies',
    '## Traffic (Pageviews)',
    '## Product usage (Events)',
    '## Bottlenecks (Timed Events)',
    '## Reliability (Errors)',
    '## Performance (Web Vitals)',
    '## Recommendations (Prioritized)',
    '## Missing instrumentation / Next questions',
    '',
    'Guidelines:',
    '- Be specific and quantitative where possible.',
    '- If data is missing or sparse, say so explicitly and explain what it implies.',
    '- Keep recommendations actionable and prioritized.',
    '',
    'Data JSON:',
    '```json',
    JSON.stringify(payload),
    '```',
    '',
  ].join('\n');
}

async function loadPresetSnapshot({ presetId, actorId }) {
  const pid = presetId != null ? String(presetId).trim() : '';
  if (!pid) return { presetId: null, presetSnapshot: null, promptTemplate: '' };

  if (isBuiltinPresetId(pid)) {
    const builtin = getBuiltinPreset(pid);
    if (!builtin) {
      return { error: 'Preset not found' };
    }

    return {
      presetId: builtin.id,
      presetSnapshot: builtin,
      promptTemplate:
        builtin && builtin.definition && builtin.definition.promptTemplate
          ? String(builtin.definition.promptTemplate)
          : '',
    };
  }

  const preset = await AiAnalysisPreset.findById(pid).lean();
  if (!preset) {
    return { error: 'Preset not found' };
  }

  const isOwner = actorId && String(preset.ownerUserId) === String(actorId);
  const canRead = Boolean(isOwner || preset.visibility === 'public');

  if (!canRead) {
    return { error: 'Forbidden preset' };
  }

  return {
    presetId: String(preset._id),
    presetSnapshot: {
      _id: String(preset._id),
      ownerUserId: preset.ownerUserId ? String(preset.ownerUserId) : null,
      ownerEmail: preset.ownerEmail || null,
      visibility: preset.visibility,
      name: preset.name,
      description: preset.description || '',
      tags: Array.isArray(preset.tags) ? preset.tags : [],
      version: preset.version || 1,
      definition: preset.definition,
      readonly: false,
      createdAt: preset.createdAt,
      updatedAt: preset.updatedAt,
    },
    promptTemplate:
      preset && preset.definition && preset.definition.promptTemplate
        ? String(preset.definition.promptTemplate)
        : '',
  };
}

function getOpenAiClient() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  return new OpenAI({
    apiKey,
    baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
  });
}

async function callLlmMarkdown({ prompt }) {
  const model = process.env.AI_ANALYSIS_MODEL || 'google/gemini-2.5-flash-lite';
  const temperature = process.env.AI_ANALYSIS_TEMPERATURE != null ? Number(process.env.AI_ANALYSIS_TEMPERATURE) : 0.2;
  const maxTokens = process.env.AI_ANALYSIS_MAX_TOKENS != null ? Number(process.env.AI_ANALYSIS_MAX_TOKENS) : 900;
  const timeoutMs = process.env.AI_ANALYSIS_TIMEOUT_MS != null ? Number(process.env.AI_ANALYSIS_TIMEOUT_MS) : 25000;

  const client = getOpenAiClient();

  const controller = new AbortController();
  const t = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const resp = await client.chat.completions.create(
      {
        model,
        temperature: Number.isFinite(temperature) ? temperature : 0.2,
        max_tokens: Number.isFinite(maxTokens) ? maxTokens : 900,
        messages: [
          { role: 'system', content: 'Return ONLY Markdown.' },
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
      markdown: typeof content === 'string' ? content : String(content || ''),
      model,
      usage: resp && resp.usage ? resp.usage : null,
    };
  } finally {
    clearTimeout(t);
  }
}

async function getRecentRuns({ projectId, limit }) {
  const n = typeof limit === 'number' ? limit : 20;
  const rows = await AiAnalysisRun.find({ projectId }).sort({ createdAt: -1 }).limit(n).lean();
  return rows || [];
}

exports.getAiAnalysisRunsJson = async (req, res, next) => {
  try {
    if (!req.project || !req.project._id) {
      return res.status(403).json({ success: false, error: 'Project not found' });
    }

    const projectId = req.project._id;
    const rawLimit = req.query && req.query.limit;
    const limit = rawLimit != null ? Math.max(1, Math.min(100, Number(rawLimit))) : 30;

    const runs = await getRecentRuns({ projectId, limit });
    return res.json({ success: true, data: runs || [] });
  } catch (err) {
    return next(err);
  }
};

exports.getAiAnalysisPage = async (req, res, next) => {
  try {
    if (!req.project || !req.project._id) {
      return res.redirect('/projects');
    }

    const projectId = req.project._id;

    const runs = await getRecentRuns({ projectId, limit: 30 });
    const latest = runs && runs.length ? runs[0] : null;

    return res.render('analytics/ai-analysis', {
      title: 'AI Analysis',
      project: req.project,
      projectBasePath: req.projectBasePath || `/projects/${req.project._id.toString()}`,
      currentSection: 'ai-analysis',
      currentUser: (req.session && req.session.user) || null,
      currentProjectRole: req.userProjectRole || null,
      runs: runs || [],
      latestRun: latest || null,
    });
  } catch (err) {
    return next(err);
  }
};

exports.getAiAnalysisRunJson = async (req, res, next) => {
  try {
    if (!req.project || !req.project._id) {
      return res.status(403).json({ success: false, error: 'Project not found' });
    }

    const runId = req.params.runId;
    const projectId = req.project._id;

    const run = await AiAnalysisRun.findOne({ _id: runId, projectId }).lean();
    if (!run) {
      return res.status(404).json({ success: false, error: 'Run not found' });
    }

    return res.json({ success: true, data: run });
  } catch (err) {
    return next(err);
  }
};

exports.postRunAiAnalysis = async (req, res, next) => {
  const startedAt = Date.now();

  try {
    if (!req.project || !req.project._id) {
      return res.status(400).json({ success: false, error: 'Project not found' });
    }

    const range = normalizeRange(req);
    if (range.error) {
      return res.status(400).json({ success: false, error: range.error });
    }

    const segment = parseSegmentFilters(req);
    const matchers = {
      eventMatch: buildEventMetadataMatch(segment),
      perfMatch: buildPerformanceMetadataMatch(segment),
      pageViewMatch: buildPageViewMetadataMatch(segment),
      errorMatch: buildErrorMetadataMatch(segment),
    };

    const actorId = req?.session?.user?.id;
    const actorEmail = req?.session?.user?.email;

    const presetLoad = await loadPresetSnapshot({
      presetId: req.body && req.body.presetId,
      actorId: actorId ? String(actorId) : null,
    });
    if (presetLoad && presetLoad.error) {
      return res.status(400).json({ success: false, error: presetLoad.error });
    }

    const model = process.env.AI_ANALYSIS_MODEL || 'google/gemini-2.5-flash-lite';

    const run = await AiAnalysisRun.create({
      projectId: req.project._id,
      presetId: presetLoad && presetLoad.presetId ? String(presetLoad.presetId) : null,
      presetSnapshot: presetLoad && presetLoad.presetSnapshot ? presetLoad.presetSnapshot : null,
      createdByUserId: actorId ? String(actorId) : null,
      createdByEmail: actorEmail ? String(actorEmail) : null,
      status: 'running',
      model,
      timeframePreset: range.mode === 'preset' ? range.timeframe : null,
      start: range.start,
      end: range.end,
    });

    try {
      logAudit(ACTION_CODES.AI_ANALYSIS_RUN_STARTED, {
        userId: actorId ? String(actorId) : null,
        email: actorEmail ? String(actorEmail) : null,
        projectId: req.project._id ? String(req.project._id) : null,
        status: 200,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });
    } catch (auditErr) {
      // ignore
    }

    const payload = await buildAiPayload({ project: req.project, start: range.start, end: range.end, matchers });
    const basePrompt = buildPrompt(payload);
    const presetPrompt =
      presetLoad && presetLoad.promptTemplate ? String(presetLoad.promptTemplate).trim() : '';

    const prompt = presetPrompt
      ? [
          basePrompt,
          '',
          '---',
          'Preset focus instructions (apply these priorities):',
          presetPrompt,
          '',
        ].join('\n')
      : basePrompt;

    let llm;
    try {
      llm = await callLlmMarkdown({ prompt });
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      const msg = err && err.message ? err.message : String(err);

      await AiAnalysisRun.updateOne(
        { _id: run._id },
        {
          $set: {
            status: 'failed',
            errorMessage: msg,
            durationMs,
          },
        }
      );

      try {
        logAudit(ACTION_CODES.AI_ANALYSIS_RUN_FAILED, {
          userId: actorId ? String(actorId) : null,
          email: actorEmail ? String(actorEmail) : null,
          projectId: req.project._id ? String(req.project._id) : null,
          status: 500,
          method: req.method,
          path: req.originalUrl,
          ip: req.ip,
        });
      } catch (auditErr) {
        // ignore
      }

      return res.status(500).json({ success: false, error: 'AI analysis failed', details: msg, runId: String(run._id) });
    }

    const durationMs = Date.now() - startedAt;

    await AiAnalysisRun.updateOne(
      { _id: run._id },
      {
        $set: {
          status: 'completed',
          resultMarkdown: llm.markdown,
          errorMessage: null,
          durationMs,
          tokenUsage: llm.usage,
          model: llm.model || model,
        },
      }
    );

    try {
      logAudit(ACTION_CODES.AI_ANALYSIS_RUN_COMPLETED, {
        userId: actorId ? String(actorId) : null,
        email: actorEmail ? String(actorEmail) : null,
        projectId: req.project._id ? String(req.project._id) : null,
        status: 200,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });
    } catch (auditErr) {
      // ignore
    }

    return res.json({
      success: true,
      runId: String(run._id),
      markdown: llm.markdown,
    });
  } catch (err) {
    return next(err);
  }
};
