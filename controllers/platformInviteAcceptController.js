const { models } = require('../utils/saasbackend');
const PlatformInvite = require('../models/PlatformInvite');

function normalizeEmail(email) {
  return (email || '').toLowerCase().trim();
}

exports.getAcceptPlatformInvite = async (req, res, next) => {
  try {
    const token = String(req.query.token || '').trim();
    if (!token) {
      return res.status(400).render('error', { status: 400, message: 'Invite token is required.' });
    }

    const inviteInfo = await PlatformInvite.findOne({ tokenHash: PlatformInvite.hashToken(token) })
      .select('-tokenHash')
      .lean();

    if (!inviteInfo) {
      return res.status(404).render('error', { status: 404, message: 'Invalid invite token.' });
    }

    if (inviteInfo.status !== 'pending') {
      return res.status(400).render('error', { status: 400, message: `Invite has been ${inviteInfo.status}.` });
    }

    if (inviteInfo.expiresAt < new Date()) {
      await PlatformInvite.updateOne({ _id: inviteInfo._id }, { status: 'expired' });
      return res.status(400).render('error', { status: 400, message: 'Invite has expired.' });
    }

    const existingUser = await models.User.findOne({ email: inviteInfo.email }).lean();

    return res.render('auth/accept-platform-invite', {
      title: 'Accept Platform Invite - SuperInsights',
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

exports.postAcceptPlatformInvite = async (req, res, next) => {
  try {
    const token = String(req.body.token || '').trim();
    const name = String(req.body.name || '').trim();
    const password = String(req.body.password || '');

    if (!token) {
      return res.status(400).render('error', { status: 400, message: 'Invite token is required.' });
    }

    const tokenHash = PlatformInvite.hashToken(token);
    const invite = await PlatformInvite.findOne({ tokenHash });

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
        return res.status(400).render('auth/accept-platform-invite', {
          title: 'Accept Platform Invite - SuperInsights',
          token,
          invite: invite.toJSON(),
          userExists: false,
          errors: ['Password is required (min 8 characters) for new account'],
          values: { name, email: invite.email },
        });
      }

      user = await models.User.create({
        email: normalizeEmail(invite.email),
        passwordHash: password,
        name,
        role: invite.role,
      });
    } else {
      // Existing user: allow role promotion via platform invite
      if (invite.role === 'admin' && user.role !== 'admin') {
        user.role = 'admin';
        await user.save();
      }
    }

    invite.status = 'accepted';
    await invite.save();

    req.session.user = {
      id: user._id.toString(),
      email: user.email,
      role: user.role === 'admin' ? 'admin' : 'viewer',
    };

    req.session.currentOrgId = req.session.currentOrgId || null;

    return res.redirect('/projects');
  } catch (err) {
    return next(err);
  }
};
