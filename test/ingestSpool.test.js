const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let tmpFile;

beforeEach(() => {
  tmpFile = path.join(os.tmpdir(), `si-spool-${process.pid}-${Math.floor(process.hrtime()[1])}.ndjson`);
  process.env.INGEST_SPOOL_PATH = tmpFile;
});

afterEach(() => {
  try { fs.rmSync(tmpFile, { force: true }); } catch (_) { /* ignore */ }
  delete process.env.INGEST_SPOOL_PATH;
});

// fresh module each test so the internal `draining` latch never leaks across
delete require.cache[require.resolve('../utils/ingestSpool')];
function freshSpool() {
  delete require.cache[require.resolve('../utils/ingestSpool')];
  return require('../utils/ingestSpool');
}

function recordingModel() {
  const inserted = [];
  return { inserted, async insertMany(docs) { inserted.push(...docs); } };
}

function failingModel(err) {
  return { async insertMany() { throw err || new Error('buffering timed out'); } };
}

test('appendToSpool writes one NDJSON record per call', async () => {
  const { appendToSpool } = freshSpool();
  await appendToSpool('pageviews', [{ url: '/a' }, { url: '/b' }]);
  await appendToSpool('events', [{ eventName: 'click' }]);
  const lines = fs.readFileSync(tmpFile, 'utf8').trim().split('\n');
  assert.strictEqual(lines.length, 2);
  assert.deepStrictEqual(JSON.parse(lines[0]), { channel: 'pageviews', docs: [{ url: '/a' }, { url: '/b' }], attempts: 0 });
});

test('appendToSpool ignores empty payloads', async () => {
  const { appendToSpool } = freshSpool();
  await appendToSpool('pageviews', []);
  assert.ok(!fs.existsSync(tmpFile));
});

test('drainSpool flushes all records and removes the file on full success', async () => {
  const spool = freshSpool();
  await spool.appendToSpool('pageviews', [{ url: '/a' }]);
  await spool.appendToSpool('events', [{ eventName: 'x' }]);
  const pv = recordingModel();
  const ev = recordingModel();

  const res = await spool.drainSpool({ pageviews: pv, events: ev });

  assert.strictEqual(res.drained, 2);
  assert.strictEqual(pv.inserted.length, 1);
  assert.strictEqual(ev.inserted.length, 1);
  assert.ok(!fs.existsSync(tmpFile), 'spool file removed when empty');
});

test('drainSpool requeues records that still fail (no data loss)', async () => {
  const spool = freshSpool();
  await spool.appendToSpool('pageviews', [{ url: '/a' }]);

  const res = await spool.drainSpool({ pageviews: failingModel() });

  assert.strictEqual(res.drained, 0);
  assert.strictEqual(res.requeued, 1);
  const rec = JSON.parse(fs.readFileSync(tmpFile, 'utf8').trim());
  assert.strictEqual(rec.attempts, 1, 'attempt count incremented');
  assert.deepStrictEqual(rec.docs, [{ url: '/a' }], 'payload preserved');
});

test('drainSpool drops a poison record after MAX_ATTEMPTS', async () => {
  const spool = freshSpool();
  await spool.appendToSpool('pageviews', [{ url: '/a' }]);
  const model = { pageviews: failingModel() };

  let last;
  for (let i = 0; i < spool.MAX_ATTEMPTS; i += 1) {
    last = await spool.drainSpool(model);
  }
  assert.strictEqual(last.dropped, 1, 'eventually dropped');
  assert.ok(!fs.existsSync(tmpFile), 'spool emptied after poison drop');
});

test('round-trip: spooled during outage, drained on recovery', async () => {
  const spool = freshSpool();
  // outage: model unavailable -> requeued, file retains payload
  await spool.appendToSpool('pageviews', [{ url: '/a' }, { url: '/b' }]);
  await spool.drainSpool({ pageviews: failingModel() });
  assert.ok(fs.existsSync(tmpFile), 'still spooled while DB down');

  // recovery: model works -> drained, file gone, all docs delivered
  const pv = recordingModel();
  const res = await spool.drainSpool({ pageviews: pv });
  assert.strictEqual(res.drained, 2);
  assert.strictEqual(pv.inserted.length, 2);
  assert.ok(!fs.existsSync(tmpFile));
});
