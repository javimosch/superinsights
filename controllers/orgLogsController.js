const RawLogEvent = require('../models/RawLogEvent');
const Project = require('../models/Project');

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  if (i <= 0) return fallback;
  return i;
}

function buildFilter(query) {
  const filter = {};

  if (query.kind && ['action', 'error'].includes(String(query.kind))) {
    filter.kind = String(query.kind);
  }

  if (query.actionCode && String(query.actionCode).trim()) {
    filter.actionCode = String(query.actionCode).trim();
  }

  if (query.userId && String(query.userId).trim()) {
    filter.userId = String(query.userId).trim();
  }

  if (query.email && String(query.email).trim()) {
    filter.email = String(query.email).trim();
  }

  if (query.contains && String(query.contains).trim()) {
    const q = String(query.contains).trim();
    filter.$or = [
      { errorMessage: { $regex: q, $options: 'i' } },
      { errorStack: { $regex: q, $options: 'i' } },
      { path: { $regex: q, $options: 'i' } },
    ];
  }

  const from = query.from ? new Date(String(query.from)) : null;
  const to = query.to ? new Date(String(query.to)) : null;

  if ((from && !Number.isNaN(from.getTime())) || (to && !Number.isNaN(to.getTime()))) {
    filter.ts = {};
    if (from && !Number.isNaN(from.getTime())) filter.ts.$gte = from;
    if (to && !Number.isNaN(to.getTime())) filter.ts.$lte = to;
  }

  return filter;
}

exports.getLogs = async (req, res, next) => {
  try {
    const orgId = req.currentOrg ? req.currentOrg._id : null;
    if (!orgId) {
      return res.status(403).render('error', {
        status: 403,
        message: 'You must belong to an organization to access this page.',
      });
    }

    const page = parsePositiveInt(req.query.page, 1);
    const limitRaw = parsePositiveInt(req.query.limit, 50);
    const limit = Math.min(Math.max(limitRaw, 10), 200);

    const projects = await Project.find({ deletedAt: null, saasOrgId: orgId }).select('_id').lean();
    const projectIds = (projects || []).map((p) => String(p._id));

    const filter = buildFilter(req.query);

    const requestedProjectId = String(req.query.projectId || '').trim();
    if (requestedProjectId) {
      if (!projectIds.includes(requestedProjectId)) {
        return res.render('org/logs', {
          title: 'Logs - SuperInsights',
          logs: [],
          page,
          limit,
          total: 0,
          totalPages: 1,
          filters: {
            kind: req.query.kind || '',
            actionCode: req.query.actionCode || '',
            userId: req.query.userId || '',
            email: req.query.email || '',
            projectId: req.query.projectId || '',
            contains: req.query.contains || '',
            from: req.query.from || '',
            to: req.query.to || '',
          },
        });
      }
      filter.projectId = requestedProjectId;
    } else {
      filter.projectId = { $in: projectIds };
    }

    const [total, rows] = await Promise.all([
      RawLogEvent.countDocuments(filter),
      RawLogEvent.find(filter)
        .sort({ ts: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    const orgName = req.currentOrg ? req.currentOrg.name : 'Organization';

    return res.render('org/logs', {
      title: 'Logs - SuperInsights',
      logs: rows || [],
      page,
      limit,
      total,
      totalPages,
      filters: {
        kind: req.query.kind || '',
        actionCode: req.query.actionCode || '',
        userId: req.query.userId || '',
        email: req.query.email || '',
        projectId: req.query.projectId || '',
        contains: req.query.contains || '',
        from: req.query.from || '',
        to: req.query.to || '',
      },
      breadcrumbs: [
        { label: 'Home', href: '/', icon: 'home' },
        { label: orgName, href: '/org/users' },
        { label: 'Logs', href: '/org/logs' }
      ]
    });
  } catch (err) {
    return next(err);
  }
};
