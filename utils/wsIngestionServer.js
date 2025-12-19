const { WebSocketServer } = require('ws');
const { URL } = require('url');

const Project = require('../models/Project');
const PageView = require('../models/PageView');
const Event = require('../models/Event');
const ErrorModel = require('../models/Error');
const PerformanceMetric = require('../models/PerformanceMetric');
const { parseTimestamp, validateBulkPayload } = require('../controllers/ingestionController');
const {
  getDropEventsConfig,
  shouldDropEventItem,
  incrementDropCounter,
} = require('./ingestionDropSettings');

function pickApiKeyFromRequest(reqUrl) {
  try {
    const u = new URL(reqUrl, 'http://localhost');
    const apiKey = u.searchParams.get('apiKey') || u.searchParams.get('api_key');
    return apiKey ? String(apiKey).trim() : null;
  } catch (e) {
    return null;
  }
}

async function resolveProjectByApiKey(apiKey) {
  if (!apiKey) return null;

  return Project.findOne({
    $or: [{ publicApiKey: apiKey }, { secretApiKey: apiKey }],
    deletedAt: null,
  });
}

function createProjectRateLimiter({ windowMs = 60000, max = 1000 }) {
  const store = new Map();

  return function check(projectId) {
    const now = Date.now();
    const key = String(projectId);

    let entry = store.get(key);
    if (!entry || entry.expiresAt <= now) {
      entry = { count: 0, expiresAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count += 1;

    if (entry.count > max) {
      return { ok: false, retryAfter: Math.ceil((entry.expiresAt - now) / 1000) };
    }

    return { ok: true, retryAfter: null };
  };
}

async function ingestPageviews({ projectId, items }) {
  const docs = items.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('Each item must be an object');
    if (!item.url) throw new Error('Field "url" is required');

    return {
      projectId,
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

  if (docs.length === 1) await PageView.create(docs[0]);
  else await PageView.insertMany(docs, { ordered: true });

  return docs.length;
}

async function ingestEvents({ projectId, items }) {
  const dropConfig = await getDropEventsConfig(projectId);
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
    incrementDropCounter(projectId, droppedCount);
  }

  if (!keptItems.length) {
    return 0;
  }

  const docs = keptItems.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('Each item must be an object');
    if (!item.eventName) throw new Error('Field "eventName" is required');

    if (item.durationMs !== undefined && item.durationMs !== null) {
      const duration = Number(item.durationMs);
      if (!Number.isFinite(duration) || duration < 0) {
        throw new Error('Field "durationMs" must be a non-negative number');
      }
    }

    return {
      projectId,
      eventName: item.eventName,
      properties: item.properties || {},
      durationMs: item.durationMs,
      sessionId: item.sessionId,
      clientId: item.clientId || (item.properties && (item.properties.client_id || item.properties.clientId)) || undefined,
      timestamp: parseTimestamp(item.timestamp),
    };
  });

  if (docs.length === 1) await Event.create(docs[0]);
  else await Event.insertMany(docs, { ordered: true });

  return docs.length;
}

async function ingestErrors({ projectId, items }) {
  const docs = items.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('Each item must be an object');
    if (!item.message) throw new Error('Field "message" is required');

    const doc = new ErrorModel({
      projectId,
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

  if (docs.length === 1) await docs[0].save();
  else await ErrorModel.insertMany(docs, { ordered: true });

  return docs.length;
}

async function ingestPerformance({ projectId, items }) {
  const docs = items.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('Each item must be an object');

    const hasMetric =
      typeof item.lcp === 'number' ||
      typeof item.cls === 'number' ||
      typeof item.fid === 'number' ||
      typeof item.ttfb === 'number';

    if (!hasMetric) {
      throw new Error('At least one metric field (lcp, cls, fid, ttfb) is required');
    }

    return {
      projectId,
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

  if (docs.length === 1) await PerformanceMetric.create(docs[0]);
  else await PerformanceMetric.insertMany(docs, { ordered: true });

  return docs.length;
}

function attachWsIngestionServer(server) {
  const wss = new WebSocketServer({ noServer: true });

  const rateLimitCheck = createProjectRateLimiter({ windowMs: 60000, max: 1000 });

  server.on('upgrade', async (req, socket, head) => {
    try {
      if (!req.url || !req.url.startsWith('/v1/ws')) {
        socket.destroy();
        return;
      }

      const apiKey = pickApiKeyFromRequest(req.url);
      const project = await resolveProjectByApiKey(apiKey);

      if (!project) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.project = project;
        wss.emit('connection', ws, req);
      });
    } catch (e) {
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    try {
      ws.send(JSON.stringify({ type: 'ready' }));
    } catch (e) {
      // ignore
    }

    ws.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw || ''));
      } catch (e) {
        try {
          ws.send(JSON.stringify({ type: 'error', error: 'invalid_json' }));
        } catch (e2) {
          // ignore
        }
        return;
      }

      const projectId = ws.project && ws.project._id ? ws.project._id : null;
      if (!projectId) {
        try {
          ws.send(JSON.stringify({ type: 'error', error: 'unauthorized' }));
        } catch (e) {
          // ignore
        }
        return;
      }

      const rl = rateLimitCheck(projectId);
      if (!rl.ok) {
        try {
          ws.send(JSON.stringify({ type: 'error', error: 'rate_limited', retryAfter: rl.retryAfter }));
        } catch (e) {
          // ignore
        }
        return;
      }

      const channel = msg && msg.channel ? String(msg.channel) : '';
      const items = Array.isArray(msg && msg.items) ? msg.items : [];

      const validationError = validateBulkPayload(items, 100);
      if (validationError) {
        try {
          ws.send(JSON.stringify({ type: 'error', error: 'validation_failed', details: validationError.error }));
        } catch (e) {
          // ignore
        }
        return;
      }

      try {
        let count = 0;
        if (channel === 'pageviews') count = await ingestPageviews({ projectId, items });
        else if (channel === 'events') count = await ingestEvents({ projectId, items });
        else if (channel === 'errors') count = await ingestErrors({ projectId, items });
        else if (channel === 'performance') count = await ingestPerformance({ projectId, items });
        else throw new Error('unknown_channel');

        try {
          ws.send(JSON.stringify({ type: 'ack', channel, count }));
        } catch (e) {
          // ignore
        }
      } catch (err) {
        const details = err && err.message ? err.message : 'ingestion_failed';
        try {
          ws.send(JSON.stringify({ type: 'error', error: 'ingestion_failed', details }));
        } catch (e) {
          // ignore
        }
      }
    });
  });

  return wss;
}

module.exports = { attachWsIngestionServer };
