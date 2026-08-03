/**
 * Return an absolute http(s) URL for a captured click href, or null if the
 * value is not a safe, navigable hyperlink.
 *
 * Allows absolute http:// and https:// URLs, plus protocol-relative URLs
 * (//host/path) which inherit the current page's protocol. Relative paths
 * are rejected because the dashboard does not know the tracked page's base URL.
 */
function safeClickHref(href) {
  if (!href) return null;

  const str = String(href).trim();
  if (!str) return null;

  const { URL } = require('url');
  let url;

  try {
    if (str.startsWith('//')) {
      url = new URL(str, 'http://localhost');
    } else {
      url = new URL(str);
    }
  } catch (e) {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }

  return url.href;
}

module.exports = safeClickHref;
