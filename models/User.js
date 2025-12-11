const mongoose = require('mongoose');

const ROLES = {
  ADMIN: 'admin',
  VIEWER: 'viewer',
};

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: [ROLES.ADMIN, ROLES.VIEWER],
      default: ROLES.VIEWER,
    },
  },
  {
    timestamps: true,
  }
);

UserSchema.statics.ROLES = ROLES;

module.exports = mongoose.model('User', UserSchema);
