const mongoose = require('mongoose');
const { generateKeyPair } = require('../utils/apiKeys');

const ENVIRONMENTS = ['production', 'staging', 'development'];

const ProjectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    icon: {
      type: String,
      default: '📊',
    },
    environment: {
      type: String,
      enum: ENVIRONMENTS,
      default: 'production',
    },
    publicApiKey: {
      type: String,
      unique: true,
      index: true,
    },
    secretApiKey: {
      type: String,
      unique: true,
      index: true,
    },
    dataRetentionDays: {
      type: Number,
      default: 90,
      min: 1,
      max: 365,
    },
    saasOrgId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
      required: true,
    },
    publicLinkEnabled: {
      type: Boolean,
      default: false,
      index: true,
    },
    publicLinkTokenHash: {
      type: String,
      default: null,
    },
    publicLinkToken: {
      type: String,
      default: null,
    },
    publicLinkCreatedAt: {
      type: Date,
      default: null,
    },
    publicLinkRevokedAt: {
      type: Date,
      default: null,
    },
    publicLinkLastRegeneratedAt: {
      type: Date,
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

ProjectSchema.statics.ENVIRONMENTS = ENVIRONMENTS;

ProjectSchema.statics.generateApiKeys = function generateApiKeys() {
  return generateKeyPair();
};

ProjectSchema.statics.findActiveProjectsByOrgIds = function findActiveProjectsByOrgIds(orgIds) {
  return this.find({
    deletedAt: null,
    saasOrgId: { $in: orgIds },
  })
    .sort({ createdAt: -1 })
    .lean();
};

ProjectSchema.statics.softDelete = function softDelete(projectId) {
  return this.findByIdAndUpdate(
    projectId,
    { deletedAt: new Date() },
    { new: true }
  );
};

ProjectSchema.methods.regenerateKeys = function regenerateKeys() {
  const { publicKey, secretKey } = generateKeyPair();
  this.publicApiKey = publicKey;
  this.secretApiKey = secretKey;
};

module.exports = mongoose.model('Project', ProjectSchema);
