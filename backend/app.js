const express = require('express');
const cors = require('cors');
const corsOptions = require('./config/cors');
const { trustProxy } = require('./config/env');
const authRoutes = require('./routes/authRoutes');
const accountRoutes = require('./routes/accountRoutes');
const publicPlayerRoutes = require('./routes/publicPlayerRoutes');
const adminRoutes = require('./routes/adminRoutes');
const csrfProtection = require('./middleware/csrfProtection');
const errorHandler = require('./middleware/errorHandler');
const securityHeaders = require('./middleware/securityHeaders');

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);
  app.use(securityHeaders);
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
  app.use('/api/v1/admin', adminRoutes);
  // Keep the admin compatibility alias aligned with the existing auth aliases.
  app.use('/admin', adminRoutes);
  app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
