const mongoose = require('mongoose');

const PerformanceMetricSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    lcp: {
      type: Number,
    },
    cls: {
      type: Number,
    },
    fid: {
      type: Number,
    },
    ttfb: {
      type: Number,
    },
    url: {
      type: String,
      index: true,
    },
    deviceType: {
      type: String,
    },
    browser: {
      type: String,
    },
    connectionType: {
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

PerformanceMetricSchema.index({ projectId: 1, timestamp: 1 });

module.exports = mongoose.model('PerformanceMetric', PerformanceMetricSchema);
