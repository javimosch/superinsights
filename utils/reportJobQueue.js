const crypto = require('crypto');
const path = require('path');
const ejs = require('ejs');

const Report = require('../models/Report');
const { generateReportContext } = require('../utils/reportGenerator');
const { buildPdfBuffer } = require('../utils/reportPdfRenderer');
const { getDateRange, parseCustomRange } = require('../utils/reportDateRange');
const { getModel } = require('../utils/saasbackend');
const { generateAggregatedCsv } = require('../utils/reportCsvExporter');

function getObjectStorageService() {
  try {
    // In production, utils/saasbackend resolves to the installed package.
    if (process.env.NODE_ENV === 'production') {
      return require('saasbackend/src/services/objectStorage.service');
    }
    return require('../ref-saasbackend/src/services/objectStorage.service');
  } catch (err) {
    return null;
  }
}

function buildNamespace({ orgId, projectId }) {
  return `${String(orgId)}_${String(projectId)}`;
}

function computeExpiresAt({ now, days }) {
  const d = Number(days);
  const n = Number.isFinite(d) ? d : 30;
  return new Date(now.getTime() + Math.max(1, n) * 24 * 60 * 60 * 1000);
}

function stageToProgress(stage) {
  if (stage === 'queued') return 0;
  if (stage === 'aggregating') return 15;
  if (stage === 'rendering') return 55;
  if (stage === 'uploading') return 80;
  return null;
}

async function startStage(reportId, stage, statusMessage) {
  const progress = stageToProgress(stage);
  await Report.updateOne(
    { _id: reportId },
    {
      $set: {
        currentStage: stage,
        statusMessage: statusMessage != null ? String(statusMessage) : null,
        ...(progress != null ? { progress } : {}),
      },
      $push: {
        stages: {
          stage,
          startedAt: new Date(),
          completedAt: null,
          errorMessage: null,
        },
      },
    }
  );
}

async function completeStage(reportId, stage) {
  await Report.updateOne(
    { _id: reportId, 'stages.stage': stage, 'stages.completedAt': null },
    { $set: { 'stages.$.completedAt': new Date() } }
  );
}

async function failStage(reportId, stage, errorMessage) {
  await Report.updateOne(
    { _id: reportId, 'stages.stage': stage, 'stages.completedAt': null },
    { $set: { 'stages.$.completedAt': new Date(), 'stages.$.errorMessage': String(errorMessage || '') } }
  );
}

function normalizeRangeFromReport(report) {
  if (report.timeframe === 'custom') {
    return {
      timeframe: null,
      start: report.startDate,
      end: report.endDate,
    };
  }

  const { start, end, timeframe } = getDateRange(report.timeframe);
  return { timeframe, start, end };
}

async function uploadReportAsset({ orgId, projectId, userId, buffer, contentType, originalName }) {
  const objectStorage = getObjectStorageService();
  if (!objectStorage || typeof objectStorage.generateKey !== 'function' || typeof objectStorage.putObject !== 'function') {
    throw new Error('SaasBackend object storage service not available (missing generateKey/putObject)');
  }

  let Asset;
  try {
    Asset = getModel('Asset');
  } catch (e) {
    Asset = null;
  }
  if (!Asset) {
    throw new Error('SaasBackend Asset model not available');
  }

  const namespace = buildNamespace({ orgId, projectId });
  const objectKey = objectStorage.generateKey(originalName, namespace);

  const put = await objectStorage.putObject({
    key: objectKey,
    body: buffer,
    contentType,
  });

  const asset = await Asset.create({
    key: objectKey,
    provider: put.provider,
    bucket: put.bucket,
    originalName,
    contentType,
    sizeBytes: buffer.length,
    visibility: 'private',
    namespace,
    visibilityEnforced: false,
    tags: ['report'],
    ownerUserId: userId || null,
    orgId: orgId || null,
    status: 'uploaded',
  });

  return {
    assetId: String(asset._id),
    assetKey: asset.key,
    fileSize: buffer.length,
  };
}

function safeFilenameBase(name) {
  return String(name || 'report').replace(/[^a-z0-9-_]+/gi, '_').slice(0, 120) || 'report';
}

async function renderHtmlReport({ project, report, ctx }) {
  const viewsRoot = path.join(__dirname, '..', 'views');
  const templatePath = path.join(viewsRoot, 'analytics', 'report-html-export.ejs');

  const base = `/projects/${project._id}`;

  const locals = {
    title: `Report: ${report.name}`,
    project,
    projectBasePath: base,
    currentSection: 'reports',
    currentUser: null,
    currentProjectRole: null,
    report,
    context: ctx,
    breadcrumbs: [],
  };

  return new Promise((resolve, reject) => {
    ejs.renderFile(templatePath, locals, {}, (err, str) => {
      if (err) return reject(err);
      resolve(str);
    });
  });
}

function renderReportToBuffer({ report, ctx, project }) {
  const base = safeFilenameBase(report.name);

  if (report.format === 'pdf') {
    return {
      buffer: buildPdfBuffer(ctx),
      contentType: 'application/pdf',
      originalName: `${base}.pdf`,
    };
  }

  if (report.format === 'csv') {
    const csv = generateAggregatedCsv(ctx);
    return {
      buffer: Promise.resolve(Buffer.from(csv, 'utf8')),
      contentType: 'text/csv; charset=utf-8',
      originalName: `${base}.csv`,
    };
  }

  if (report.format === 'html') {
    return {
      buffer: (async () => {
        const html = await renderHtmlReport({ project, report, ctx });
        return Buffer.from(html, 'utf8');
      })(),
      contentType: 'text/html; charset=utf-8',
      originalName: `${base}.html`,
    };
  }

  return {
    buffer: Promise.resolve(Buffer.from(JSON.stringify(ctx, null, 2))),
    contentType: 'application/json',
    originalName: `${base}.json`,
  };
}

async function runReportJob({ reportId, project, orgId, actorUserId }) {
  const startMs = Date.now();

  const report = await Report.findById(reportId).lean();
  if (!report || report.deletedAt) {
    return;
  }

  await Report.updateOne(
    { _id: reportId },
    {
      $set: {
        status: 'generating',
        progress: 0,
        statusMessage: 'Queued…',
      },
    }
  );

  try {
    await startStage(reportId, 'queued', 'Queued…');

    const range = normalizeRangeFromReport(report);

    if (report.timeframe === 'custom') {
      if (!report.startDate || !report.endDate) {
        throw new Error('Custom range requires start and end dates');
      }
      const parsed = parseCustomRange({ start: report.startDate, end: report.endDate });
      if (parsed.error) {
        throw new Error(parsed.error);
      }
    }

    await completeStage(reportId, 'queued');
    await startStage(reportId, 'aggregating', 'Aggregating data…');

    const ctx = await generateReportContext({
      project,
      range,
      dataType: report.dataType,
      filters: report.filters || {},
      includeAiInsights: Boolean(report.includeAiInsights),
    });

    await Report.updateOne(
      { _id: reportId },
      {
        $set: {
          contextSnapshot: ctx,
        },
      }
    );

    await completeStage(reportId, 'aggregating');
    await startStage(reportId, 'rendering', 'Rendering output…');

    const rendered = renderReportToBuffer({ report, ctx, project });
    const buffer = await rendered.buffer;

    await completeStage(reportId, 'rendering');
    await startStage(reportId, 'uploading', 'Uploading…');

    const asset = await uploadReportAsset({
      orgId,
      projectId: project._id,
      userId: actorUserId || null,
      buffer,
      contentType: rendered.contentType,
      originalName: rendered.originalName,
    });

    const expiresAt = computeExpiresAt({ now: new Date(), days: 30 });

    await Report.updateOne(
      { _id: reportId },
      {
        $set: {
          status: 'completed',
          progress: 100,
          statusMessage: null,
          currentStage: null,
          assetId: asset.assetId,
          assetKey: asset.assetKey,
          assetUrl: null,
          fileSize: asset.fileSize,
          expiresAt,
          generatedAt: new Date(),
          estimatedDurationMs: Date.now() - startMs,
        },
      }
    );

    await completeStage(reportId, 'uploading');

    const durationMs = Date.now() - startMs;
    console.log('[report_generation_completed]', {
      reportId: String(reportId),
      projectId: String(project._id),
      format: report.format,
      dataType: report.dataType,
      durationMs,
      fileSize: asset.fileSize,
    });
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);

    try {
      const latest = await Report.findById(reportId).select('currentStage').lean();
      if (latest && latest.currentStage) {
        await failStage(reportId, latest.currentStage, msg);
      }
    } catch (e) {
      // ignore
    }

    await Report.updateOne(
      { _id: reportId },
      {
        $set: {
          status: 'failed',
          statusMessage: msg,
          progress: 100,
          currentStage: null,
        },
      }
    );

    console.error('[report_generation_failed]', {
      reportId: String(reportId),
      projectId: String(project._id),
      error: msg,
    });
  }
}

function enqueueReportGeneration({ reportId, project, orgId, actorUserId }) {
  const key = crypto.randomBytes(8).toString('hex');
  const startedAt = Date.now();
  const timeoutMs = 5 * 60 * 1000;
  const timeoutAt = new Date(startedAt + timeoutMs);

  Report.updateOne({ _id: reportId }, { $set: { jobTimeoutAt: timeoutAt } }).catch(() => {});

  setTimeout(() => {
    runReportJob({ reportId, project, orgId, actorUserId }).catch(() => {});
  }, 10);

  setTimeout(() => {
    Report.updateOne(
      { _id: reportId, status: { $in: ['pending', 'generating'] } },
      {
        $set: {
          status: 'failed',
          statusMessage: 'Generation timeout after 5 minutes',
          progress: 100,
          currentStage: null,
        },
      }
    ).catch(() => {});
  }, timeoutMs);
  return key;
}

module.exports = {
  enqueueReportGeneration,
};
