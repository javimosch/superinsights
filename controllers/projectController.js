const Project = require('../models/Project');
const User = require('../models/User');

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

    if (!['production', 'staging', 'development'].includes(environment)) {
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

    res.redirect(`/projects/${project._id.toString()}/settings`);
  } catch (err) {
    next(err);
  }
};

exports.getProjectSettings = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id).populate('users.userId').exec();

    if (!project || project.deletedAt) {
      return res.status(404).render('404', {
        title: 'Not Found - SuperInsights',
      });
    }

    const userId = req.session.user.id;

    if (!project.hasUserAccess(userId)) {
      return res.status(403).render('error', {
        status: 403,
        message: 'You do not have access to this project.',
      });
    }

    const role = project.getUserRole(userId);

    if (!['owner', 'admin'].includes(role)) {
      return res.status(403).render('error', {
        status: 403,
        message: 'You do not have permission to access project settings.',
      });
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
      successMessage: null,
    });
  } catch (err) {
    next(err);
  }
};

exports.postUpdateProject = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id).populate('users.userId').exec();

    if (!project || project.deletedAt) {
      return res.status(404).render('404', {
        title: 'Not Found - SuperInsights',
      });
    }

    const userId = req.session.user.id;
    const role = project.getUserRole(userId);

    if (!['owner', 'admin'].includes(role)) {
      return res.status(403).render('error', {
        status: 403,
        message: 'You do not have permission to update this project.',
      });
    }

    const name = normalizeName(req.body.name);
    const icon = req.body.icon || '📊';
    const environment = req.body.environment || 'production';
    const dataRetentionDaysRaw = req.body.dataRetentionDays;
    const dataRetentionDays = parseDataRetentionDays(dataRetentionDaysRaw);

    const errors = [];

    if (!name) {
      errors.push('Name is required');
    }

    if (!['production', 'staging', 'development'].includes(environment)) {
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
      });
    }

    project.name = name;
    project.icon = icon;
    project.environment = environment;
    project.dataRetentionDays = dataRetentionDays;

    await project.save();

    res.render('projects/settings', {
      title: `${project.name} Settings - SuperInsights`,
      project,
      users: project.users,
      currentProjectRole: role,
      errors: [],
      values,
      successMessage: 'Project updated successfully.',
    });
  } catch (err) {
    next(err);
  }
};

exports.postRegenerateKeys = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id).populate('users.userId').exec();

    if (!project || project.deletedAt) {
      return res.status(404).render('404', {
        title: 'Not Found - SuperInsights',
      });
    }

    const userId = req.session.user.id;
    const role = project.getUserRole(userId);

    if (role !== 'owner') {
      return res.status(403).render('error', {
        status: 403,
        message: 'Only the project owner can regenerate API keys.',
      });
    }

    project.regenerateKeys();
    await project.save();

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
    });
  } catch (err) {
    next(err);
  }
};

exports.postAddUser = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id).populate('users.userId').exec();

    if (!project || project.deletedAt) {
      return res.status(404).render('404', {
        title: 'Not Found - SuperInsights',
      });
    }

    const currentUserId = req.session.user.id;
    const currentRole = project.getUserRole(currentUserId);

    if (!['owner', 'admin'].includes(currentRole)) {
      return res.status(403).render('error', {
        status: 403,
        message: 'You do not have permission to manage project members.',
      });
    }

    const email = (req.body.email || '').toLowerCase().trim();
    const role = req.body.role || 'viewer';

    const errors = [];

    if (!email) {
      errors.push('Email is required');
    }

    if (!['owner', 'admin', 'viewer'].includes(role)) {
      errors.push('Invalid role');
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
      });
    }

    project.users.push({
      userId: user._id,
      role,
      addedAt: new Date(),
    });

    await project.save();
    await project.populate('users.userId');

    res.render('projects/settings', {
      title: `${project.name} Settings - SuperInsights`,
      project,
      users: project.users,
      currentProjectRole: currentRole,
      errors: [],
      values,
      successMessage: 'User added to project.',
    });
  } catch (err) {
    next(err);
  }
};

exports.postRemoveUser = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id).populate('users.userId').exec();

    if (!project || project.deletedAt) {
      return res.status(404).render('404', {
        title: 'Not Found - SuperInsights',
      });
    }

    const currentUserId = req.session.user.id;
    const currentRole = project.getUserRole(currentUserId);

    if (currentRole !== 'owner') {
      return res.status(403).render('error', {
        status: 403,
        message: 'Only the project owner can remove users.',
      });
    }

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
      });
    }

    project.users = project.users.filter(
      (u) => u.userId.toString() !== removeUserId.toString()
    );

    await project.save();
    await project.populate('users.userId');

    res.render('projects/settings', {
      title: `${project.name} Settings - SuperInsights`,
      project,
      users: project.users,
      currentProjectRole: currentRole,
      errors: [],
      values: {
        name: project.name,
        icon: project.icon,
        environment: project.environment,
        dataRetentionDays: project.dataRetentionDays,
      },
      successMessage: 'User removed from project.',
    });
  } catch (err) {
    next(err);
  }
};

exports.postSoftDelete = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id).exec();

    if (!project || project.deletedAt) {
      return res.status(404).render('404', {
        title: 'Not Found - SuperInsights',
      });
    }

    const currentUserId = req.session.user.id;
    const currentRole = project.getUserRole(currentUserId);

    if (currentRole !== 'owner') {
      return res.status(403).render('error', {
        status: 403,
        message: 'Only the project owner can delete this project.',
      });
    }

    await Project.softDelete(project._id);

    res.redirect('/projects');
  } catch (err) {
    next(err);
  }
};
