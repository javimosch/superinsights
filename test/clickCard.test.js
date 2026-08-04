const { test } = require('node:test');
const assert = require('node:assert');
const { isClickEvent, safeClickHref, formatClickCard, attachClickCard } = require('../utils/clickCard');

test('isClickEvent returns true only for $click', () => {
  assert.strictEqual(isClickEvent('$click'), true);
  assert.strictEqual(isClickEvent('pageview'), false);
  assert.strictEqual(isClickEvent(''), false);
  assert.strictEqual(isClickEvent(null), false);
});

test('safeClickHref accepts http, https and relative paths', () => {
  assert.strictEqual(safeClickHref('https://example.com/path'), 'https://example.com/path');
  assert.strictEqual(safeClickHref('/pricing?foo=1'), '/pricing?foo=1');
  assert.strictEqual(safeClickHref('/'), '/');
});

test('safeClickHref rejects javascript and data URLs', () => {
  assert.strictEqual(safeClickHref('javascript:alert(1)'), null);
  assert.strictEqual(safeClickHref('data:text/html,<script>alert(1)</script>'), null);
  assert.strictEqual(safeClickHref('mailto:test@example.com'), null);
  assert.strictEqual(safeClickHref('javascript:alert(1)/'), null);
});

test('formatClickCard builds a readable card from click properties', () => {
  const card = formatClickCard({
    tag: 'button',
    id: 'btn-hero',
    className: 'btn',
    text: 'Get started',
    href: '/pricing',
    data: { id: 'btn-hero' },
    selector: 'button#btn-hero',
    rect: { x: 840, y: 600, w: 200, h: 48 },
  });

  assert.strictEqual(card.isClick, true);
  assert.strictEqual(card.tag, 'button');
  assert.strictEqual(card.id, 'btn-hero');
  assert.strictEqual(card.className, 'btn');
  assert.strictEqual(card.text, 'Get started');
  assert.strictEqual(card.selector, 'button#btn-hero');
  assert.strictEqual(card.href, '/pricing');
  assert.strictEqual(card.rect, '840×600 · 200×48');
  assert.strictEqual(card.label, '<button> "Get started"');
  assert.deepStrictEqual(card.data, [{ key: 'id', value: 'btn-hero' }]);
});

test('formatClickCard falls back to tag/id/class when selector is missing', () => {
  const card = formatClickCard({ tag: 'a', id: 'cta', className: 'btn' });
  assert.strictEqual(card.selector, 'a#cta');
});

test('formatClickCard handles missing properties gracefully', () => {
  const card = formatClickCard(null);
  assert.strictEqual(card.isClick, true);
  assert.strictEqual(card.tag, '');
  assert.strictEqual(card.text, '');
  assert.strictEqual(card.href, null);
  assert.strictEqual(card.rect, null);
  assert.strictEqual(card.data.length, 0);
});

test('attachClickCard adds clickCard only for $click events', () => {
  const clickRow = { eventName: '$click', properties: { tag: 'button' } };
  attachClickCard(clickRow);
  assert.ok(clickRow.clickCard);
  assert.strictEqual(clickRow.clickCard.tag, 'button');

  const otherRow = { eventName: 'pageview', properties: { url: '/' } };
  attachClickCard(otherRow);
  assert.strictEqual(otherRow.clickCard, undefined);
});
