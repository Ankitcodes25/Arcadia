const { getAdminSessionToken } = require('../config/adminSessionCookie');
const { verifySessionToken } = require('../services/adminSessionService');

// Admin Panel session guard (the HTTP-only admin cookie). Unrelated to
// requireAdmin.js, which checks a player account's database role. Any failure
// is an opaque 401 that never says why the session was rejected.
function requireAdminSession(req, res, next) {
  const token = getAdminSessionToken(req);
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
