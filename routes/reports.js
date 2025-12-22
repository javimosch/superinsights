const express = require('express');

const router = express.Router({ mergeParams: true });

const reportController = require('../controllers/reportController');
const { ensureProjectRole } = require('../middleware/projectAccess');

router.get('/', ensureProjectRole(['owner', 'admin', 'viewer']), reportController.getReportsPage);
router.get('/new', ensureProjectRole(['owner', 'admin']), reportController.getNewReportPage);
router.post('/generate', ensureProjectRole(['owner', 'admin']), reportController.postGenerateReport);

router.get('/:reportId', ensureProjectRole(['owner', 'admin', 'viewer']), reportController.getReportDetailPage);
router.get('/:reportId/status', ensureProjectRole(['owner', 'admin', 'viewer']), reportController.getReportStatus);
router.get('/:reportId/download', ensureProjectRole(['owner', 'admin', 'viewer']), reportController.getReportDownload);
router.post('/:reportId/delete', ensureProjectRole(['owner', 'admin']), reportController.postDeleteReport);

module.exports = router;
