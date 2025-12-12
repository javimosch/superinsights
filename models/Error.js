const crypto = require('crypto');
const mongoose = require('mongoose');

const ErrorSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    stackTrace: {
      type: String,
    },
    fingerprint: {
      type: String,
      required: true,
      index: true,
    },
    sourceFile: {
      type: String,
    },
    lineNumber: {
      type: Number,
    },
    columnNumber: {
      type: Number,
    },
    browser: {
      type: String,
    },
    browserVersion: {
      type: String,
    },
    os: {
      type: String,
    },
    osVersion: {
      type: String,
    },
    deviceType: {
      type: String,
    },
    context: {
      type: mongoose.Schema.Types.Mixed,
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

ErrorSchema.index({ projectId: 1, fingerprint: 1, timestamp: 1 });

ErrorSchema.methods.generateFingerprint = function generateFingerprint() {
  const message = this.message || '';
  const stack = this.stackTrace || '';
  const input = message + stack.slice(0, 100);

  const hash = crypto.createHash('sha256').update(input).digest('hex');
  this.fingerprint = hash;
  return hash;
};

ErrorSchema.pre('save', function preSave(next) {
  if (this.isNew || this.isModified('message') || this.isModified('stackTrace')) {
    this.generateFingerprint();
  }

  next();
});

module.exports = mongoose.model('Error', ErrorSchema);
