const Project = require('../models/Project');
const { logAction } = require('../utils/aggregatedLogger');
const { ACTION_CODES } = require('../utils/actionCodes');
const { logAudit } = require('../utils/auditLogger');
const { logRawAction } = require('../utils/rawLogger');

exports.getPublicLinks = async (req, res, next) => {
  try {
    const projects = await Project.find({
      deletedAt: null,
      publicLinkEnabled: true,
    })
      .sort({ updatedAt: -1 })
      .lean();

    return res.render('admin/public-links', {
      title: 'Public links - SuperInsights',
      projects: projects || [],
      errors: [],
      successMessage: null,
    });
  } catch (err) {
    return next(err);
  }
};

exports.postRevokePublicLink = async (req, res, next) => {
  try {
    const projectId = req.body.projectId;
    if (!projectId) {
      return res.status(400).render('error', {
        status: 400,
        message: 'Project ID is required.',
      });
    }

    const project = await Project.findById(projectId).exec();
    if (!project || project.deletedAt) {
      return res.status(404).render('404', {
        title: 'Not Found - SuperInsights',
      });
    }

    project.publicLinkEnabled = false;
    project.publicLinkTokenHash = null;
    project.publicLinkToken = null;
    project.publicLinkRevokedAt = new Date();

    await project.save();

    try {
      const actorId = req?.session?.user?.id;
      const actorEmail = req?.session?.user?.email;

      logAction(ACTION_CODES.ADMIN_PROJECT_PUBLIC_LINK_REVOKE, {
        userId: actorId ? String(actorId) : null,
        email: actorEmail ? String(actorEmail) : null,
        projectId: project._id ? String(project._id) : null,
        status: 302,
        method: req.method,
        path: req.originalUrl,
      });

      logAudit(ACTION_CODES.ADMIN_PROJECT_PUBLIC_LINK_REVOKE, {
        userId: actorId ? String(actorId) : null,
        email: actorEmail ? String(actorEmail) : null,
        projectId: project._id ? String(project._id) : null,
        status: 302,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });

      logRawAction(ACTION_CODES.ADMIN_PROJECT_PUBLIC_LINK_REVOKE, {
        userId: actorId ? String(actorId) : null,
        email: actorEmail ? String(actorEmail) : null,
        projectId: project._id ? String(project._id) : null,
        status: 302,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });
    } catch (e) {
    }

    return res.redirect('/admin/public-links');
  } catch (err) {
    return next(err);
  }
};
