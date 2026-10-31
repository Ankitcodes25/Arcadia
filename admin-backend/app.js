/*
 * Express application for the Arcadia Admin Backend.
 *
 * Middleware order: security headers → origin rejection → CORS → JSON parsing
 * (small limit) → CSRF-style request header check → the single auth router →
 * 404 → safe error handler. This service exposes only the three admin auth
 * endpoints; everything else returns a JSON 404.
 */

const express = require('express');
const cors = require('cors');
const { getEnv } = require('./config/env');
const { corsOptions, rejectUnexpectedOrigin } = require('./config/cors');
const securityHeaders = require('./middleware/securityHeaders');
const errorHandler = require('./middleware/errorHandler');
const adminAuthRoutes = require('./routes/adminAuthRoutes');

/**
 * CSRF hardening for state-changing requests. The session cookie is
 * SameSite-protected and CORS is pinned to one origin, and this header adds a
 * third layer: a cross-site form post cannot set custom headers, so any
 * request without `X-Admin-Request` that carries a browser context is refused.
 */
function requestVerification(req, res, next) {
  if (req.method === 'GET' || req.method === 'OPTIONS') {
    return next();
  }

  const hasBrowserContext = Boolean(req.get('origin')) || req.get('sec-fetch-site') === 'cross-site';
  const hasClientHeader = req.get('x-admin-request') === '1';

  if (hasBrowserContext && !hasClientHeader) {
    return res.status(403).json({ error: 'Request verification failed' });
  }

  return next();
}

function createApp() {
  const { trustProxy } = getEnv();
  const app = express();

  app.disable('x-powered-by');
  if (trustProxy > 0) {
    app.set('trust proxy', trustProxy);
  }

  app.use(securityHeaders);
  app.use(rejectUnexpectedOrigin);
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '8kb', strict: true }));
  app.use(requestVerification);

  // The only mounted router: admin authentication.
  app.use('/api/admin/auth', adminAuthRoutes);

  app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
