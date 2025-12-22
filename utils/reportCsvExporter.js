function escapeCsvValue(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[\n\r",]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(rows) {
  return rows.map((r) => r.map(escapeCsvValue).join(',')).join('\n') + '\n';
}

function pushMetric(rows, metric, value, dataType, timeframe) {
  rows.push([metric, value == null ? '' : String(value), dataType || '', timeframe || '']);
}

function generateAggregatedCsv(context) {
  const meta = (context && context.meta) || {};
  const timeframe = meta.timeframe || 'custom';

  const rows = [['metric', 'value', 'dataType', 'timeframe']];

  pushMetric(rows, 'projectId', meta.projectId, meta.dataType, timeframe);
  pushMetric(rows, 'projectName', meta.projectName, meta.dataType, timeframe);
  pushMetric(rows, 'environment', meta.environment, meta.dataType, timeframe);
  pushMetric(rows, 'start', meta.start ? new Date(meta.start).toISOString() : '', meta.dataType, timeframe);
  pushMetric(rows, 'end', meta.end ? new Date(meta.end).toISOString() : '', meta.dataType, timeframe);

  if (context && context.summary) {
    pushMetric(rows, 'totalCount', context.summary.totalCount, meta.dataType, timeframe);
  }

  if (context && context.pageviews) {
    pushMetric(rows, 'totalViews', context.pageviews.totalViews, 'pageviews', timeframe);
    pushMetric(rows, 'uniqueVisitors', context.pageviews.uniqueVisitors, 'pageviews', timeframe);
    const top = context.pageviews.topPages || [];
    top.forEach((p, idx) => {
      pushMetric(rows, `topPage_${idx + 1}_url`, p.url, 'pageviews', timeframe);
      pushMetric(rows, `topPage_${idx + 1}_views`, p.views, 'pageviews', timeframe);
      pushMetric(rows, `topPage_${idx + 1}_uniqueVisitors`, p.uniqueVisitors, 'pageviews', timeframe);
    });
  }

  if (context && context.events) {
    pushMetric(rows, 'totalEvents', context.events.totalEvents, 'events', timeframe);
    const top = context.events.topEvents || [];
    top.forEach((e, idx) => {
      pushMetric(rows, `topEvent_${idx + 1}_name`, e.eventName, 'events', timeframe);
      pushMetric(rows, `topEvent_${idx + 1}_count`, e.count, 'events', timeframe);
    });
  }

  if (context && context.errors) {
    pushMetric(rows, 'totalErrors', context.errors.totalErrors, 'errors', timeframe);
    pushMetric(rows, 'uniqueFingerprints', context.errors.uniqueFingerprints, 'errors', timeframe);
    const top = context.errors.topFingerprints || [];
    top.forEach((e, idx) => {
      pushMetric(rows, `topError_${idx + 1}_fingerprint`, e.fingerprint, 'errors', timeframe);
      pushMetric(rows, `topError_${idx + 1}_count`, e.count, 'errors', timeframe);
      pushMetric(rows, `topError_${idx + 1}_type`, e.errorType, 'errors', timeframe);
      pushMetric(rows, `topError_${idx + 1}_message`, e.message, 'errors', timeframe);
    });
  }

  if (context && context.performance) {
    pushMetric(rows, 'totalMeasurements', context.performance.totalMeasurements, 'performance', timeframe);
    const p = context.performance.percentiles || {};
    for (const [k, v] of Object.entries(p)) {
      pushMetric(rows, k, v, 'performance', timeframe);
    }
  }

  return toCsv(rows);
}

module.exports = {
  generateAggregatedCsv,
};
