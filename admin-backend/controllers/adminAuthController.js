/*
 * Admin authentication controller: login (the account resolver), session
 * verification (me), logout.
 *
 * Every response stays generic on failure. The only identity ever returned is
 * the safe admin shape (username, displayName, role) or the explicit
 * accountType routing signal — never the password hash, the JWT secret, or the
 * session token itself.
 */

const { getSessionToken, setSessionCookie, clearSessionCookie } = require('../config/cookie');
const {
  resolveLogin,
  issueSessionToken,
  invalidateSessionToken,
} = require('../services/adminSessionService');

/**
 * POST /api/admin/auth/login — the server-side login resolver.
 * Body: { email, password }
 *
 * Resolves whether this attempt belongs to the single admin account or to a
 * player, then answers accordingly. It never returns a password, hash, JWT
 * secret or session token, and it never creates both sessions for one attempt:
 *
 *   - email is NOT the admin account → 200 { accountType: "player" } with no
 *     session. The frontend continues with the existing player login; the
 *     submitted password plays no part in this decision.
 *   - email IS the admin account + wrong password → 401 generic error. The
 *     frontend stops here and shows the normal login error; this is never
 *     retried as a player login.
 *   - email IS the admin account + correct password → session cookie is set
 *     and 200 { accountType: "admin", admin } is returned.
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body ?? {};

    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const resolution = await resolveLogin(email, password);

    if (resolution.accountType === 'player') {
      // Deliberate account resolution: not the admin account, so no admin
      // session is created and no credential is validated here. The caller
      // continues with the existing player authentication flow.
      return res.status(200).json({ accountType: 'player' });
    }

    if (resolution.failure) {
      // The admin account with a wrong password: fail closed. This must never
      // fall through to player login, and the reason stays generic.
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Authenticated admin: the session travels only in the HTTP-only cookie.
    const token = issueSessionToken();
    setSessionCookie(res, token);

    return res.status(200).json({ accountType: 'admin', admin: resolution.admin });
  } catch (error) {
    return next(error);
  }
}

/** GET /api/admin/auth/me — protected. Returns the current admin identity. */
function me(req, res) {
  return res.status(200).json({ admin: req.admin });
}

/**
 * POST /api/admin/auth/logout
 *
 * Clears the cookie AND revokes the token id server-side, so a copied cookie
 * stops working immediately rather than at expiry. Idempotent: logging out
 * with an already-invalid session still succeeds.
 */
function logout(req, res, next) {
  try {
    const token = getSessionToken(req);
    if (token) {
      invalidateSessionToken(token);
    }
    clearSessionCookie(res);
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
