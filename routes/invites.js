const express = require('express');
const router = express.Router();

const inviteAcceptController = require('../controllers/inviteAcceptController');

router.get('/accept-invite', inviteAcceptController.getAcceptInvite);
router.post('/accept-invite', inviteAcceptController.postAcceptInvite);

module.exports = router;
