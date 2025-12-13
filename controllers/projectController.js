const Project = require('../models/Project');
const User = require('../models/User');
const { logAction } = require('../utils/aggregatedLogger');
const { ACTION_CODES } = require('../utils/actionCodes');
const { logAudit } = require('../utils/auditLogger');
const { logRawAction } = require('../utils/rawLogger');

function normalizeName(name) {
  return (name || '').trim();
}

function parseDataRetentionDays(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  return num;
}

exports.getProjects = async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const projects = await Project.findActiveProjects(userId);

    res.render('projects/index', {
      title: 'Projects - SuperInsights',
      projects,
      errors: [],
      values: {},
    });
  } catch (err) {
    next(err);
  }
};

exports.getNewProject = (req, res) => {
  res.render('projects/new', {
    title: 'New Project - SuperInsights',
    errors: [],
    values: {
      name: '',
      icon: '📊',
      environment: 'production',
      dataRetentionDays: 90,
    },
    environments: Project.ENVIRONMENTS,
  });
};

exports.postCreateProject = async (req, res, next) => {
  try {
    const name = normalizeName(req.body.name);
    const icon = req.body.icon || '📊';
    const environment = req.body.environment || 'production';
    const dataRetentionDaysRaw = req.body.dataRetentionDays;
    const dataRetentionDays = parseDataRetentionDays(dataRetentionDaysRaw);

    const errors = [];

    if (!name) {
      errors.push('Name is required');
    }

    if (!Project.ENVIRONMENTS.includes(environment)) {
      errors.push('Environment is invalid');
    }

    if (dataRetentionDays == null) {
      errors.push('Data retention days must be a number');
    } else if (dataRetentionDays < 1 || dataRetentionDays > 365) {
      errors.push('Data retention days must be between 1 and 365');
    }

    const values = {
      name,
      icon,
      environment,
      dataRetentionDays: dataRetentionDaysRaw,
    };

    if (errors.length) {
      return res.status(400).render('projects/new', {
        title: 'New Project - SuperInsights',
        errors,
        values,
        environments: Project.ENVIRONMENTS,
      });
    }

    const { publicKey, secretKey } = Project.generateApiKeys();

    const project = await Project.create({
      name,
      icon,
      environment,
      dataRetentionDays,
      publicApiKey: publicKey,
      secretApiKey: secretKey,
      users: [
        {
          userId: req.session.user.id,
          role: 'owner',
        },
      ],
    });

    try {
      const actorId = req?.session?.user?.id;
      const actorEmail = req?.session?.user?.email;
      logAction(ACTION_CODES.PROJECT_CREATE, {
        userId: actorId ? String(actorId) : null,
        email: actorEmail ? String(actorEmail) : null,
        projectId: project._id ? String(project._id) : null,
        status: 302,
        method: req.method,
        path: req.originalUrl,
      });

      logAudit(ACTION_CODES.PROJECT_CREATE, {
        userId: actorId ? String(actorId) : null,
        email: actorEmail ? String(actorEmail) : null,
        projectId: project._id ? String(project._id) : null,
        status: 302,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });

      logRawAction(ACTION_CODES.PROJECT_CREATE, {
        userId: actorId ? String(actorId) : null,
        email: actorEmail ? String(actorEmail) : null,
        projectId: project._id ? String(project._id) : null,
        status: 302,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });
    } catch (e) {
      // ignore
    }

    res.redirect(`/projects/${project._id.toString()}/settings`);
  } catch (err) {
    next(err);
  }
};

exports.getProjectSettings = (req, res) => {
  const project = req.project;
  const role = req.userProjectRole;

  res.render('projects/settings', {
    title: `${project.name} Settings - SuperInsights`,
    project,
    users: project.users,
    currentProjectRole: role,
    errors: [],
    values: {
      name: project.name,
      icon: project.icon,
      environment: project.environment,
      dataRetentionDays: project.dataRetentionDays,
    },
    successMessage: null,
    environments: Project.ENVIRONMENTS,
  });
};

exports.postUpdateProject = async (req, res, next) => {
  try {
    const project = req.project;
    const role = req.userProjectRole;

    const name = normalizeName(req.body.name);
    const icon = req.body.icon || '📊';
    const environment = req.body.environment || 'production';
    const dataRetentionDaysRaw = req.body.dataRetentionDays;
    const dataRetentionDays = parseDataRetentionDays(dataRetentionDaysRaw);

    const errors = [];

    if (!name) {
      errors.push('Name is required');
    }

    if (!Project.ENVIRONMENTS.includes(environment)) {
      errors.push('Environment is invalid');
    }

    if (dataRetentionDays == null) {
      errors.push('Data retention days must be a number');
    } else if (dataRetentionDays < 1 || dataRetentionDays > 365) {
      errors.push('Data retention days must be between 1 and 365');
    }

    const values = {
      name,
      icon,
      environment,
      dataRetentionDays: dataRetentionDaysRaw,
    };

    if (errors.length) {
      return res.status(400).render('projects/settings', {
        title: `${project.name} Settings - SuperInsights`,
        project,
        users: project.users,
        currentProjectRole: role,
        errors,
        values,
        successMessage: null,
        environments: Project.ENVIRONMENTS,
      });
    }

    project.name = name;
    project.icon = icon;
    project.environment = environment;
    project.dataRetentionDays = dataRetentionDays;

    await project.save();

    try {
      const actorId = req?.session?.user?.id;
      const actorEmail = req?.session?.user?.email;
      logAction(ACTION_CODES.PROJECT_UPDATE, {
        userId: actorId ? String(actorId) : null,
        email: actorEmail ? String(actorEmail) : null,
        projectId: project._id ? String(project._id) : null,
        status: 200,
        method: req.method,
        path: req.originalUrl,
      });

      logAudit(ACTION_CODES.PROJECT_UPDATE, {
        userId: actorId ? String(actorId) : null,
        email: actorEmail ? String(actorEmail) : null,
        projectId: project._id ? String(project._id) : null,
        status: 200,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });

      logRawAction(ACTION_CODES.PROJECT_UPDATE, {
        userId: actorId ? String(actorId) : null,
        email: actorEmail ? String(actorEmail) : null,
        projectId: project._id ? String(project._id) : null,
        status: 200,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });
    } catch (e) {
      // ignore
    }

    res.render('projects/settings', {
      title: `${project.name} Settings - SuperInsights`,
      project,
      users: project.users,
      currentProjectRole: role,
      errors: [],
      values,
      successMessage: 'Project updated successfully.',
      environments: Project.ENVIRONMENTS,
    });
  } catch (err) {
    next(err);
  }
};

exports.postRegenerateKeys = async (req, res, next) => {
  try {
    const project = req.project;
    const role = req.userProjectRole;

    project.regenerateKeys();
    await project.save();

    try {
      const actorId = req?.session?.user?.id;
      const actorEmail = req?.session?.user?.email;
      logAction(ACTION_CODES.PROJECT_REGENERATE_KEYS, {
        userId: actorId ? String(actorId) : null,
        email: actorEmail ? String(actorEmail) : null,
        projectId: project._id ? String(project._id) : null,
        status: 200,
        method: req.method,
        path: req.originalUrl,
      });

      logAudit(ACTION_CODES.PROJECT_REGENERATE_KEYS, {
        userId: actorId ? String(actorId) : null,
        email: actorEmail ? String(actorEmail) : null,
        projectId: project._id ? String(project._id) : null,
        status: 200,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });

      logRawAction(ACTION_CODES.PROJECT_REGENERATE_KEYS, {
        userId: actorId ? String(actorId) : null,
        email: actorEmail ? String(actorEmail) : null,
        projectId: project._id ? String(project._id) : null,
        status: 200,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });
    } catch (e) {
      // ignore
    }

    res.render('projects/settings', {
      title: `${project.name} Settings - SuperInsights`,
      project,
      users: project.users,
      currentProjectRole: role,
      errors: [],
      values: {
        name: project.name,
        icon: project.icon,
        environment: project.environment,
        dataRetentionDays: project.dataRetentionDays,
      },
      successMessage: 'API keys regenerated successfully.',
      environments: Project.ENVIRONMENTS,
    });
  } catch (err) {
    next(err);
  }
};

exports.postAddUser = async (req, res, next) => {
  try {
    const project = req.project;
    const currentUserId = req.session.user.id;
    const currentRole = req.userProjectRole;

    const email = (req.body.email || '').toLowerCase().trim();
    const roleToAssign = req.body.role || 'viewer';

    const errors = [];

    if (!email) {
      errors.push('Email is required');
    }

    if (!['owner', 'admin', 'viewer'].includes(roleToAssign)) {
      errors.push('Invalid role');
    }

    if (roleToAssign === 'owner' && currentRole !== 'owner') {
      errors.push('Only an existing owner can assign the owner role.');
    }

    const values = {
      name: project.name,
      icon: project.icon,
      environment: project.environment,
      dataRetentionDays: project.dataRetentionDays,
    };

    if (errors.length) {
      return res.status(400).render('projects/settings', {
        title: `${project.name} Settings - SuperInsights`,
        project,
        users: project.users,
        currentProjectRole: currentRole,
        errors,
        values,
        successMessage: null,
        environments: Project.ENVIRONMENTS,
      });
    }

    const user = await User.findOne({ email }).lean();

    if (!user) {
      return res.status(400).render('projects/settings', {
        title: `${project.name} Settings - SuperInsights`,
        project,
        users: project.users,
        currentProjectRole: currentRole,
        errors: ['No user found with that email'],
        values,
        successMessage: null,
        environments: Project.ENVIRONMENTS,
      });
    }

    const alreadyMember = project.users.some(
      (u) => u.userId.toString() === user._id.toString()
    );

    if (alreadyMember) {
      return res.status(400).render('projects/settings', {
        title: `${project.name} Settings - SuperInsights`,
        project,
        users: project.users,
        currentProjectRole: currentRole,
        errors: ['User is already a member of this project'],
        values,
        successMessage: null,
        environments: Project.ENVIRONMENTS,
      });
    }

    project.users.push({
      userId: user._id,
      role: roleToAssign,
      addedAt: new Date(),
    });

    await project.save();
    await project.populate('users.userId');

    try {
      const actorId = req?.session?.user?.id;
      const actorEmail = req?.session?.user?.email;
      logAction(ACTION_CODES.PROJECT_USER_ADD, {
        userId: actorId ? String(actorId) : null,
        email: actorEmail ? String(actorEmail) : null,
        projectId: project._id ? String(project._id) : null,
        status: 200,
        method: req.method,
        path: req.originalUrl,
      });

      logAudit(ACTION_CODES.PROJECT_USER_ADD, {
        userId: actorId ? String(actorId) : null,
        email: actorEmail ? String(actorEmail) : null,
        projectId: project._id ? String(project._id) : null,
        status: 200,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });

      logRawAction(ACTION_CODES.PROJECT_USER_ADD, {
        userId: actorId ? String(actorId) : null,
        email: actorEmail ? String(actorEmail) : null,
        projectId: project._id ? String(project._id) : null,
        status: 200,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });
    } catch (e) {
      // ignore
    }

    const updatedRole = project.getUserRole(currentUserId);

    if (!updatedRole) {
      return res.redirect('/projects');
    }

    res.render('projects/settings', {
      title: `${project.name} Settings - SuperInsights`,
      project,
      users: project.users,
      currentProjectRole: updatedRole,
      errors: [],
      values,
      successMessage: 'User added to project.',
      environments: Project.ENVIRONMENTS,
    });
  } catch (err) {
    next(err);
  }
};

exports.postRemoveUser = async (req, res, next) => {
  try {
    const project = req.project;
    const currentUserId = req.session.user.id;
    const currentRole = req.userProjectRole;

    const removeUserId = req.body.userId;

    if (!removeUserId) {
      return res.status(400).render('projects/settings', {
        title: `${project.name} Settings - SuperInsights`,
        project,
        users: project.users,
        currentProjectRole: currentRole,
        errors: ['User ID is required'],
        values: {
          name: project.name,
          icon: project.icon,
          environment: project.environment,
          dataRetentionDays: project.dataRetentionDays,
        },
        successMessage: null,
        environments: Project.ENVIRONMENTS,
      });
    }

    const owners = project.users.filter((u) => u.role === 'owner');

    if (
      owners.length === 1 &&
      owners[0].userId.toString() === removeUserId.toString()
    ) {
      return res.status(400).render('projects/settings', {
        title: `${project.name} Settings - SuperInsights`,
        project,
        users: project.users,
        currentProjectRole: currentRole,
        errors: ['Cannot remove the last project owner'],
        values: {
          name: project.name,
          icon: project.icon,
          environment: project.environment,
          dataRetentionDays: project.dataRetentionDays,
        },
        successMessage: null,
        environments: Project.ENVIRONMENTS,
      });
    }

    project.users = project.users.filter(
      (u) => u.userId.toString() !== removeUserId.toString()
    );

    await project.save();
    await project.populate('users.userId');

    try {
      const actorId = req?.session?.user?.id;
      const actorEmail = req?.session?.user?.email;
      logAction(ACTION_CODES.PROJECT_USER_REMOVE, {
        userId: actorId ? String(actorId) : null,
        email: actorEmail ? String(actorEmail) : null,
        projectId: project._id ? String(project._id) : null,
        status: 200,
        method: req.method,
        path: req.originalUrl,
      });

      logAudit(ACTION_CODES.PROJECT_USER_REMOVE, {
        userId: actorId ? String(actorId) : null,
        email: actorEmail ? String(actorEmail) : null,
        projectId: project._id ? String(project._id) : null,
        status: 200,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });

      logRawAction(ACTION_CODES.PROJECT_USER_REMOVE, {
        userId: actorId ? String(actorId) : null,
        email: actorEmail ? String(actorEmail) : null,
        projectId: project._id ? String(project._id) : null,
        status: 200,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });
    } catch (e) {
      // ignore
    }

    const updatedRole = project.getUserRole(currentUserId);

    if (!updatedRole) {
      return res.redirect('/projects');
    }

    res.render('projects/settings', {
      title: `${project.name} Settings - SuperInsights`,
      project,
      users: project.users,
      currentProjectRole: updatedRole,
      errors: [],
      values: {
        name: project.name,
        icon: project.icon,
        environment: project.environment,
        dataRetentionDays: project.dataRetentionDays,
      },
      successMessage: 'User removed from project.',
      environments: Project.ENVIRONMENTS,
    });
  } catch (err) {
    next(err);
  }
};

exports.postSoftDelete = async (req, res, next) => {
  try {
    const project = req.project;

    await Project.softDelete(project._id);

    try {
      const actorId = req?.session?.user?.id;
      const actorEmail = req?.session?.user?.email;
      logAction(ACTION_CODES.PROJECT_SOFT_DELETE, {
        userId: actorId ? String(actorId) : null,
        email: actorEmail ? String(actorEmail) : null,
        projectId: project._id ? String(project._id) : null,
        status: 302,
        method: req.method,
        path: req.originalUrl,
      });

      logAudit(ACTION_CODES.PROJECT_SOFT_DELETE, {
        userId: actorId ? String(actorId) : null,
        email: actorEmail ? String(actorEmail) : null,
        projectId: project._id ? String(project._id) : null,
        status: 302,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });

      logRawAction(ACTION_CODES.PROJECT_SOFT_DELETE, {
        userId: actorId ? String(actorId) : null,
        email: actorEmail ? String(actorEmail) : null,
        projectId: project._id ? String(project._id) : null,
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
