/*
 * Admin Panel sign-in configuration (the single env-configured admin account).
 *
 * The Admin Panel has exactly one account and no registration flow; it exists
 * only through these variables in backend/.env:
 *
 *   ADMIN_EMAIL                 the login identifier the shared login modal sends
 *                               (also used by `npm run provision:admin`)
 *   ADMIN_USERNAME              session identity, 3-64 characters
 *   ADMIN_PASSWORD_HASH         bcrypt hash - generate with `npm run hash:admin-password`
 *   ADMIN_JWT_SECRET            >= 32 characters, different from JWT_SECRET
 *   ADMIN_SESSION_TTL_MINUTES   optional, 5-720, default 240
 *
 * When none of ADMIN_USERNAME / ADMIN_PASSWORD_HASH / ADMIN_JWT_SECRET is set
 * the panel is disabled: the login resolver reports every email as a player.
 * Setting only some of them is a startup error, so a half-configured admin
 * account can never silently route the admin email to the player login.
 * Errors only ever name a variable, never print its value.
 */

const { jwtSecret } = require('./env');
const normalizeEmail = require('../utils/normalizeEmail');

const PANEL_VARIABLES = ['ADMIN_USERNAME', 'ADMIN_PASSWORD_HASH', 'ADMIN_JWT_SECRET'];
const MIN_ADMIN_JWT_SECRET_LENGTH = 32;
const DEFAULT_SESSION_TTL_MINUTES = 240;
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

function createSafeConfigError(message) {
  const error = new Error(message);
  error.safeMessage = message;
  return error;
}

function optionalValue(source, name) {
  const value = source[name];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseSessionTtl(value) {
  if (value === null) {
    return DEFAULT_SESSION_TTL_MINUTES;
  }

  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 720) {
    throw createSafeConfigError('ADMIN_SESSION_TTL_MINUTES must be an integer between 5 and 720');
  }

  return minutes;
}

/** Returns the frozen admin panel config, or null when the panel is disabled. */
function validateAdminPanelConfig(source = process.env) {
  if (PANEL_VARIABLES.every((name) => optionalValue(source, name) === null)) {
    return null;
  }

  const missing = PANEL_VARIABLES.filter((name) => optionalValue(source, name) === null);
  if (missing.length) {
    throw createSafeConfigError(
      `Admin Panel sign-in is partly configured: set ${missing.join(', ')} in backend/.env, or remove all admin panel variables to disable it`,
    );
  }

  const username = optionalValue(source, 'ADMIN_USERNAME');
  if (username.length < 3 || username.length > 64) {
    throw createSafeConfigError('ADMIN_USERNAME must be between 3 and 64 characters');
  }

  const email = normalizeEmail(optionalValue(source, 'ADMIN_EMAIL') || '');
  if (!normalizeEmail.isValidEmail(email)) {
    throw createSafeConfigError('ADMIN_EMAIL is required for Admin Panel sign-in and must be a valid email address');
  }

  const passwordHash = optionalValue(source, 'ADMIN_PASSWORD_HASH');
  if (!BCRYPT_HASH_PATTERN.test(passwordHash)) {
    throw createSafeConfigError('ADMIN_PASSWORD_HASH must be a bcrypt hash; generate one with `npm run hash:admin-password`');
  }

  // Not trimmed: the secret is used exactly as written.
  const sessionSecret = source.ADMIN_JWT_SECRET;
  if (sessionSecret.length < MIN_ADMIN_JWT_SECRET_LENGTH) {
    throw createSafeConfigError(`ADMIN_JWT_SECRET must be at least ${MIN_ADMIN_JWT_SECRET_LENGTH} characters`);
  }
  if (sessionSecret === (source.JWT_SECRET ?? jwtSecret)) {
    throw createSafeConfigError('ADMIN_JWT_SECRET must be different from JWT_SECRET');
  }

  return Object.freeze({
    username,
    email,
    passwordHash,
    sessionSecret,
    sessionTtlMinutes: parseSessionTtl(optionalValue(source, 'ADMIN_SESSION_TTL_MINUTES')),
  });
}

let cached;

/** Validated once from process.env; throws a safe error when misconfigured. */
function getAdminPanelConfig() {
  if (cached === undefined) {
    cached = validateAdminPanelConfig();
  }
  return cached;
}

function isAdminPanelConfigured() {
  return getAdminPanelConfig() !== null;
}

/** Test-only: re-read process.env on the next getAdminPanelConfig() call. */
function resetAdminPanelConfigForTests() {
  cached = undefined;
}

module.exports = {
  PANEL_VARIABLES,
  validateAdminPanelConfig,
  getAdminPanelConfig,
  isAdminPanelConfigured,
  resetAdminPanelConfigForTests,
};
