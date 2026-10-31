/*
 * Environment loading and validation for the Arcadia Admin Backend.
 *
 * The admin backend is intentionally independent from the player-facing
 * backend: it has no database, no registration flow and exactly one admin
 * account, configured entirely through environment variables. Nothing in here
 * ever prints a variable VALUE — validation failures name the variable only,
 * so passwords, hashes and secrets can never end up in logs or error output.
 */

const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const VALID_NODE_ENVIRONMENTS = new Set(['development', 'test', 'production']);
const VALID_SAME_SITE = new Set(['lax', 'strict', 'none']);

function fail(message) {
  // Safe by construction: the message only ever names a variable, never a value.
  throw new Error(`[admin-backend configuration] ${message}`);
}

function readInteger(value, { name, min, max, fallback }) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    fail(`${name} must be an integer between ${min} and ${max}.`);
  }

  return parsed;
}

function validateEnvironment(rawEnv = process.env) {
  const nodeEnv = rawEnv.NODE_ENV || 'development';
  if (!VALID_NODE_ENVIRONMENTS.has(nodeEnv)) {
    fail('NODE_ENV must be one of development, test or production.');
  }
  const isProduction = nodeEnv === 'production';

  const port = readInteger(rawEnv.PORT, { name: 'PORT', min: 1, max: 65535, fallback: 4100 });

  const adminUsername = (rawEnv.ADMIN_USERNAME || '').trim();
  if (adminUsername.length < 3 || adminUsername.length > 64) {
    fail('ADMIN_USERNAME is required and must be between 3 and 64 characters.');
  }

  /*
   * ADMIN_EMAIL is the login identifier the shared Arcadia login modal sends
   * (its login field is a real email input). It is the server-side routing
   * key the login resolver uses to tell the one admin account apart from every
   * player — a non-secret identifier, never compared in the browser.
   */
  const adminEmail = (rawEnv.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    fail('ADMIN_EMAIL is required and must be a valid email address, e.g. admin@example.com.');
  }

  const adminPasswordHash = (rawEnv.ADMIN_PASSWORD_HASH || '').trim();
  // A bcrypt hash always starts with $2a$, $2b$ or $2y$ followed by the cost.
  if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(adminPasswordHash)) {
    fail('ADMIN_PASSWORD_HASH is required and must be a bcrypt hash. Generate one with `npm run hash-password`.');
  }

  const adminJwtSecret = rawEnv.ADMIN_JWT_SECRET || '';
  if (adminJwtSecret.length < 32) {
    fail('ADMIN_JWT_SECRET is required and must be at least 32 characters long.');
  }

  const adminFrontendOrigin = (rawEnv.ADMIN_FRONTEND_ORIGIN || '').trim();
  let parsedOrigin;
  try {
    parsedOrigin = new URL(adminFrontendOrigin);
  } catch {
    fail('ADMIN_FRONTEND_ORIGIN is required and must be an absolute HTTP(S) origin, e.g. http://localhost:5173.');
  }
  if (parsedOrigin.protocol !== 'http:' && parsedOrigin.protocol !== 'https:') {
    fail('ADMIN_FRONTEND_ORIGIN must use http or https.');
  }
  if (parsedOrigin.username || parsedOrigin.password || parsedOrigin.search || parsedOrigin.hash) {
    fail('ADMIN_FRONTEND_ORIGIN must be a bare origin without credentials, query or fragment.');
  }
  if (isProduction && parsedOrigin.protocol !== 'https:') {
    fail('ADMIN_FRONTEND_ORIGIN must use https in production.');
  }
  // Normalized origin (no trailing slash) — this is what CORS and the cookie compare against.
  const normalizedOrigin = parsedOrigin.origin;

  let cookieSameSite = (rawEnv.COOKIE_SAME_SITE || '').trim().toLowerCase();
  if (!cookieSameSite) {
    cookieSameSite = isProduction ? 'lax' : 'lax';
  }
  if (!VALID_SAME_SITE.has(cookieSameSite)) {
    fail('COOKIE_SAME_SITE must be one of lax, strict or none.');
  }
  if (cookieSameSite === 'none' && !isProduction) {
    fail('COOKIE_SAME_SITE=none is only allowed in production and requires HTTPS.');
  }

  const sessionTtlMinutes = readInteger(rawEnv.ADMIN_SESSION_TTL_MINUTES, {
    name: 'ADMIN_SESSION_TTL_MINUTES',
    min: 5,
    max: 720,
    fallback: 240,
  });

  const bcryptCost = readInteger(rawEnv.BCRYPT_COST, {
    name: 'BCRYPT_COST',
    min: 10,
    max: 15,
    fallback: isProduction ? 12 : 10,
  });

  const trustProxy = readInteger(rawEnv.TRUST_PROXY, {
    name: 'TRUST_PROXY',
    min: 0,
    max: 10,
    fallback: 0,
  });

  return Object.freeze({
    nodeEnv,
    isProduction,
    port,
    adminUsername,
    adminEmail,
    adminPasswordHash,
    adminJwtSecret,
    adminFrontendOrigin: normalizedOrigin,
    cookieSameSite,
    sessionTtlMinutes,
    bcryptCost,
    trustProxy,
  });
}

let cached = null;

/**
 * Validates once, caches the result, and re-exports the frozen object. Every
 * module reads admin configuration from here so validation always runs before
 * anything can use an unvalidated value.
 */
function getEnv() {
  if (!cached) {
    cached = validateEnvironment();
  }
  return cached;
}

module.exports = {
  getEnv,
  validateEnvironment,
};
