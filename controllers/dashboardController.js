const PageView = require('../models/PageView');
const Event = require('../models/Event');
const ErrorModel = require('../models/Error');
const PerformanceMetric = require('../models/PerformanceMetric');
const { calculatePerformanceScore } = require('../utils/performanceScore');

const ENABLE_MONGO_PERCENTILE = String(process.env.SUPERINSIGHTS_ENABLE_MONGO_PERCENTILE || '').toLowerCase() === 'true';

let lastPercentileLogTs = 0;
let percentileLogCount = 0;

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

async function getPageViewsSummary({ projectId, start, end }) {
  try {
    const match = {
      projectId,
      timestamp: { $gte: start, $lte: end },
    };

    const [totalViews, uniqueVisitorsAgg, viewsByDayAgg, topPagesAgg] = await Promise.all([
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
          },
        },
        { $sort: { views: -1 } },
        { $limit: 5 },
        { $project: { _id: 0, url: '$_id', views: 1 } },
      ]),
    ]);

    const uniqueVisitors =
      uniqueVisitorsAgg && uniqueVisitorsAgg.length ? uniqueVisitorsAgg[0].uniqueVisitors : 0;

    return {
      totalViews: totalViews || 0,
      uniqueVisitors: uniqueVisitors || 0,
      viewsByDay: viewsByDayAgg || [],
      topPages: topPagesAgg || [],
    };
  } catch (err) {
    console.error('[dashboard] getPageViewsSummary failed', err);
    return {
      totalViews: 0,
      uniqueVisitors: 0,
      viewsByDay: [],
      topPages: [],
    };
  }
}

async function getEventsSummary({ projectId, start, end }) {
  try {
    const match = {
      projectId,
      timestamp: { $gte: start, $lte: end },
    };

    const [totalEvents, eventsByDayAgg, topEventsAgg] = await Promise.all([
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
        { $limit: 5 },
        { $project: { _id: 0, eventName: '$_id', count: 1 } },
      ]),
    ]);

    return {
      totalEvents: totalEvents || 0,
      topEvents: topEventsAgg || [],
      eventsByDay: eventsByDayAgg || [],
    };
  } catch (err) {
    console.error('[dashboard] getEventsSummary failed', err);
    return {
      totalEvents: 0,
      topEvents: [],
      eventsByDay: [],
    };
  }
}

async function getErrorsSummary({ projectId, start, end }) {
  try {
    const match = {
      projectId,
      timestamp: { $gte: start, $lte: end },
    };

    const [totalErrors, uniqueFingerprintsAgg, errorsByDayAgg] = await Promise.all([
      ErrorModel.countDocuments(match),
      ErrorModel.aggregate([
        { $match: match },
        { $group: { _id: '$fingerprint' } },
        { $count: 'uniqueFingerprints' },
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
    ]);

    const uniqueFingerprints =
      uniqueFingerprintsAgg && uniqueFingerprintsAgg.length
        ? uniqueFingerprintsAgg[0].uniqueFingerprints
        : 0;

    return {
      totalErrors: totalErrors || 0,
      uniqueFingerprints: uniqueFingerprints || 0,
      errorsByDay: errorsByDayAgg || [],
    };
  } catch (err) {
    console.error('[dashboard] getErrorsSummary failed', err);
    return {
      totalErrors: 0,
      uniqueFingerprints: 0,
      errorsByDay: [],
    };
  }
}

function percentileFromSortedValues(sortedValues, p) {
  if (!Array.isArray(sortedValues) || !sortedValues.length) return null;
  const clamped = Math.min(Math.max(p, 0), 1);
  const idx = Math.floor(clamped * (sortedValues.length - 1));
  const val = sortedValues[idx];
  return typeof val === 'number' && Number.isFinite(val) ? val : null;
}

async function calculatePercentilesWithPercentileOperator({ projectId, start, end }) {
  const match = {
    projectId,
    timestamp: { $gte: start, $lte: end },
  };

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

async function calculatePercentilesFallback({ projectId, start, end }) {
  const match = {
    projectId,
    timestamp: { $gte: start, $lte: end },
  };

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

async function calculatePercentiles({ projectId, start, end }) {
  if (!ENABLE_MONGO_PERCENTILE) {
    return calculatePercentilesFallback({ projectId, start, end });
  }

  try {
    const result = await calculatePercentilesWithPercentileOperator({
      projectId,
      start,
      end,
    });
    if (!result) return null;
    return result;
  } catch (err) {
    const now = Date.now();
    const shouldLog = now - lastPercentileLogTs > 5 * 60 * 1000;
    if (shouldLog) {
      lastPercentileLogTs = now;
      percentileLogCount += 1;
      console.debug('[dashboard] $percentile aggregation failed, falling back', {
        projectId: String(projectId),
        start,
        end,
        error: err && err.message ? err.message : String(err),
        count: percentileLogCount,
      });
    }

    return calculatePercentilesFallback({ projectId, start, end });
  }
}

async function getMetricsByDay({ projectId, start, end }) {
  const match = {
    projectId,
    timestamp: { $gte: start, $lte: end },
  };

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

async function getPerformanceSummary({ projectId, start, end }) {
  try {
    const match = {
      projectId,
      timestamp: { $gte: start, $lte: end },
    };

    const [percentilesRaw, metricsByDay, totalMeasurements] = await Promise.all([
      calculatePercentiles({ projectId, start, end }),
      getMetricsByDay({ projectId, start, end }),
      PerformanceMetric.countDocuments(match),
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

    return {
      performanceScore,
      percentiles,
      metricsByDay: metricsByDay || [],
      totalMeasurements: totalMeasurements || 0,
    };
  } catch (err) {
    console.error('[dashboard] getPerformanceSummary failed', err);
    return {
      performanceScore: { score: 0, lcpScore: 0, clsScore: 0, fidScore: 0, ttfbScore: 0 },
      percentiles: {
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
      metricsByDay: [],
      totalMeasurements: 0,
    };
  }
}

async function buildDashboardPayload(req) {
  if (!req.project || !req.project._id) {
    return null;
  }

  const projectId = req.project._id;

  const rawTimeframe = req.query.timeframe || '7d';
  const { timeframe, start, end } = getDateRange(rawTimeframe);

  const params = { projectId, start, end };

  const [pageViews, events, errors, performance] = await Promise.all([
    getPageViewsSummary(params),
    getEventsSummary(params),
    getErrorsSummary(params),
    getPerformanceSummary(params),
  ]);

  return {
    timeframe,
    pageViews,
    events,
    errors,
    performance,
  };
}

exports.getDashboard = async (req, res, next) => {
  try {
    if (!req.project || !req.project._id) {
      return res.redirect('/projects');
    }

    const payload = await buildDashboardPayload(req);
    if (!payload) return res.redirect('/projects');

    return res.render('analytics/dashboard', {
      title: 'Dashboard',
      project: req.project,
      timeframe: payload.timeframe,
      pageViews: payload.pageViews,
      events: payload.events,
      errors: payload.errors,
      performance: payload.performance,
      currentUser: req.user,
      currentProjectRole: req.currentProjectRole,
    });
  } catch (err) {
    return next(err);
  }
};

exports.getDashboardData = async (req, res, next) => {
  try {
    if (!req.project || !req.project._id) {
      return res.status(400).json({ success: false, error: 'Project not found' });
    }

    const payload = await buildDashboardPayload(req);
    if (!payload) {
      return res.status(400).json({ success: false, error: 'Project not found' });
    }

    return res.json({
      success: true,
      data: {
        timeframe: payload.timeframe,
        pageViews: payload.pageViews,
        events: payload.events,
        errors: payload.errors,
        performance: payload.performance,
      },
    });
  } catch (err) {
    return next(err);
  }
};
