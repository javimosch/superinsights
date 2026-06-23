const express = require('express');

const ingestionController = require('../controllers/ingestionController');
const { validateApiKey } = require('../middleware/apiKeyAuth');
const { createProjectRateLimiter, createIpRateLimiter } = require('../middleware/apiRateLimit');

const router = express.Router();

// Tighter than the 100kb global limit: ingestion payloads are compact JSON and
// bulk is capped at 100 items in the controller. Reject oversized bodies early.
const MAX_INGEST_BYTES = 64 * 1024;

// 1) Per-IP limit first — cheapest, and guards the key-lookup below from floods.
router.use(createIpRateLimiter({ windowMs: 60000, max: 1200 }));

// 2) Oversized-body guard (independent of API-key validity).
router.use((req, res, next) => {
  const len = Number(req.headers['content-length'] || 0);
  if (len > MAX_INGEST_BYTES) {
    return res.status(413).json({ error: 'Payload too large', maxBytes: MAX_INGEST_BYTES });
  }
  return next();
});

// 3) Authenticate the public key (DB lookup), then 4) per-project rate limit.
router.use(validateApiKey);

const projectRateLimiter = createProjectRateLimiter({ windowMs: 60000, max: 1000 });
router.use(projectRateLimiter);

router.post('/pageviews', ingestionController.postPageViews);
router.post('/events', ingestionController.postEvents);
router.post('/errors', ingestionController.postErrors);
router.post('/performance', ingestionController.postPerformanceMetrics);

module.exports = router;
