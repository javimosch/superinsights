const PageView = require('../models/PageView');
const Event = require('../models/Event');
const ErrorModel = require('../models/Error');
const PerformanceMetric = require('../models/PerformanceMetric');
const AiAnalysisRun = require('../models/AiAnalysisRun');

const {
  buildEventMetadataMatch,
  buildPerformanceMetadataMatch,
  buildPageViewMetadataMatch,
  buildErrorMetadataMatch,
} = require('../utils/segmentFilters');

function safeStr(v, maxLen) {
  const s = v == null ? '' : String(v);
  if (!maxLen) return s;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

async function buildPageViewsAgg({ projectId, start, end, pageViewMatch }) {
  const match = { projectId, timestamp: { $gte: start, $lte: end }, ...(pageViewMatch || {}) };

  const [totalViews, uniqueRows, viewsByDay, topPages] = await Promise.all([
    PageView.countDocuments(match),
    PageView.aggregate([{ $match: match }, { $group: { _id: '$clientId' } }, { $count: 'uniqueVisitors' }]),
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

async function buildErrorsAgg({ projectId, start, end, errorMatch }) {
  const match = { projectId, timestamp: { $gte: start, $lte: end }, ...(errorMatch || {}) };

  const [totalErrors, uniqueFpRows, errorsByDay, topFingerprints] = await Promise.all([
    ErrorModel.countDocuments(match),
    ErrorModel.aggregate([{ $match: match }, { $group: { _id: '$fingerprint' } }, { $count: 'unique' }]),
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

  const [totalMeasurements, percentilesRows] = await Promise.all([
    PerformanceMetric.countDocuments(match),
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
  };
}

async function getLatestAiInsights({ projectId }) {
  const run = await AiAnalysisRun.findOne({ projectId, status: 'completed' }).sort({ createdAt: -1 }).lean();
  if (!run || !run.resultMarkdown) return null;
  return {
    runId: String(run._id),
    createdAt: run.createdAt,
    markdown: String(run.resultMarkdown),
  };
}

async function generateReportContext({ project, range, dataType, filters, includeAiInsights }) {
  const projectId = project._id;

  const matchers = {
    eventMatch: buildEventMetadataMatch(filters),
    perfMatch: buildPerformanceMetadataMatch(filters),
    pageViewMatch: buildPageViewMetadataMatch(filters),
    errorMatch: buildErrorMetadataMatch(filters),
  };

  const need = (t) => dataType === 'all' || dataType === t;

  const [pageviews, events, errors, performance, aiInsights] = await Promise.all([
    need('pageviews') ? buildPageViewsAgg({ projectId, start: range.start, end: range.end, pageViewMatch: matchers.pageViewMatch }) : null,
    need('events') ? buildEventsAgg({ projectId, start: range.start, end: range.end, eventMatch: matchers.eventMatch }) : null,
    need('errors') ? buildErrorsAgg({ projectId, start: range.start, end: range.end, errorMatch: matchers.errorMatch }) : null,
    need('performance') ? buildPerformanceAgg({ projectId, start: range.start, end: range.end, perfMatch: matchers.perfMatch }) : null,
    includeAiInsights ? getLatestAiInsights({ projectId }) : null,
  ]);

  const summary = {
    totalCount:
      (pageviews?.totalViews || 0) +
      (events?.totalEvents || 0) +
      (errors?.totalErrors || 0) +
      (performance?.totalMeasurements || 0),
  };

  return {
    meta: {
      projectId: String(project._id),
      projectName: project.name,
      projectIcon: project.icon,
      environment: project.environment,
      dataType,
      timeframe: range.timeframe || null,
      start: range.start,
      end: range.end,
      generatedAt: new Date(),
    },
    summary,
    pageviews,
    events,
    errors,
    performance,
    aiInsights,
    filters: filters || {},
  };
}

module.exports = {
  generateReportContext,
};
