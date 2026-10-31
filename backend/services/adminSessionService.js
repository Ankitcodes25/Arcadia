/*
 * Admin Panel session lifecycle: login resolution, token issue, verification
 * and logout revocation for the single configured admin account
 * (config/adminPanel.js). A provisioned MongoDB admin's current password is
 * authoritative; the configured bcrypt hash is used when no admin is provisioned.
 *
 * resolveLogin() decides the account type server-side by identifier before any
 * password work: a non-admin email is routed to the player flow untouched,
 * while the admin email is checked against the provisioned account or the
 * configured fallback hash. When the panel is not configured there is no
 * admin account, so every email resolves to a player.
 * No credential material is ever returned or logged.
 */

const crypto = require('node:crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { getAdminPanelConfig } = require('../config/adminPanel');
const { User, USER_ROLES, ACCOUNT_STATUSES } = require('../models/User');
const normalizeEmail = require('../utils/normalizeEmail');
const { signAdminSession, verifyAdminSession } = require('../utils/adminSessionToken');

/*
 * Ids of logged-out sessions, refused even before they expire. Entries are
 * pruned once they age past the session TTL, the only window in which such a
 * token could still verify. Kept in process memory: a backend restart forgets
 * revocations, so a copied cookie from before the restart would work again
 * until its own expiry.
 */
const revokedTokenIds = new Map(); // jti -> revokedAt (epoch ms)

function pruneRevokedTokens(sessionTtlMinutes, now = Date.now()) {
  const maxAgeMs = sessionTtlMinutes * 60 * 1000;
  for (const [jti, revokedAt] of revokedTokenIds) {
    if (now - revokedAt > maxAgeMs) {
      revokedTokenIds.delete(jti);
    }
  }
}

function safeEquals(a, b) {
  // Hashing first gives equal-length buffers, so the comparison time does not
  // depend on where (or whether) the inputs differ.
  const digestA = crypto.createHash('sha256').update(String(a), 'utf8').digest();
  const digestB = crypto.createHash('sha256').update(String(b), 'utf8').digest();
  return crypto.timingSafeEqual(digestA, digestB);
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
 * Returns exactly one of:
 *   { accountType: 'player' }                                  not the admin email
 *   { accountType: 'admin', failure: 'invalid_credentials' }   admin email, wrong password
 *   { accountType: 'admin', admin }                            admin email, correct password
 */
async function resolveLogin(submittedEmail, submittedPassword) {
  const config = getAdminPanelConfig();
  if (!config) {
    return { accountType: 'player' };
  }

  if (!safeEquals(normalizeEmail(submittedEmail), config.email)) {
    // Routing decision only: no credential work for player emails.
    return { accountType: 'player' };
  }

  let passwordHash = config.passwordHash;
  if (mongoose.connection.readyState === 1) {
    const adminAccount = await User.findOne({
      email: config.email,
      role: USER_ROLES.ADMIN,
    }).select('+passwordHash');

    if (adminAccount) {
      if (adminAccount.status !== ACCOUNT_STATUSES.ACTIVE || !adminAccount.passwordHash) {
        return { accountType: 'admin', failure: 'invalid_credentials' };
      }
      passwordHash = adminAccount.passwordHash;
    }
  } else if (process.env.NODE_ENV === 'production') {
    throw new Error('Admin account verification is unavailable');
  }

  let passwordMatch = false;
  try {
    passwordMatch = await bcrypt.compare(String(submittedPassword ?? ''), passwordHash);
  } catch {
    passwordMatch = false;
  }

  if (!passwordMatch) {
    return { accountType: 'admin', failure: 'invalid_credentials' };
  }

  return { accountType: 'admin', admin: toSafeAdmin(config.username) };
}

/** Issues a new signed session token for the authenticated admin. */
function issueSessionToken() {
  return signAdminSession(getAdminPanelConfig().username);
}

/** Returns { admin, tokenId } or { failure: 'invalid_session' }. */
function verifySessionToken(token) {
  const config = getAdminPanelConfig();
  if (!config) {
    return { failure: 'invalid_session' };
  }

  try {
    const payload = verifyAdminSession(token);

    pruneRevokedTokens(config.sessionTtlMinutes);
    if (revokedTokenIds.has(payload.jti)) {
      return { failure: 'invalid_session' };
    }

    // A session for a previous ADMIN_USERNAME stops working once it is rotated.
    if (!safeEquals(payload.username, config.username)) {
      return { failure: 'invalid_session' };
    }

    return { admin: toSafeAdmin(config.username), tokenId: payload.jti };
  } catch {
    return { failure: 'invalid_session' };
  }
}

/** Revokes a session server-side. An already-invalid token is a no-op. */
function invalidateSessionToken(token) {
  if (!getAdminPanelConfig()) {
    return false;
  }

  try {
    const payload = verifyAdminSession(token);
    revokedTokenIds.set(payload.jti, Date.now());
    return true;
  } catch {
    return false;
  }
}

/** Test-only: clears revocation state between test cases. */
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
