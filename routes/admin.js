const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const auditController = require('../controllers/auditController');
const logsController = require('../controllers/logsController');
const { ensureAuthenticated, ensureRole } = require('../middleware/auth');
const User = require('../models/User');
const { createRateLimiter } = require('../middleware/rateLimit');

const adminInviteLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

router.use(ensureAuthenticated);
router.use(ensureRole(User.ROLES.ADMIN));

router.get('/users', authController.getUsers);
router.post('/users/invite', adminInviteLimiter, authController.postInviteUser);

router.get('/audit', auditController.getAudit);

router.get('/logs', logsController.getLogs);

module.exports = router;
