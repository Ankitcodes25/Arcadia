/*
 * Admin Panel session token signing and verification.
 *
 * A short-lived HS256 JWT signed with ADMIN_JWT_SECRET (never JWT_SECRET), and
 * with its own issuer/audience/type, so a player access token can never pass
 * as an admin session or the reverse. It carries only the admin username and a
 * unique token id used for logout revocation, and lives exclusively in the
 * HTTP-only admin session cookie.
 */

const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { getAdminPanelConfig } = require('../config/adminPanel');

const ADMIN_SESSION_TOKEN_TYPE = 'admin-session';
const ADMIN_SESSION_ISSUER = 'arcadia-backend';
const ADMIN_SESSION_AUDIENCE = 'arcadia-admin-panel';

function signAdminSession(username) {
  const { sessionSecret, sessionTtlMinutes } = getAdminPanelConfig();

  return jwt.sign(
    {
      type: ADMIN_SESSION_TOKEN_TYPE,
      username,
      jti: crypto.randomUUID(),
    },
    sessionSecret,
    {
      algorithm: 'HS256',
      issuer: ADMIN_SESSION_ISSUER,
      audience: ADMIN_SESSION_AUDIENCE,
      expiresIn: `${sessionTtlMinutes}m`,
    },
  );
}

/** Throws on any invalid token; callers translate that to a 401. */
function verifyAdminSession(token) {
  const { sessionSecret } = getAdminPanelConfig();

  const payload = jwt.verify(token, sessionSecret, {
    algorithms: ['HS256'],
    issuer: ADMIN_SESSION_ISSUER,
    audience: ADMIN_SESSION_AUDIENCE,
  });

  if (
    !payload
    || payload.type !== ADMIN_SESSION_TOKEN_TYPE
    || typeof payload.username !== 'string'
    || typeof payload.jti !== 'string'
  ) {
    throw new Error('Invalid admin session token');
  }

  return payload;
}

module.exports = {
  ADMIN_SESSION_TOKEN_TYPE,
  ADMIN_SESSION_ISSUER,
  ADMIN_SESSION_AUDIENCE,
  signAdminSession,
  verifyAdminSession,
};
