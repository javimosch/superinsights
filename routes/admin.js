const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const logsController = require('../controllers/logsController');
const publicLinksAdminController = require('../controllers/publicLinksAdminController');
const { ensureAuthenticated, ensureRole } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');

const adminInviteLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

router.use(ensureAuthenticated);
router.use(ensureRole('admin'));

router.get('/users', authController.getUsers);
router.post('/users/invite', adminInviteLimiter, authController.postInviteUser);

router.get('/logs', logsController.getLogs);

router.get('/public-links', publicLinksAdminController.getPublicLinks);
router.post('/public-links/revoke', publicLinksAdminController.postRevokePublicLink);

module.exports = router;
