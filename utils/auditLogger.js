const { getModel } = require('../utils/saasbackend');

function logAudit(actionCode, meta = {}) {
  const action = String(actionCode || '').trim();
  if (!action) return;

  const userId = meta.userId != null ? String(meta.userId) : null;
  const email = meta.email != null ? String(meta.email) : null;
  const projectId = meta.projectId != null ? String(meta.projectId) : null;
  const method = meta.method != null ? String(meta.method) : null;
  const path = meta.path != null ? String(meta.path) : null;
  const status = meta.status != null ? Number(meta.status) : null;
  const ip = meta.ip != null ? String(meta.ip) : null;

  const outcome = status != null && status >= 400 ? 'failure' : 'success';

  Promise.resolve()
    .then(() => {
      const AuditEvent = getModel('AuditEvent');

      return AuditEvent.create({
        actorType: userId ? 'user' : 'system',
        actorUserId: userId || null,
        actorId: email || userId || null,
        action,
        entityType: projectId ? 'project' : 'unknown',
        entityId: projectId || null,
        meta: {
          userId,
          email,
          projectId,
          status,
          method,
          path,
          ip,
        },
        outcome,
        context: {
          ip,
          path,
          method,
        },
        targetType: projectId ? 'project' : null,
        targetId: projectId || null,
      });
    })
    .catch(() => {
      // ignore
    });
}

module.exports = {
  logAudit,
};
