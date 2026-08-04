const { test } = require('node:test');
const assert = require('node:assert');
const { safeClickHref, isClickEvent, formatClickProps } = require('../utils/clickProps');

test('isClickEvent matches $click only', () => {
  assert.strictEqual(isClickEvent('$click'), true);
  assert.strictEqual(isClickEvent('pageview'), false);
  assert.strictEqual(isClickEvent(null), false);
});

test('formatClickProps returns null for non-objects', () => {
  assert.strictEqual(formatClickProps(null), null);
  assert.strictEqual(formatClickProps('string'), null);
  assert.strictEqual(formatClickProps([]), null);
});

test('formatClickProps extracts click context fields in order', () => {
  const fields = formatClickProps({
    tag: 'button',
    text: 'Save',
    href: '/save',
    id: 'save-btn',
    className: 'btn primary',
    selector: 'button#save-btn',
    rect: { x: 840, y: 600, w: 200, h: 48 },
    data: { id: '42' },
  });

  assert.ok(fields);
  assert.strictEqual(fields.length, 8);
  assert.deepStrictEqual(fields[0], { label: 'Tag', value: 'button' });
  assert.deepStrictEqual(fields[1], { label: 'Text', value: 'Save' });
  assert.deepStrictEqual(fields[2], { label: 'Href', value: '/save', href: '/save' });
  assert.strictEqual(fields[3].label, 'Id');
  assert.strictEqual(fields[3].value, 'save-btn');
  assert.strictEqual(fields[4].label, 'Class');
  assert.strictEqual(fields[4].value, 'btn primary');
  assert.strictEqual(fields[5].label, 'Selector');
  assert.strictEqual(fields[5].value, 'button#save-btn');
  assert.strictEqual(fields[6].label, 'Position');
  assert.strictEqual(fields[6].value, '840×600 · 200×48');
  assert.strictEqual(fields[7].label, 'Data id');
  assert.strictEqual(fields[7].value, '42');
});

test('safeClickHref blocks unsafe or unknown protocols', () => {
  assert.strictEqual(safeClickHref('javascript:alert(1)'), null);
  assert.strictEqual(safeClickHref(' data:text/html,<script>'), null);
  assert.strictEqual(safeClickHref('vbscript:msgbox'), null);
  assert.strictEqual(safeClickHref('foo:bar'), null);
});

test('safeClickHref allows http, https, mailto, tel and relative paths', () => {
  assert.strictEqual(safeClickHref('https://example.com'), 'https://example.com');
  assert.strictEqual(safeClickHref('http://example.com/path'), 'http://example.com/path');
  assert.strictEqual(safeClickHref('/relative/path'), '/relative/path');
  assert.strictEqual(safeClickHref('mailto:test@example.com'), 'mailto:test@example.com');
  assert.strictEqual(safeClickHref('tel:+1234567890'), 'tel:+1234567890');
});

test('formatClickProps keeps unsafe href as text without a link', () => {
  const fields = formatClickProps({
    tag: 'a',
    href: 'javascript:alert(1)',
  });

  assert.ok(fields);
  const hrefField = fields.find((f) => f.label === 'Href');
  assert.ok(hrefField);
  assert.strictEqual(hrefField.href, undefined);
  assert.strictEqual(hrefField.value, 'javascript:alert(1)');
});
