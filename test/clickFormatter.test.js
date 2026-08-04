const { test } = require('node:test');
const assert = require('node:assert');
const { formatClickCard, buildClickKey } = require('../utils/clickFormatter');

test('formats full $click properties into a readable card', () => {
  const card = formatClickCard({
    tag: 'a',
    text: 'Get started',
    href: '/pricing',
    selector: 'a.btn',
    data: { id: 'btn-hero' },
    rect: { x: 200, y: 48, w: 840, h: 600 },
  });

  assert.strictEqual(card.tag, 'a');
  assert.strictEqual(card.text, 'Get started');
  assert.strictEqual(card.safeHref, '/pricing');
  assert.strictEqual(card.dataId, 'btn-hero');
  assert.strictEqual(card.selector, 'a.btn');
  assert.strictEqual(card.size, '840×600');
  assert.strictEqual(card.position, '(200, 48)');
  assert.ok(card.title.includes('a'), 'title includes tag');
  assert.ok(card.title.includes('Get started'), 'title includes text');
  assert.ok(card.dataLabel.includes('id: btn-hero'), 'data label includes id');
});

test('external and relative hrefs pass through', () => {
  assert.strictEqual(formatClickCard({ href: 'https://example.com' }).safeHref, 'https://example.com');
  assert.strictEqual(formatClickCard({ href: '#section' }).safeHref, '#section');
  assert.strictEqual(formatClickCard({ href: '/pricing' }).safeHref, '/pricing');
});

test('unsafe hrefs fall back to hash', () => {
  assert.strictEqual(formatClickCard({ href: 'javascript:alert(1)' }).safeHref, '#');
});

test('missing properties return a safe empty card', () => {
  const card = formatClickCard(null);
  assert.strictEqual(card.isClick, false);
  assert.strictEqual(card.safeHref, '');
  assert.strictEqual(card.dataLabel, '');
  assert.strictEqual(card.title, null);
});

test('buildClickKey prefers selector', () => {
  assert.strictEqual(buildClickKey({ tag: 'button', id: 'x', selector: '#hero' }), '#hero');
  assert.strictEqual(buildClickKey({ tag: 'button', data: { id: 'x' } }), 'button#x');
  assert.strictEqual(buildClickKey({ tag: 'div' }), 'div');
  assert.strictEqual(buildClickKey(null), 'unknown');
});
