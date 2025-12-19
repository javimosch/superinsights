const Event = require('../models/Event');
const { parseSegmentFilters, buildEventMetadataMatch } = require('../utils/segmentFilters');

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

function buildMatch({ projectId, start, end, eventName, metadataMatch }) {
  const match = {
    projectId,
    timestamp: { $gte: start, $lte: end },
  };

  if (eventName) {
    match.eventName = eventName;
  }

  if (metadataMatch && typeof metadataMatch === 'object') {
    Object.assign(match, metadataMatch);
  }

  return match;
}

function buildTimedMatch({ projectId, start, end, eventName, metadataMatch }) {
  const match = buildMatch({ projectId, start, end, eventName, metadataMatch });
  match.durationMs = { $ne: null, $exists: true };
  return match;
}

async function getTimedEventSummary({ projectId, start, end, metadataMatch }) {
  const match = buildTimedMatch({ projectId, start, end, metadataMatch });

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

    return rows || [];
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
          p50Ms: { $literal: null },
          p95Ms: { $literal: null },
        },
      },
      { $sort: { avgMs: -1, maxMs: -1 } },
      { $limit: 10 },
    ]);

    return rows || [];
  }
}

async function getSingleEventDurationSummary({ projectId, start, end, eventName, metadataMatch }) {
  const match = buildTimedMatch({ projectId, start, end, eventName, metadataMatch });

  try {
    const rows = await Event.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
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
          count: 1,
          avgMs: 1,
          maxMs: 1,
          p50Ms: { $arrayElemAt: ['$percentiles', 0] },
          p95Ms: { $arrayElemAt: ['$percentiles', 1] },
        },
      },
    ]);

    return rows && rows.length ? rows[0] : { count: 0, avgMs: null, p50Ms: null, p95Ms: null, maxMs: null };
  } catch (err) {
    const rows = await Event.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          avgMs: { $avg: '$durationMs' },
          maxMs: { $max: '$durationMs' },
        },
      },
      {
        $project: {
          _id: 0,
          count: 1,
          avgMs: 1,
          maxMs: 1,
          p50Ms: { $literal: null },
          p95Ms: { $literal: null },
        },
      },
    ]);

    return rows && rows.length ? rows[0] : { count: 0, avgMs: null, p50Ms: null, p95Ms: null, maxMs: null };
  }
}

async function getEventsByDay({ projectId, start, end, eventName, metadataMatch }) {
  const match = buildMatch({ projectId, start, end, eventName, metadataMatch });

  const rows = await Event.aggregate([
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

async function getTotalEvents({ projectId, start, end, eventName, metadataMatch }) {
  const match = buildMatch({ projectId, start, end, eventName, metadataMatch });
  const total = await Event.countDocuments(match);
  return total || 0;
}

async function getUniqueEventNames({ projectId, start, end, metadataMatch }) {
  const match = buildMatch({ projectId, start, end, metadataMatch });

  const rows = await Event.aggregate([
    { $match: match },
    { $group: { _id: '$eventName' } },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, eventName: '$_id' } },
  ]);

  return (rows || []).map((r) => r.eventName).filter(Boolean);
}

async function getTopEvents({ projectId, start, end, metadataMatch }) {
  const match = buildMatch({ projectId, start, end, metadataMatch });

  const rows = await Event.aggregate([
    { $match: match },
    { $group: { _id: '$eventName', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 },
    { $project: { _id: 0, eventName: '$_id', count: 1 } },
  ]);

  return rows || [];
}

async function getEventPropertySchema({ projectId, eventName, start, end, metadataMatch }) {
  const match = buildMatch({ projectId, start, end, eventName, metadataMatch });

  const rows = await Event.aggregate([
    { $match: match },
    {
      $project: {
        properties: 1,
      },
    },
    {
      $project: {
        kv: {
          $objectToArray: {
            $ifNull: ['$properties', {}],
          },
        },
      },
    },
    { $unwind: '$kv' },
    {
      $group: {
        _id: '$kv.k',
        sampleValues: { $addToSet: '$kv.v' },
      },
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        _id: 0,
        key: '$_id',
        sampleValues: { $slice: ['$sampleValues', 5] },
      },
    },
  ]);

  return rows || [];
}

exports.getEventsAnalytics = async (req, res, next) => {
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

    const rawEventName = typeof req.query.eventName === 'string' ? req.query.eventName.trim() : '';
    const eventName = rawEventName ? rawEventName : undefined;

    const segment = parseSegmentFilters(req);
    const metadataMatch = buildEventMetadataMatch(segment);

    const params = {
      projectId,
      start,
      end,
      eventName,
      metadataMatch,
    };

    const [eventsByDay, totalEvents, uniqueEventNames, topEvents, timedEvents] = await Promise.all([
      getEventsByDay(params),
      getTotalEvents(params),
      getUniqueEventNames({ projectId, start, end, metadataMatch }),
      getTopEvents({ projectId, start, end, metadataMatch }),
      getTimedEventSummary({ projectId, start, end, metadataMatch }),
    ]);

    return res.render('analytics/events', {
      title: 'Events',
      project: req.project,
      projectBasePath: req.projectBasePath || `/projects/${req.project._id.toString()}`,
      timeframe,
      eventName: eventName || '',
      segment,
      eventsByDay: eventsByDay || [],
      totalEvents: totalEvents || 0,
      uniqueEventNames: uniqueEventNames || [],
      topEvents: topEvents || [],
      timedEvents: timedEvents || [],
      currentSection: 'events',
      currentUser: (req.session && req.session.user) || null,
      currentProjectRole: req.userProjectRole || null,
    });
  } catch (err) {
    return next(err);
  }
};

exports.getEventDetail = async (req, res, next) => {
  try {
    if (!req.project || !req.project._id) {
      return res.redirect('/projects');
    }

    const projectId = req.project._id;
    if (!projectId) {
      return next(new Error('Project not found'));
    }

    const eventName = req.params.eventName;

    const rawTimeframe = req.query.timeframe || '7d';
    const { timeframe, start, end } = getDateRange(rawTimeframe);

    const segment = parseSegmentFilters(req);
    const metadataMatch = buildEventMetadataMatch(segment);

    const match = buildMatch({ projectId, start, end, eventName, metadataMatch });

    const [occurrences, propertySchema, eventsByDay, durationSummary] = await Promise.all([
      Event.find(match).sort({ timestamp: -1 }).limit(100),
      getEventPropertySchema({ projectId, eventName, start, end, metadataMatch }),
      getEventsByDay({ projectId, start, end, eventName, metadataMatch }),
      getSingleEventDurationSummary({ projectId, start, end, eventName, metadataMatch }),
    ]);

    return res.render('analytics/event-detail', {
      title: `Event: ${eventName}`,
      project: req.project,
      projectBasePath: req.projectBasePath || `/projects/${req.project._id.toString()}`,
      eventName,
      timeframe,
      segment,
      occurrences: occurrences || [],
      propertySchema: propertySchema || [],
      eventsByDay: eventsByDay || [],
      durationSummary: durationSummary || { count: 0, avgMs: null, p50Ms: null, p95Ms: null, maxMs: null },
      currentSection: 'events',
      currentUser: (req.session && req.session.user) || null,
      currentProjectRole: req.userProjectRole || null,
    });
  } catch (err) {
    return next(err);
  }
};
