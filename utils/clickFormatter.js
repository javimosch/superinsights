function formatClickCard(properties) {
  const p = properties && typeof properties === 'object' ? properties : {};
  const tag = typeof p.tag === 'string' ? p.tag : '';
  const text = typeof p.text === 'string' ? p.text : '';
  const href = typeof p.href === 'string' ? p.href : '';
  const selector = typeof p.selector === 'string' ? p.selector : '';
  const data = p.data && typeof p.data === 'object' && !Array.isArray(p.data) ? p.data : {};
  const rect = p.rect && typeof p.rect === 'object' && !Array.isArray(p.rect) ? p.rect : null;

  let safeHref = '';
  if (href.trim()) {
    const url = href.trim();
    if (/^(https?:\/\/|\/|#|mailto:|tel:|sms:)/i.test(url)) {
      safeHref = url;
    } else {
      safeHref = '#';
    }
  }

  const dataId = typeof data.id === 'string'
    ? data.id
    : typeof data['data-id'] === 'string'
      ? data['data-id']
      : '';

  const dataEntries = Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => ({ key: k, value: String(v) }));

  let size = null;
  let position = null;
  if (rect) {
    const w = Number(rect.w);
    const h = Number(rect.h);
    if (Number.isFinite(w) && Number.isFinite(h) && w >= 0 && h >= 0) {
      size = `${Math.round(w)}×${Math.round(h)}`;
    }
    const x = Number(rect.x);
    const y = Number(rect.y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      position = `(${Math.round(x)}, ${Math.round(y)})`;
    }
  }

  const dataLabel = dataEntries.map(({ key, value }) => `${key}: ${value}`).join(', ') || '';

  const summary = [tag, text ? `“${text}”` : ''].filter(Boolean).join(' ') || null;
  const title = [tag, text ? `“${text}”` : '', dataId ? `#${dataId}` : '', selector].filter(Boolean).join(' · ') || null;

  return {
    tag,
    text,
    href,
    safeHref,
    selector,
    data,
    dataId,
    dataEntries,
    dataLabel,
    rect,
    size,
    position,
    summary,
    title,
    isClick: !!(tag || text || href || selector || dataEntries.length),
  };
}

function buildClickKey(properties) {
  const card = formatClickCard(properties);
  if (card.selector) return card.selector;
  if (card.tag && card.dataId) return `${card.tag}#${card.dataId}`;
  if (card.tag) return card.tag;
  return 'unknown';
}

module.exports = { formatClickCard, buildClickKey };
