const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const LOG_FILE = path.join(DATA_DIR, 'logging.json');
const TMP_FILE = path.join(DATA_DIR, 'logging.json.tmp');

const DEFAULT_MAX_TYPES = 10_000;
const DEFAULT_FLUSH_DEBOUNCE_MS = 1000;

let state = {
  version: 1,
  updatedAt: null,
  actions: {},
  errors: {},
};

let loaded = false;
let flushTimer = null;
let isFlushing = false;
let pendingFlush = false;

function _nowIso() {
  return new Date().toISOString();
}

function _ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function _safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function _loadOnce() {
  if (loaded) return;
  loaded = true;

  _ensureDir();

  const existing = _safeReadJson(LOG_FILE);
  if (existing && typeof existing === 'object') {
    state = {
      version: 1,
      updatedAt: existing.updatedAt || null,
      actions: existing.actions && typeof existing.actions === 'object' ? existing.actions : {},
      errors: existing.errors && typeof existing.errors === 'object' ? existing.errors : {},
    };
  }
}

function _updateIntervalStats(entry, prevSeenAtMs, nowMs) {
  if (!prevSeenAtMs) return;
  const delta = nowMs - prevSeenAtMs;
  if (!(delta >= 0)) return;

  const prevIntervals = Number(entry.intervalsCount || 0);
  const prevAvg = typeof entry.avgIntervalMs === 'number' ? entry.avgIntervalMs : null;

  const nextIntervals = prevIntervals + 1;
  entry.intervalsCount = nextIntervals;

  if (prevAvg == null) {
    entry.avgIntervalMs = delta;
  } else {
    entry.avgIntervalMs = prevAvg + (delta - prevAvg) / nextIntervals;
  }

  if (typeof entry.minIntervalMs !== 'number') entry.minIntervalMs = delta;
  else entry.minIntervalMs = Math.min(entry.minIntervalMs, delta);

  if (typeof entry.maxIntervalMs !== 'number') entry.maxIntervalMs = delta;
  else entry.maxIntervalMs = Math.max(entry.maxIntervalMs, delta);
}

function _touchEntry(map, type, meta, maxTypes) {
  const t = String(type || '').trim();
  if (!t) return;

  const now = new Date();
  const nowMs = now.getTime();
  const nowIso = now.toISOString();

  const existing = map[t];
  const prevLastSeenAt = existing && existing.lastSeenAt ? Date.parse(existing.lastSeenAt) : null;

  const next = existing || {
    count: 0,
    firstSeenAt: nowIso,
    lastSeenAt: nowIso,
    avgIntervalMs: null,
    minIntervalMs: null,
    maxIntervalMs: null,
    intervalsCount: 0,
  };

  next.count = Number(next.count || 0) + 1;
  if (!next.firstSeenAt) next.firstSeenAt = nowIso;
  next.lastSeenAt = nowIso;

  _updateIntervalStats(next, prevLastSeenAt, nowMs);

  if (meta && typeof meta === 'object') {
    if (meta.userId != null) next.lastUserId = String(meta.userId);
    if (meta.email != null) next.lastEmail = String(meta.email);
    if (meta.projectId != null) next.lastProjectId = String(meta.projectId);
    if (meta.status != null) next.lastStatus = Number(meta.status);
    if (meta.method != null) next.lastMethod = String(meta.method);
    if (meta.path != null) next.lastPath = String(meta.path);
  }

  map[t] = next;

  const keys = Object.keys(map);
  if (keys.length <= maxTypes) return;

  // prune least-recently-seen types
  keys
    .sort((a, b) => {
      const ta = map[a] && map[a].lastSeenAt ? Date.parse(map[a].lastSeenAt) : 0;
      const tb = map[b] && map[b].lastSeenAt ? Date.parse(map[b].lastSeenAt) : 0;
      return ta - tb;
    })
    .slice(0, keys.length - maxTypes)
    .forEach((k) => {
      delete map[k];
    });
}

function _scheduleFlush({ debounceMs } = {}) {
  const ms = typeof debounceMs === 'number' ? debounceMs : DEFAULT_FLUSH_DEBOUNCE_MS;

  if (flushTimer) return;

  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushToDisk();
  }, ms);
}

function _writeAtomic(jsonObj) {
  _ensureDir();
  const payload = JSON.stringify(jsonObj, null, 2);
  fs.writeFileSync(TMP_FILE, payload, 'utf8');
  fs.renameSync(TMP_FILE, LOG_FILE);
}

function flushToDisk() {
  _loadOnce();

  if (isFlushing) {
    pendingFlush = true;
    return;
  }

  isFlushing = true;

  try {
    state.updatedAt = _nowIso();
    _writeAtomic(state);
  } catch (err) {
    // last resort stderr (avoid throwing inside request lifecycle)
    try {
      console.error('[aggregatedLogger] flush failed', err);
    } catch (e) {
      // ignore
    }
  } finally {
    isFlushing = false;
    if (pendingFlush) {
      pendingFlush = false;
      flushToDisk();
    }
  }
}

function logAction(actionCode, meta = {}, options = {}) {
  _loadOnce();
  const maxTypes = typeof options.maxTypes === 'number' ? options.maxTypes : DEFAULT_MAX_TYPES;
  _touchEntry(state.actions, actionCode, meta, maxTypes);
  _scheduleFlush(options);
}

function logError(errorType, meta = {}, options = {}) {
  _loadOnce();
  const maxTypes = typeof options.maxTypes === 'number' ? options.maxTypes : DEFAULT_MAX_TYPES;
  _touchEntry(state.errors, errorType, meta, maxTypes);
  _scheduleFlush(options);
}

function getSnapshot() {
  _loadOnce();
  return JSON.parse(JSON.stringify(state));
}

module.exports = {
  logAction,
  logError,
  flushToDisk,
  getSnapshot,
  LOG_FILE,
};
