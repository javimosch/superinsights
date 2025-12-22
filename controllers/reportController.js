const Report = require('../models/Report');
const FilterTemplate = require('../models/FilterTemplate');

const { enqueueReportGeneration } = require('../utils/reportJobQueue');
const { getDateRange, parseCustomRange } = require('../utils/reportDateRange');
const { services } = require('../utils/saasbackend');
const { logAudit } = require('../utils/auditLogger');
const { ACTION_CODES } = require('../utils/actionCodes');

const REPORT_GENERATION_MIN_INTERVAL_MS = 10 * 1000;
const generationRateLimit = new Map();

const REPORT_DOWNLOAD_WINDOW_MS = 60 * 1000;
const REPORT_DOWNLOAD_MAX_PER_WINDOW = 10;
const downloadRateLimit = new Map();

function safeStr(v, maxLen) {
  const s = v == null ? '' : String(v);
  if (!maxLen) return s;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function stableStringify(v) {
  if (v == null) return '';
  if (Array.isArray(v)) {
    return `[${v.map(stableStringify).join(',')}]`;
  }
  if (typeof v === 'object') {
    const keys = Object.keys(v).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

function computeDedupHash({ projectId, dataType, timeframe, startDate, endDate, filters, format, csvMode, includeAiInsights }) {
  const crypto = require('crypto');
  const payload = {
    projectId: String(projectId),
    dataType: String(dataType || ''),
    timeframe: String(timeframe || ''),
    startDate: startDate ? new Date(startDate).toISOString() : null,
    endDate: endDate ? new Date(endDate).toISOString() : null,
    filters: filters || {},
    format: String(format || ''),
    csvMode: csvMode || null,
    includeAiInsights: Boolean(includeAiInsights),
  };
  return crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');
}

function projectRoleAllowsGenerate(role) {
  return role === 'owner' || role === 'admin';
}

function getBasePath(req) {
  return req.projectBasePath || `/projects/${req.project._id.toString()}`;
}

function parseFiltersFromBody(body) {
  if (!body) return {};

  const out = {};

  if (body.clientId != null) out.clientId = safeStr(body.clientId, 200);
  if (body.userId != null) out.userId = safeStr(body.userId, 200);

  if (body.deviceType != null) out.deviceType = safeStr(body.deviceType, 60);
  if (body.browser != null) out.browser = safeStr(body.browser, 120);
  if (body.os != null) out.os = safeStr(body.os, 120);
  if (body.utmSource != null) out.utmSource = safeStr(body.utmSource, 120);
  if (body.utmMedium != null) out.utmMedium = safeStr(body.utmMedium, 120);
  if (body.utmCampaign != null) out.utmCampaign = safeStr(body.utmCampaign, 120);

  if (body.meta && typeof body.meta === 'object' && !Array.isArray(body.meta)) {
    out.meta = body.meta;
  } else if (typeof body.meta === 'string') {
    try {
      const parsed = JSON.parse(body.meta);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) out.meta = parsed;
    } catch (e) {
      // ignore
    }
  }

  return out;
}

function normalizeRangeFromRequest(body) {
  const timeframe = body && body.timeframe ? String(body.timeframe) : '7d';
  const tf = timeframe === 'custom' ? 'custom' : timeframe;

  if (tf === 'custom') {
    const parsed = parseCustomRange({ start: body && body.startDate, end: body && body.endDate });
    if (parsed.error) return { error: parsed.error };
    return {
      timeframe: 'custom',
      start: parsed.start,
      end: parsed.end,
    };
  }

  const { start, end, timeframe: normalized } = getDateRange(tf);
  return {
    timeframe: normalized,
    start,
    end,
  };
}

exports.getReportsPage = async (req, res, next) => {
  try {
    const project = req.project;
    const base = getBasePath(req);

    const qStatus = req.query && req.query.status ? String(req.query.status) : 'all';
    const qSort = req.query && req.query.sort ? String(req.query.sort) : 'created_desc';

    const query = { projectId: project._id, deletedAt: null };
    if (qStatus && qStatus !== 'all') {
      query.status = qStatus;
    }

    let sort = { createdAt: -1 };
    if (qSort === 'created_asc') sort = { createdAt: 1 };
    if (qSort === 'name_asc') sort = { name: 1, createdAt: -1 };
    if (qSort === 'status_asc') sort = { status: 1, createdAt: -1 };

    const reports = await Report.find(query)
      .sort(sort)
      .limit(100)
      .lean();

    const orgName = req.currentOrg ? req.currentOrg.name : 'Organization';

    return res.render('analytics/reports', {
      title: 'Reports',
      project,
      projectBasePath: base,
      currentSection: 'reports',
      currentUser: (req.session && req.session.user) || null,
      currentProjectRole: req.userProjectRole || null,
      reports: reports || [],
      listStatus: qStatus,
      listSort: qSort,
      breadcrumbs: [
        { label: 'Home', href: '/', icon: 'home' },
        { label: orgName, href: '/org/users' },
        { label: 'Projects', href: '/projects' },
        { label: project.name, href: `${base}/dashboard` },
        { label: 'Reports', href: `${base}/reports` },
      ],
    });
  } catch (err) {
    return next(err);
  }
};

exports.getNewReportPage = async (req, res, next) => {
  try {
    const project = req.project;
    const base = getBasePath(req);

    const templates = await FilterTemplate.find({ projectId: project._id }).sort({ createdAt: -1 }).limit(50).lean();

    const orgName = req.currentOrg ? req.currentOrg.name : 'Organization';

    return res.render('analytics/report-new', {
      title: 'Generate report',
      project,
      projectBasePath: base,
      currentSection: 'reports',
      currentUser: (req.session && req.session.user) || null,
      currentProjectRole: req.userProjectRole || null,
      templates: templates || [],
      breadcrumbs: [
        { label: 'Home', href: '/', icon: 'home' },
        { label: orgName, href: '/org/users' },
        { label: 'Projects', href: '/projects' },
        { label: project.name, href: `${base}/dashboard` },
        { label: 'Reports', href: `${base}/reports` },
        { label: 'New', href: `${base}/reports/new` },
      ],
    });
  } catch (err) {
    return next(err);
  }
};

exports.getReportDetailPage = async (req, res, next) => {
  try {
    const project = req.project;
    const base = getBasePath(req);
    const reportId = req.params.reportId;

    const report = await Report.findOne({ _id: reportId, projectId: project._id, deletedAt: null }).lean();
    if (!report) {
      return res.status(404).render('404', { title: 'Not Found - SuperInsights' });
    }

    const orgName = req.currentOrg ? req.currentOrg.name : 'Organization';

    return res.render('analytics/report-detail', {
      title: 'Report',
      project,
      projectBasePath: base,
      currentSection: 'reports',
      currentUser: (req.session && req.session.user) || null,
      currentProjectRole: req.userProjectRole || null,
      report,
      breadcrumbs: [
        { label: 'Home', href: '/', icon: 'home' },
        { label: orgName, href: '/org/users' },
        { label: 'Projects', href: '/projects' },
        { label: project.name, href: `${base}/dashboard` },
        { label: 'Reports', href: `${base}/reports` },
        { label: report.name, href: `${base}/reports/${report._id}` },
      ],
    });
  } catch (err) {
    return next(err);
  }
};

exports.getReportHtmlView = async (req, res, next) => {
  try {
    const project = req.project;
    const base = getBasePath(req);
    const reportId = req.params.reportId;

    const report = await Report.findOne({ _id: reportId, projectId: project._id, deletedAt: null }).lean();
    if (!report) {
      return res.status(404).render('404', { title: 'Not Found - SuperInsights' });
    }

    if (report.status !== 'completed') {
      return res.redirect(`${base}/reports/${report._id}`);
    }

    const ctx = report.contextSnapshot || null;
    if (!ctx) {
      return res.redirect(`${base}/reports/${report._id}`);
    }

    const orgName = req.currentOrg ? req.currentOrg.name : 'Organization';

    return res.render('analytics/report-html', {
      title: `Report: ${report.name}`,
      project,
      projectBasePath: base,
      currentSection: 'reports',
      currentUser: (req.session && req.session.user) || null,
      currentProjectRole: req.userProjectRole || null,
      report,
      context: ctx,
      breadcrumbs: [
        { label: 'Home', href: '/', icon: 'home' },
        { label: orgName, href: '/org/users' },
        { label: 'Projects', href: '/projects' },
        { label: project.name, href: `${base}/dashboard` },
        { label: 'Reports', href: `${base}/reports` },
        { label: report.name, href: `${base}/reports/${report._id}` },
        { label: 'View', href: `${base}/reports/${report._id}/view` },
      ],
    });
  } catch (err) {
    return next(err);
  }
};

exports.postGenerateReport = async (req, res, next) => {
  try {
    const project = req.project;

    if (!projectRoleAllowsGenerate(req.userProjectRole)) {
      return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    const actorId = req?.session?.user?.id ? String(req.session.user.id) : null;
    const now = Date.now();
    const rateKey = `${actorId || 'anon'}:${String(project._id)}`;
    const last = generationRateLimit.get(rateKey) || 0;
    if (now - last < REPORT_GENERATION_MIN_INTERVAL_MS) {
      return res.status(429).json({
        error: 'Rate limited',
        code: 'RATE_LIMIT',
        details: 'Please wait a few seconds before generating another report.',
      });
    }
    generationRateLimit.set(rateKey, now);

    const name = safeStr(req.body && req.body.name ? req.body.name : 'Report', 160);
    const dataType = req.body && req.body.dataType ? String(req.body.dataType) : 'pageviews';
    const format = req.body && req.body.format ? String(req.body.format) : 'pdf';
    const csvMode = req.body && req.body.csvMode ? String(req.body.csvMode) : null;
    const includeAiInsights = Boolean(req.body && req.body.includeAiInsights);
    const filterTemplateId = req.body && req.body.filterTemplateId ? String(req.body.filterTemplateId) : null;

    const range = normalizeRangeFromRequest(req.body || {});
    if (range.error) {
      return res.status(400).json({ error: range.error, code: 'INVALID_RANGE' });
    }

    const filters = parseFiltersFromBody(req.body || {});

    const dedupHash = computeDedupHash({
      projectId: project._id,
      dataType,
      timeframe: range.timeframe,
      startDate: range.start,
      endDate: range.end,
      filters,
      format,
      csvMode,
      includeAiInsights,
    });

    const existing = await Report.findOne({ projectId: project._id, dedupHash, status: { $in: ['pending', 'generating'] }, deletedAt: null })
      .select('_id status')
      .lean();
    if (existing && existing._id) {
      const base = getBasePath(req);
      return res.status(202).json({
        reportId: String(existing._id),
        status: existing.status || 'pending',
        pollingUrl: `${base}/reports/${existing._id}/status`,
        viewUrl: `${base}/reports/${existing._id}`,
        deduplicated: true,
      });
    }

    const report = await Report.create({
      projectId: project._id,
      createdBy: actorId,
      name,
      dataType,
      timeframe: range.timeframe,
      startDate: range.start,
      endDate: range.end,
      filters,
      format,
      csvMode: format === 'csv' ? (csvMode || 'aggregated') : null,
      includeAiInsights,
      status: 'pending',
      progress: 0,
      stages: [],
      currentStage: null,
      statusMessage: 'Queued…',
      dedupHash,
      filterTemplateId,
      deletedAt: null,
    });

    try {
      logAudit(ACTION_CODES.REPORT_GENERATED, {
        userId: actorId,
        email: req?.session?.user?.email,
        projectId: project._id ? String(project._id) : null,
        status: 202,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });
    } catch (e) {
      // ignore
    }

    const orgId = project.saasOrgId;
    enqueueReportGeneration({
      reportId: report._id,
      project,
      orgId,
      actorUserId: actorId,
    });

    const base = getBasePath(req);

    return res.status(202).json({
      reportId: String(report._id),
      status: 'pending',
      pollingUrl: `${base}/reports/${report._id}/status`,
      viewUrl: `${base}/reports/${report._id}`,
      estimatedSeconds: 15,
    });
  } catch (err) {
    return next(err);
  }
};

exports.getReportStatus = async (req, res, next) => {
  try {
    const project = req.project;
    const reportId = req.params.reportId;

    const report = await Report.findOne({ _id: reportId, projectId: project._id, deletedAt: null }).lean();
    if (!report) {
      return res.status(404).json({ error: 'Report not found', code: 'NOT_FOUND' });
    }

    const base = getBasePath(req);

    const startedAt = report.createdAt ? new Date(report.createdAt).getTime() : null;
    const nowMs = Date.now();
    const elapsedSeconds = startedAt ? Math.max(0, Math.floor((nowMs - startedAt) / 1000)) : null;
    const estTotalSeconds = report.estimatedDurationMs ? Math.max(1, Math.ceil(report.estimatedDurationMs / 1000)) : 15;
    const estimatedSecondsRemaining = elapsedSeconds != null ? Math.max(0, estTotalSeconds - elapsedSeconds) : null;

    const json = {
      reportId: String(report._id),
      status: report.status,
      progress: report.progress != null ? report.progress : null,
      message: report.statusMessage || null,
      currentStage: report.currentStage || null,
      stages: report.stages || [],
      elapsedSeconds,
      estimatedSecondsRemaining,
      fileSize: report.fileSize || null,
      generatedAt: report.generatedAt || null,
    };

    if (report.status === 'completed') {
      json.downloadUrl = `${base}/reports/${report._id}/download`;
    }

    return res.json(json);
  } catch (err) {
    return next(err);
  }
};

exports.getReportDownload = async (req, res, next) => {
  try {
    const project = req.project;
    const reportId = req.params.reportId;

    const report = await Report.findOne({ _id: reportId, projectId: project._id, deletedAt: null }).lean();
    if (!report) {
      return res.status(404).render('404', { title: 'Not Found - SuperInsights' });
    }

    if (report.status !== 'completed' || !report.assetId) {
      return res.status(409).render('error', {
        status: 409,
        message: 'Report is not ready for download.',
      });
    }

    if (report.expiresAt && new Date(report.expiresAt).getTime() < Date.now()) {
      return res.status(410).render('error', {
        status: 410,
        message: 'Report has expired. Please regenerate it.',
      });
    }

    const actorId = req?.session?.user?.id ? String(req.session.user.id) : 'anon';
    const dlKey = `${actorId}:${String(project._id)}`;
    const existing = downloadRateLimit.get(dlKey);
    const now = Date.now();
    if (!existing || now - existing.windowStartMs >= REPORT_DOWNLOAD_WINDOW_MS) {
      downloadRateLimit.set(dlKey, { windowStartMs: now, count: 1 });
    } else {
      existing.count += 1;
      if (existing.count > REPORT_DOWNLOAD_MAX_PER_WINDOW) {
        return res.status(429).render('error', {
          status: 429,
          message: 'Rate limited. Please wait before downloading again.',
        });
      }
    }

    if (!services?.assets?.getAssetBytesById) {
      return res.status(500).render('error', {
        status: 500,
        message: 'Assets service is not available.',
      });
    }

    const result = await services.assets.getAssetBytesById(report.assetId);

    const expectedNamespace = `${String(project.saasOrgId)}_${String(project._id)}`;
    const actualNamespace = result?.asset?.namespace;
    if (actualNamespace && String(actualNamespace) !== expectedNamespace) {
      return res.status(403).render('error', {
        status: 403,
        message: 'Forbidden.',
      });
    }

    const filename = result?.asset?.originalName || `${safeStr(report.name, 80)}.${report.format || 'pdf'}`;
    const contentType = result?.contentType || result?.asset?.contentType || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    Report.updateOne({ _id: report._id }, { $inc: { downloadCount: 1 } }).catch(() => {});

    try {
      logAudit(ACTION_CODES.REPORT_DOWNLOADED, {
        userId: req?.session?.user?.id,
        email: req?.session?.user?.email,
        projectId: project._id ? String(project._id) : null,
        status: 200,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });
    } catch (e) {
      // ignore
    }

    return res.send(result.body);
  } catch (err) {
    return next(err);
  }
};

exports.postDeleteReport = async (req, res, next) => {
  try {
    const project = req.project;

    if (!projectRoleAllowsGenerate(req.userProjectRole)) {
      return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    const reportId = req.params.reportId;

    const report = await Report.findOne({ _id: reportId, projectId: project._id, deletedAt: null });
    if (!report) {
      return res.status(404).json({ error: 'Report not found', code: 'NOT_FOUND' });
    }

    report.deletedAt = new Date();
    await report.save();

    try {
      logAudit(ACTION_CODES.REPORT_DELETED, {
        userId: req?.session?.user?.id,
        email: req?.session?.user?.email,
        projectId: project._id ? String(project._id) : null,
        status: 200,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });
    } catch (e) {
      // ignore
    }

    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
};

exports.getFilterTemplatesJson = async (req, res, next) => {
  try {
    const project = req.project;
    const rows = await FilterTemplate.find({ projectId: project._id }).sort({ createdAt: -1 }).limit(100).lean();
    return res.json({ success: true, data: rows || [] });
  } catch (err) {
    return next(err);
  }
};

exports.postCreateFilterTemplate = async (req, res, next) => {
  try {
    const project = req.project;

    if (!projectRoleAllowsGenerate(req.userProjectRole)) {
      return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    const name = safeStr(req.body && req.body.name ? req.body.name : '', 120).trim();
    if (!name) {
      return res.status(400).json({ error: 'Name is required', code: 'INVALID_PARAMS' });
    }

    const description = safeStr(req.body && req.body.description ? req.body.description : '', 500);
    const filters = parseFiltersFromBody(req.body || {});

    const range = normalizeRangeFromRequest(req.body || {});
    if (range.error) {
      return res.status(400).json({ error: range.error, code: 'INVALID_RANGE' });
    }

    const row = await FilterTemplate.create({
      projectId: project._id,
      name,
      description,
      filters,
      timeframe: range.timeframe,
      startDate: range.start,
      endDate: range.end,
      createdBy: req?.session?.user?.id || null,
    });

    return res.status(201).json({ success: true, data: row });
  } catch (err) {
    return next(err);
  }
};

exports.postDeleteFilterTemplate = async (req, res, next) => {
  try {
    const project = req.project;

    if (!projectRoleAllowsGenerate(req.userProjectRole)) {
      return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    const templateId = req.params.templateId;
    await FilterTemplate.deleteOne({ _id: templateId, projectId: project._id });
    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
};
