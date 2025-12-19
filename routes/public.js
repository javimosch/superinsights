const express = require('express');
const router = express.Router();

const dashboardController = require('../controllers/dashboardController');
const pageViewsController = require('../controllers/pageViewsController');
const eventsController = require('../controllers/eventsController');
const errorsController = require('../controllers/errorsController');
const performanceController = require('../controllers/performanceController');
const docsController = require('../controllers/docsController');

const { ensurePublicProjectAccess } = require('../middleware/publicProjectAccess');
const { createRateLimiter } = require('../middleware/rateLimit');

const publicLimiter = createRateLimiter({ windowMs: 60_000, max: 60 });

router.use(publicLimiter);

router.get('/:id/:token/dashboard', ensurePublicProjectAccess, dashboardController.getDashboard);
router.get('/:id/:token/dashboard/data', ensurePublicProjectAccess, dashboardController.getDashboardData);

router.get('/:id/:token/pageviews', ensurePublicProjectAccess, pageViewsController.getPageViewsAnalytics);

router.get('/:id/:token/events', ensurePublicProjectAccess, eventsController.getEventsAnalytics);
router.get('/:id/:token/events/:eventName', ensurePublicProjectAccess, eventsController.getEventDetail);

router.get('/:id/:token/errors', ensurePublicProjectAccess, errorsController.getErrorsAnalytics);
router.get('/:id/:token/errors/:fingerprint', ensurePublicProjectAccess, errorsController.getErrorDetail);

router.get('/:id/:token/performance', ensurePublicProjectAccess, performanceController.getPerformanceAnalytics);

// Public docs routes (no authentication required)
router.get('/docs', docsController.getDocs);
router.get('/docs/:section', docsController.getDocs);

module.exports = router;
