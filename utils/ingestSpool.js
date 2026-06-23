// Durable spool for ingestion payloads that can't be written because MongoDB is
// unavailable. Instead of dropping the events (a 500 with no retry), the
// controller appends them here and the spool is flushed back to Mongo when the
// connection recovers. Format: newline-delimited JSON, one record per line:
//   { "channel": "pageviews", "docs": [ ...plain docs... ], "attempts": 0 }
//
// This module is intentionally dependency-free (fs/path only); mongoose and the
// models are required lazily inside installAutoDrain so the file processing can
// be unit-tested without a database or node_modules.
const fs = require('fs');
const path = require('path');

const MAX_ATTEMPTS = 5;

function spoolPath() {
  return process.env.INGEST_SPOOL_PATH || path.join(__dirname, '..', 'data', 'ingest-spool.ndjson');
}

async function appendToSpool(channel, docs) {
  if (!docs || !docs.length) return;
  const line = `${JSON.stringify({ channel, docs, attempts: 0 })}\n`;
  const file = spoolPath();
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.appendFile(file, line, 'utf8');
}

let draining = false;

// Flush the spool through the given { channel: model } map. Each record is
// re-inserted; on failure it is requeued with an incremented attempt count and
// dropped (as poison) once it exceeds MAX_ATTEMPTS, so a permanently-bad record
// can't grow the file forever. Returns counts for observability/tests.
async function drainSpool(models) {
  if (draining) return { drained: 0, requeued: 0, dropped: 0 };
  draining = true;
  const file = spoolPath();
  try {
    let content;
    try {
      content = await fs.promises.readFile(file, 'utf8');
    } catch (e) {
      if (e.code === 'ENOENT') return { drained: 0, requeued: 0, dropped: 0 };
      throw e;
    }

    const lines = content.split('\n').filter(Boolean);
    const requeue = [];
    let drained = 0;
    let dropped = 0;

    for (const line of lines) {
      let rec;
      try {
        rec = JSON.parse(line);
      } catch (_) {
        dropped += 1; // corrupt line — drop
        continue;
      }

      const model = models[rec.channel];
      if (!model || !Array.isArray(rec.docs) || !rec.docs.length) {
        dropped += 1;
        continue;
      }

      try {
        await model.insertMany(rec.docs, { ordered: false });
        drained += rec.docs.length;
      } catch (err) {
        const attempts = (rec.attempts || 0) + 1;
        if (attempts >= MAX_ATTEMPTS) {
          dropped += 1;
          console.error(`[ingest] dropping spooled ${rec.channel} record after ${attempts} attempts:`, err && err.message);
        } else {
          requeue.push(JSON.stringify({ ...rec, attempts }));
        }
      }
    }

    if (requeue.length) {
      await fs.promises.writeFile(file, `${requeue.join('\n')}\n`, 'utf8');
    } else {
      await fs.promises.rm(file, { force: true });
    }

    if (drained) console.log(`[ingest] drained ${drained} spooled doc(s); ${requeue.length} requeued, ${dropped} dropped`);
    return { drained, requeued: requeue.length, dropped };
  } finally {
    draining = false;
  }
}

// Wire automatic draining to connection recovery. Called once at boot.
function installAutoDrain() {
  const mongoose = require('mongoose');
  const models = {
    pageviews: require('../models/PageView'),
    events: require('../models/Event'),
    errors: require('../models/Error'),
    performance: require('../models/PerformanceMetric'),
  };
  const trigger = () => {
    drainSpool(models).catch((e) => console.error('[ingest] drain error', e && e.message));
  };
  mongoose.connection.on('connected', trigger);
  mongoose.connection.on('reconnected', trigger);
  if (mongoose.connection.readyState === 1) trigger();
}

module.exports = { appendToSpool, drainSpool, installAutoDrain, spoolPath, MAX_ATTEMPTS };
