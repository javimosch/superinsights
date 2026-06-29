/**
 * IP Capture & Geolocation utility
 *
 * Captures the client IP from the HTTP request and optionally resolves
 * it to a country code using the bundled geoip-lite database.
 *
 * Usage:
 *   const { captureIp, getCountry } = require('./utils/ipCapture');
 *   const ipInfo = captureIp(req);
 *   // { ip: '1.2.3.4', country: 'US' }  — country is null if geoip disabled or not found
 */

let geoip = null;
try {
  geoip = require('geoip-lite');
} catch {
  // geoip-lite not installed — country resolution will be unavailable
}

const GEOIP_ENABLED = !!(geoip && process.env.GEOIP_ENABLED !== 'false');

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
 *
 * @param {string} ip
 * @returns {string|null}
 */
function ipToCountry(ip) {
  if (!ip || !GEOIP_ENABLED) return null;
  try {
    const lookedUp = geoip.lookup(ip);
    return (lookedUp && lookedUp.country) || null;
  } catch {
    return null;
  }
}

/**
 * Capture IP information for an incoming request.
 *
 * @param {import('express').Request} req
 * @returns {{ ip: string|null, country: string|null }}
 */
function captureIp(req) {
  const ip = extractIp(req);
  const country = ipToCountry(ip);
  return { ip, country };
}

module.exports = { captureIp, extractIp, ipToCountry };
