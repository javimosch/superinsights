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
    start = new Date(new Date().getFullYear(), 0, 1);
  } else {
    start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }

  return { timeframe: tf, start, end: now };
}

function parseCustomRange({ start, end }) {
  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : null;

  if (!startDate || Number.isNaN(startDate.getTime())) {
    return { error: 'Invalid start date' };
  }

  if (!endDate || Number.isNaN(endDate.getTime())) {
    return { error: 'Invalid end date' };
  }

  if (startDate.getTime() >= endDate.getTime()) {
    return { error: 'Start date must be before end date' };
  }

  return { start: startDate, end: endDate };
}

module.exports = {
  getDateRange,
  parseCustomRange,
};
