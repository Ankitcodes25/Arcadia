/*
 * Authentication middleware for admin routes.
 *
 * Reads the session token from the HTTP-only cookie, verifies it, checks
 * server-side revocation, and attaches the safe admin identity to the request.
 * Any failure is an opaque 401 — no detail about why the session was rejected
 * is ever disclosed.
 */

const { getSessionToken } = require('../config/cookie');
const { verifySessionToken } = require('../services/adminSessionService');

function requireAdminSession(req, res, next) {
  const token = getSessionToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const result = verifySessionToken(token);
  if (result.failure) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  req.admin = result.admin;
  req.adminSession = { tokenId: result.tokenId };
  return next();
}

module.exports = requireAdminSession;
