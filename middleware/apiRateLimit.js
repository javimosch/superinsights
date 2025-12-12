const store = new Map();

function createProjectRateLimiter({ windowMs = 60000, max = 1000 }) {
  return function projectRateLimiter(req, res, next) {
    if (!req.project || !req.project._id) {
      return next();
    }

    const now = Date.now();
    const key = req.project._id.toString();

    let entry = store.get(key);

    if (!entry || entry.expiresAt <= now) {
      entry = { count: 0, expiresAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count += 1;

    if (entry.count > max) {
      const retryAfterSeconds = Math.ceil((entry.expiresAt - now) / 1000);

      return res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: retryAfterSeconds,
      });
    }

    return next();
  };
}

module.exports = { createProjectRateLimiter };
