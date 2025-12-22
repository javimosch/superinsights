const mongoose = require('mongoose');

const REPORT_DATA_TYPES = ['pageviews', 'events', 'errors', 'performance', 'all'];
const REPORT_TIMEFRAMES = ['5m', '30m', '1h', '6h', '12h', '24h', '7d', '30d', '3m', '1y', 'custom'];
const REPORT_FORMATS = ['pdf', 'csv', 'json', 'html'];
const REPORT_STATUSES = ['pending', 'generating', 'completed', 'failed'];

const ReportSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      index: true,
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    name: {
      type: String,
      trim: true,
      required: true,
      maxlength: 160,
    },
    dataType: {
      type: String,
      enum: REPORT_DATA_TYPES,
      required: true,
      default: 'pageviews',
    },
    timeframe: {
      type: String,
      enum: REPORT_TIMEFRAMES,
      required: true,
      default: '7d',
    },
    startDate: {
      type: Date,
      default: null,
    },
    endDate: {
      type: Date,
      default: null,
    },
    filters: {
      type: Object,
      default: {},
    },
    format: {
      type: String,
      enum: REPORT_FORMATS,
      required: true,
      default: 'pdf',
    },
    includeAiInsights: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: REPORT_STATUSES,
      required: true,
      default: 'pending',
      index: true,
    },
    statusMessage: {
      type: String,
      default: null,
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    assetId: {
      type: String,
      default: null,
      index: true,
    },
    assetKey: {
      type: String,
      default: null,
      index: true,
    },
    assetUrl: {
      type: String,
      default: null,
    },
    fileSize: {
      type: Number,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    generatedAt: {
      type: Date,
      default: null,
    },
    downloadCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

ReportSchema.statics.REPORT_DATA_TYPES = REPORT_DATA_TYPES;
ReportSchema.statics.REPORT_TIMEFRAMES = REPORT_TIMEFRAMES;
ReportSchema.statics.REPORT_FORMATS = REPORT_FORMATS;
ReportSchema.statics.REPORT_STATUSES = REPORT_STATUSES;

module.exports = mongoose.model('Report', ReportSchema);
