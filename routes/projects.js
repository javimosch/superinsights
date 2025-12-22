const express = require('express');
const router = express.Router();

const projectController = require('../controllers/projectController');
const pageViewsController = require('../controllers/pageViewsController');
const eventsController = require('../controllers/eventsController');
const errorsController = require('../controllers/errorsController');
const performanceController = require('../controllers/performanceController');
 const dashboardController = require('../controllers/dashboardController');
const aiAnalysisController = require('../controllers/aiAnalysisController');
 const reportsRouter = require('./reports');
 const filterTemplatesRouter = require('./filter-templates');
const { ensureAuthenticated } = require('../middleware/auth');
 const { requireOrgSelected, requireOrgRoleAtLeast } = require('../middleware/orgContext');
const {
  ensureProjectAccess,
  ensureProjectRole,
} = require('../middleware/projectAccess');

router.use(ensureAuthenticated);
 router.use(requireOrgSelected);

router.get('/', projectController.getProjects);
router.get('/new', requireOrgRoleAtLeast('owner'), projectController.getNewProject);
router.post('/', requireOrgRoleAtLeast('owner'), projectController.postCreateProject);

router.get(
  '/:id/settings',
  ensureProjectAccess,
  ensureProjectRole(['owner', 'admin']),
  projectController.getProjectSettings
);

router.post(
  '/:id/settings/drop-events',
  ensureProjectAccess,
  ensureProjectRole(['owner', 'admin']),
  projectController.postUpdateDropEventsSettings
);

router.get(
  '/:id/settings/drop-events/report',
  ensureProjectAccess,
  ensureProjectRole(['owner', 'admin']),
  projectController.getDropEventsReport
);

router.post(
  '/:id/update',
  ensureProjectAccess,
  ensureProjectRole(['owner', 'admin']),
  projectController.postUpdateProject
);

router.post(
  '/:id/regenerate-keys',
  ensureProjectAccess,
  ensureProjectRole(['owner']),
  projectController.postRegenerateKeys
);

router.post(
  '/:id/public-link/enable',
  ensureProjectAccess,
  ensureProjectRole(['owner']),
  projectController.postEnablePublicLink
);

router.post(
  '/:id/public-link/regenerate',
  ensureProjectAccess,
  ensureProjectRole(['owner']),
  projectController.postRegeneratePublicLink
);

router.post(
  '/:id/public-link/revoke',
  ensureProjectAccess,
  ensureProjectRole(['owner']),
  projectController.postRevokePublicLink
);

router.post(
  '/:id/users/add',
  ensureProjectAccess,
  ensureProjectRole(['owner', 'admin']),
  projectController.postAddUser
);

router.post(
  '/:id/users/remove',
  ensureProjectAccess,
  ensureProjectRole(['owner']),
  projectController.postRemoveUser
);

router.post(
  '/:id/delete',
  ensureProjectAccess,
  ensureProjectRole(['owner']),
  projectController.postSoftDelete
);

router.post(
  '/:id/clear-data',
  ensureProjectAccess,
  ensureProjectRole(['owner']),
  projectController.postClearProjectData
);

router.get(
  '/:id/dashboard',
  ensureProjectAccess,
  dashboardController.getDashboard
);

router.get(
  '/:id/dashboard/data',
  ensureProjectAccess,
  dashboardController.getDashboardData
);

router.get(
  '/:id/pageviews',
  ensureProjectAccess,
  pageViewsController.getPageViewsAnalytics
);

router.get(
  '/:id/events',
  ensureProjectAccess,
  eventsController.getEventsAnalytics
);

router.get(
  '/:id/events/:eventName',
  ensureProjectAccess,
  eventsController.getEventDetail
);

router.get(
  '/:id/errors',
  ensureProjectAccess,
  errorsController.getErrorsAnalytics
);

router.get(
  '/:id/errors/:fingerprint',
  ensureProjectAccess,
  errorsController.getErrorDetail
);

router.get(
  '/:id/performance',
  ensureProjectAccess,
  performanceController.getPerformanceAnalytics
);

router.get(
  '/:id/ai-analysis',
  ensureProjectAccess,
  aiAnalysisController.getAiAnalysisPage
);

router.post(
  '/:id/ai-analysis/run',
  ensureProjectAccess,
  aiAnalysisController.postRunAiAnalysis
);

router.get(
  '/:id/ai-analysis/runs',
  ensureProjectAccess,
  aiAnalysisController.getAiAnalysisRunsJson
);

router.get(
  '/:id/ai-analysis/runs/:runId',
  ensureProjectAccess,
  aiAnalysisController.getAiAnalysisRunJson
);

 router.use('/:id/reports', ensureProjectAccess, reportsRouter);
 router.use('/:id/filter-templates', ensureProjectAccess, filterTemplatesRouter);

module.exports = router;
