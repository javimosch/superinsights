const mongoose = require('mongoose');

const AiAnalysisRunSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    presetId: {
      type: String,
      index: true,
    },
    presetSnapshot: {
      type: mongoose.Schema.Types.Mixed,
    },
    createdByUserId: {
      type: String,
      index: true,
    },
    createdByEmail: {
      type: String,
    },
    status: {
      type: String,
      enum: ['running', 'completed', 'failed'],
      default: 'running',
      index: true,
    },
    model: {
      type: String,
      default: 'google/gemini-2.5-flash-lite',
    },
    timeframePreset: {
      type: String,
      enum: ['5m', '30m', '1h', '6h', '12h', '24h', '7d', '30d', '3m', '1y', null],
      default: null,
    },
    start: {
      type: Date,
      required: true,
      index: true,
    },
    end: {
      type: Date,
      required: true,
      index: true,
    },
    resultMarkdown: {
      type: String,
    },
    errorMessage: {
      type: String,
    },
    durationMs: {
      type: Number,
    },
    tokenUsage: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

AiAnalysisRunSchema.index({ projectId: 1, createdAt: -1 });
AiAnalysisRunSchema.index({ projectId: 1, start: 1, end: 1, createdAt: -1 });

module.exports = mongoose.model('AiAnalysisRun', AiAnalysisRunSchema);
