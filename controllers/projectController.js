const Project = require('../models/Project');
const { models, services } = require('../utils/saasbackend');
const { logAction } = require('../utils/aggregatedLogger');
const { ACTION_CODES } = require('../utils/actionCodes');
const { logAudit } = require('../utils/auditLogger');
const { logRawAction } = require('../utils/rawLogger');
const {
  generatePublicLinkToken,
  hashPublicLinkToken,
} = require('../utils/publicLinkTokens');
const {
  getDropEventsConfig,
  saveDropEventsConfig,
  getDropCounter,
} = require('../utils/ingestionDropSettings');

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

    const memberships = await models.OrganizationMember.find({
      userId,
      status: 'active',
    })
      .select('orgId')
      .lean();

    const orgIds = (memberships || []).map((m) => m.orgId);
    const projects = orgIds.length
      ? await Project.findActiveProjectsByOrgIds(orgIds)
      : [];

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

exports.postEnablePublicLink = async (req, res, next) => {
  try {
    const project = req.project;

    const token = generatePublicLinkToken();
    const tokenHash = hashPublicLinkToken(token);

    project.publicLinkEnabled = true;
    project.publicLinkToken = token;
    project.publicLinkTokenHash = tokenHash;
    project.publicLinkCreatedAt = project.publicLinkCreatedAt || new Date();
    project.publicLinkRevokedAt = null;
    project.publicLinkLastRegeneratedAt = new Date();

    await project.save();

    try {
      const actorId = req?.session?.user?.id;
      const actorEmail = req?.session?.user?.email;

      logAction(ACTION_CODES.PROJECT_PUBLIC_LINK_ENABLE, {
        userId: actorId ? String(actorId) : null,
        email: actorEmail ? String(actorEmail) : null,
        projectId: project._id ? String(project._id) : null,
        status: 302,
        method: req.method,
        path: req.originalUrl,
      });

      logAudit(ACTION_CODES.PROJECT_PUBLIC_LINK_ENABLE, {
        userId: actorId ? String(actorId) : null,
        email: actorEmail ? String(actorEmail) : null,
        projectId: project._id ? String(project._id) : null,
        status: 302,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });

      logRawAction(ACTION_CODES.PROJECT_PUBLIC_LINK_ENABLE, {
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

    return res.redirect(`/projects/${project._id.toString()}/settings`);
  } catch (err) {
    return next(err);
  }
};

exports.postRegeneratePublicLink = async (req, res, next) => {
  try {
    const project = req.project;

    const token = generatePublicLinkToken();
    const tokenHash = hashPublicLinkToken(token);

    project.publicLinkEnabled = true;
    project.publicLinkToken = token;
    project.publicLinkTokenHash = tokenHash;
    project.publicLinkCreatedAt = project.publicLinkCreatedAt || new Date();
    project.publicLinkRevokedAt = null;
    project.publicLinkLastRegeneratedAt = new Date();

    await project.save();

    try {
      const actorId = req?.session?.user?.id;
      const actorEmail = req?.session?.user?.email;

      logAction(ACTION_CODES.PROJECT_PUBLIC_LINK_REGENERATE, {
        userId: actorId ? String(actorId) : null,
        email: actorEmail ? String(actorEmail) : null,
        projectId: project._id ? String(project._id) : null,
        status: 302,
        method: req.method,
        path: req.originalUrl,
      });

      logAudit(ACTION_CODES.PROJECT_PUBLIC_LINK_REGENERATE, {
        userId: actorId ? String(actorId) : null,
        email: actorEmail ? String(actorEmail) : null,
        projectId: project._id ? String(project._id) : null,
        status: 302,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });

      logRawAction(ACTION_CODES.PROJECT_PUBLIC_LINK_REGENERATE, {
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

    return res.redirect(`/projects/${project._id.toString()}/settings`);
  } catch (err) {
    return next(err);
  }
};

exports.postRevokePublicLink = async (req, res, next) => {
  try {
    const project = req.project;

    project.publicLinkEnabled = false;
    project.publicLinkToken = null;
    project.publicLinkTokenHash = null;
    project.publicLinkRevokedAt = new Date();

    await project.save();

    try {
      const actorId = req?.session?.user?.id;
      const actorEmail = req?.session?.user?.email;

      logAction(ACTION_CODES.PROJECT_PUBLIC_LINK_REVOKE, {
        userId: actorId ? String(actorId) : null,
        email: actorEmail ? String(actorEmail) : null,
        projectId: project._id ? String(project._id) : null,
        status: 302,
        method: req.method,
        path: req.originalUrl,
      });

      logAudit(ACTION_CODES.PROJECT_PUBLIC_LINK_REVOKE, {
        userId: actorId ? String(actorId) : null,
        email: actorEmail ? String(actorEmail) : null,
        projectId: project._id ? String(project._id) : null,
        status: 302,
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
      });

      logRawAction(ACTION_CODES.PROJECT_PUBLIC_LINK_REVOKE, {
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

    return res.redirect(`/projects/${project._id.toString()}/settings`);
  } catch (err) {
    return next(err);
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

    // Create SaaS org + owner membership
    const slugBase = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);

    const org = await models.Organization.create({
      name,
      slug: `${slugBase}-${Date.now().toString(36)}`,
      ownerUserId: req.session.user.id,
      allowPublicJoin: false,
      status: 'active',
    });

    await models.OrganizationMember.create({
      orgId: org._id,
      userId: req.session.user.id,
      role: 'owner',
      status: 'active',
      addedByUserId: req.session.user.id,
    });

    const { publicKey, secretKey } = Project.generateApiKeys();

    const project = await Project.create({
      name,
      icon,
      environment,
      dataRetentionDays,
      publicApiKey: publicKey,
      secretApiKey: secretKey,
      saasOrgId: org._id,
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

  (async () => {
    try {
      const users = await models.OrganizationMember.find({
        orgId: project.saasOrgId,
        status: 'active',
      })
        .populate('userId', 'email name')
        .sort({ createdAt: -1 })
        .lean();

      const dropEventsConfig = await getDropEventsConfig(project._id);

      return res.render('projects/settings', {
        title: `${project.name} Settings - SuperInsights`,
        project,
        users,
        currentProjectRole: role,
        currentSection: 'settings',
        errors: [],
        values: {
          name: project.name,
          icon: project.icon,
          environment: project.environment,
          dataRetentionDays: project.dataRetentionDays,
        },
        dropEventsConfig,
        dropEventsCount: getDropCounter(project._id),
        successMessage: null,
        environments: Project.ENVIRONMENTS,
      });
    } catch (err) {
      return res.status(500).render('error', {
        status: 500,
        message: 'Failed to load project members.',
      });
    }
  })();
};

function parseDropFilters(body) {
  const keys = Array.isArray(body.dropFilterKey) ? body.dropFilterKey : body.dropFilterKey ? [body.dropFilterKey] : [];
  const values = Array.isArray(body.dropFilterValue) ? body.dropFilterValue : body.dropFilterValue ? [body.dropFilterValue] : [];

  const out = [];
  const n = Math.max(keys.length, values.length);

  for (let i = 0; i < n; i += 1) {
    const key = keys[i] != null ? String(keys[i]).trim() : '';
    const value = values[i] != null ? String(values[i]).trim() : '';
    if (!key) continue;
    out.push({ key, value });
  }

  return out;
}

exports.postUpdateDropEventsSettings = async (req, res, next) => {
  try {
    const project = req.project;
    const role = req.userProjectRole;

    const enabled = req.body.dropEnabled === 'on' || req.body.dropEnabled === 'true' || req.body.dropEnabled === true;
    const mode = req.body.dropMode === 'whitelist' ? 'whitelist' : 'blacklist';
    const filters = parseDropFilters(req.body);

    const errors = [];
    if (enabled) {
      if (!filters.length) {
        errors.push('Drop data ingestion: at least one metadata filter is required when enabled');
      }
    }

    const users = await models.OrganizationMember.find({
      orgId: project.saasOrgId,
      status: 'active',
    })
      .populate('userId', 'email name')
      .sort({ createdAt: -1 })
      .lean();

    const values = {
      name: project.name,
      icon: project.icon,
      environment: project.environment,
      dataRetentionDays: project.dataRetentionDays,
    };

    const dropEventsConfig = {
      enabled,
      mode,
      filters,
    };

    if (errors.length) {
      return res.status(400).render('projects/settings', {
        title: `${project.name} Settings - SuperInsights`,
        project,
        users,
        currentProjectRole: role,
        currentSection: 'settings',
        errors,
        values,
        dropEventsConfig,
        dropEventsCount: getDropCounter(project._id),
        successMessage: null,
        environments: Project.ENVIRONMENTS,
      });
    }

    const saved = await saveDropEventsConfig(project._id, dropEventsConfig);

    return res.render('projects/settings', {
      title: `${project.name} Settings - SuperInsights`,
      project,
      users,
      currentProjectRole: role,
      currentSection: 'settings',
      errors: [],
      values,
      dropEventsConfig: saved,
      dropEventsCount: getDropCounter(project._id),
      successMessage: 'Drop data ingestion settings updated.',
      environments: Project.ENVIRONMENTS,
    });
  } catch (err) {
    next(err);
  }
};

exports.getDropEventsReport = async (req, res, next) => {
  try {
    const project = req.project;
    return res.json({ dropped: getDropCounter(project._id) });
  } catch (err) {
    return next(err);
  }
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
      const users = await models.OrganizationMember.find({
        orgId: project.saasOrgId,
        status: 'active',
      })
        .populate('userId', 'email name')
        .sort({ createdAt: -1 })
        .lean();

      return res.status(400).render('projects/settings', {
        title: `${project.name} Settings - SuperInsights`,
        project,
        users,
        currentProjectRole: role,
        currentSection: 'settings',
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

    const users = await models.OrganizationMember.find({
      orgId: project.saasOrgId,
      status: 'active',
    })
      .populate('userId', 'email name')
      .sort({ createdAt: -1 })
      .lean();

    const dropEventsConfig = await getDropEventsConfig(project._id);

    res.render('projects/settings', {
      title: `${project.name} Settings - SuperInsights`,
      project,
      users,
      currentProjectRole: role,
      currentSection: 'settings',
      errors: [],
      values,
      dropEventsConfig,
      dropEventsCount: getDropCounter(project._id),
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

    const users = await models.OrganizationMember.find({
      orgId: project.saasOrgId,
      status: 'active',
    })
      .populate('userId', 'email name')
      .sort({ createdAt: -1 })
      .lean();

    const dropEventsConfig = await getDropEventsConfig(project._id);

    res.render('projects/settings', {
      title: `${project.name} Settings - SuperInsights`,
      project,
      users,
      currentProjectRole: role,
      currentSection: 'settings',
      errors: [],
      values: {
        name: project.name,
        icon: project.icon,
        environment: project.environment,
        dataRetentionDays: project.dataRetentionDays,
      },
      dropEventsConfig,
      dropEventsCount: getDropCounter(project._id),
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
      const users = await models.OrganizationMember.find({
        orgId: project.saasOrgId,
        status: 'active',
      })
        .populate('userId', 'email name')
        .sort({ createdAt: -1 })
        .lean();

      const dropEventsConfig = await getDropEventsConfig(project._id);

      return res.status(400).render('projects/settings', {
        title: `${project.name} Settings - SuperInsights`,
        project,
        users,
        currentProjectRole: currentRole,
        currentSection: 'settings',
        errors,
        values,
        dropEventsConfig,
        dropEventsCount: getDropCounter(project._id),
        successMessage: null,
        environments: Project.ENVIRONMENTS,
      });
    }

    const user = await models.User.findOne({ email }).lean();

    if (user) {
      const existingMember = await models.OrganizationMember.findOne({
        orgId: project.saasOrgId,
        userId: user._id,
      });

      if (existingMember && existingMember.status === 'active') {
        const users = await models.OrganizationMember.find({
          orgId: project.saasOrgId,
          status: 'active',
        })
          .populate('userId', 'email name')
          .sort({ createdAt: -1 })
          .lean();

        const dropEventsConfig = await getDropEventsConfig(project._id);

        return res.status(400).render('projects/settings', {
          title: `${project.name} Settings - SuperInsights`,
          project,
          users,
          currentProjectRole: currentRole,
          currentSection: 'settings',
          errors: ['User is already a member of this project'],
          values,
          dropEventsConfig,
          dropEventsCount: getDropCounter(project._id),
          successMessage: null,
          environments: Project.ENVIRONMENTS,
        });
      }

      if (existingMember) {
        existingMember.status = 'active';
        existingMember.role = roleToAssign;
        existingMember.addedByUserId = req.session.user.id;
        await existingMember.save();
      } else {
        await models.OrganizationMember.create({
          orgId: project.saasOrgId,
          userId: user._id,
          role: roleToAssign,
          status: 'active',
          addedByUserId: req.session.user.id,
        });
      }
    } else {
      // Create an invite if user does not exist
      const existingInvite = await models.Invite.findOne({
        email,
        orgId: project.saasOrgId,
        status: 'pending',
      }).lean();

      if (existingInvite) {
        const users = await models.OrganizationMember.find({
          orgId: project.saasOrgId,
          status: 'active',
        })
          .populate('userId', 'email name')
          .sort({ createdAt: -1 })
          .lean();

        const dropEventsConfig = await getDropEventsConfig(project._id);

        return res.status(400).render('projects/settings', {
          title: `${project.name} Settings - SuperInsights`,
          project,
          users,
          currentProjectRole: currentRole,
          currentSection: 'settings',
          errors: ['An invite is already pending for that email'],
          values,
          dropEventsConfig,
          dropEventsCount: getDropCounter(project._id),
          successMessage: null,
          environments: Project.ENVIRONMENTS,
        });
      }

      const { token, tokenHash } = models.Invite.generateToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await models.Invite.create({
        email,
        tokenHash,
        expiresAt,
        createdByUserId: req.session.user.id,
        orgId: project.saasOrgId,
        role: roleToAssign,
        status: 'pending',
      });

      const base = process.env.PUBLIC_URL || 'http://localhost:3000';
      const inviteLink = `${base}/accept-invite?token=${token}`;

      try {
        await services.email.sendEmail({
          to: email,
          subject: `You're invited to join ${project.name}`,
          html: `<p>You've been invited to join <strong>${project.name}</strong> as a ${roleToAssign}.</p>
            <p><a href="${inviteLink}">Click here to accept the invitation</a></p>`,
          type: 'invite',
        });
      } catch (e) {
        // ignore
      }
    }

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

    const users = await models.OrganizationMember.find({
      orgId: project.saasOrgId,
      status: 'active',
    })
      .populate('userId', 'email name')
      .sort({ createdAt: -1 })
      .lean();

    const dropEventsConfig = await getDropEventsConfig(project._id);

    res.render('projects/settings', {
      title: `${project.name} Settings - SuperInsights`,
      project,
      users,
      currentProjectRole: currentRole,
      currentSection: 'settings',
      errors: [],
      values,
      dropEventsConfig,
      dropEventsCount: getDropCounter(project._id),
      successMessage: user ? 'User added to project.' : 'Invite sent.',
      environments: Project.ENVIRONMENTS,
    });
  } catch (err) {
    next(err);
  }
};

exports.postRemoveUser = async (req, res, next) => {
  try {
    const project = req.project;
    const currentRole = req.userProjectRole;

    const removeUserId = req.body.userId;

    if (!removeUserId) {
      const users = await models.OrganizationMember.find({
        orgId: project.saasOrgId,
        status: 'active',
      })
        .populate('userId', 'email name')
        .sort({ createdAt: -1 })
        .lean();

      const dropEventsConfig = await getDropEventsConfig(project._id);

      return res.status(400).render('projects/settings', {
        title: `${project.name} Settings - SuperInsights`,
        project,
        users,
        currentProjectRole: currentRole,
        currentSection: 'settings',
        errors: ['User ID is required'],
        values: {
          name: project.name,
          icon: project.icon,
          environment: project.environment,
          dataRetentionDays: project.dataRetentionDays,
        },
        dropEventsConfig,
        dropEventsCount: getDropCounter(project._id),
        successMessage: null,
        environments: Project.ENVIRONMENTS,
      });
    }


    const owners = await models.OrganizationMember.countDocuments({
      orgId: project.saasOrgId,
      role: 'owner',
      status: 'active',
    });

    const removingMember = await models.OrganizationMember.findOne({
      orgId: project.saasOrgId,
      userId: removeUserId,
      status: 'active',
    });

    if (!removingMember) {
      const users = await models.OrganizationMember.find({
        orgId: project.saasOrgId,
        status: 'active',
      })
        .populate('userId', 'email name')
        .sort({ createdAt: -1 })
        .lean();

      const dropEventsConfig = await getDropEventsConfig(project._id);

      return res.status(404).render('projects/settings', {
        title: `${project.name} Settings - SuperInsights`,
        project,
        users,
        currentProjectRole: currentRole,
        currentSection: 'settings',
        errors: ['Member not found'],
        values: {
          name: project.name,
          icon: project.icon,
          environment: project.environment,
          dataRetentionDays: project.dataRetentionDays,
        },
        dropEventsConfig,
        dropEventsCount: getDropCounter(project._id),
        successMessage: null,
        environments: Project.ENVIRONMENTS,
      });
    }

    if (removingMember.role === 'owner' && owners <= 1) {
      const users = await models.OrganizationMember.find({
        orgId: project.saasOrgId,
        status: 'active',
      })
        .populate('userId', 'email name')
        .sort({ createdAt: -1 })
        .lean();

      const dropEventsConfig = await getDropEventsConfig(project._id);

      return res.status(400).render('projects/settings', {
        title: `${project.name} Settings - SuperInsights`,
        project,
        users,
        currentProjectRole: currentRole,
        currentSection: 'settings',
        errors: ['Cannot remove the last project owner'],
        values: {
          name: project.name,
          icon: project.icon,
          environment: project.environment,
          dataRetentionDays: project.dataRetentionDays,
        },
        dropEventsConfig,
        dropEventsCount: getDropCounter(project._id),
        successMessage: null,
        environments: Project.ENVIRONMENTS,
      });
    }

    removingMember.status = 'removed';
    await removingMember.save();

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

    const users = await models.OrganizationMember.find({
      orgId: project.saasOrgId,
      status: 'active',
    })
      .populate('userId', 'email name')
      .sort({ createdAt: -1 })
      .lean();

    const dropEventsConfig = await getDropEventsConfig(project._id);

    res.render('projects/settings', {
      title: `${project.name} Settings - SuperInsights`,
      project,
      users,
      currentProjectRole: currentRole,
      currentSection: 'settings',
      errors: [],
      values: {
        name: project.name,
        icon: project.icon,
        environment: project.environment,
        dataRetentionDays: project.dataRetentionDays,
      },
      dropEventsConfig,
      dropEventsCount: getDropCounter(project._id),
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
