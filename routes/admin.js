const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const platformAdminController = require('../controllers/platformAdminController');
const logsController = require('../controllers/logsController');
const publicLinksAdminController = require('../controllers/publicLinksAdminController');
const { ensureAuthenticated, ensureRole } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');

const adminInviteLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });
const platformInviteLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

router.use(ensureAuthenticated);
router.use(ensureRole('admin'));

router.get('/', platformAdminController.getAdminHome);

router.get('/users', platformAdminController.getPlatformUsers);
router.post('/users/invite', adminInviteLimiter, authController.postInviteUser);

router.post('/users/set-role', platformAdminController.postSetUserRole);
router.post('/users/set-password', platformAdminController.postSetUserPassword);
router.post('/users/delete', platformAdminController.postDeleteUser);
router.post('/users/platform-invite', platformInviteLimiter, platformAdminController.postCreatePlatformInvite);

router.get('/orgs', platformAdminController.getOrgs);
router.post('/orgs', platformAdminController.postCreateOrg);
router.post('/orgs/rename', platformAdminController.postRenameOrg);
router.post('/orgs/disable', platformAdminController.postDisableOrg);

router.get('/logs', logsController.getLogs);

router.get('/public-links', publicLinksAdminController.getPublicLinks);
router.post('/public-links/revoke', publicLinksAdminController.postRevokePublicLink);

module.exports = router;
