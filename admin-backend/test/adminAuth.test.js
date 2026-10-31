/*
 * Integration tests for the Arcadia Admin Backend.
 *
 * Environment variables are set BEFORE any app module is loaded, because
 * config/env.js validates at import time. The server runs on an ephemeral
 * port and every flow is exercised over real HTTP with fetch.
 */

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');

// ---- Test environment (must precede any app require) ------------------------

const TEST_PASSWORD = 'Arcadia-Test-Pa55word!';
const TEST_USERNAME = 'arcadia-admin';
const TEST_EMAIL = 'admin@test.arcadia.gg';

process.env.NODE_ENV = 'test';
process.env.ADMIN_USERNAME = TEST_USERNAME;
process.env.ADMIN_EMAIL = TEST_EMAIL;
// Pre-hash synchronously so env validation sees a real bcrypt hash.
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync(TEST_PASSWORD, 10);
process.env.ADMIN_JWT_SECRET = crypto.randomBytes(48).toString('hex');
process.env.ADMIN_FRONTEND_ORIGIN = 'http://localhost:5173';
process.env.ADMIN_SESSION_TTL_MINUTES = '60';
process.env.COOKIE_SAME_SITE = 'lax';
delete process.env.PORT; // default port; we listen on 0 (ephemeral) explicitly.

const createApp = require('../app');
const { validateEnvironment } = require('../config/env');
const { resetLoginRateLimiterForTests, LOGIN_LIMITS } = require('../middleware/rateLimit');
const { resetRevokedSessionsForTests } = require('../services/adminSessionService');

let server;
let baseUrl;

before(async () => {
  server = await new Promise((resolve, reject) => {
    const s = createApp().listen(0, () => resolve(s));
    s.on('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  resetLoginRateLimiterForTests();
  resetRevokedSessionsForTests();
});

// ---- Helpers -----------------------------------------------------------------

/** Extracts the session cookie value from a Set-Cookie header collection. */
function extractSessionCookie(setCookies) {
  for (const cookie of setCookies ?? []) {
    const [pair] = cookie.split(';');
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex > 0 && pair.slice(0, separatorIndex).trim() === 'arcadia_admin_session') {
      return pair.slice(separatorIndex + 1).trim();
    }
  }
  return null;
}

async function login(email, password, extra = {}) {
  const response = await fetch(`${baseUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Request': '1', ...extra.headers },
    body: JSON.stringify({ email, password }),
    ...extra,
  });
  return response;
}

async function loginSuccessfully() {
  const response = await login(TEST_EMAIL, TEST_PASSWORD);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.accountType, 'admin');
  const cookie = extractSessionCookie(response.headers.getSetCookie());
  assert.ok(cookie, 'a session cookie was set');
  return { body, cookie };
}

// ---- Login resolution ---------------------------------------------------------

test('admin login succeeds with correct credentials and returns accountType admin', async () => {
  const response = await login(TEST_EMAIL, TEST_PASSWORD);

  assert.equal(response.status, 200);
  const body = await response.json();

  // Explicit account type plus only the safe identity — nothing else.
  assert.deepEqual(Object.keys(body), ['accountType', 'admin']);
  assert.equal(body.accountType, 'admin');
  assert.equal(body.admin.username, TEST_USERNAME);
  assert.equal(body.admin.role, 'SUPER_ADMIN');

  const setCookie = response.headers.getSetCookie().find((c) => c.startsWith('arcadia_admin_session='));
  assert.ok(setCookie, 'session cookie present');
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.match(setCookie, /Path=\/api\/admin/i);
  // No Secure flag in test/development (would break plain-HTTP local dev).
  assert.doesNotMatch(setCookie, /Secure/i);
});

test('login response never contains the password, hash, secret or token', async () => {
  const response = await login(TEST_EMAIL, TEST_PASSWORD);
  const raw = await response.text();

  assert.doesNotMatch(raw, new RegExp(TEST_PASSWORD.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(raw, /\$2[aby]\$\d{2}\$/); // bcrypt hash
  assert.doesNotMatch(raw, /eyJ/, 'no JWT is returned in the body');
});

test('admin login fails with a generic 401 for a wrong password (never routed to player)', async () => {
  const response = await login(TEST_EMAIL, 'definitely-the-wrong-password');
  assert.equal(response.status, 401);
  const body = await response.json();
  // A failed admin login must never be re-attempted as a player login, so the
  // response is an auth failure (no accountType: "player", no session).
  assert.equal(body.error, 'Invalid email or password');
  assert.equal(body.accountType, undefined);
  assert.equal(extractSessionCookie(response.headers.getSetCookie()), null, 'no session cookie');
});

test('a non-admin email resolves to accountType player with NO admin session', async () => {
  const response = await login('someone@example.com', 'whatever-the-password-is');
  assert.equal(response.status, 200);
  const body = await response.json();

  // Pure routing signal: the account type is reported, no admin identity and
  // no session is created, and the password played no part in the decision.
  assert.deepEqual(Object.keys(body), ['accountType']);
  assert.equal(body.accountType, 'player');
  assert.equal(extractSessionCookie(response.headers.getSetCookie()), null,
    'a player resolution must not create an admin session');
});

test('player resolution is not counted as a failed admin login', async () => {
  // Player resolutions return 200, so they never consume the admin failure
  // budget — an unrelated player logging in cannot lock the admin out.
  for (let i = 0; i < LOGIN_LIMITS.perUsername + 5; i += 1) {
    const response = await login(`player-${i}@example.com`, 'pw');
    assert.equal(response.status, 200);
  }
  // The admin login still works afterwards.
  const admin = await login(TEST_EMAIL, TEST_PASSWORD);
  assert.equal(admin.status, 200);
});

test('login rejects non-string or missing fields with 400', async () => {
  const missing = await fetch(`${baseUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Request': '1' },
    body: JSON.stringify({}),
  });
  assert.equal(missing.status, 400);

  const wrongType = await fetch(`${baseUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Request': '1' },
    body: JSON.stringify({ email: { $ne: null }, password: ['x'] }),
  });
  assert.equal(wrongType.status, 400);
});

test('admin login is rate limited after repeated failures (per-email bucket)', async () => {
  let lastStatus = 0;
  for (let attempt = 0; attempt <= LOGIN_LIMITS.perUsername; attempt += 1) {
    const response = await login(TEST_EMAIL, `wrong-${attempt}`);
    lastStatus = response.status;
  }
  assert.equal(lastStatus, 429, 'repeated failures eventually return 429');

  const blocked = await login(TEST_EMAIL, 'still-wrong');
  assert.equal(blocked.status, 429);
  assert.ok(blocked.headers.get('retry-after'), 'Retry-After header present');

  const body = await blocked.json();
  assert.equal(body.error, 'Too many login attempts. Please try again later.');
});

// ---- Session verification (me) ----------------------------------------------

test('GET /me requires authentication', async () => {
  const response = await fetch(`${baseUrl}/api/admin/auth/me`);
  assert.equal(response.status, 401);
});

test('GET /me rejects a forged/garbage cookie', async () => {
  const response = await fetch(`${baseUrl}/api/admin/auth/me`, {
    headers: { Cookie: 'arcadia_admin_session=not-a-jwt' },
  });
  assert.equal(response.status, 401);
});

test('GET /me returns the admin identity for a valid session', async () => {
  const { cookie } = await loginSuccessfully();

  const response = await fetch(`${baseUrl}/api/admin/auth/me`, {
    headers: { Cookie: `arcadia_admin_session=${cookie}` },
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.admin.username, TEST_USERNAME);
  assert.equal(body.admin.role, 'SUPER_ADMIN');
  assert.equal(body.admin.displayName, 'Super Admin');
});

// ---- Logout ------------------------------------------------------------------

test('logout clears the cookie and invalidates the session server-side', async () => {
  const { cookie } = await loginSuccessfully();

  const logoutResponse = await fetch(`${baseUrl}/api/admin/auth/logout`, {
    method: 'POST',
    headers: { Cookie: `arcadia_admin_session=${cookie}`, 'X-Admin-Request': '1' },
  });
  assert.equal(logoutResponse.status, 200);
  const clearedCookie = logoutResponse.headers.getSetCookie()
    .find((c) => c.startsWith('arcadia_admin_session='));
  assert.ok(clearedCookie, 'cookie clearing header present');
  assert.match(clearedCookie, /Expires=Thu, 01 Jan 1970|Max-Age=0/i);

  // The same token must now be refused even though it has not expired.
  const reuse = await fetch(`${baseUrl}/api/admin/auth/me`, {
    headers: { Cookie: `arcadia_admin_session=${cookie}` },
  });
  assert.equal(reuse.status, 401, 'logged-out token is rejected server-side');
});

test('logout is idempotent and works without a session', async () => {
  const response = await fetch(`${baseUrl}/api/admin/auth/logout`, {
    method: 'POST',
    headers: { 'X-Admin-Request': '1' },
  });
  assert.equal(response.status, 200);
});

// ---- Registration must not exist --------------------------------------------

test('there is no admin registration endpoint', async () => {
  const response = await fetch(`${baseUrl}/api/admin/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Request': '1' },
    body: JSON.stringify({ username: 'attacker', password: 'password12345' }),
  });
  assert.equal(response.status, 404);
});

test('no player or admin management APIs exist on this service', async () => {
  for (const path of ['/api/admin/players', '/api/admin/reports', '/api/admin/moderation', '/api/admin/dashboard', '/players', '/auth/login']) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 404, `${path} must 404`);
  }
});

// ---- CORS --------------------------------------------------------------------

test('CORS allows only the configured admin frontend origin, with credentials', async () => {
  const allowed = await fetch(`${baseUrl}/api/admin/auth/me`, {
    headers: { Origin: 'http://localhost:5173' },
  });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');

  const foreign = await fetch(`${baseUrl}/api/admin/auth/me`, {
    headers: { Origin: 'https://evil.example.com' },
  });
  assert.equal(foreign.status, 403, 'unexpected origins are refused outright');
  assert.equal(foreign.headers.get('access-control-allow-origin'), null);
});

// ---- Request verification (CSRF layer) ---------------------------------------

test('state-changing requests from a browser context need X-Admin-Request', async () => {
  const response = await fetch(`${baseUrl}/api/admin/auth/logout`, {
    method: 'POST',
    headers: { Origin: 'http://localhost:5173' },
  });
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.error, 'Request verification failed');
});

// ---- Security headers --------------------------------------------------------

test('security headers are present and x-powered-by is disabled', async () => {
  const response = await fetch(`${baseUrl}/api/admin/auth/me`);
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

// ---- Environment validation --------------------------------------------------

test('validateEnvironment rejects a missing configuration with a safe message', () => {
  assert.throws(
    () => validateEnvironment({ NODE_ENV: 'test' }),
    (error) => {
      // Message names variables; it must never contain values.
      assert.match(error.message, /ADMIN_USERNAME|ADMIN_PASSWORD_HASH|ADMIN_JWT_SECRET|ADMIN_FRONTEND_ORIGIN/);
      return true;
    },
  );
});

test('validateEnvironment rejects an invalid bcrypt hash shape', () => {
  assert.throws(
    () => validateEnvironment({
      NODE_ENV: 'test',
      ADMIN_USERNAME: 'someone',
      ADMIN_EMAIL: 'someone@example.com',
      ADMIN_PASSWORD_HASH: 'not-a-bcrypt-hash',
      ADMIN_JWT_SECRET: 'x'.repeat(40),
      ADMIN_FRONTEND_ORIGIN: 'http://localhost:5173',
    }),
    /ADMIN_PASSWORD_HASH/,
  );
});

test('validateEnvironment rejects a missing or malformed ADMIN_EMAIL', () => {
  assert.throws(
    () => validateEnvironment({
      NODE_ENV: 'test',
      ADMIN_USERNAME: 'someone',
      ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
      ADMIN_JWT_SECRET: 'x'.repeat(40),
      ADMIN_FRONTEND_ORIGIN: 'http://localhost:5173',
    }),
    /ADMIN_EMAIL/,
  );

  assert.throws(
    () => validateEnvironment({
      NODE_ENV: 'test',
      ADMIN_USERNAME: 'someone',
      ADMIN_EMAIL: 'not-an-email',
      ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
      ADMIN_JWT_SECRET: 'x'.repeat(40),
      ADMIN_FRONTEND_ORIGIN: 'http://localhost:5173',
    }),
    /ADMIN_EMAIL/,
  );
});

test('validateEnvironment rejects a short JWT secret', () => {
  assert.throws(
    () => validateEnvironment({
      NODE_ENV: 'test',
      ADMIN_USERNAME: 'someone',
      ADMIN_EMAIL: 'someone@example.com',
      ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
      ADMIN_JWT_SECRET: 'too-short',
      ADMIN_FRONTEND_ORIGIN: 'http://localhost:5173',
    }),
    /ADMIN_JWT_SECRET/,
  );
});

test('validateEnvironment rejects non-https origins in production', () => {
  assert.throws(
    () => validateEnvironment({
      NODE_ENV: 'production',
      ADMIN_USERNAME: 'someone',
      ADMIN_EMAIL: 'someone@example.com',
      ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
      ADMIN_JWT_SECRET: 'y'.repeat(40),
      ADMIN_FRONTEND_ORIGIN: 'http://admin.example.com',
    }),
    /https/,
  );
});

test('validateEnvironment accepts a complete valid configuration', () => {
  const env = validateEnvironment({
    NODE_ENV: 'test',
    ADMIN_USERNAME: 'someone',
    ADMIN_EMAIL: 'Someone@Example.com',
    ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
    ADMIN_JWT_SECRET: 'z'.repeat(40),
    ADMIN_FRONTEND_ORIGIN: 'https://admin.example.com/',
    PORT: '4100',
    ADMIN_SESSION_TTL_MINUTES: '120',
  });
  assert.equal(env.adminFrontendOrigin, 'https://admin.example.com');
  assert.equal(env.sessionTtlMinutes, 120);
  // Normalized to lowercase for reliable identifier resolution.
  assert.equal(env.adminEmail, 'someone@example.com');
});
