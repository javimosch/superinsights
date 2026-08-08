const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const safeClickHref = require('../utils/safeClickHref');

describe('safeClickHref', () => {
  it('returns null for empty or non-string values', () => {
    assert.equal(safeClickHref(''), null);
    assert.equal(safeClickHref(null), null);
    assert.equal(safeClickHref(undefined), null);
    assert.equal(safeClickHref(123), null);
  });

  it('allows absolute http and https URLs', () => {
    assert.equal(safeClickHref('http://example.com/foo'), 'http://example.com/foo');
    assert.equal(safeClickHref('https://example.com/foo'), 'https://example.com/foo');
  });

  it('resolves protocol-relative URLs to http', () => {
    assert.equal(safeClickHref('//example.com/foo'), 'http://example.com/foo');
  });

  it('rejects relative paths without a known base', () => {
    assert.equal(safeClickHref('/foo'), null);
    assert.equal(safeClickHref('?x=1'), null);
    assert.equal(safeClickHref('#anchor'), null);
  });

  it('rejects non-http schemes', () => {
    assert.equal(safeClickHref('javascript:alert(1)'), null);
    assert.equal(safeClickHref('data:text/html,<script>alert(1)</script>'), null);
    assert.equal(safeClickHref('vbscript:msgbox(1)'), null);
    assert.equal(safeClickHref('mailto:test@example.com'), null);
  });

  it('trims whitespace and rejects invalid inputs', () => {
    assert.equal(safeClickHref('  https://example.com  '), 'https://example.com/');
    assert.equal(safeClickHref('  javascript:alert(1)  '), null);
  });
});
