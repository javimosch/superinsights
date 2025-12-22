const express = require('express');

const router = express.Router({ mergeParams: true });

const reportController = require('../controllers/reportController');
const { ensureProjectRole } = require('../middleware/projectAccess');

router.get('/', ensureProjectRole(['owner', 'admin', 'viewer']), reportController.getFilterTemplatesJson);
router.post('/', ensureProjectRole(['owner', 'admin']), reportController.postCreateFilterTemplate);
router.post('/:templateId/delete', ensureProjectRole(['owner', 'admin']), reportController.postDeleteFilterTemplate);

module.exports = router;
