const mongoose = require('mongoose');

const PlatformInvite = require('../models/PlatformInvite');
const { models } = require('../utils/saasbackend');

function normalizeEmail(email) {
  return (email || '').toLowerCase().trim();
}

function normalizePlatformRole(role) {
  const r = String(role || '').trim().toLowerCase();
  return r === 'admin' ? 'admin' : 'user';
}

function normalizeOrgName(name) {
  return String(name || '').trim();
}

function generateOrgSlug(name) {
  const base = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
  return `${base}-${Date.now().toString(36)}`;
}

exports.getAdminHome = async (req, res, next) => {
  try {
    return res.render('admin/index', {
      title: 'Platform admin - SuperInsights',
      breadcrumbs: [
        { label: 'Home', href: '/', icon: 'home' },
        { label: 'Platform Admin', href: '/admin' }
      ]
    });
  } catch (err) {
    return next(err);
  }
};

exports.getPlatformUsers = async (req, res, next) => {
  try {
    const users = await models.User.find()
      .select('email role createdAt')
      .sort({ createdAt: -1 })
      .lean();

    const invites = await PlatformInvite.find({ status: 'pending' })
      .select('-tokenHash')
      .sort({ createdAt: -1 })
      .lean();

    return res.render('admin/users', {
      title: 'Platform users - SuperInsights',
      users,
      platformInvites: invites || [],
      errors: [],
      successMessage: null,
      inviteLink: null,
      values: { email: '', role: 'user' },
      invitedUserEmail: null,
      breadcrumbs: [
        { label: 'Home', href: '/', icon: 'home' },
        { label: 'Platform Admin', href: '/admin' },
        { label: 'Platform Users', href: '/admin/users' }
      ]
    });
  } catch (err) {
    return next(err);
  }
};

exports.postCreatePlatformInvite = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const role = normalizePlatformRole(req.body.role);

    const errors = [];
    if (!email) errors.push('Email is required');

    if (errors.length) {
      const users = await models.User.find().select('email role createdAt').sort({ createdAt: -1 }).lean();
      const invites = await PlatformInvite.find({ status: 'pending' }).select('-tokenHash').sort({ createdAt: -1 }).lean();
      return res.status(400).render('admin/users', {
        title: 'Platform users - SuperInsights',
        users,
        platformInvites: invites || [],
        errors,
        successMessage: null,
        inviteLink: null,
        values: { email, role },
        invitedUserEmail: null,
      });
    }

    const existingUser = await models.User.findOne({ email }).lean();
    if (existingUser) {
      return res.status(409).render('error', {
        status: 409,
        message: 'A user with that email already exists. Change their role instead.',
      });
    }

    const existingInvite = await PlatformInvite.findOne({ email, status: 'pending' }).lean();
    if (existingInvite) {
      return res.status(409).render('error', { status: 409, message: 'Invite already pending for this email.' });
    }

    const { token, tokenHash } = PlatformInvite.generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await PlatformInvite.create({
      email,
      tokenHash,
      expiresAt,
      status: 'pending',
      role,
      createdByUserId: new mongoose.Types.ObjectId(String(req.session.user.id)),
    });

    const base = process.env.PUBLIC_URL || 'http://localhost:3000';
    const inviteLink = `${base}/accept-platform-invite?token=${encodeURIComponent(token)}`;

    const users = await models.User.find().select('email role createdAt').sort({ createdAt: -1 }).lean();
    const invites = await PlatformInvite.find({ status: 'pending' }).select('-tokenHash').sort({ createdAt: -1 }).lean();

    return res.render('admin/users', {
      title: 'Platform users - SuperInsights',
      users,
      platformInvites: invites || [],
      errors: [],
      successMessage: 'Invite created.',
      inviteLink,
      values: { email: '', role: 'user' },
      invitedUserEmail: null,
    });
  } catch (err) {
    return next(err);
  }
};

exports.postSetUserPassword = async (req, res, next) => {
  try {
    const userId = String(req.body.userId || '').trim();
    const password = String(req.body.password || '');

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).render('error', { status: 400, message: 'Invalid user ID.' });
    }

    if (!password || password.length < 8) {
      return res.status(400).render('error', { status: 400, message: 'Password must be at least 8 characters.' });
    }

    const user = await models.User.findById(userId);
    if (!user) {
      return res.status(404).render('error', { status: 404, message: 'User not found.' });
    }

    user.passwordHash = password;
    await user.save();

    return res.redirect('/admin/users');
  } catch (err) {
    return next(err);
  }
};

exports.postSetUserRole = async (req, res, next) => {
  try {
    const userId = String(req.body.userId || '').trim();
    const role = normalizePlatformRole(req.body.role);

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).render('error', { status: 400, message: 'Invalid user ID.' });
    }

    const user = await models.User.findById(userId);
    if (!user) {
      return res.status(404).render('error', { status: 404, message: 'User not found.' });
    }

    user.role = role;
    await user.save();

    if (req.session.user && String(req.session.user.id) === String(user._id)) {
      req.session.user.role = user.role === 'admin' ? 'admin' : 'viewer';
    }

    return res.redirect('/admin/users');
  } catch (err) {
    return next(err);
  }
};

exports.postDeleteUser = async (req, res, next) => {
  try {
    const userId = String(req.body.userId || '').trim();

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID.' });
    }

    const user = await models.User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Prevent deletion of the last admin user
    if (user.role === 'admin') {
      const adminCount = await models.User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return res.status(400).json({ success: false, message: 'Cannot delete the last admin user.' });
      }
    }

    // Prevent self-deletion
    if (String(userId) === String(req.session.user.id)) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account.' });
    }

    // Remove user from all organizations
    await models.OrganizationMember.deleteMany({ userId });

    // Delete the user
    await models.User.findByIdAndDelete(userId);

    return res.json({ success: true, message: 'User deleted successfully.' });
  } catch (err) {
    console.error('Error deleting user:', err);
    return res.status(500).json({ success: false, message: 'An error occurred while deleting the user.' });
  }
};

exports.getOrgs = async (req, res, next) => {
  try {
    const orgs = await models.Organization.find()
      .select('name slug status ownerUserId createdAt')
      .sort({ createdAt: -1 })
      .lean();

    return res.render('admin/orgs', {
      title: 'Organizations - SuperInsights',
      orgs: orgs || [],
      errors: [],
      successMessage: null,
      values: { name: '' },
      breadcrumbs: [
        { label: 'Home', href: '/', icon: 'home' },
        { label: 'Platform Admin', href: '/admin' },
        { label: 'Organizations', href: '/admin/orgs' }
      ]
    });
  } catch (err) {
    return next(err);
  }
};

exports.postCreateOrg = async (req, res, next) => {
  try {
    const name = normalizeOrgName(req.body.name);
    const errors = [];
    if (!name) errors.push('Name is required');

    if (errors.length) {
      const orgs = await models.Organization.find().select('name slug status ownerUserId createdAt').sort({ createdAt: -1 }).lean();
      return res.status(400).render('admin/orgs', {
        title: 'Organizations - SuperInsights',
        orgs: orgs || [],
        errors,
        successMessage: null,
        values: { name },
      });
    }

    const slug = generateOrgSlug(name);

    const org = await models.Organization.create({
      name,
      slug,
      ownerUserId: new mongoose.Types.ObjectId(String(req.session.user.id)),
      allowPublicJoin: false,
      status: 'active',
    });

    await models.OrganizationMember.create({
      orgId: org._id,
      userId: new mongoose.Types.ObjectId(String(req.session.user.id)),
      role: 'owner',
      status: 'active',
      addedByUserId: new mongoose.Types.ObjectId(String(req.session.user.id)),
    });

    return res.redirect('/admin/orgs');
  } catch (err) {
    return next(err);
  }
};

exports.postRenameOrg = async (req, res, next) => {
  try {
    const orgId = String(req.body.orgId || '').trim();
    const name = normalizeOrgName(req.body.name);

    if (!orgId || !mongoose.Types.ObjectId.isValid(orgId)) {
      return res.status(400).render('error', { status: 400, message: 'Invalid org ID.' });
    }

    if (!name) {
      return res.status(400).render('error', { status: 400, message: 'Org name is required.' });
    }

    await models.Organization.updateOne({ _id: orgId }, { name: name.trim() });

    return res.redirect('/admin/orgs');
  } catch (err) {
    return next(err);
  }
};

exports.postDisableOrg = async (req, res, next) => {
  try {
    const orgId = String(req.body.orgId || '').trim();
    if (!orgId || !mongoose.Types.ObjectId.isValid(orgId)) {
      return res.status(400).render('error', { status: 400, message: 'Invalid org ID.' });
    }

    await models.Organization.updateOne({ _id: orgId }, { status: 'disabled' });

    return res.redirect('/admin/orgs');
  } catch (err) {
    return next(err);
  }
};
