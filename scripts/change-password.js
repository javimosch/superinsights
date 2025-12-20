require('dotenv').config();

const { URL } = require('url');

function getBaseUrl() {
  const raw = process.env.SAASBACKEND_BASE_URL || process.env.PUBLIC_URL || process.env.PUBLISHED_DOMAIN || 'http://localhost:3000';
  // Add protocol if missing (for PUBLISHED_DOMAIN which might be just hostname)
  if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
    return `https://${raw.replace(/\/$/, '')}`;
  }
  return raw.replace(/\/$/, '');
}

function getBasicAuthHeader() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin';
  const token = Buffer.from(`${username}:${password}`).toString('base64');
  return `Basic ${token}`;
}

async function requestJson(method, urlString, { headers = {}, body } = {}) {
  const url = new URL(urlString);

  const res = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${res.statusText}`);
    err.status = res.status;
    err.body = json || text;
    throw err;
  }

  return json;
}

async function main() {
  const emailArg = process.argv[2];
  const newPasswordArg = process.argv[3];
  const email = (emailArg || '').toLowerCase().trim();
  const newPassword = newPasswordArg || '';

  if (!email || !newPassword) {
    console.error('Usage: node scripts/change-password.js <email> <new-password>');
    process.exit(1);
  }

  const baseUrl = getBaseUrl();
  const authHeader = getBasicAuthHeader();
  const apiBase = `${baseUrl}/saas/api/admin/users`;

  // Get all users and filter locally (search parameter might not be working)
  const list = await requestJson('GET', `${apiBase}?limit=50&offset=0`, {
    headers: { Authorization: authHeader },
  });

  const users = Array.isArray(list?.users) ? list.users : [];
  const user = users.find((u) => String(u.email || '').toLowerCase() === email);

  if (!user || !user._id) {
    console.error(`User not found via admin API: ${email}`);
    process.exit(1);
  }

  const updated = await requestJson('PATCH', `${apiBase}/${encodeURIComponent(String(user._id))}`, {
    headers: { Authorization: authHeader },
    body: { passwordHash: newPassword },
  });

  const updatedUser = updated?.user || updated;
  console.log(`Password changed via API: ${updatedUser.email} (${updatedUser._id})`);
  process.exit(0);
}

main().catch((err) => {
  console.error('change-password failed', {
    message: err && err.message ? err.message : String(err),
    status: err && err.status ? err.status : undefined,
    body: err && err.body ? err.body : undefined,
  });
  process.exit(1);
});
