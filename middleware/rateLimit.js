const store = new Map();

function createRateLimiter({ windowMs, max }) {
  return function rateLimiter(req, res, next) {
    const now = Date.now();
    const key = req.ip || 'unknown';

    let entry = store.get(key);

    if (!entry || entry.expiresAt <= now) {
      entry = { count: 0, expiresAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count += 1;

    if (entry.count > max) {
      res.status(429);
      return res.render('error', {
        status: 429,
        message: 'Too many requests. Please try again later.',
      });
    }

    return next();
  };
}

module.exports = { createRateLimiter };
