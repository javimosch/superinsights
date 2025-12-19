const PerformanceMetric = require('../models/PerformanceMetric');
const { calculatePerformanceScore } = require('../utils/performanceScore');
const { parseSegmentFilters, buildPerformanceMetadataMatch } = require('../utils/segmentFilters');

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

function normalizeDeviceType(rawDeviceType) {
  const allowed = ['desktop', 'mobile', 'tablet'];
  if (!rawDeviceType || typeof rawDeviceType !== 'string') return 'all';
  const trimmed = rawDeviceType.trim();
  if (!trimmed || trimmed === 'all') return 'all';
  return allowed.includes(trimmed) ? trimmed : 'all';
}

function normalizeBrowser(rawBrowser) {
  const allowed = ['Chrome', 'Firefox', 'Safari', 'Edge'];
  if (!rawBrowser || typeof rawBrowser !== 'string') return 'all';
  const trimmed = rawBrowser.trim();
  if (!trimmed || trimmed === 'all') return 'all';
  return allowed.includes(trimmed) ? trimmed : 'all';
}

function buildMatch({ projectId, start, end, deviceType, browser, metadataMatch }) {
  const match = {
    projectId,
    timestamp: { $gte: start, $lte: end },
  };

  const normalizedDeviceType = normalizeDeviceType(deviceType);
  if (normalizedDeviceType !== 'all') {
    match.deviceType = normalizedDeviceType;
  }

  const normalizedBrowser = normalizeBrowser(browser);
  if (normalizedBrowser !== 'all') {
    match.browser = normalizedBrowser;
  }

  if (metadataMatch && typeof metadataMatch === 'object') {
    Object.assign(match, metadataMatch);
  }

  return match;
}

function percentileFromSortedValues(sortedValues, p) {
  if (!Array.isArray(sortedValues) || !sortedValues.length) return null;
  const clamped = Math.min(Math.max(p, 0), 1);
  const idx = Math.floor(clamped * (sortedValues.length - 1));
  const val = sortedValues[idx];
  return typeof val === 'number' && Number.isFinite(val) ? val : null;
}

async function calculatePercentilesWithPercentileOperator({ projectId, start, end, deviceType, browser, metadataMatch }) {
  const match = buildMatch({ projectId, start, end, deviceType, browser, metadataMatch });

  const rows = await PerformanceMetric.aggregate([
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
  ]);

  return rows && rows.length ? rows[0] : null;
}

async function calculatePercentilesFallback({ projectId, start, end, deviceType, browser, metadataMatch }) {
  const match = buildMatch({ projectId, start, end, deviceType, browser, metadataMatch });

  async function getSortedValues(metricField) {
    const rows = await PerformanceMetric.aggregate([
      {
        $match: {
          ...match,
          [metricField]: { $ne: null, $exists: true },
        },
      },
      { $sort: { [metricField]: 1 } },
      { $project: { _id: 0, value: `$${metricField}` } },
    ]);

    return (rows || [])
      .map((r) => r.value)
      .filter((v) => typeof v === 'number' && Number.isFinite(v));
  }

  const [lcpValues, clsValues, fidValues, ttfbValues] = await Promise.all([
    getSortedValues('lcp'),
    getSortedValues('cls'),
    getSortedValues('fid'),
    getSortedValues('ttfb'),
  ]);

  return {
    lcp_p50: percentileFromSortedValues(lcpValues, 0.5),
    lcp_p75: percentileFromSortedValues(lcpValues, 0.75),
    lcp_p95: percentileFromSortedValues(lcpValues, 0.95),
    cls_p50: percentileFromSortedValues(clsValues, 0.5),
    cls_p75: percentileFromSortedValues(clsValues, 0.75),
    cls_p95: percentileFromSortedValues(clsValues, 0.95),
    fid_p50: percentileFromSortedValues(fidValues, 0.5),
    fid_p75: percentileFromSortedValues(fidValues, 0.75),
    fid_p95: percentileFromSortedValues(fidValues, 0.95),
    ttfb_p50: percentileFromSortedValues(ttfbValues, 0.5),
    ttfb_p75: percentileFromSortedValues(ttfbValues, 0.75),
    ttfb_p95: percentileFromSortedValues(ttfbValues, 0.95),
  };
}

async function calculatePercentiles({ projectId, start, end, deviceType, browser, metadataMatch }) {
  try {
    const result = await calculatePercentilesWithPercentileOperator({
      projectId,
      start,
      end,
      deviceType,
      browser,
      metadataMatch,
    });
    if (!result) return null;
    return result;
  } catch (err) {
    console.error('[performance] $percentile aggregation failed, falling back', {
      projectId: String(projectId),
      start,
      end,
      deviceType: deviceType || 'all',
      browser: browser || 'all',
      error: err && err.message ? err.message : String(err),
    });
    return calculatePercentilesFallback({ projectId, start, end, deviceType, browser, metadataMatch });
  }
}

async function getMetricsByDay({ projectId, start, end, deviceType, browser, metadataMatch }) {
  const match = buildMatch({ projectId, start, end, deviceType, browser, metadataMatch });

  const rows = await PerformanceMetric.aggregate([
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
  ]);

  return rows || [];
}

async function getTotalMeasurements({ projectId, start, end, deviceType, browser, metadataMatch }) {
  const match = buildMatch({ projectId, start, end, deviceType, browser, metadataMatch });
  const total = await PerformanceMetric.countDocuments(match);
  return total || 0;
}

async function getCompleteMeasurements({ projectId, start, end, deviceType, browser, metadataMatch }) {
  const match = buildMatch({ projectId, start, end, deviceType, browser, metadataMatch });
  const total = await PerformanceMetric.countDocuments({
    ...match,
    lcp: { $ne: null, $exists: true },
    cls: { $ne: null, $exists: true },
    fid: { $ne: null, $exists: true },
    ttfb: { $ne: null, $exists: true },
  });
  return total || 0;
}

exports.getPerformanceAnalytics = async (req, res, next) => {
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

    const deviceType = normalizeDeviceType(req.query.deviceType);
    const browser = normalizeBrowser(req.query.browser);

    const segment = parseSegmentFilters(req);
    const metadataMatch = buildPerformanceMetadataMatch(segment);

    const params = {
      projectId,
      start,
      end,
      deviceType: deviceType === 'all' ? undefined : deviceType,
      browser: browser === 'all' ? undefined : browser,
      metadataMatch,
    };

    const [percentilesRaw, metricsByDay, totalMeasurements, completeMeasurements] = await Promise.all([
      calculatePercentiles(params),
      getMetricsByDay(params),
      getTotalMeasurements(params),
      getCompleteMeasurements(params),
    ]);

    const percentiles =
      percentilesRaw ||
      {
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
      };

    const performanceScore = calculatePerformanceScore(percentiles);

    const orgName = req.currentOrg ? req.currentOrg.name : 'Organization';

    return res.render('analytics/performance', {
      title: 'Performance Metrics',
      project: req.project,
      projectBasePath: req.projectBasePath || `/projects/${req.project._id.toString()}`,
      timeframe,
      deviceType,
      browser,
      segment,
      percentiles,
      metricsByDay: metricsByDay || [],
      totalMeasurements: totalMeasurements || 0,
      completeMeasurements: completeMeasurements || 0,
      performanceScore,
      currentSection: 'performance',
      currentUser: (req.session && req.session.user) || null,
      currentProjectRole: req.userProjectRole || null,
      breadcrumbs: [
        { label: 'Home', href: '/', icon: 'home' },
        { label: orgName, href: '/org/users' },
        { label: 'Projects', href: '/projects' },
        { label: req.project.name, href: `/projects/${req.project._id}/dashboard` },
        { label: 'Performance', href: `/projects/${req.project._id}/performance` }
      ]
    });
  } catch (err) {
    return next(err);
  }
};
