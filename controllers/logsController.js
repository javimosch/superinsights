const RawLogEvent = require('../models/RawLogEvent');

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

  if (query.projectId && String(query.projectId).trim()) {
    filter.projectId = String(query.projectId).trim();
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
    const page = parsePositiveInt(req.query.page, 1);
    const limitRaw = parsePositiveInt(req.query.limit, 50);
    const limit = Math.min(Math.max(limitRaw, 10), 200);

    const filter = buildFilter(req.query);

    const [total, rows] = await Promise.all([
      RawLogEvent.countDocuments(filter),
      RawLogEvent.find(filter)
        .sort({ ts: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return res.render('admin/logs', {
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
        { label: 'Platform Admin', href: '/admin' },
        { label: 'Logs', href: '/admin/logs' }
      ]
    });
  } catch (err) {
    return next(err);
  }
};
