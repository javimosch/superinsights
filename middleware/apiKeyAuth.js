const Project = require('../models/Project');

async function validateApiKey(req, res, next) {
  try {
    const authHeader = req.header('Authorization');
    const headerKey = req.header('X-API-Key') || req.header('x-api-key');

    let apiKey = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      apiKey = authHeader.slice(7).trim();
    } else if (headerKey) {
      apiKey = headerKey.trim();
    }

    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    const project = await Project.findOne({
      $or: [{ publicApiKey: apiKey }, { secretApiKey: apiKey }],
      deletedAt: null,
    });

    if (!project) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const apiKeyType = project.publicApiKey === apiKey ? 'public' : 'secret';

    req.project = project;
    req.apiKeyType = apiKeyType;

    return next();
  } catch (err) {
    return next(err);
  }
}

function requirePublicKey(req, res, next) {
  if (req.apiKeyType !== 'public') {
    return res.status(403).json({ error: 'Public API key required' });
  }

  return next();
}

function requireSecretKey(req, res, next) {
  if (req.apiKeyType !== 'secret') {
    return res.status(403).json({ error: 'Secret API key required' });
  }

  return next();
}

module.exports = {
  validateApiKey,
  requirePublicKey,
  requireSecretKey,
};
