const mongoose = require('mongoose');

// Connectivity has exactly one source of truth: mongoose.connection.readyState
// (0=disconnected, 1=connected, 2=connecting, 3=disconnecting). The previous
// one-way `isConnected` latch was set true once and never reset on a drop, so
// it lied after MongoDB restarted and made any reconnect path a no-op.
function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

async function connectDB() {
  if (isDbConnected()) return;

  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/superinsights';

  // Bound the timeouts so a dead/severed MongoDB surfaces in seconds instead of
  // buffering for 10s on every query, and keep heartbeats frequent so the driver
  // notices recovery quickly. This is the resilience the silent outage lacked.
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    heartbeatFrequencyMS: 10000,
  });
}

// Loud, explicit lifecycle logging. The outage was invisible because nothing
// announced the disconnect — the process kept serving 200s while every query
// buffer-timed-out. These handlers make a drop and a recovery both auditable
// (and drive the /readyz endpoint via readyState).
mongoose.connection.on('connected', () => console.log('[mongo] connected'));
mongoose.connection.on('reconnected', () => console.log('[mongo] reconnected'));
mongoose.connection.on('disconnected', () =>
  console.error('[mongo] DISCONNECTED — queries will fail until reconnect')
);
mongoose.connection.on('error', (err) =>
  console.error('[mongo] connection error', err && err.message ? err.message : err)
);

process.on('SIGINT', async () => {
  try {
    await mongoose.connection.close();
  } catch (_) {
    /* best effort on shutdown */
  }
  process.exit(0);
});

module.exports = { connectDB, isDbConnected };
