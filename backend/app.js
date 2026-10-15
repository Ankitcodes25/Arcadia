const express = require('express');
const cors = require('cors');
const corsOptions = require('./config/cors');
const { trustProxy } = require('./config/env');
const authRoutes = require('./routes/authRoutes');
const accountRoutes = require('./routes/accountRoutes');
const publicPlayerRoutes = require('./routes/publicPlayerRoutes');
const adminRoutes = require('./routes/adminRoutes');
const supportRoutes = require('./routes/supportRoutes');
const csrfProtection = require('./middleware/csrfProtection');
const errorHandler = require('./middleware/errorHandler');
const securityHeaders = require('./middleware/securityHeaders');
const { ASSET_DIRECTORY: EMAIL_ASSET_DIRECTORY } = require('./services/emailTemplates/arcadiaLayout');

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);
  app.use(securityHeaders);
  // Email artwork, linked from emails through EMAIL_ASSET_BASE_URL. Mail
  // clients and Gmail's image proxy fetch it from anywhere, so it is mounted
  // before the origin check, may be embedded cross-origin and is cached long.
  app.use('/email-assets', express.static(EMAIL_ASSET_DIRECTORY, {
    index: false,
    redirect: false,
    fallthrough: true,
    setHeaders(res) {
      // securityHeaders sets no-store for the API; artwork is safe to cache.
      res.set('Cache-Control', 'public, max-age=604800');
      res.set('Cross-Origin-Resource-Policy', 'cross-origin');
      res.removeHeader('Pragma');
    },
  }));
  app.use(corsOptions.rejectUnexpectedOrigin);
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '32kb', strict: true }));
  app.use(csrfProtection);
  app.use('/api/v1/auth', authRoutes);
  // Backward-compatible alias. Both mounts use the same router and service.
  app.use('/auth', authRoutes);
  app.use('/api/v1/account', accountRoutes);
  app.use('/api/v1/players', publicPlayerRoutes);
  // Backward-compatible account alias.
  app.use('/account', accountRoutes);
  app.use('/api/v1/support', supportRoutes);
  app.use('/api/v1/admin', adminRoutes);
  // Keep the admin compatibility alias aligned with the existing auth aliases.
  app.use('/admin', adminRoutes);
  app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
