/**
 * IP Capture & Geolocation utility
 *
 * Captures the client IP from the HTTP request and resolves
 * it to a country code using the free RIR delegated stats
 * (no license key required, updated daily).
 *
 * Usage:
 *   const { captureIp } = require('./utils/ipCapture');
 *   const ipInfo = captureIp(req);
 *   // { ip: '1.2.3.4', country: 'US' }
 */

const countryLookup = require('./countryLookup');
const COUNTRY_LOOKUP_ENABLED = process.env.COUNTRY_LOOKUP_ENABLED !== 'false';

/**
 * Extract the client IP from an Express request object.
 * Checks x-forwarded-for first (for reverse-proxy setups), then falls back to req.ip.
 *
 * @param {import('express').Request} req
 * @returns {string|null}
 */
function extractIp(req) {
  if (!req) return null;

  // x-forwarded-for can be a comma-separated list; the leftmost is the original client
  const forwarded = req.headers && req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }

  if (req.ip) return req.ip;

  if (req.connection && req.connection.remoteAddress) {
    return req.connection.remoteAddress;
  }

  return null;
}

/**
 * Resolve an IP address to a 2-letter ISO country code.
 * Uses the free RIR delegated stats — no license key required.
 *
 * @param {string} ip
 * @returns {string|null}
 */
function ipToCountry(ip) {
  if (!ip || !COUNTRY_LOOKUP_ENABLED) return null;
  try {
    return countryLookup.lookup(ip);
  } catch {
    return null;
  }
}

let initPromise = null;

/**
 * Initialise the country lookup database.
 * Idempotent — safe to call multiple times.
 * The first call to captureIp() also triggers this automatically.
 */
function init() {
  if (!initPromise) {
    initPromise = countryLookup.init().catch(err => {
      console.warn('[ipCapture] Country lookup init failed:', err.message);
      initPromise = null; // allow retry
    });
  }
  return initPromise;
}

/**
 * Capture IP information for an incoming request.
 * Triggers lazy initialisation of country data on first call.
 *
 * @param {import('express').Request} req
 * @returns {{ ip: string|null, country: string|null }}
 */
function captureIp(req) {
  // Fire-and-forget init on first call (subsequent calls are no-ops)
  if (!initPromise) init();

  const ip = extractIp(req);
  const country = ipToCountry(ip);
  return { ip, country };
}

module.exports = { captureIp, extractIp, ipToCountry, init };
