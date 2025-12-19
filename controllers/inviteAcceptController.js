const { models } = require('../utils/saasbackend');

function normalizeEmail(email) {
  return (email || '').toLowerCase().trim();
}

exports.getAcceptInvite = async (req, res, next) => {
  try {
    const token = String(req.query.token || '').trim();
    if (!token) {
      return res.status(400).render('error', { status: 400, message: 'Invite token is required.' });
    }

    const inviteInfo = await models.Invite.findOne({ tokenHash: models.Invite.hashToken(token) })
      .select('-tokenHash')
      .populate('orgId', 'name slug')
      .lean();

    if (!inviteInfo) {
      return res.status(404).render('error', { status: 404, message: 'Invalid invite token.' });
    }

    if (inviteInfo.status !== 'pending') {
      return res.status(400).render('error', { status: 400, message: `Invite has been ${inviteInfo.status}.` });
    }

    if (inviteInfo.expiresAt < new Date()) {
      inviteInfo.status = 'expired';
      await models.Invite.updateOne({ _id: inviteInfo._id }, { status: 'expired' });
      return res.status(400).render('error', { status: 400, message: 'Invite has expired.' });
    }

    const existingUser = await models.User.findOne({ email: inviteInfo.email }).lean();

    return res.render('auth/accept-invite', {
      title: 'Accept Invite - SuperInsights',
      token,
      invite: inviteInfo,
      userExists: Boolean(existingUser),
      errors: [],
      values: { name: '', email: inviteInfo.email },
    });
  } catch (err) {
    return next(err);
  }
};

exports.postAcceptInvite = async (req, res, next) => {
  try {
    const token = String(req.body.token || '').trim();
    const name = String(req.body.name || '').trim();
    const password = String(req.body.password || '');

    if (!token) {
      return res.status(400).render('error', { status: 400, message: 'Invite token is required.' });
    }

    const tokenHash = models.Invite.hashToken(token);
    const invite = await models.Invite.findOne({ tokenHash }).populate('orgId');

    if (!invite) {
      return res.status(404).render('error', { status: 404, message: 'Invalid invite token.' });
    }

    if (invite.status !== 'pending') {
      return res.status(400).render('error', { status: 400, message: `Invite has been ${invite.status}.` });
    }

    if (invite.expiresAt < new Date()) {
      invite.status = 'expired';
      await invite.save();
      return res.status(400).render('error', { status: 400, message: 'Invite has expired.' });
    }

    let user = await models.User.findOne({ email: invite.email });

    if (!user) {
      if (!password || password.length < 8) {
        return res.status(400).render('auth/accept-invite', {
          title: 'Accept Invite - SuperInsights',
          token,
          invite: invite.toJSON(),
          userExists: false,
          errors: ['Password is required (min 8 characters) for new account'],
          values: { name, email: invite.email },
        });
      }

      const userCount = await models.User.countDocuments();
      user = await models.User.create({
        email: normalizeEmail(invite.email),
        passwordHash: password,
        name,
        role: userCount === 0 ? 'admin' : 'user',
      });
    }

    const existingMember = await models.OrganizationMember.findOne({
      orgId: invite.orgId._id,
      userId: user._id,
    });

    if (existingMember) {
      if (existingMember.status === 'active') {
        invite.status = 'accepted';
        await invite.save();
        return res.status(409).render('error', { status: 409, message: 'Already a member of this organization.' });
      }
      existingMember.status = 'active';
      existingMember.role = invite.role;
      await existingMember.save();
    } else {
      await models.OrganizationMember.create({
        orgId: invite.orgId._id,
        userId: user._id,
        role: invite.role,
      });
    }

    invite.status = 'accepted';
    await invite.save();

    // Sign user into Superinsights session
    req.session.user = {
      id: user._id.toString(),
      email: user.email,
      role: user.role === 'admin' ? 'admin' : 'viewer',
    };

    req.session.currentOrgId = invite.orgId && invite.orgId._id ? invite.orgId._id.toString() : null;

    return res.redirect('/projects');
  } catch (err) {
    return next(err);
  }
};
