/*
 * Bootstrap for the Arcadia Admin Backend.
 *
 * Configuration is validated before the server starts; an invalid
 * environment fails fast with a message that names the offending variable
 * but never prints a value. Startup logging is limited to the listening
 * URL — no credentials, hashes, secrets or tokens ever reach stdout/stderr.
 */

const { getEnv } = require('./config/env');
const createApp = require('./app');

function getSafeStartupErrorMessage(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  // Environment validation errors are already safe (they only name variables).
  if (message.startsWith('[admin-backend configuration]')) {
    return message;
  }
  if (error?.code === 'EADDRINUSE') {
    return `Port ${getEnv().port} is already in use. Set PORT to a free port.`;
  }
  return 'Admin backend failed to start. Check the configuration and try again.';
}

async function startServer({ port } = {}) {
  // Validates the environment (throws a safe message when invalid).
  const env = getEnv();
  const app = createApp();

  return new Promise((resolve, reject) => {
    const server = app.listen(port ?? env.port, () => {
      const activePort = server.address()?.port ?? env.port;
      // Safe to log: host/port only.
      console.log(`Arcadia admin backend listening on http://localhost:${activePort}`);
      resolve(server);
    });

    server.on('error', (error) => {
      reject(new Error(getSafeStartupErrorMessage(error)));
    });
  });
}

function stopServer(server) {
  return new Promise((resolve) => {
    if (!server || !server.listening) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}

if (require.main === module) {
  startServer()
    .then((server) => {
      const shutdown = () => {
        stopServer(server).then(() => process.exit(0));
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    })
    .catch((error) => {
      // Safe message only — never the raw error (it could embed config values).
      console.error(getSafeStartupErrorMessage(error));
      process.exit(1);
    });
}

module.exports = {
  startServer,
  stopServer,
  getSafeStartupErrorMessage,
};
