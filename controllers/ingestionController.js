const PageView = require('../models/PageView');
const Event = require('../models/Event');
const ErrorModel = require('../models/Error');
const PerformanceMetric = require('../models/PerformanceMetric');
const {
  getDropEventsConfig,
  shouldDropEventItem,
  incrementDropCounter,
} = require('../utils/ingestionDropSettings');

function parseTimestamp(value) {
  if (value === undefined || value === null) {
    return new Date();
  }

  if (value instanceof Date) {
    // eslint-disable-next-line no-restricted-globals
    return isNaN(value.getTime()) ? new Date() : value;
  }

  if (typeof value === 'number') {
    const d = new Date(value);
    // eslint-disable-next-line no-restricted-globals
    return isNaN(d.getTime()) ? new Date() : d;
  }

  if (typeof value === 'string') {
    const d = new Date(value);
    // eslint-disable-next-line no-restricted-globals
    return isNaN(d.getTime()) ? new Date() : d;
  }

  return new Date();
}

function validateBulkPayload(items, maxBulkSize = 100) {
  if (!Array.isArray(items)) {
    return { error: 'Payload must be an array for bulk ingestion' };
  }

  if (items.length === 0) {
    return { error: 'Payload array must not be empty' };
  }

  if (items.length > maxBulkSize) {
    return { error: `Bulk payload size exceeds limit of ${maxBulkSize}` };
  }

  return null;
}

async function postPageViews(req, res, next) {
  try {
    const body = req.body;
    const items = Array.isArray(body?.items) ? body.items : Array.isArray(body) ? body : [body];

    const validationError = validateBulkPayload(items, 100);
    if (validationError) {
      return res.status(400).json({ error: 'Validation failed', details: validationError.error });
    }

    const docs = items.map((item) => {
      if (!item || typeof item !== 'object') {
        throw new Error('Each item must be an object');
      }

      if (!item.url) {
        throw new Error('Field "url" is required');
      }

      return {
        projectId: req.project._id,
        url: item.url,
        title: item.title,
        referrer: item.referrer,
        sessionId: item.sessionId,
        clientId: item.clientId,
        utmSource: item.utmSource,
        utmMedium: item.utmMedium,
        utmCampaign: item.utmCampaign,
        utmTerm: item.utmTerm,
        utmContent: item.utmContent,
        deviceType: item.deviceType,
        browser: item.browser,
        os: item.os,
        timestamp: parseTimestamp(item.timestamp),
      };
    });

    if (docs.length === 1) {
      await PageView.create(docs[0]);
    } else {
      await PageView.insertMany(docs, { ordered: true });
    }

    return res.status(201).json({ success: true, count: docs.length });
  } catch (err) {
    if (err.name === 'ValidationError' || err.message?.startsWith('Field') || err.message?.includes('must be an object')) {
      return res.status(400).json({ error: 'Validation failed', details: err.message });
    }

    return next(err);
  }
}

async function postEvents(req, res, next) {
  try {
    const body = req.body;
    const items = Array.isArray(body?.items) ? body.items : Array.isArray(body) ? body : [body];

    const validationError = validateBulkPayload(items, 100);
    if (validationError) {
      return res.status(400).json({ error: 'Validation failed', details: validationError.error });
    }

    const dropConfig = await getDropEventsConfig(req.project._id);
    const keptItems = [];
    let droppedCount = 0;

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (shouldDropEventItem(dropConfig, item)) {
        droppedCount += 1;
      } else {
        keptItems.push(item);
      }
    }

    if (droppedCount) {
      incrementDropCounter(req.project._id, droppedCount);
    }

    if (!keptItems.length) {
      return res.status(201).json({ success: true, count: 0, dropped: droppedCount });
    }

    const docs = keptItems.map((item) => {
      if (!item || typeof item !== 'object') {
        throw new Error('Each item must be an object');
      }

      if (!item.eventName) {
        throw new Error('Field "eventName" is required');
      }

      if (item.durationMs !== undefined && item.durationMs !== null) {
        const duration = Number(item.durationMs);
        if (!Number.isFinite(duration) || duration < 0) {
          throw new Error('Field "durationMs" must be a non-negative number');
        }
      }

      return {
        projectId: req.project._id,
        eventName: item.eventName,
        properties: item.properties || {},
        durationMs: item.durationMs,
        sessionId: item.sessionId,
        clientId: item.clientId || (item.properties && (item.properties.client_id || item.properties.clientId)) || undefined,
        timestamp: parseTimestamp(item.timestamp),
      };
    });

    if (docs.length === 1) {
      await Event.create(docs[0]);
    } else {
      await Event.insertMany(docs, { ordered: true });
    }

    return res.status(201).json({ success: true, count: docs.length });
  } catch (err) {
    if (err.name === 'ValidationError' || err.message?.startsWith('Field') || err.message?.includes('must be an object')) {
      return res.status(400).json({ error: 'Validation failed', details: err.message });
    }

    return next(err);
  }
}

async function postErrors(req, res, next) {
  try {
    const body = req.body;
    const items = Array.isArray(body?.items) ? body.items : Array.isArray(body) ? body : [body];

    const validationError = validateBulkPayload(items, 100);
    if (validationError) {
      return res.status(400).json({ error: 'Validation failed', details: validationError.error });
    }

    const docs = items.map((item) => {
      if (!item || typeof item !== 'object') {
        throw new Error('Each item must be an object');
      }

      if (!item.message) {
        throw new Error('Field "message" is required');
      }

      const doc = new ErrorModel({
        projectId: req.project._id,
        message: item.message,
        errorType: item.errorType,
        stackTrace: item.stackTrace,
        sourceFile: item.sourceFile,
        lineNumber: item.lineNumber,
        columnNumber: item.columnNumber,
        browser: item.browser,
        browserVersion: item.browserVersion,
        os: item.os,
        osVersion: item.osVersion,
        deviceType: item.deviceType,
        context: item.context,
        timestamp: parseTimestamp(item.timestamp),
      });

      doc.generateFingerprint();

      return doc;
    });

    if (docs.length === 1) {
      await docs[0].save();
    } else {
      await ErrorModel.insertMany(docs, { ordered: true });
    }

    return res.status(201).json({ success: true, count: docs.length });
  } catch (err) {
    if (err.name === 'ValidationError' || err.message?.startsWith('Field') || err.message?.includes('must be an object')) {
      return res.status(400).json({ error: 'Validation failed', details: err.message });
    }

    return next(err);
  }
}

async function postPerformanceMetrics(req, res, next) {
  try {
    const body = req.body;
    const items = Array.isArray(body?.items) ? body.items : Array.isArray(body) ? body : [body];

    const validationError = validateBulkPayload(items, 100);
    if (validationError) {
      return res.status(400).json({ error: 'Validation failed', details: validationError.error });
    }

    const docs = items.map((item) => {
      if (!item || typeof item !== 'object') {
        throw new Error('Each item must be an object');
      }

      const hasMetric =
        typeof item.lcp === 'number' ||
        typeof item.cls === 'number' ||
        typeof item.fid === 'number' ||
        typeof item.ttfb === 'number';

      if (!hasMetric) {
        throw new Error('At least one metric field (lcp, cls, fid, ttfb) is required');
      }

      return {
        projectId: req.project._id,
        metricType: item.metricType || 'web_vitals_aggregate',
        lcp: item.lcp,
        cls: item.cls,
        fid: item.fid,
        ttfb: item.ttfb,
        url: item.url,
        clientId: item.clientId || (item.properties && (item.properties.client_id || item.properties.clientId)) || undefined,
        deviceType: item.deviceType,
        browser: item.browser,
        connectionType: item.connectionType,
        properties: item.properties || {},
        timestamp: parseTimestamp(item.timestamp),
      };
    });

    if (docs.length === 1) {
      await PerformanceMetric.create(docs[0]);
    } else {
      await PerformanceMetric.insertMany(docs, { ordered: true });
    }

    return res.status(201).json({ success: true, count: docs.length });
  } catch (err) {
    if (err.name === 'ValidationError' || err.message?.startsWith('Field') || err.message?.includes('must be an object')) {
      return res.status(400).json({ error: 'Validation failed', details: err.message });
    }

    return next(err);
  }
}

module.exports = {
  parseTimestamp,
  validateBulkPayload,
  postPageViews,
  postEvents,
  postErrors,
  postPerformanceMetrics,
};
