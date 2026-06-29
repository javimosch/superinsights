/**
 * DIY Country IP Lookup — built from free RIR delegated stats.
 *
 * No license key needed. Data sources (daily-updated, free):
 *   https://ftp.ripe.net/pub/stats/ripencc/delegated-ripencc-latest
 *   https://ftp.arin.net/pub/stats/arin/delegated-arin-latest
 *   https://ftp.apnic.net/pub/stats/apnic/delegated-apnic-latest
 *   https://ftp.lacnic.net/pub/stats/lacnic/delegated-lacnic-latest
 *   https://ftp.afrinic.net/pub/stats/afrinic/delegated-afrinic-latest
 *
 * Usage:
 *   const lookup = require('./utils/countryLookup');
 *   await lookup.init();         // load data (auto-called on first lookup)
 *   const country = lookup.lookup('188.245.71.48');  // "DE"
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CACHE_FILE = path.join(DATA_DIR, 'ip-country.json');
const CACHE_VERSION = 1;

const RIR_SOURCES = [
  { url: 'https://ftp.ripe.net/pub/stats/ripencc/delegated-ripencc-latest' },
  { url: 'https://ftp.apnic.net/stats/apnic/delegated-apnic-latest' },
  { url: 'https://ftp.lacnic.net/pub/stats/lacnic/delegated-lacnic-latest' },
  { url: 'https://ftp.afrinic.net/pub/stats/afrinic/delegated-afrinic-latest' },
  { url: () => {
      const d = new Date();
      const ds = d.getFullYear() + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0');
      return 'https://ftp.arin.net/pub/stats/arin/delegated-arin-extended-' + ds;
    },
  },
  // Fallback: db-ip.com free CC BY 4.0 database (comprehensive, unified format)
  { url: 'https://download.db-ip.com/free/dbip-country-lite-2026-06.csv.gz', gzip: true, skipLines: 0, separator: ',' },
];

// Internal storage: sorted array of { start: <number>, end: <number>, country: <string> }
let ranges = [];
let ready = false;

/**
 * Convert an IPv4 string to a 32-bit integer.
 */
function ipToInt(ip) {
  const parts = ip.split('.');
  return ((+parts[0] << 24) | (+parts[1] << 16) | (+parts[2] << 8) | +parts[3]) >>> 0;
}

/**
 * Binary search: find the range containing `ipInt`.
 * Returns the country code or null.
 */
function binarySearch(ipInt) {
  let lo = 0;
  let hi = ranges.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const r = ranges[mid];

    if (ipInt < r.start) {
      hi = mid - 1;
    } else if (ipInt > r.end) {
      lo = mid + 1;
    } else {
      return r.country;
    }
  }

  return null;
}

/**
 * Parse a single RIR delegated stats line.
 * Format: <registry>|<country>|ipv4|<start>|<count>|<date>|<status>
 */
function parseLine(line, source) {
  if (source && source.gzip) {
    // db-ip format: start_ip,end_ip,country_code
    const parts = line.trim().split(',');
    if (parts.length < 3) return null;
    const country = parts[2];
    if (!country || country.length !== 2) return null;
    const start = ipToInt(parts[0]);
    const end = ipToInt(parts[1]);
    if (isNaN(start) || isNaN(end)) return null;
    return { start, end, country };
  }

  // RIR delegated stats format
  const parts = line.trim().split('|');
  if (parts.length < 7) return null;
  if (parts[2] !== 'ipv4') return null;
  if (parts[6] !== 'allocated' && parts[6] !== 'assigned') return null;

  const country = parts[1];
  if (!country || country === '*' || country.length !== 2) return null;

  const startIP = parts[3];
  const count = parseInt(parts[4], 10);
  if (!startIP || !count || count <= 0) return null;

  const start = ipToInt(startIP);
  const end = start + count - 1;

  return { start, end, country };
}

/**
 * Download a URL and return its body as a string.
 */
function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('timeout')); });
  });
}

/**
 * Download and parse all 5 RIR delegated stats files, merge into sorted ranges.
 */
async function downloadAndBuild() {
  const allRanges = [];

  for (const source of RIR_SOURCES) {
    const url = typeof source.url === 'function' ? source.url() : source.url;
    try {
      const rawBody = await fetch(url);
      const body = source.gzip ? zlib.gunzipSync(Buffer.from(rawBody)).toString('utf-8') : rawBody;
      const lines = body.split('\n');
      let parsed = 0;

      for (const line of lines) {
        const r = parseLine(line, source);
        if (r) {
          allRanges.push(r);
          parsed++;
        }
      }

      console.log(`[countryLookup] ${path.basename(url)}: ${parsed} ranges`);
    } catch (err) {
      console.error(`[countryLookup] Failed to fetch ${url}: ${err.message}`);
    }
  }

  // Sort by start IP for binary search
  allRanges.sort((a, b) => a.start - b.start);

  // Merge overlapping/adjacent ranges with same country
  const merged = [];
  for (const r of allRanges) {
    const last = merged[merged.length - 1];
    if (last && last.country === r.country && r.start <= last.end + 1) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ start: r.start, end: r.end, country: r.country });
    }
  }

  // Cache to disk
  const cache = { version: CACHE_VERSION, updated: new Date().toISOString(), ranges: merged };
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));

  ranges = merged;
  ready = true;
  console.log(`[countryLookup] Total: ${ranges.length} ranges, ${allRanges.length} raw entries`);
}

/**
 * Load cached data, or download if missing/stale (>7 days).
 */
async function init(forceRefresh = false) {
  if (ready) return;

  // Check cache
  if (!forceRefresh && fs.existsSync(CACHE_FILE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      if (cached.version === CACHE_VERSION && Array.isArray(cached.ranges)) {
        // Check staleness
        const updated = new Date(cached.updated);
        const ageDays = (Date.now() - updated.getTime()) / 86400000;
        if (ageDays < 7) {
          ranges = cached.ranges;
          ready = true;
          console.log(`[countryLookup] Loaded ${ranges.length} ranges from cache (${Math.round(ageDays)}d old)`);
          return;
        }
        console.log(`[countryLookup] Cache stale (${Math.round(ageDays)}d), refreshing...`);
      }
    } catch (e) {
      console.warn(`[countryLookup] Cache corrupt, rebuilding...`);
    }
  }

  await downloadAndBuild();
}

/**
 * Lookup the country code for an IP address.
 * Returns a 2-letter ISO country code, or null if not found.
 */
function lookup(ip) {
  if (!ready) return null;
  const ipInt = ipToInt(ip);
  return binarySearch(ipInt);
}

module.exports = { init, lookup, ipToInt };
