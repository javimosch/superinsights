const crypto = require('crypto');

const Report = require('../models/Report');
const { generateReportContext } = require('../utils/reportGenerator');
const { buildPdfBuffer } = require('../utils/reportPdfRenderer');
const { getDateRange, parseCustomRange } = require('../utils/reportDateRange');
const { getModel } = require('../utils/saasbackend');

function getObjectStorageService() {
  try {
    // In production, utils/saasbackend resolves to the installed package.
    if (process.env.NODE_ENV === 'production') {
      // eslint-disable-next-line import/no-extraneous-dependencies
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

function updateProgress(reportId, progress, statusMessage) {
  return Report.updateOne(
    { _id: reportId },
    {
      $set: {
        progress: Math.max(0, Math.min(100, Number(progress) || 0)),
        statusMessage: statusMessage != null ? String(statusMessage) : null,
      },
    }
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
    throw new Error('SaasBackend object storage service not available');
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
        progress: 2,
        statusMessage: 'Generating report…',
      },
    }
  );

  try {
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

    await updateProgress(reportId, 15, 'Aggregating data…');

    const ctx = await generateReportContext({
      project,
      range,
      dataType: report.dataType,
      filters: report.filters || {},
      includeAiInsights: Boolean(report.includeAiInsights),
    });

    await updateProgress(reportId, 55, 'Rendering output…');

    let buffer;
    let contentType;
    let originalName;

    if (report.format === 'pdf') {
      buffer = await buildPdfBuffer(ctx);
      contentType = 'application/pdf';
      originalName = `${String(report.name || 'report').replace(/[^a-z0-9-_]+/gi, '_')}.pdf`;
    } else {
      buffer = Buffer.from(JSON.stringify(ctx, null, 2));
      contentType = 'application/json';
      originalName = `${String(report.name || 'report').replace(/[^a-z0-9-_]+/gi, '_')}.json`;
    }

    await updateProgress(reportId, 80, 'Uploading…');

    const asset = await uploadReportAsset({
      orgId,
      projectId: project._id,
      userId: actorUserId || null,
      buffer,
      contentType,
      originalName,
    });

    const expiresAt = computeExpiresAt({ now: new Date(), days: 30 });

    await Report.updateOne(
      { _id: reportId },
      {
        $set: {
          status: 'completed',
          progress: 100,
          statusMessage: null,
          assetId: asset.assetId,
          assetKey: asset.assetKey,
          assetUrl: null,
          fileSize: asset.fileSize,
          expiresAt,
          generatedAt: new Date(),
        },
      }
    );

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
    await Report.updateOne(
      { _id: reportId },
      {
        $set: {
          status: 'failed',
          statusMessage: msg,
          progress: 100,
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
  setTimeout(() => {
    runReportJob({ reportId, project, orgId, actorUserId }).catch(() => {});
  }, 10);
  return key;
}

module.exports = {
  enqueueReportGeneration,
};
