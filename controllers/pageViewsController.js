const PageView = require('../models/PageView');

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

function buildMatch({ projectId, start, end, deviceType, urlPrefix }) {
  const match = {
    projectId,
    timestamp: { $gte: start, $lte: end },
  };

  const allowedDeviceTypes = ['desktop', 'mobile', 'tablet'];
  if (allowedDeviceTypes.includes(deviceType)) {
    match.deviceType = deviceType;
  }

  if (urlPrefix) {
    const safe = escapeRegExp(urlPrefix);
    match.url = { $regex: `^${safe}` };
  }

  return match;
}

async function getViewsByDay({ projectId, start, end, deviceType, urlPrefix }) {
  const match = buildMatch({ projectId, start, end, deviceType, urlPrefix });

  // Pipeline: match project + date range + optional filters, group by day, count, sort.
  const rows = await PageView.aggregate([
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

async function getTotalViews({ projectId, start, end, deviceType, urlPrefix }) {
  const match = buildMatch({ projectId, start, end, deviceType, urlPrefix });
  const total = await PageView.countDocuments(match);
  return total || 0;
}

async function getUniqueVisitors({ projectId, start, end, deviceType, urlPrefix }) {
  const match = buildMatch({ projectId, start, end, deviceType, urlPrefix });

  // Pipeline: match filters, group by clientId to get distinct, then count.
  const rows = await PageView.aggregate([
    { $match: match },
    { $group: { _id: '$clientId' } },
    { $count: 'uniqueVisitors' },
  ]);

  return rows && rows.length ? rows[0].uniqueVisitors : 0;
}

async function getTopPages({ projectId, start, end, deviceType, urlPrefix }) {
  const match = buildMatch({ projectId, start, end, deviceType, urlPrefix });

  // Pipeline: match filters, group by url to count views and collect unique clientIds, compute sizes.
  const rows = await PageView.aggregate([
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
  ]);

  return rows || [];
}

exports.getPageViewsAnalytics = async (req, res, next) => {
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

    const rawDeviceType = req.query.deviceType;
    const allowedDeviceTypes = ['desktop', 'mobile', 'tablet'];
    const deviceType = allowedDeviceTypes.includes(rawDeviceType) ? rawDeviceType : 'all';

    const rawUrlPrefix = typeof req.query.urlPrefix === 'string' ? req.query.urlPrefix.trim() : '';
    const urlPrefix = rawUrlPrefix ? rawUrlPrefix : undefined;

    const params = {
      projectId,
      start,
      end,
      deviceType: deviceType === 'all' ? undefined : deviceType,
      urlPrefix,
    };

    const [viewsByDay, totalViews, uniqueVisitors, topPages] = await Promise.all([
      getViewsByDay(params),
      getTotalViews(params),
      getUniqueVisitors(params),
      getTopPages(params),
    ]);

    const orgName = req.currentOrg ? req.currentOrg.name : 'Organization';

    return res.render('analytics/pageviews', {
      title: 'Page views',
      project: req.project,
      projectBasePath: req.projectBasePath || `/projects/${req.project._id.toString()}`,
      timeframe,
      deviceType,
      urlPrefix,
      viewsByDay: viewsByDay || [],
      totalViews: totalViews || 0,
      uniqueVisitors: uniqueVisitors || 0,
      topPages: topPages || [],
      currentSection: 'pageviews',
      currentUser: (req.session && req.session.user) || null,
      currentProjectRole: req.userProjectRole || null,
      breadcrumbs: [
        { label: 'Home', href: '/', icon: 'home' },
        { label: orgName, href: '/org/users' },
        { label: 'Projects', href: '/projects' },
        { label: req.project.name, href: `/projects/${req.project._id}/dashboard` },
        { label: 'Page views', href: `/projects/${req.project._id}/pageviews` }
      ]
    });
  } catch (err) {
    return next(err);
  }
};
