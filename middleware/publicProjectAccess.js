const Project = require('../models/Project');
const { hashPublicLinkToken, safeEqualHex } = require('../utils/publicLinkTokens');

async function ensurePublicProjectAccess(req, res, next) {
  try {
    const projectId = req.params.id;
    const token = req.params.token;

    if (!projectId || !token) {
      return res.status(404).render('404', {
        title: 'Not Found - SuperInsights',
      });
    }

    const project = await Project.findById(projectId).exec();

    if (!project || project.deletedAt) {
      return res.status(404).render('404', {
        title: 'Not Found - SuperInsights',
      });
    }

    if (!project.publicLinkEnabled || !project.publicLinkTokenHash) {
      return res.status(404).render('404', {
        title: 'Not Found - SuperInsights',
      });
    }

    const tokenHash = hashPublicLinkToken(token);
    const ok = safeEqualHex(project.publicLinkTokenHash, tokenHash);

    if (!ok) {
      return res.status(404).render('404', {
        title: 'Not Found - SuperInsights',
      });
    }

    req.project = project;
    req.userProjectRole = 'public';
    req.projectBasePath = `/p/${project._id.toString()}/${token}`;

    res.setHeader('X-Robots-Tag', 'noindex');

    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  ensurePublicProjectAccess,
};
