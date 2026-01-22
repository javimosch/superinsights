const envPath = process.env.ENV_FILE || '.env';

require('dotenv').config({ path: envPath });

console.log('Loading environment variables from:', envPath,{
  adminUsername: process.env.ADMIN_USERNAME,
  adminPassword: process.env.ADMIN_PASSWORD,
});

const app = require('./app');
const { connectDB } = require('./config/db');
const http = require('http');
const { attachWsIngestionServer } = require('./utils/wsIngestionServer');

const PORT = process.env.PORT || 3000;

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  process.exit(1);
});

(async () => {
  try {
    await connectDB();

    const server = http.createServer(app);
    attachWsIngestionServer(server);

    server.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server', err);
    process.exit(1);
  }
})();
