function ensureAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }

  return res.redirect('/auth/login');
}

function ensureRole(role) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.redirect('/auth/login');
    }

    if (req.session.user.role !== role) {
      return res.status(403).render('error', {
        status: 403,
        message: 'You do not have permission to access this resource.',
      });
    }

    return next();
  };
}

module.exports = {
  ensureAuthenticated,
  ensureRole,
};
