const mongoose = require('mongoose');
const { generateKeyPair } = require('../utils/apiKeys');

const ENVIRONMENTS = ['production', 'staging', 'development'];

const ProjectUserSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'viewer'],
      required: true,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

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
    users: [ProjectUserSchema],
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

ProjectSchema.statics.findActiveProjects = function findActiveProjects(userId) {
  return this.find({
    deletedAt: null,
    'users.userId': userId,
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

ProjectSchema.methods.hasUserAccess = function hasUserAccess(userId) {
  return this.users.some(
    (u) => u.userId.toString() === userId.toString()
  );
};

ProjectSchema.methods.getUserRole = function getUserRole(userId) {
  const entry = this.users.find(
    (u) => u.userId.toString() === userId.toString()
  );
  return entry ? entry.role : null;
};

ProjectSchema.methods.regenerateKeys = function regenerateKeys() {
  const { publicKey, secretKey } = generateKeyPair();
  this.publicApiKey = publicKey;
  this.secretApiKey = secretKey;
};

module.exports = mongoose.model('Project', ProjectSchema);
