const Report = require('../models/Report');
const FilterTemplate = require('../models/FilterTemplate');

const { enqueueReportGeneration } = require('../utils/reportJobQueue');
const { getDateRange, parseCustomRange } = require('../utils/reportDateRange');
const { services } = require('../utils/saasbackend');
const { logAudit } = require('../utils/auditLogger');
const { ACTION_CODES } = require('../utils/actionCodes');

const REPORT_GENERATION_MIN_INTERVAL_MS = 10 * 1000;
const generationRateLimit = new Map();

function safeStr(v, maxLen) {
  const s = v == null ? '' : String(v);
  if (!maxLen) return s;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
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

    const reports = await Report.find({ projectId: project._id, deletedAt: null })
      .sort({ createdAt: -1 })
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
    const includeAiInsights = Boolean(req.body && req.body.includeAiInsights);

    const range = normalizeRangeFromRequest(req.body || {});
    if (range.error) {
      return res.status(400).json({ error: range.error, code: 'INVALID_RANGE' });
    }

    const filters = parseFiltersFromBody(req.body || {});

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
      includeAiInsights,
      status: 'pending',
      progress: 0,
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

    const json = {
      reportId: String(report._id),
      status: report.status,
      progress: report.progress != null ? report.progress : null,
      message: report.statusMessage || null,
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

    if (!services?.assets?.getAssetBytesById) {
      return res.status(500).render('error', {
        status: 500,
        message: 'Assets service is not available.',
      });
    }

    const result = await services.assets.getAssetBytesById(report.assetId);

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

    const row = await FilterTemplate.create({
      projectId: project._id,
      name,
      description,
      filters,
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
