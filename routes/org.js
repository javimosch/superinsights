const express = require('express');
const router = express.Router();

const { ensureAuthenticated } = require('../middleware/auth');
const { requireOrgSelected, requireOrgRoleAtLeast } = require('../middleware/orgContext');
const orgUsersController = require('../controllers/orgUsersController');
const orgPublicLinksController = require('../controllers/orgPublicLinksController');
const orgLogsController = require('../controllers/orgLogsController');

router.use(ensureAuthenticated);

router.post('/rename', requireOrgSelected, requireOrgRoleAtLeast('owner'), orgUsersController.postRenameOrg);

router.get('/users', requireOrgSelected, requireOrgRoleAtLeast('owner'), orgUsersController.getUsers);
router.post('/users/add', requireOrgSelected, requireOrgRoleAtLeast('owner'), orgUsersController.postAddExistingUser);
router.post('/users/invite', requireOrgSelected, requireOrgRoleAtLeast('owner'), orgUsersController.postCreateInvite);
router.post('/users/set-role', requireOrgSelected, requireOrgRoleAtLeast('owner'), orgUsersController.postSetMemberRole);
router.post('/users/remove', requireOrgSelected, requireOrgRoleAtLeast('owner'), orgUsersController.postRemoveMember);

router.get('/public-links', requireOrgSelected, requireOrgRoleAtLeast('owner'), orgPublicLinksController.getPublicLinks);
router.post('/public-links/revoke', requireOrgSelected, requireOrgRoleAtLeast('owner'), orgPublicLinksController.postRevokePublicLink);

router.get('/logs', requireOrgSelected, requireOrgRoleAtLeast('owner'), orgLogsController.getLogs);

router.get('/join/:orgId', orgUsersController.getJoinOrg);
router.post('/join/:orgId', orgUsersController.postJoinOrg);

router.post('/switch', (req, res) => {
  const orgId = String(req.body.orgId || '').trim();
  req.session.currentOrgId = orgId || null;

  const redirectTo = String(req.body.redirectTo || '').trim();
  if (redirectTo && redirectTo.startsWith('/')) {
    return res.redirect(redirectTo);
  }

  return res.redirect('/projects');
});

module.exports = router;
