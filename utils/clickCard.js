function isClickEvent(eventName) {
  return eventName === '$click';
}

function safeClickHref(href) {
  if (typeof href !== 'string' || !href.trim()) {
    return null;
  }
  const trimmed = href.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (/^\/([a-zA-Z0-9_\-/?&=.%#~]*)?$/i.test(trimmed)) {
    return trimmed;
  }
  return null;
}

function formatDataAttributes(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return [];
  }
  return Object.entries(data)
    .filter(([key]) => typeof key === 'string' && key.length > 0)
    .map(([key, value]) => ({ key, value: String(value ?? '') }));
}

function formatRect(rect) {
  if (!rect || typeof rect !== 'object') {
    return null;
  }
  const x = Number(rect.x) || 0;
  const y = Number(rect.y) || 0;
  const w = Number(rect.w) || 0;
  const h = Number(rect.h) || 0;
  if (!w && !h && !x && !y) {
    return null;
  }
  return `${x}×${y} · ${w}×${h}`;
}

function formatClickCard(properties) {
  const p = properties || {};
  const tag = String(p.tag || '');
  const id = String(p.id || '');
  const className = String(p.className || '');
  const text = String(p.text || '');
  const rawHref = p.href;
  const data = formatDataAttributes(p.data);
  const rect = formatRect(p.rect);

  const selector =
    String(p.selector || '') ||
    (id ? `${tag}#${id}` : className ? `${tag}.${className}` : tag);

  const label = tag
    ? `<${tag}>${text ? ` "${text}"` : ''}`
    : text || selector || 'clicked element';

  return {
    isClick: true,
    tag,
    id,
    className,
    text,
    selector,
    data,
    href: safeClickHref(rawHref),
    rect,
    label,
  };
}

function attachClickCard(row) {
  if (!row || typeof row !== 'object') {
    return row;
  }
  if (isClickEvent(row.eventName)) {
    row.clickCard = formatClickCard(row.properties);
  }
  return row;
}

module.exports = {
  isClickEvent,
  safeClickHref,
  formatClickCard,
  attachClickCard,
};
