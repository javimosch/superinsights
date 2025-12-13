const Event = require('../models/Event');

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

function buildMatch({ projectId, start, end, eventName }) {
  const match = {
    projectId,
    timestamp: { $gte: start, $lte: end },
  };

  if (eventName) {
    match.eventName = eventName;
  }

  return match;
}

async function getEventsByDay({ projectId, start, end, eventName }) {
  const match = buildMatch({ projectId, start, end, eventName });

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

async function getTotalEvents({ projectId, start, end, eventName }) {
  const match = buildMatch({ projectId, start, end, eventName });
  const total = await Event.countDocuments(match);
  return total || 0;
}

async function getUniqueEventNames({ projectId, start, end }) {
  const match = buildMatch({ projectId, start, end });

  const rows = await Event.aggregate([
    { $match: match },
    { $group: { _id: '$eventName' } },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, eventName: '$_id' } },
  ]);

  return (rows || []).map((r) => r.eventName).filter(Boolean);
}

async function getTopEvents({ projectId, start, end }) {
  const match = buildMatch({ projectId, start, end });

  const rows = await Event.aggregate([
    { $match: match },
    { $group: { _id: '$eventName', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 },
    { $project: { _id: 0, eventName: '$_id', count: 1 } },
  ]);

  return rows || [];
}

async function getEventPropertySchema({ projectId, eventName, start, end }) {
  const match = buildMatch({ projectId, start, end, eventName });

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

    const params = {
      projectId,
      start,
      end,
      eventName,
    };

    const [eventsByDay, totalEvents, uniqueEventNames, topEvents] = await Promise.all([
      getEventsByDay(params),
      getTotalEvents(params),
      getUniqueEventNames({ projectId, start, end }),
      getTopEvents({ projectId, start, end }),
    ]);

    return res.render('analytics/events', {
      title: 'Events',
      project: req.project,
      timeframe,
      eventName: eventName || '',
      eventsByDay: eventsByDay || [],
      totalEvents: totalEvents || 0,
      uniqueEventNames: uniqueEventNames || [],
      topEvents: topEvents || [],
      currentUser: req.user,
      currentProjectRole: req.currentProjectRole,
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

    const match = buildMatch({ projectId, start, end, eventName });

    const [occurrences, propertySchema, eventsByDay] = await Promise.all([
      Event.find(match).sort({ timestamp: -1 }).limit(100),
      getEventPropertySchema({ projectId, eventName, start, end }),
      getEventsByDay({ projectId, start, end, eventName }),
    ]);

    return res.render('analytics/event-detail', {
      title: `Event: ${eventName}`,
      project: req.project,
      eventName,
      timeframe,
      occurrences: occurrences || [],
      propertySchema: propertySchema || [],
      eventsByDay: eventsByDay || [],
      currentUser: req.user,
      currentProjectRole: req.currentProjectRole,
    });
  } catch (err) {
    return next(err);
  }
};
