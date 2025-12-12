const express = require('express');

const ingestionController = require('../controllers/ingestionController');
const { validateApiKey } = require('../middleware/apiKeyAuth');
const { createProjectRateLimiter } = require('../middleware/apiRateLimit');

const router = express.Router();

router.use(validateApiKey);

const projectRateLimiter = createProjectRateLimiter({ windowMs: 60000, max: 1000 });
router.use(projectRateLimiter);

router.post('/pageviews', ingestionController.postPageViews);
router.post('/events', ingestionController.postEvents);
router.post('/errors', ingestionController.postErrors);
router.post('/performance', ingestionController.postPerformanceMetrics);

module.exports = router;
