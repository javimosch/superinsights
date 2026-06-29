const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    eventName: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    properties: {
      type: mongoose.Schema.Types.Mixed,
    },
    durationMs: {
      type: Number,
      index: true,
    },
    sessionId: {
      type: String,
      index: true,
    },
    clientId: {
      type: String,
      index: true,
    },
    ip: {
      type: String,
    },
    country: {
      type: String,
    },
    timestamp: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

EventSchema.index({ projectId: 1, eventName: 1, timestamp: 1 });
EventSchema.index({ projectId: 1, eventName: 1, durationMs: 1, timestamp: 1 });

module.exports = mongoose.model('Event', EventSchema);
