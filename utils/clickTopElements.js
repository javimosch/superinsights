/**
 * Aggregate the most-clicked CSS selectors for a set of $click events.
 *
 * @param {object} options
 * @param {import('mongoose').Model} options.Event - Mongoose Event model
 * @param {object} options.match - Pre-built MongoDB match object (project, timeframe, etc.)
 * @param {number} [options.limit=5] - Number of results to return
 * @returns {Promise<Array<{selector: string, count: number}>>}
 */
async function getTopClickedElements({ Event, match, limit = 5 } = {}) {
  if (!Event || typeof Event.aggregate !== 'function') {
    throw new TypeError('Event model with aggregate method is required');
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 50);

  const rows = await Event.aggregate([
    { $match: match },
    { $match: { 'properties.selector': { $exists: true, $ne: null } } },
    {
      $group: {
        _id: '$properties.selector',
        count: { $sum: 1 },
        latest: { $max: '$timestamp' },
      },
    },
    { $sort: { count: -1, latest: -1 } },
    { $limit: safeLimit },
    {
      $project: {
        _id: 0,
        selector: '$_id',
        count: 1,
      },
    },
  ]);

  return (rows || [])
    .map((row) => ({
      selector: row && row.selector != null ? String(row.selector) : '',
      count: Number(row && row.count != null ? row.count : 0) || 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, safeLimit);
}

module.exports = { getTopClickedElements };
