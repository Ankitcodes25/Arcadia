/*
 * CORS configuration for the admin backend.
 *
 * Exactly one origin is ever allowed: ADMIN_FRONTEND_ORIGIN. Requests without
 * an Origin header (curl, server-to-server) pass through — the session cookie
 * still only exists in the admin's browser. Credentials are enabled so the
 * HTTP-only session cookie can travel with responses and requests.
 */

const { getEnv } = require('./env');

function isAllowedOrigin(origin) {
  if (!origin || typeof origin !== 'string') {
    return false;
  }
  try {
    return new URL(origin).origin === getEnv().adminFrontendOrigin;
  } catch {
    return false;
  }
}

/**
 * Hard gate mounted before the cors middleware: a browser request from any
 * other origin is refused outright instead of merely lacking CORS headers.
 */
function rejectUnexpectedOrigin(req, res, next) {
  const origin = req.get('origin');
  if (origin && !isAllowedOrigin(origin)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  return next();
}

const corsOptions = {
  origin(origin, callback) {
    if (!origin || isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Admin-Request'],
  exposedHeaders: ['Retry-After'],
  maxAge: 600,
  optionsSuccessStatus: 204,
};

module.exports = {
  corsOptions,
  isAllowedOrigin,
  rejectUnexpectedOrigin,
};
