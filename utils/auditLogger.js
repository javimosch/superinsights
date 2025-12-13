const AuditLog = require('../models/AuditLog');

function logAudit(actionCode, meta = {}) {
  const payload = {
    actionCode: String(actionCode || '').trim(),
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
    .then(() => AuditLog.create(payload))
    .catch(() => {
      // ignore
    });
}

module.exports = {
  logAudit,
};
