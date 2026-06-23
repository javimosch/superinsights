const { test } = require('node:test');
const assert = require('node:assert');
const { createIpRateLimiter } = require('../middleware/apiRateLimit');

function mockRes() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    set(k, v) { this.headers[k] = v; return this; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
  };
}

test('allows up to max requests then returns 429 JSON with Retry-After', () => {
  const limiter = createIpRateLimiter({ windowMs: 60000, max: 2 });
  const req = { ip: '10.0.0.1' }; // unique IP — store is module-level

  let passed = 0;
  for (let i = 0; i < 2; i += 1) {
    limiter(req, mockRes(), () => { passed += 1; });
  }
  assert.strictEqual(passed, 2, 'first `max` requests pass');

  const res = mockRes();
  let nexted = false;
  limiter(req, res, () => { nexted = true; });

  assert.strictEqual(nexted, false, 'over-limit request is blocked');
  assert.strictEqual(res.statusCode, 429);
  assert.strictEqual(res.body.error, 'Rate limit exceeded');
  assert.ok(Number(res.headers['Retry-After']) > 0, 'sets Retry-After');
});

test('limits are per-IP', () => {
  const limiter = createIpRateLimiter({ windowMs: 60000, max: 1 });
  let a = false;
  let b = false;
  limiter({ ip: '10.0.0.2' }, mockRes(), () => { a = true; });
  limiter({ ip: '10.0.0.3' }, mockRes(), () => { b = true; });
  assert.ok(a && b, 'distinct IPs each get their own budget');
});
