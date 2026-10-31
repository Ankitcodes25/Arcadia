/*
 * Admin session lifecycle: login resolution, token issue, verification and
 * logout invalidation.
 *
 * There is exactly one admin, configured via ADMIN_EMAIL / ADMIN_USERNAME /
 * ADMIN_PASSWORD_HASH. resolveLogin() decides the account type server-side by
 * identifier before doing any password work: a non-admin email is routed to
 * the player flow untouched, while the admin email is always checked with
 * bcrypt using a timing-safe email comparison. No credential material is ever
 * returned or logged.
 */

const { timingSafeEqual } = require('node:crypto');
const { getEnv } = require('../config/env');
const { verifyPassword } = require('../utils/bcrypt');
const { signAdminSession, verifyAdminSession } = require('../utils/jwt');

/**
 * Ids of logged-out sessions. A token whose jti appears here is refused even
 * if it has not expired. Entries are pruned as they age past the session TTL,
 * which is the only window in which such a token could still be valid.
 */
const revokedTokenIds = new Map(); // jti -> revokedAt (epoch ms)

function revokeTokenId(jti) {
  if (typeof jti === 'string' && jti) {
    revokedTokenIds.set(jti, Date.now());
  }
}

function pruneRevokedTokens(now = Date.now()) {
  const maxAgeMs = getEnv().sessionTtlMinutes * 60 * 1000;
  for (const [jti, revokedAt] of revokedTokenIds) {
    if (now - revokedAt > maxAgeMs) {
      revokedTokenIds.delete(jti);
    }
  }
}

function isTokenRevoked(jti) {
  pruneRevokedTokens();
  return revokedTokenIds.has(jti);
}

function safeEquals(a, b) {
  const bufferA = Buffer.from(String(a), 'utf8');
  const bufferB = Buffer.from(String(b), 'utf8');
  if (bufferA.length !== bufferB.length) {
    // Still perform a comparison of equal-length buffers to keep the work
    // constant, then report the mismatch.
    const filler = Buffer.alloc(bufferA.length);
    timingSafeEqual(bufferA, filler);
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

/** The identity shape returned to the frontend. Never includes the hash or secret. */
function toSafeAdmin(username) {
  return Object.freeze({
    username,
    displayName: 'Super Admin',
    role: 'SUPER_ADMIN',
  });
}

/**
 * Resolves a login attempt against the single configured admin account.
 *
 * This is the deliberate, server-side account-resolution strategy. The browser
 * never compares credentials — it relays them here once, and the account type
 * is decided by identifier (timing-safe ADMIN_EMAIL match) before any password
 * work happens. It returns exactly one of:
 *
 *   { accountType: 'player' }
 *       The submitted email is NOT the admin email, so this is a player login.
 *       No password is validated and no session is created — the frontend just
 *       continues with the existing player authentication flow. This is a pure
 *       routing signal; the admin password never participates.
 *
 *   { accountType: 'admin', failure: 'invalid_credentials' }
 *       The email IS the admin email but the password is wrong. The caller
 *       returns 401 and this attempt must NOT be retried as a player login.
 *
 *   { accountType: 'admin', admin }
 *       Admin email + correct password. Only now does the caller issue a
 *       session and report accountType 'admin'.
 *
 * Within the admin branch the work is constant: bcrypt always runs and the
 * email comparison is timing-safe. Across the two branches the response status
 * (401 vs 200) already distinguishes them by design — that is the resolution
 * signal the spec asks for, gated behind rate limiting, while the password
 * itself stays bcrypt-protected either way. No credential material is ever
 * returned or logged.
 */
async function resolveLogin(submittedEmail, submittedPassword) {
  const { adminEmail, adminUsername, adminPasswordHash } = getEnv();

  const emailMatch = safeEquals(
    String(submittedEmail ?? '').trim().toLowerCase(),
    adminEmail,
  );

  if (!emailMatch) {
    // Not the admin account: routing decision only, no credential work.
    return { accountType: 'player' };
  }

  const passwordMatch = await verifyPassword(
    String(submittedPassword ?? ''),
    adminPasswordHash,
  );

  if (!passwordMatch) {
    return { accountType: 'admin', failure: 'invalid_credentials' };
  }

  return { accountType: 'admin', admin: toSafeAdmin(adminUsername) };
}

/** Issues a new signed session token for the authenticated admin. */
function issueSessionToken() {
  const { adminUsername } = getEnv();
  return signAdminSession(adminUsername);
}

/**
 * Verifies a session token from the cookie.
 * Returns { admin, tokenId } or { failure: 'invalid_session' }.
 */
function verifySessionToken(token) {
  try {
    const payload = verifyAdminSession(token);

    if (isTokenRevoked(payload.jti)) {
      return { failure: 'invalid_session' };
    }

    // The token must belong to the one configured admin — if credentials are
    // rotated while a session is live, the old session stops working.
    const { adminUsername } = getEnv();
    if (!safeEquals(payload.username, adminUsername)) {
      return { failure: 'invalid_session' };
    }

    return { admin: toSafeAdmin(adminUsername), tokenId: payload.jti };
  } catch {
    return { failure: 'invalid_session' };
  }
}

/** Invalidates a session server-side by revoking its token id. */
function invalidateSessionToken(token) {
  try {
    const payload = verifyAdminSession(token);
    revokeTokenId(payload.jti);
    return true;
  } catch {
    // An already-invalid token is fine to "log out": the end state is the same.
    return false;
  }
}

/** Test-only helper: clears revocation state between test cases. */
function resetRevokedSessionsForTests() {
  revokedTokenIds.clear();
}

module.exports = {
  resolveLogin,
  issueSessionToken,
  verifySessionToken,
  invalidateSessionToken,
  resetRevokedSessionsForTests,
  toSafeAdmin,
};
