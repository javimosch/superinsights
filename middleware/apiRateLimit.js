const store = new Map();
const ipStore = new Map();

// Per-IP limiter for the public ingestion endpoints. Runs before API-key
// validation so a flood with a stolen/guessed public key (the key is visible in
// client HTML) can't hammer the DB key-lookup. Returns JSON (these are API
// routes, not HTML). NOTE: in-process only — replace with a shared store
// (Redis) when running more than one instance.
function createIpRateLimiter({ windowMs = 60000, max = 1200 }) {
  return function ipRateLimiter(req, res, next) {
    const now = Date.now();
    const key = req.ip || 'unknown';

    let entry = ipStore.get(key);

    if (!entry || entry.expiresAt <= now) {
      entry = { count: 0, expiresAt: now + windowMs };
      ipStore.set(key, entry);
    }

    entry.count += 1;

    if (entry.count > max) {
      const retryAfterSeconds = Math.ceil((entry.expiresAt - now) / 1000);
      res.set('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: retryAfterSeconds,
      });
    }

    return next();
  };
}

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

module.exports = { createProjectRateLimiter, createIpRateLimiter };
