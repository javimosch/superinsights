const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema(
  {
    ts: { type: Date, default: Date.now, index: true },
    actionCode: { type: String, required: true, index: true },

    userId: { type: String, default: null, index: true },
    email: { type: String, default: null, index: true },
    projectId: { type: String, default: null, index: true },

    method: { type: String, default: null },
    path: { type: String, default: null },
    status: { type: Number, default: null },
    ip: { type: String, default: null },
  },
  {
    minimize: true,
  }
);

module.exports = mongoose.model('AuditLog', AuditLogSchema);
