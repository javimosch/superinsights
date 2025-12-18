const mongoose = require('mongoose');

const VISIBILITY = {
  PRIVATE: 'private',
  PUBLIC: 'public',
};

const AiAnalysisPresetSchema = new mongoose.Schema(
  {
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    ownerEmail: {
      type: String,
    },
    visibility: {
      type: String,
      enum: [VISIBILITY.PRIVATE, VISIBILITY.PUBLIC],
      default: VISIBILITY.PRIVATE,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    tags: {
      type: [String],
      default: [],
    },
    version: {
      type: Number,
      default: 1,
    },
    definition: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

AiAnalysisPresetSchema.index({ ownerUserId: 1, createdAt: -1 });
AiAnalysisPresetSchema.index({ visibility: 1, createdAt: -1 });
AiAnalysisPresetSchema.index({ name: 1, visibility: 1 });

AiAnalysisPresetSchema.statics.VISIBILITY = VISIBILITY;

module.exports = mongoose.model('AiAnalysisPreset', AiAnalysisPresetSchema);
