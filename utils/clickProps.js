const UNSAFE_PROTOCOL_PATTERN = /^(javascript|data|vbscript)\s*:/i;
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

function safeClickHref(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const href = raw.trim();

  if (UNSAFE_PROTOCOL_PATTERN.test(href)) return null;

  let parsed;
  try {
    parsed = new URL(href, 'http://localhost');
  } catch (err) {
    return null;
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol.toLowerCase())) return null;

  return href;
}

function valueText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch (err) {
    return String(value);
  }
}

function isClickEvent(eventName) {
  return eventName === '$click';
}

function formatClickProps(properties) {
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return null;
  }

  const fields = [];

  const add = (label, value, href) => {
    const text = valueText(value);
    if (!text) return;
    const field = { label, value: text };
    if (href) field.href = href;
    fields.push(field);
  };

  if (properties.tag !== undefined) add('Tag', properties.tag);
  if (properties.text !== undefined) add('Text', properties.text);
  if (properties.href !== undefined) {
    const safe = safeClickHref(properties.href);
    add('Href', properties.href, safe);
  }
  if (properties.id !== undefined) add('Id', properties.id);
  if (properties.className !== undefined) add('Class', properties.className);
  if (properties.selector !== undefined) add('Selector', properties.selector);

  if (properties.data && typeof properties.data === 'object' && !Array.isArray(properties.data)) {
    for (const [key, value] of Object.entries(properties.data)) {
      if (value === undefined || value === null) continue;
      add(`Data ${key}`, value);
    }
  }

  return fields.length ? fields : null;
}

module.exports = { safeClickHref, isClickEvent, formatClickProps };
