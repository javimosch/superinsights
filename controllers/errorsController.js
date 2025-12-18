const ErrorModel = require('../models/Error');

function getDateRange(timeframe) {
  const now = new Date();
  const allowed = ['24h', '7d', '30d'];
  const tf = allowed.includes(timeframe) ? timeframe : '7d';

  let start;
  if (tf === '24h') {
    start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  } else if (tf === '30d') {
    start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else {
    start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }

  return { timeframe: tf, start, end: now };
}

function normalizeBrowserFilter(rawBrowser) {
  const allowed = ['Chrome', 'Firefox', 'Safari', 'Edge'];
  if (!rawBrowser || typeof rawBrowser !== 'string') return 'all';
  const trimmed = rawBrowser.trim();
  if (!trimmed || trimmed === 'all') return 'all';
  return allowed.includes(trimmed) ? trimmed : 'all';
}

function normalizeErrorTypeFilter(rawErrorType) {
  if (!rawErrorType || typeof rawErrorType !== 'string') return 'all';
  const trimmed = rawErrorType.trim();
  if (!trimmed || trimmed === 'all') return 'all';
  return trimmed;
}

function buildMatch({ projectId, start, end, browser, fingerprint, errorType }) {
  const match = {
    projectId,
    timestamp: { $gte: start, $lte: end },
  };

  const normalizedBrowser = normalizeBrowserFilter(browser);
  if (normalizedBrowser !== 'all') {
    match.browser = normalizedBrowser;
  }

  if (fingerprint) {
    match.fingerprint = fingerprint;
  }

  const normalizedErrorType = normalizeErrorTypeFilter(errorType);
  if (normalizedErrorType !== 'all') {
    match.errorType = normalizedErrorType;
  }

  return match;
}

async function getErrorsByDay({ projectId, start, end, browser, fingerprint, errorType }) {
  const match = buildMatch({ projectId, start, end, browser, fingerprint, errorType });

  const rows = await ErrorModel.aggregate([
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
  ]);

  return rows || [];
}

async function getTotalErrors({ projectId, start, end, browser, errorType }) {
  const match = buildMatch({ projectId, start, end, browser, errorType });
  const total = await ErrorModel.countDocuments(match);
  return total || 0;
}

async function getGroupedErrors({ projectId, start, end, browser, errorType }) {
  const match = buildMatch({ projectId, start, end, browser, errorType });

  const rows = await ErrorModel.aggregate([
    { $match: match },
    { $sort: { timestamp: 1 } },
    {
      $group: {
        _id: '$fingerprint',
        message: { $first: '$message' },
        browser: { $first: '$browser' },
        os: { $first: '$os' },
        osVersion: { $first: '$osVersion' },
        deviceType: { $first: '$deviceType' },
        firstSeen: { $first: '$timestamp' },
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 50 },
    {
      $project: {
        _id: 0,
        fingerprint: '$_id',
        message: 1,
        browser: 1,
        os: 1,
        osVersion: 1,
        deviceType: 1,
        firstSeen: 1,
        count: 1,
      },
    },
  ]);

  return rows || [];
}

async function getUniqueFingerprints({ projectId, start, end, errorType }) {
  const match = buildMatch({ projectId, start, end, errorType });

  const rows = await ErrorModel.aggregate([
    { $match: match },
    { $group: { _id: '$fingerprint' } },
    { $count: 'unique' },
  ]);

  return rows && rows.length ? rows[0].unique : 0;
}

exports.getErrorsAnalytics = async (req, res, next) => {
  try {
    if (!req.project || !req.project._id) {
      return res.redirect('/projects');
    }

    const projectId = req.project._id;
    if (!projectId) {
      return next(new Error('Project not found'));
    }

    const rawTimeframe = req.query.timeframe || '7d';
    const { timeframe, start, end } = getDateRange(rawTimeframe);

    const browser = normalizeBrowserFilter(req.query.browser);
    const errorType = normalizeErrorTypeFilter(req.query.errorType);

    const params = {
      projectId,
      start,
      end,
      browser: browser === 'all' ? undefined : browser,
      errorType: errorType === 'all' ? undefined : errorType,
    };

    const [errorsByDay, totalErrors, groupedErrors, uniqueFingerprints] = await Promise.all([
      getErrorsByDay(params),
      getTotalErrors(params),
      getGroupedErrors(params),
      getUniqueFingerprints({ projectId, start, end, errorType: params.errorType }),
    ]);

    return res.render('analytics/errors', {
      title: 'Errors',
      project: req.project,
      projectBasePath: req.projectBasePath || `/projects/${req.project._id.toString()}`,
      timeframe,
      browser,
      errorType,
      errorsByDay: errorsByDay || [],
      totalErrors: totalErrors || 0,
      groupedErrors: groupedErrors || [],
      uniqueFingerprints: uniqueFingerprints || 0,
      currentSection: 'errors',
      currentUser: (req.session && req.session.user) || null,
      currentProjectRole: req.userProjectRole || null,
    });
  } catch (err) {
    return next(err);
  }
};

exports.getErrorDetail = async (req, res, next) => {
  try {
    if (!req.project || !req.project._id) {
      return res.redirect('/projects');
    }

    const projectId = req.project._id;
    if (!projectId) {
      return next(new Error('Project not found'));
    }

    const fingerprint = req.params.fingerprint;

    const rawTimeframe = req.query.timeframe || '7d';
    const { timeframe, start, end } = getDateRange(rawTimeframe);

    const match = {
      projectId,
      fingerprint,
      timestamp: { $gte: start, $lte: end },
    };

    const [occurrences, errorsByDay] = await Promise.all([
      ErrorModel.find(match).sort({ timestamp: -1 }).limit(100),
      getErrorsByDay({ projectId, start, end, browser: undefined, fingerprint }),
    ]);

    const rows = occurrences || [];
    const totalOccurrences = rows.length;
    const lastSeen = rows.length ? rows[0].timestamp : null;
    const firstSeen = rows.length ? rows[rows.length - 1].timestamp : null;

    const errorDetails = rows.length ? rows[0] : null;

    return res.render('analytics/error-detail', {
      title: 'Error Detail',
      project: req.project,
      projectBasePath: req.projectBasePath || `/projects/${req.project._id.toString()}`,
      fingerprint,
      timeframe,
      occurrences: rows,
      errorsByDay: errorsByDay || [],
      totalOccurrences,
      firstSeen,
      lastSeen,
      errorDetails,
      currentSection: 'errors',
      currentUser: (req.session && req.session.user) || null,
      currentProjectRole: req.userProjectRole || null,
    });
  } catch (err) {
    return next(err);
  }
};
