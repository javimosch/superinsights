const mongoose = require('mongoose');
const crypto = require('crypto');

const PlatformInviteSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'revoked', 'expired'],
      default: 'pending',
      index: true,
    },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  },
  { timestamps: true }
);

PlatformInviteSchema.index({ email: 1, status: 1 });

PlatformInviteSchema.statics.generateToken = function generateToken() {
  const token = 'pinv_' + crypto.randomBytes(24).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
};

PlatformInviteSchema.statics.hashToken = function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
};

module.exports = mongoose.model('PlatformInvite', PlatformInviteSchema);
