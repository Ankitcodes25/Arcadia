const env = require('./config/env');
const createApp = require('./app');
const { connectDatabase, disconnectDatabase, assertDatabaseConnection } = require('./config/database');
const { User } = require('./models/User');
const { Session } = require('./models/Session');
const { OAuthState } = require('./models/OAuthState');
const { OAuthHandoff } = require('./models/OAuthHandoff');
const { PasswordResetToken } = require('./models/PasswordResetToken');
const { RateLimitBucket } = require('./models/RateLimitBucket');
const { AdminMutationLock } = require('./models/AdminMutationLock');
const { isEmailConfigured, getEmailConfig } = require('./config/email');
const { getGoogleOAuthConfig, isGoogleOAuthConfigured } = require('./config/googleOAuth');
const { isAdminPanelConfigured } = require('./config/adminPanel');

function getSafeStartupErrorMessage(error) {
  if (typeof error?.safeMessage === 'string' && error.safeMessage.trim()) {
    return error.safeMessage;
  }
  if (error?.code === 'EADDRINUSE') {
    return `Port ${error.port || env.port} is already in use, usually by an earlier backend that is still running. Stop that process (or change PORT in backend/.env) and start again.`;
  }
  if (error?.code === 'ECONNREFUSED') {
    return 'MongoDB connection refused. Verify the configured MONGODB_URI endpoint and network access.';
  }
  if (error?.name === 'MongooseServerSelectionError') {
    return 'MongoDB server selection failed. Verify the configured MONGODB_URI endpoint, network access, and Atlas IP allowlist.';
  }
  return 'Check required environment variables and MongoDB connectivity.';
}

async function startServer({ port = env.port, mongoUri = env.mongoUri } = {}) {
  // Throws a safe, variable-naming error when the admin account is half-configured.
  const adminPanelConfigured = isAdminPanelConfigured();

  if (env.isProduction) {
    getGoogleOAuthConfig();
    const emailConfig = getEmailConfig();
    if (!emailConfig.configured) {
      throw new Error('Production email delivery must be configured with SMTP');
    }
  }

  await connectDatabase(mongoUri);
  assertDatabaseConnection();
  await User.init();
  await Session.init();
  await OAuthState.init();
  await OAuthHandoff.init();
  await PasswordResetToken.init();
  await RateLimitBucket.init();
  await AdminMutationLock.init();

  if (!isEmailConfigured()) {
    console.warn('Transactional email delivery is disabled; configure SMTP before sending password-reset links.');
  }
  if (!isGoogleOAuthConfigured()) {
    console.warn('Google OAuth is not configured; set the four server-side Google OAuth variables before using Google sign-in.');
  }
  if (!adminPanelConfigured) {
    console.warn('Admin Panel sign-in is disabled; set ADMIN_USERNAME, ADMIN_PASSWORD_HASH and ADMIN_JWT_SECRET (with ADMIN_EMAIL) before using /admin.');
  }

  const app = createApp();

  return new Promise((resolve, reject) => {
    const httpServer = app.listen(port, () => {
      const address = httpServer.address();
      const activePort = typeof address === 'object' && address ? address.port : port;
      console.log(`Auth server running on http://localhost:${activePort}`);
      resolve(httpServer);
    });

    httpServer.once('error', reject);
  });
}

async function stopServer(httpServer) {
  if (httpServer) {
    await new Promise((resolve, reject) => {
      httpServer.close((error) => (error ? reject(error) : resolve()));
    });
  }

  await disconnectDatabase();
}

if (require.main === module) {
  startServer()
    .then((httpServer) => {
      const shutdown = async () => {
        try {
          await stopServer(httpServer);
          process.exit(0);
        } catch {
          process.exit(1);
        }
      };

      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
    })
    .catch((error) => {
      console.error(`Arcadia backend could not start: ${getSafeStartupErrorMessage(error)}`);
      process.exitCode = 1;
    });
}

module.exports = {
  getSafeStartupErrorMessage,
  startServer,
  stopServer,
};
