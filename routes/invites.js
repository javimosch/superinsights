const express = require('express');
const router = express.Router();

const inviteAcceptController = require('../controllers/inviteAcceptController');
const platformInviteAcceptController = require('../controllers/platformInviteAcceptController');

router.get('/accept-invite', inviteAcceptController.getAcceptInvite);
router.post('/accept-invite', inviteAcceptController.postAcceptInvite);

router.get('/accept-platform-invite', platformInviteAcceptController.getAcceptPlatformInvite);
router.post('/accept-platform-invite', platformInviteAcceptController.postAcceptPlatformInvite);

module.exports = router;
