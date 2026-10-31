/*
 * Session token signing and verification.
 *
 * The token is a short-lived HS256 JWT carrying only: the admin username, a
 * token type marker, a unique token id (used for logout invalidation), and the
 * standard issuer/audience claims. It contains no password material and no
 * secrets. The token itself never reaches JavaScript — it lives exclusively in
 * the HTTP-only session cookie.
 */

const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { getEnv } = require('../config/env');

const ADMIN_SESSION_TOKEN_TYPE = 'admin-session';
const JWT_ISSUER = 'arcadia-admin-backend';
const JWT_AUDIENCE = 'arcadia-admin-panel';

function signAdminSession(username) {
  const { adminJwtSecret, sessionTtlMinutes } = getEnv();

  return jwt.sign(
    {
      type: ADMIN_SESSION_TOKEN_TYPE,
      username,
      // Unique per session: logout records this id so the token stops working
      // even before the cookie expires.
      jti: crypto.randomUUID(),
    },
    adminJwtSecret,
    {
      algorithm: 'HS256',
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: `${sessionTtlMinutes}m`,
    },
  );
}

/**
 * Strict verification: algorithm pinned, issuer/audience checked, expiry
 * respected. Throws on any invalid token — callers translate that to a 401.
 */
function verifyAdminSession(token) {
  const { adminJwtSecret } = getEnv();

  const payload = jwt.verify(token, adminJwtSecret, {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
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
  JWT_ISSUER,
  JWT_AUDIENCE,
  signAdminSession,
  verifyAdminSession,
};
