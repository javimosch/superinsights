const RawLogEvent = require('../models/RawLogEvent');

const MAX_EVENTS = 10_000;
let writeCount = 0;

async function pruneIfNeeded() {
  const total = await RawLogEvent.estimatedDocumentCount();
  if (total <= MAX_EVENTS) return;

  const excess = total - MAX_EVENTS;
  if (excess <= 0) return;

  const ids = await RawLogEvent.find({})
    .sort({ ts: 1 })
    .limit(excess)
    .select({ _id: 1 })
    .lean();

  const toDelete = (ids || []).map((r) => r._id).filter(Boolean);
  if (!toDelete.length) return;

  await RawLogEvent.deleteMany({ _id: { $in: toDelete } });
}

function schedulePrune() {
  writeCount += 1;
  if (writeCount % 50 !== 0) return; // amortize pruning cost

  Promise.resolve()
    .then(() => pruneIfNeeded())
    .catch(() => {
      // ignore
    });
}

function logRawAction(actionCode, meta = {}) {
  const payload = {
    kind: 'action',
    actionCode: actionCode != null ? String(actionCode) : null,
    userId: meta.userId != null ? String(meta.userId) : null,
    email: meta.email != null ? String(meta.email) : null,
    projectId: meta.projectId != null ? String(meta.projectId) : null,
    method: meta.method != null ? String(meta.method) : null,
    path: meta.path != null ? String(meta.path) : null,
    status: meta.status != null ? Number(meta.status) : null,
    ip: meta.ip != null ? String(meta.ip) : null,
  };

  if (!payload.actionCode) return;

  Promise.resolve()
    .then(() => RawLogEvent.create(payload))
    .then(() => schedulePrune())
    .catch(() => {
      // ignore
    });
}

function logRawError(err, meta = {}) {
  const message = err && err.message ? String(err.message) : 'Unknown error';

  const payload = {
    kind: 'error',
    errorMessage: message,
    errorStack: err && err.stack ? String(err.stack) : null,
    userId: meta.userId != null ? String(meta.userId) : null,
    email: meta.email != null ? String(meta.email) : null,
    projectId: meta.projectId != null ? String(meta.projectId) : null,
    method: meta.method != null ? String(meta.method) : null,
    path: meta.path != null ? String(meta.path) : null,
    status: meta.status != null ? Number(meta.status) : null,
    ip: meta.ip != null ? String(meta.ip) : null,
  };

  Promise.resolve()
    .then(() => RawLogEvent.create(payload))
    .then(() => schedulePrune())
    .catch(() => {
      // ignore
    });
}

module.exports = {
  logRawAction,
  logRawError,
};
