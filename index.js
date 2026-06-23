const envPath = process.env.ENV_FILE || '.env';

require('dotenv').config({ path: envPath });

console.log('Loading environment variables from:', envPath);

// Refuse to boot in production with missing/default secrets. Runs before
// requiring ./app, since app.js reads SESSION_SECRET at module load.
const { assertProductionSecrets } = require('./config/validateSecrets');
assertProductionSecrets();

const app = require('./app');
const { connectDB, closeDB } = require('./config/db');
const http = require('http');
const { attachWsIngestionServer } = require('./utils/wsIngestionServer');

const PORT = process.env.PORT || 3000;
const SHUTDOWN_TIMEOUT_MS = 10000;

let server;
let wss;
let shuttingDown = false;

// Drain in-flight work before exiting: stop accepting new HTTP/WS connections,
// terminate WS clients, close the DB, then exit. SIGTERM is what Docker/Coolify
// send on deploy/restart, so without this every deploy can sever in-flight
// ingestion. A hard-timeout backstop guarantees the process still exits if a
// connection refuses to drain.
async function shutdown(signal, code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] received ${signal}, draining…`);

  const forced = setTimeout(() => {
    console.error('[shutdown] drain timed out — forcing exit');
    process.exit(code || 1);
  }, SHUTDOWN_TIMEOUT_MS);
  forced.unref();

  try {
    if (wss) {
      for (const client of wss.clients) {
        try { client.terminate(); } catch (_) { /* already gone */ }
      }
      await new Promise((resolve) => wss.close(() => resolve()));
    }
    if (server) {
      await new Promise((resolve) => server.close(() => resolve()));
    }
    await closeDB();
    console.log('[shutdown] clean exit');
    clearTimeout(forced);
    process.exit(code);
  } catch (err) {
    console.error('[shutdown] error while draining', err);
    clearTimeout(forced);
    process.exit(code || 1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM', 0));
process.on('SIGINT', () => shutdown('SIGINT', 0));

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  shutdown('uncaughtException', 1);
});

(async () => {
  try {
    await connectDB();

    server = http.createServer(app);
    wss = attachWsIngestionServer(server);

    server.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server', err);
    process.exit(1);
  }
})();
