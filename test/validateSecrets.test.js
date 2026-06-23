const { test } = require('node:test');
const assert = require('node:assert');
const { assertProductionSecrets } = require('../config/validateSecrets');

const STRONG = {
  SESSION_SECRET: 'a-long-random-session-secret',
  JWT_ACCESS_SECRET: 'a-long-random-access-secret',
  JWT_REFRESH_SECRET: 'a-long-random-refresh-secret',
};

test('no-op outside production', () => {
  assert.doesNotThrow(() => assertProductionSecrets({ NODE_ENV: 'development' }));
});

test('passes in production with strong secrets', () => {
  assert.doesNotThrow(() => assertProductionSecrets({ NODE_ENV: 'production', ...STRONG }));
});

// assertProductionSecrets exits the process on failure; stub process.exit so the
// test can observe the exit code instead of dying.
function exitCodeFor(env) {
  const orig = process.exit;
  let code = null;
  process.exit = (c) => {
    code = c;
    throw new Error('__exit__');
  };
  try {
    assertProductionSecrets(env);
  } catch (e) {
    if (e.message !== '__exit__') throw e;
  } finally {
    process.exit = orig;
  }
  return code;
}

test('exits 78 in production when a secret is a known default', () => {
  assert.strictEqual(
    exitCodeFor({ NODE_ENV: 'production', ...STRONG, SESSION_SECRET: 'change-me-in-production' }),
    78
  );
});

test('exits 78 in production when a secret is missing', () => {
  assert.strictEqual(
    exitCodeFor({ NODE_ENV: 'production', SESSION_SECRET: STRONG.SESSION_SECRET, JWT_ACCESS_SECRET: 'x' }),
    78
  );
});
