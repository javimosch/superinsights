const express = require('express');
const router = express.Router();

const projectController = require('../controllers/projectController');
const pageViewsController = require('../controllers/pageViewsController');
const { ensureAuthenticated } = require('../middleware/auth');
const {
  ensureProjectAccess,
  ensureProjectRole,
} = require('../middleware/projectAccess');

router.use(ensureAuthenticated);

router.get('/', projectController.getProjects);
router.get('/new', projectController.getNewProject);
router.post('/', projectController.postCreateProject);

router.get(
  '/:id/settings',
  ensureProjectAccess,
  ensureProjectRole(['owner', 'admin']),
  projectController.getProjectSettings
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

router.get(
  '/:id/pageviews',
  ensureProjectAccess,
  pageViewsController.getPageViewsAnalytics
);

module.exports = router;
