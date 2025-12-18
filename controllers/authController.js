const { models } = require('../utils/saasbackend');
const Project = require('../models/Project');
const { logAction } = require('../utils/aggregatedLogger');
const { ACTION_CODES } = require('../utils/actionCodes');
const { logAudit } = require('../utils/auditLogger');
const { logRawAction } = require('../utils/rawLogger');

function normalizeEmail(email) {
  return (email || '').toLowerCase().trim();
}

exports.getRegister = (req, res) => {
  if (req.session.user) {
    return res.redirect('/');
  }

  res.render('auth/register', {
    title: 'Register - SuperInsights',
    errors: [],
    values: { email: '' },
  });
};

exports.postRegister = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = req.body.password || '';

    const errors = [];
    if (!email) errors.push('Email is required');
    if (!password || password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    if (errors.length) {
      return res.status(400).render('auth/register', {
        title: 'Register - SuperInsights',
        errors,
        values: { email },
      });
    }

    const existing = await models.User.findOne({ email }).lean();
    if (existing) {
      return res.status(400).render('auth/register', {
        title: 'Register - SuperInsights',
        errors: ['A user with that email already exists'],
        values: { email },
      });
    }

    const userCount = await models.User.countDocuments();
    const saasRole = userCount === 0 ? 'admin' : 'user';

    const user = await models.User.create({ email, passwordHash: password, role: saasRole });

    // Onboarding A: create org + initial project
    const orgName = `${user.email.split('@')[0]}'s Workspace`;
    const org = await models.Organization.create({
      name: orgName,
      slug: `${user.email.split('@')[0]}-${Date.now().toString(36)}`,
      ownerUserId: user._id,
      allowPublicJoin: false,
      status: 'active',
    });

    await models.OrganizationMember.create({
      orgId: org._id,
      userId: user._id,
      role: 'owner',
      status: 'active',
      addedByUserId: user._id,
    });

    const { publicKey, secretKey } = Project.generateApiKeys();
    const project = await Project.create({
      name: 'My First Project',
      icon: '📊',
      environment: 'production',
      dataRetentionDays: 90,
      publicApiKey: publicKey,
      secretApiKey: secretKey,
      saasOrgId: org._id,
    });

    req.session.user = {
      id: user._id.toString(),
      email: user.email,
      role: user.role === 'admin' ? 'admin' : 'viewer',
    };

    try {
      logAction(ACTION_CODES.AUTH_REGISTER_SUCCESS, {
        userId: req.session.user.id,
        email: req.session.user.email,
        status: 302,
        method: req.method,
        path: req.originalUrl,
      });

      logAudit(ACTION_CODES.AUTH_REGISTER_SUCCESS, {
        userId: req.session.user.id,
        email: req.session.user.email,
        status: 302,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });

      logRawAction(ACTION_CODES.AUTH_REGISTER_SUCCESS, {
        userId: req.session.user.id,
        email: req.session.user.email,
        status: 302,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });
    } catch (e) {
      // ignore
    }

    res.redirect(`/projects/${project._id.toString()}/dashboard`);
  } catch (err) {
    next(err);
  }
};

exports.getLogin = (req, res) => {
  if (req.session.user) {
    return res.redirect('/');
  }

  res.render('auth/login', {
    title: 'Login - SuperInsights',
    errors: [],
    values: { email: '' },
  });
};

exports.postLogin = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = req.body.password || '';

    const user = await models.User.findOne({ email });
    if (!user) {
      return res.status(400).render('auth/login', {
        title: 'Login - SuperInsights',
        errors: ['Invalid email or password'],
        values: { email },
      });
    }

    const matches = await user.comparePassword(password);
    if (!matches) {
      return res.status(400).render('auth/login', {
        title: 'Login - SuperInsights',
        errors: ['Invalid email or password'],
        values: { email },
      });
    }

    req.session.user = {
      id: user._id.toString(),
      email: user.email,
      role: user.role === 'admin' ? 'admin' : 'viewer',
    };

    try {
      logAction(ACTION_CODES.AUTH_LOGIN_SUCCESS, {
        userId: req.session.user.id,
        email: req.session.user.email,
        status: 302,
        method: req.method,
        path: req.originalUrl,
      });

      logAudit(ACTION_CODES.AUTH_LOGIN_SUCCESS, {
        userId: req.session.user.id,
        email: req.session.user.email,
        status: 302,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });

      logRawAction(ACTION_CODES.AUTH_LOGIN_SUCCESS, {
        userId: req.session.user.id,
        email: req.session.user.email,
        status: 302,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });
    } catch (e) {
      // ignore
    }

    res.redirect('/projects');
  } catch (err) {
    next(err);
  }
};

exports.postLogout = (req, res, next) => {
  try {
    const userId = req?.session?.user?.id;
    const email = req?.session?.user?.email;

    req.session.destroy((err) => {
      if (err) return next(err);

      try {
        logAction(ACTION_CODES.AUTH_LOGOUT, {
          userId: userId ? String(userId) : null,
          email: email ? String(email) : null,
          status: 302,
          method: req.method,
          path: req.originalUrl,
        });

        logAudit(ACTION_CODES.AUTH_LOGOUT, {
          userId: userId ? String(userId) : null,
          email: email ? String(email) : null,
          status: 302,
          method: req.method,
          path: req.originalUrl,
          ip: req.ip,
        });

        logRawAction(ACTION_CODES.AUTH_LOGOUT, {
          userId: userId ? String(userId) : null,
          email: email ? String(email) : null,
          status: 302,
          method: req.method,
          path: req.originalUrl,
          ip: req.ip,
        });
      } catch (e) {
        // ignore
      }

      res.redirect('/auth/login');
    });
  } catch (err) {
    next(err);
  }
};

exports.getUsers = async (req, res, next) => {
  try {
    const users = await models.User.find()
      .select('email role createdAt')
      .sort({ createdAt: -1 })
      .lean();

    res.render('admin/users', {
      title: 'User Management - SuperInsights',
      users,
      roles: { ADMIN: 'admin', VIEWER: 'viewer' },
      errors: [],
      values: { email: '', role: 'viewer' },
      invitedUserEmail: null,
    });
  } catch (err) {
    next(err);
  }
};

function generateTempPassword() {
  return Math.random().toString(36).slice(-10);
}

exports.postInviteUser = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const role = req.body.role || 'viewer';

    const errors = [];
    if (!email) errors.push('Email is required');
    if (!['admin', 'viewer'].includes(role)) {
      errors.push('Invalid role');
    }

    if (errors.length) {
      const users = await models.User.find().select('email role createdAt').sort({ createdAt: -1 }).lean();
      return res.status(400).render('admin/users', {
        title: 'User Management - SuperInsights',
        users,
        roles: { ADMIN: 'admin', VIEWER: 'viewer' },
        errors,
        values: { email, role },
        invitedUserEmail: null,
      });
    }

    const existing = await models.User.findOne({ email }).lean();
    if (existing) {
      const users = await models.User.find().select('email role createdAt').sort({ createdAt: -1 }).lean();
      return res.status(400).render('admin/users', {
        title: 'User Management - SuperInsights',
        users,
        roles: { ADMIN: 'admin', VIEWER: 'viewer' },
        errors: ['A user with that email already exists'],
        values: { email, role },
        invitedUserEmail: null,
      });
    }

    const tempPassword = generateTempPassword();
    const saasRole = role === 'admin' ? 'admin' : 'user';
    const user = await models.User.create({ email, passwordHash: tempPassword, role: saasRole });

    try {
      const actorId = req?.session?.user?.id;
      const actorEmail = req?.session?.user?.email;

      logAction(ACTION_CODES.ADMIN_INVITE_USER, {
        userId: actorId ? String(actorId) : null,
        email: actorEmail ? String(actorEmail) : null,
        status: 200,
        method: req.method,
        path: req.originalUrl,
      });

      logAudit(ACTION_CODES.ADMIN_INVITE_USER, {
        userId: actorId ? String(actorId) : null,
        email: actorEmail ? String(actorEmail) : null,
        status: 200,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });

      logRawAction(ACTION_CODES.ADMIN_INVITE_USER, {
        userId: actorId ? String(actorId) : null,
        email: actorEmail ? String(actorEmail) : null,
        status: 200,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });
    } catch (e) {
      // ignore
    }

    const users = await models.User.find().select('email role createdAt').sort({ createdAt: -1 }).lean();

    res.render('admin/users', {
      title: 'User Management - SuperInsights',
      users,
      roles: { ADMIN: 'admin', VIEWER: 'viewer' },
      errors: [],
      values: { email: '', role: 'viewer' },
      invitedUserEmail: user.email,
    });
  } catch (err) {
    next(err);
  }
};
