const mongoose = require('mongoose');

const PageViewSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    url: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
    },
    referrer: {
      type: String,
    },
    sessionId: {
      type: String,
      index: true,
    },
    clientId: {
      type: String,
      index: true,
    },
    utmSource: {
      type: String,
    },
    utmMedium: {
      type: String,
    },
    utmCampaign: {
      type: String,
    },
    utmTerm: {
      type: String,
    },
    utmContent: {
      type: String,
    },
    deviceType: {
      type: String,
      enum: ['desktop', 'mobile', 'tablet'],
    },
    browser: {
      type: String,
    },
    os: {
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

PageViewSchema.index({ projectId: 1, timestamp: 1 });
PageViewSchema.index({ projectId: 1, deviceType: 1, timestamp: 1 });
PageViewSchema.index({ projectId: 1, url: 1 });

module.exports = mongoose.model('PageView', PageViewSchema);
