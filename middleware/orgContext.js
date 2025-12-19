const mongoose = require('mongoose');
const { models } = require('../utils/saasbackend');

async function loadUserOrgs(req, res, next) {
  try {
    if (!req.session || !req.session.user) {
      req.orgs = [];
      req.currentOrg = null;
      return next();
    }

    const userId = req.session.user.id;

    const memberships = await models.OrganizationMember.find({
      userId,
      status: 'active',
    })
      .populate('orgId', 'name slug status')
      .sort({ createdAt: -1 })
      .lean();

    const orgs = (memberships || [])
      .filter((m) => m.orgId && m.orgId.status === 'active')
      .map((m) => ({
        _id: m.orgId._id,
        name: m.orgId.name,
        slug: m.orgId.slug,
        myRole: m.role,
      }));

    req.orgs = orgs;

    const sessionOrgId = req.session.currentOrgId;
    const hasSessionOrg =
      sessionOrgId && mongoose.Types.ObjectId.isValid(String(sessionOrgId));

    const selectedOrg = hasSessionOrg
      ? orgs.find((o) => String(o._id) === String(sessionOrgId))
      : null;

    req.currentOrg = selectedOrg || orgs[0] || null;

    if (req.currentOrg && String(req.session.currentOrgId || '') !== String(req.currentOrg._id)) {
      req.session.currentOrgId = String(req.currentOrg._id);
    }

    return next();
  } catch (err) {
    return next(err);
  }
}

function exposeOrgContextToViews(req, res, next) {
  res.locals.orgs = req.orgs || [];
  res.locals.currentOrg = req.currentOrg || null;
  next();
}

function requireOrgSelected(req, res, next) {
  if (req.session?.user?.role === 'admin') {
    return next();
  }

  if (!req.currentOrg) {
    return res.status(403).render('error', {
      status: 403,
      message: 'You must belong to an organization to access this page.',
    });
  }

  return next();
}

function requireOrgRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];

  return (req, res, next) => {
    if (req.session?.user?.role === 'admin') {
      return next();
    }

    if (!req.currentOrg) {
      return res.status(403).render('error', {
        status: 403,
        message: 'You must belong to an organization to access this page.',
      });
    }

    if (!allowed.includes(req.currentOrg.myRole)) {
      return res.status(403).render('error', {
        status: 403,
        message: 'You do not have permission to access this resource.',
      });
    }

    return next();
  };
}

function requireOrgRoleAtLeast(minRole) {
  const hierarchy = {
    owner: 2,
    viewer: 1,
  };

  return (req, res, next) => {
    if (req.session?.user?.role === 'admin') {
      return next();
    }

    if (!req.currentOrg) {
      return res.status(403).render('error', {
        status: 403,
        message: 'You must belong to an organization to access this page.',
      });
    }

    const myLevel = hierarchy[req.currentOrg.myRole] || 0;
    const minLevel = hierarchy[minRole] || 0;

    if (myLevel < minLevel) {
      return res.status(403).render('error', {
        status: 403,
        message: 'You do not have permission to access this resource.',
      });
    }

    return next();
  };
}

module.exports = {
  loadUserOrgs,
  exposeOrgContextToViews,
  requireOrgSelected,
  requireOrgRole,
  requireOrgRoleAtLeast,
};
