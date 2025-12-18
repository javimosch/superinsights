const crypto = require('crypto');

function normalizePepper(pepper) {
  const p = typeof pepper === 'string' ? pepper : '';
  return p.trim();
}

function generatePublicLinkToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashPublicLinkToken(token) {
  const pepper = normalizePepper(process.env.PUBLIC_LINK_PEPPER);
  const input = `${pepper}:${String(token || '')}`;
  return crypto.createHash('sha256').update(input).digest('hex');
}

function safeEqualHex(a, b) {
  const sa = typeof a === 'string' ? a : '';
  const sb = typeof b === 'string' ? b : '';

  const ba = Buffer.from(sa, 'hex');
  const bb = Buffer.from(sb, 'hex');

  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

module.exports = {
  generatePublicLinkToken,
  hashPublicLinkToken,
  safeEqualHex,
};
