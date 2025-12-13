const mongoose = require('mongoose');

const RawLogEventSchema = new mongoose.Schema(
  {
    ts: { type: Date, default: Date.now, index: true },
    kind: { type: String, required: true, enum: ['action', 'error'], index: true },

    actionCode: { type: String, default: null, index: true },
    errorMessage: { type: String, default: null, index: true },
    errorStack: { type: String, default: null },

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

module.exports = mongoose.model('RawLogEvent', RawLogEventSchema);
