/*
 * Admin Panel authentication: the login resolver, session check and logout.
 *
 * Failures stay generic. The only identity ever returned is the safe admin
 * shape (username, displayName, role) or the accountType routing signal, never
 * the password hash, ADMIN_JWT_SECRET or the session token itself.
 */

const {
  getAdminSessionToken,
  setAdminSessionCookie,
  clearAdminSessionCookie,
} = require('../config/adminSessionCookie');
const {
  resolveLogin,
  issueSessionToken,
  invalidateSessionToken,
} = require('../services/adminSessionService');

/**
 * POST /api/admin/auth/login with { email, password }
 *
 * The shared login modal calls this before any player login:
 *   - not the admin email            → 200 { accountType: "player" }, no session;
 *                                      the frontend continues with player login
 *   - admin email + wrong password   → 401; never retried as a player login
 *   - admin email + correct password → session cookie + 200 { accountType: "admin", admin }
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body ?? {};

    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const resolution = await resolveLogin(email, password);

    if (resolution.accountType === 'player') {
      return res.status(200).json({ accountType: 'player' });
    }

    if (resolution.failure) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    setAdminSessionCookie(res, issueSessionToken());
    return res.status(200).json({ accountType: 'admin', admin: resolution.admin });
  } catch (error) {
    return next(error);
  }
}

/** GET /api/admin/auth/me (requires the admin session). */
function me(req, res) {
  return res.status(200).json({ admin: req.admin });
}

/**
 * POST /api/admin/auth/logout
 * Clears the cookie and revokes the token id, so a copied cookie stops working
 * immediately. Idempotent: succeeds without a valid session too.
 */
function logout(req, res, next) {
  try {
    const token = getAdminSessionToken(req);
    if (token) {
      invalidateSessionToken(token);
    }
    clearAdminSessionCookie(res);
    return res.status(200).json({ success: true });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  login,
  me,
  logout,
};
