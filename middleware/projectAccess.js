const Project = require('../models/Project');

async function ensureProjectAccess(req, res, next) {
  try {
    const projectId = req.params.id;
    const userId = req.session.user && req.session.user.id;

    if (!projectId || !userId) {
      return res.status(403).render('error', {
        status: 403,
        message: 'You do not have permission to access this project.',
      });
    }

    const project = await Project.findById(projectId).populate('users.userId').exec();

    if (!project || project.deletedAt) {
      return res.status(404).render('404', {
        title: 'Not Found - SuperInsights',
      });
    }

    if (!project.hasUserAccess(userId)) {
      return res.status(403).render('error', {
        status: 403,
        message: 'You do not have permission to access this project.',
      });
    }

    const role = project.getUserRole(userId);

    req.project = project;
    req.userProjectRole = role;

    return next();
  } catch (err) {
    return next(err);
  }
}

function ensureProjectRole(roles) {
  return (req, res, next) => {
    const role = req.userProjectRole;

    if (!role || !roles.includes(role)) {
      return res.status(403).render('error', {
        status: 403,
        message: 'You do not have permission to perform this action.',
      });
    }

    return next();
  };
}

module.exports = {
  ensureProjectAccess,
  ensureProjectRole,
};
