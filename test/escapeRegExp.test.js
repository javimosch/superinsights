const { test } = require('node:test');
const assert = require('node:assert');
const { escapeRegExp } = require('../utils/escapeRegExp');

test('escapes all regex metacharacters', () => {
  assert.strictEqual(escapeRegExp('(a+)+$'), '\\(a\\+\\)\\+\\$');
});

test('escaped ReDoS payload matches literally, not as a pattern', () => {
  const re = new RegExp(escapeRegExp('(a+)+$'));
  assert.ok(re.test('(a+)+$'), 'should match the literal string');
  assert.ok(!re.test('aaaa'), 'should NOT behave as the dangerous pattern');
});

test('plain text passes through unchanged', () => {
  assert.strictEqual(escapeRegExp('hello world'), 'hello world');
});

test('coerces non-strings safely', () => {
  assert.strictEqual(escapeRegExp(42), '42');
});
