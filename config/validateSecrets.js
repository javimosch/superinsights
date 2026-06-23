// Fail-fast guard: refuse to boot in production with missing or well-known
// default secrets. Without this, an unset SESSION_SECRET silently falls back to
// the public string 'change-me-in-production' (see app.js), making every session
// forgeable; the same risk applies to the JWT signing secrets.
const KNOWN_DEFAULTS = new Set([
  '',
  'change-me-in-production',
  'replace-me',
  'changeme',
  'change-me',
  'secret',
  'password',
]);

// Secrets the app signs/verifies with. Add to this list as new ones appear.
const REQUIRED_IN_PRODUCTION = ['SESSION_SECRET', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];

function assertProductionSecrets(env = process.env) {
  if (env.NODE_ENV !== 'production') return;

  const offenders = REQUIRED_IN_PRODUCTION.filter((key) => {
    const value = String(env[key] || '').trim();
    return value === '' || KNOWN_DEFAULTS.has(value.toLowerCase());
  });

  if (offenders.length) {
    console.error(
      '[secrets] Refusing to start in production — these secrets are missing or set ' +
        `to a known default: ${offenders.join(', ')}. Set strong, unique values.`
    );
    process.exit(78); // EX_CONFIG
  }
}

module.exports = { assertProductionSecrets, KNOWN_DEFAULTS, REQUIRED_IN_PRODUCTION };
