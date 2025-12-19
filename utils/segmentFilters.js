function normalizeString(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function normalizeMetaKey(v) {
  const s = normalizeString(v);
  if (!s) return null;
  if (s.startsWith('$')) return null;
  if (s.includes('\u0000')) return null;
  if (!/^[A-Za-z0-9_.-]{1,80}$/.test(s)) return null;
  return s;
}

function normalizeMetaObject(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  const out = {};
  for (const [k, v] of Object.entries(meta)) {
    const key = normalizeMetaKey(k);
    const val = normalizeString(v);
    if (!key || val == null) continue;
    out[key] = val;
  }
  return out;
}

function parseMetaFromRequest(req) {
  const q = (req && req.query) || {};
  const b = (req && req.body) || {};

  const rawMeta = q.meta != null ? q.meta : b.meta;

  if (rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta)) {
    return normalizeMetaObject(rawMeta);
  }

  if (typeof rawMeta === 'string') {
    try {
      const parsed = JSON.parse(rawMeta);
      return normalizeMetaObject(parsed);
    } catch (e) {
      return {};
    }
  }

  const metaKey = normalizeMetaKey(q.metaKey != null ? q.metaKey : b.metaKey);
  const metaValue = normalizeString(q.metaValue != null ? q.metaValue : b.metaValue);
  if (metaKey && metaValue != null) {
    return { [metaKey]: metaValue };
  }

  return {};
}

function parseSegmentFilters(req) {
  const q = (req && req.query) || {};
  const b = (req && req.body) || {};

  const clientId = normalizeString(q.clientId != null ? q.clientId : b.clientId) ||
    normalizeString(q.client_id != null ? q.client_id : b.client_id);

  const userId = normalizeString(q.userId != null ? q.userId : b.userId) ||
    normalizeString(q.user_id != null ? q.user_id : b.user_id);

  const meta = parseMetaFromRequest(req);

  return {
    clientId: clientId || null,
    userId: userId || null,
    meta,
  };
}

function buildEventMetadataMatch({ clientId, userId, meta }) {
  const match = {};

  if (clientId) match.clientId = clientId;

  if (userId) {
    match['properties.userId'] = userId;
  }

  const m = normalizeMetaObject(meta);
  for (const [k, v] of Object.entries(m)) {
    match[`properties.${k}`] = v;
  }

  return match;
}

function buildPerformanceMetadataMatch({ clientId, userId, meta }) {
  const match = {};

  if (clientId) match.clientId = clientId;

  if (userId) {
    match['properties.userId'] = userId;
  }

  const m = normalizeMetaObject(meta);
  for (const [k, v] of Object.entries(m)) {
    match[`properties.${k}`] = v;
  }

  return match;
}

function buildPageViewMetadataMatch({ clientId }) {
  const match = {};
  if (clientId) match.clientId = clientId;
  return match;
}

function buildErrorMetadataMatch({ clientId, userId, meta }) {
  const match = {};

  if (clientId) match['context.clientId'] = clientId;

  if (userId) {
    match['context.userId'] = userId;
  }

  const m = normalizeMetaObject(meta);
  for (const [k, v] of Object.entries(m)) {
    match[`context.${k}`] = v;
  }

  return match;
}

module.exports = {
  parseSegmentFilters,
  buildEventMetadataMatch,
  buildPerformanceMetadataMatch,
  buildPageViewMetadataMatch,
  buildErrorMetadataMatch,
};
