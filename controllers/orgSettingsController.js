const mongoose = require('mongoose');
const { models } = require('../utils/saasbackend');

function normalizeOrgName(name) {
  return String(name || '').trim();
}

function normalizeRole(role) {
  const r = String(role || '').trim().toLowerCase();
  return r === 'owner' ? 'owner' : 'viewer';
}

exports.postRenameOrg = async (req, res, next) => {
  try {
    const orgId = req.currentOrg ? req.currentOrg._id : null;
    const name = normalizeOrgName(req.body.name);

    if (!orgId) {
      return res.status(403).render('error', {
        status: 403,
        message: 'You must belong to an organization to access this page.',
      });
    }

    if (!name) {
      return res.status(400).render('error', { status: 400, message: 'Org name is required.' });
    }

    await models.Organization.updateOne({ _id: orgId }, { name });

    return res.redirect('/org/users');
  } catch (err) {
    return next(err);
  }
};

exports.postSetMemberRole = async (req, res, next) => {
  try {
    const orgId = req.currentOrg ? req.currentOrg._id : null;
    const userId = String(req.body.userId || '').trim();
    const role = normalizeRole(req.body.role);

    if (!orgId) {
      return res.status(403).render('error', {
        status: 403,
        message: 'You must belong to an organization to access this page.',
      });
    }

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).render('error', { status: 400, message: 'Invalid user ID.' });
    }

    const member = await models.OrganizationMember.findOne({ orgId, userId, status: 'active' });
    if (!member) {
      return res.status(404).render('error', { status: 404, message: 'Member not found.' });
    }

    if (member.role === 'owner' && role !== 'owner') {
      const owners = await models.OrganizationMember.countDocuments({ orgId, role: 'owner', status: 'active' });
      if (owners <= 1) {
        return res.status(403).render('error', {
          status: 403,
          message: 'Cannot demote the last owner of the organization.',
        });
      }
    }

    member.role = role;
    await member.save();

    return res.redirect('/org/users');
  } catch (err) {
    return next(err);
  }
};
