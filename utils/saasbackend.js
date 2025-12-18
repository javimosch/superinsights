const mongoose = require('mongoose');

function getSaasbackend() {
  if (globalThis.saasbackend) {
    return globalThis.saasbackend;
  }

  const sb = require(process.env.NODE_ENV === 'production' ? 'saasbackend' : '../ref-saasbackend');
  globalThis.saasbackend = sb;
  return sb;
}

function getModel(modelName) {
  const safeName = String(modelName || '').trim();
  if (!safeName) {
    throw new Error('modelName is required');
  }

  const sb = getSaasbackend();
  if (sb?.models?.[safeName]) {
    return sb.models[safeName];
  }

  try {
    return mongoose.model(safeName);
  } catch (e) {
    throw new Error(`Model not found: ${safeName}`);
  }
}

module.exports = {
  ...getSaasbackend(),
  getSaasbackend,
  getModel,
};
