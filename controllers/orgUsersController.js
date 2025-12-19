const mongoose = require('mongoose');
const { models } = require('../utils/saasbackend');
const orgSettingsController = require('./orgSettingsController');

function normalizeEmail(email) {
  return (email || '').toLowerCase().trim();
}

function normalizeRole(role) {
  const r = String(role || '').trim().toLowerCase();
  if (r === 'owner') return 'owner';
  return 'viewer';
}

exports.getUsers = async (req, res, next) => {
  try {
    const orgId = req.currentOrg ? req.currentOrg._id : null;
    if (!orgId) {
      return res.status(403).render('error', {
        status: 403,
        message: 'You must belong to an organization to access this page.',
      });
    }

    const [org, members, invites] = await Promise.all([
      models.Organization.findById(orgId).lean(),
      models.OrganizationMember.find({ orgId, status: 'active' })
        .populate('userId', 'email name')
        .sort({ createdAt: -1 })
        .lean(),
      models.Invite.find({ orgId, status: 'pending' })
        .select('-tokenHash')
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const base = process.env.PUBLIC_URL || 'http://localhost:3000';
    const joinLink = org && org.allowPublicJoin ? `${base}/org/join/${org._id.toString()}` : null;

    const orgName = org ? org.name : 'Organization';

    return res.render('org/users', {
      title: 'Organization users - SuperInsights',
      org,
      members: members || [],
      invites: invites || [],
      joinLink,
      errors: [],
      successMessage: null,
      values: { email: '', role: 'viewer' },
      inviteLink: null,
      addedUserEmail: null,
      breadcrumbs: [
        { label: 'Home', href: '/', icon: 'home' },
        { label: orgName, href: '/org/users' },
        { label: 'Users', href: '/org/users' }
      ]
    });
  } catch (err) {
    return next(err);
  }
};

exports.postRenameOrg = orgSettingsController.postRenameOrg;
exports.postSetMemberRole = orgSettingsController.postSetMemberRole;

exports.postAddExistingUser = async (req, res, next) => {
  try {
    const orgId = req.currentOrg ? req.currentOrg._id : null;
    if (!orgId) {
      return res.status(403).render('error', {
        status: 403,
        message: 'You must belong to an organization to access this page.',
      });
    }

    const email = normalizeEmail(req.body.email);
    const role = normalizeRole(req.body.role);

    const errors = [];
    if (!email) errors.push('Email is required');

    if (errors.length) {
      req.currentOrgId = orgId;
      return exports.getUsers({ ...req, body: req.body }, res, next);
    }

    const user = await models.User.findOne({ email }).lean();
    if (!user) {
      return res.status(404).render('error', {
        status: 404,
        message: 'User not found. Use invite instead.',
      });
    }

    const existingMember = await models.OrganizationMember.findOne({ orgId, userId: user._id });
    if (existingMember) {
      if (existingMember.status === 'active') {
        return res.status(409).render('error', {
          status: 409,
          message: 'User is already a member of this organization.',
        });
      }
      existingMember.status = 'active';
      existingMember.role = role;
      existingMember.addedByUserId = req.session.user.id;
      await existingMember.save();
    } else {
      await models.OrganizationMember.create({
        orgId,
        userId: user._id,
        role,
        status: 'active',
        addedByUserId: req.session.user.id,
      });
    }

    const [org, members, invites] = await Promise.all([
      models.Organization.findById(orgId).lean(),
      models.OrganizationMember.find({ orgId, status: 'active' })
        .populate('userId', 'email name')
        .sort({ createdAt: -1 })
        .lean(),
      models.Invite.find({ orgId, status: 'pending' })
        .select('-tokenHash')
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const base = process.env.PUBLIC_URL || 'http://localhost:3000';
    const joinLink = org && org.allowPublicJoin ? `${base}/org/join/${org._id.toString()}` : null;

    return res.render('org/users', {
      title: 'Organization users - SuperInsights',
      org,
      members: members || [],
      invites: invites || [],
      joinLink,
      errors: [],
      successMessage: 'User added to organization.',
      values: { email: '', role: 'viewer' },
      inviteLink: null,
      addedUserEmail: user.email,
    });
  } catch (err) {
    return next(err);
  }
};

exports.postCreateInvite = async (req, res, next) => {
  try {
    const orgId = req.currentOrg ? req.currentOrg._id : null;
    if (!orgId) {
      return res.status(403).render('error', {
        status: 403,
        message: 'You must belong to an organization to access this page.',
      });
    }

    const email = normalizeEmail(req.body.email);
    const role = normalizeRole(req.body.role);

    const errors = [];
    if (!email) errors.push('Email is required');

    if (errors.length) {
      return exports.getUsers(req, res, next);
    }

    const existingUser = await models.User.findOne({ email }).lean();
    if (existingUser) {
      const existingMember = await models.OrganizationMember.findOne({
        orgId,
        userId: existingUser._id,
        status: 'active',
      }).lean();

      if (existingMember) {
        return res.status(409).render('error', {
          status: 409,
          message: 'User is already a member of this organization.',
        });
      }
    }

    const existingInvite = await models.Invite.findOne({ orgId, email, status: 'pending' }).lean();
    if (existingInvite) {
      return res.status(409).render('error', {
        status: 409,
        message: 'Invite already pending for this email.',
      });
    }

    const { token, tokenHash } = models.Invite.generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await models.Invite.create({
      email,
      tokenHash,
      expiresAt,
      status: 'pending',
      createdByUserId: req.session.user.id,
      orgId,
      role,
    });

    const base = process.env.PUBLIC_URL || 'http://localhost:3000';
    const inviteLink = `${base}/accept-invite?token=${encodeURIComponent(token)}`;

    const [org, members, invites] = await Promise.all([
      models.Organization.findById(orgId).lean(),
      models.OrganizationMember.find({ orgId, status: 'active' })
        .populate('userId', 'email name')
        .sort({ createdAt: -1 })
        .lean(),
      models.Invite.find({ orgId, status: 'pending' })
        .select('-tokenHash')
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const joinLink = org && org.allowPublicJoin ? `${base}/org/join/${org._id.toString()}` : null;

    return res.render('org/users', {
      title: 'Organization users - SuperInsights',
      org,
      members: members || [],
      invites: invites || [],
      joinLink,
      errors: [],
      successMessage: 'Invite created.',
      values: { email: '', role: 'viewer' },
      inviteLink,
      addedUserEmail: null,
    });
  } catch (err) {
    return next(err);
  }
};

exports.postRemoveMember = async (req, res, next) => {
  try {
    const orgId = req.currentOrg ? req.currentOrg._id : null;
    if (!orgId) {
      return res.status(403).render('error', {
        status: 403,
        message: 'You must belong to an organization to access this page.',
      });
    }

    const userId = String(req.body.userId || '').trim();
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).render('error', { status: 400, message: 'Invalid user ID.' });
    }

    if (String(userId) === String(req.session.user.id)) {
      return res.status(400).render('error', { status: 400, message: 'You cannot remove yourself.' });
    }

    const member = await models.OrganizationMember.findOne({ orgId, userId, status: 'active' });
    if (!member) {
      return res.status(404).render('error', { status: 404, message: 'Member not found.' });
    }

    if (member.role === 'owner') {
      const owners = await models.OrganizationMember.countDocuments({ orgId, role: 'owner', status: 'active' });
      if (owners <= 1) {
        return res.status(403).render('error', {
          status: 403,
          message: 'Cannot remove the last owner of the organization.',
        });
      }
    }

    member.status = 'removed';
    await member.save();

    return res.redirect('/org/users');
  } catch (err) {
    return next(err);
  }
};

exports.getJoinOrg = async (req, res, next) => {
  try {
    const orgId = String(req.params.orgId || '').trim();
    if (!orgId || !mongoose.Types.ObjectId.isValid(orgId)) {
      return res.status(400).render('error', { status: 400, message: 'Invalid organization ID.' });
    }

    const org = await models.Organization.findById(orgId).lean();
    if (!org || org.status !== 'active') {
      return res.status(404).render('error', { status: 404, message: 'Organization not found.' });
    }

    if (!org.allowPublicJoin) {
      return res.status(403).render('error', {
        status: 403,
        message: 'This organization does not allow joining via link.',
      });
    }

    return res.render('org/join', {
      title: 'Join organization - SuperInsights',
      org,
      errors: [],
    });
  } catch (err) {
    return next(err);
  }
};

exports.postJoinOrg = async (req, res, next) => {
  try {
    const orgId = String(req.params.orgId || '').trim();
    if (!orgId || !mongoose.Types.ObjectId.isValid(orgId)) {
      return res.status(400).render('error', { status: 400, message: 'Invalid organization ID.' });
    }

    const org = await models.Organization.findById(orgId).lean();
    if (!org || org.status !== 'active') {
      return res.status(404).render('error', { status: 404, message: 'Organization not found.' });
    }

    if (!org.allowPublicJoin) {
      return res.status(403).render('error', {
        status: 403,
        message: 'This organization does not allow joining via link.',
      });
    }

    const userId = req.session.user.id;

    const existing = await models.OrganizationMember.findOne({ orgId, userId });
    if (existing) {
      if (existing.status === 'active') {
        req.session.currentOrgId = String(orgId);
        return res.redirect('/projects');
      }
      existing.status = 'active';
      existing.role = 'viewer';
      await existing.save();
    } else {
      await models.OrganizationMember.create({
        orgId,
        userId,
        role: 'viewer',
        status: 'active',
      });
    }

    req.session.currentOrgId = String(orgId);
    return res.redirect('/projects');
  } catch (err) {
    return next(err);
  }
};
