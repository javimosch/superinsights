const bcrypt = require('bcryptjs');
const User = require('../models/User');
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

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).render('auth/register', {
        title: 'Register - SuperInsights',
        errors: ['A user with that email already exists'],
        values: { email },
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const userCount = await User.countDocuments();
    const role = userCount === 0 ? User.ROLES.ADMIN : User.ROLES.VIEWER;

    const user = await User.create({ email, passwordHash, role });

    req.session.user = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
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

    res.redirect('/');
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

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).render('auth/login', {
        title: 'Login - SuperInsights',
        errors: ['Invalid email or password'],
        values: { email },
      });
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
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
      role: user.role,
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

    res.redirect('/');
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
    const users = await User.find().sort({ createdAt: -1 }).lean();

    res.render('admin/users', {
      title: 'User Management - SuperInsights',
      users,
      roles: User.ROLES,
      errors: [],
      values: { email: '', role: User.ROLES.VIEWER },
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
    const role = req.body.role || User.ROLES.VIEWER;

    const errors = [];
    if (!email) errors.push('Email is required');
    if (![User.ROLES.ADMIN, User.ROLES.VIEWER].includes(role)) {
      errors.push('Invalid role');
    }

    if (errors.length) {
      const users = await User.find().sort({ createdAt: -1 }).lean();
      return res.status(400).render('admin/users', {
        title: 'User Management - SuperInsights',
        users,
        roles: User.ROLES,
        errors,
        values: { email, role },
        invitedUserEmail: null,
      });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      const users = await User.find().sort({ createdAt: -1 }).lean();
      return res.status(400).render('admin/users', {
        title: 'User Management - SuperInsights',
        users,
        roles: User.ROLES,
        errors: ['A user with that email already exists'],
        values: { email, role },
        invitedUserEmail: null,
      });
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const user = await User.create({ email, passwordHash, role });

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

    const users = await User.find().sort({ createdAt: -1 }).lean();

    res.render('admin/users', {
      title: 'User Management - SuperInsights',
      users,
      roles: User.ROLES,
      errors: [],
      values: { email: '', role: User.ROLES.VIEWER },
      invitedUserEmail: user.email,
    });
  } catch (err) {
    next(err);
  }
};
