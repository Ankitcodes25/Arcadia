/*
 * Admin Panel sign-in (/api/admin/auth/*) on the main backend.
 *
 * Environment variables are set BEFORE any app module is loaded, because
 * config/env.js validates at import time (and dotenv never overrides a value
 * that is already set). No database connection is needed: the admin routes
 * never touch MongoDB. Every flow runs over real HTTP on an ephemeral port.
 */

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');

const TEST_PASSWORD = 'Arcadia-Test-Pa55word!';
const TEST_USERNAME = 'arcadia-admin';
const TEST_EMAIL = 'admin@test.arcadia.gg';
const FRONTEND_ORIGIN = 'http://localhost:5173';
const TEST_PASSWORD_HASH = bcrypt.hashSync(TEST_PASSWORD, 10);
const PLAYER_JWT_SECRET = crypto.randomBytes(32).toString('hex');
const ADMIN_JWT_SECRET = crypto.randomBytes(48).toString('hex');

const ADMIN_PANEL_ENV = Object.freeze({
  ADMIN_USERNAME: TEST_USERNAME,
  ADMIN_EMAIL: TEST_EMAIL,
  ADMIN_PASSWORD_HASH: TEST_PASSWORD_HASH,
  ADMIN_JWT_SECRET,
  ADMIN_SESSION_TTL_MINUTES: '60',
});

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/arcadia_admin_panel_test';
process.env.JWT_SECRET = PLAYER_JWT_SECRET;
process.env.FRONTEND_URL = FRONTEND_ORIGIN;
process.env.CORS_ORIGIN = FRONTEND_ORIGIN;
process.env.COOKIE_SAME_SITE = 'lax';
process.env.TRUST_PROXY = 'false';
Object.assign(process.env, ADMIN_PANEL_ENV);

const createApp = require('../app');
const {
  validateAdminPanelConfig,
  resetAdminPanelConfigForTests,
} = require('../config/adminPanel');
const {
  resetAdminLoginRateLimitForTests,
  ADMIN_LOGIN_LIMITS,
} = require('../middleware/adminLoginRateLimit');
const { resetRevokedSessionsForTests } = require('../services/adminSessionService');

let server;
let baseUrl;

before(async () => {
  server = await new Promise((resolve, reject) => {
    const httpServer = createApp().listen(0, () => resolve(httpServer));
    httpServer.on('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  Object.assign(process.env, ADMIN_PANEL_ENV);
  resetAdminPanelConfigForTests();
  resetAdminLoginRateLimitForTests();
  resetRevokedSessionsForTests();
});

// ---- Helpers -----------------------------------------------------------------

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

function login(email, password, headers = {}) {
  return fetch(`${baseUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Arcadia-Request': '1', ...headers },
    body: JSON.stringify({ email, password }),
  });
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

function me(cookie) {
  return fetch(`${baseUrl}/api/admin/auth/me`, {
    headers: cookie ? { Cookie: `arcadia_admin_session=${cookie}` } : {},
  });
}

function withoutAdminPanel(run) {
  return async () => {
    for (const name of Object.keys(ADMIN_PANEL_ENV)) {
      delete process.env[name];
    }
    resetAdminPanelConfigForTests();
    await run();
  };
}

// ---- Login resolution ---------------------------------------------------------

test('admin login succeeds with correct credentials and returns accountType admin', async () => {
  const response = await login(TEST_EMAIL, TEST_PASSWORD);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ['accountType', 'admin']);
  assert.equal(body.accountType, 'admin');
  assert.equal(body.admin.username, TEST_USERNAME);
  assert.equal(body.admin.role, 'SUPER_ADMIN');

  const setCookie = response.headers.getSetCookie().find((c) => c.startsWith('arcadia_admin_session='));
  assert.ok(setCookie, 'session cookie present');
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.match(setCookie, /Path=\/api\/admin(;|$)/i);
  assert.match(setCookie, /Max-Age=3600/i);
  // No Secure flag outside production (would break plain-HTTP local dev).
  assert.doesNotMatch(setCookie, /Secure/i);
});

test('the admin email is matched case- and whitespace-insensitively', async () => {
  const response = await login(`  ${TEST_EMAIL.toUpperCase()} `, TEST_PASSWORD);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).accountType, 'admin');
});

test('login response never contains the password, hash, secret or token', async () => {
  const response = await login(TEST_EMAIL, TEST_PASSWORD);
  const raw = await response.text();

  assert.doesNotMatch(raw, new RegExp(TEST_PASSWORD.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(raw, /\$2[aby]\$\d{2}\$/);
  assert.equal(raw.includes(ADMIN_JWT_SECRET), false);
  assert.doesNotMatch(raw, /eyJ/, 'no JWT is returned in the body');
});

test('a wrong admin password is a generic 401 that is never routed to the player flow', async () => {
  const response = await login(TEST_EMAIL, 'definitely-the-wrong-password');
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.error, 'Invalid email or password');
  assert.equal(body.accountType, undefined);
  assert.equal(extractSessionCookie(response.headers.getSetCookie()), null, 'no session cookie');
});

test('a non-admin email resolves to accountType player with no admin session', async () => {
  const response = await login('someone@example.com', 'whatever-the-password-is');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, { accountType: 'player' });
  assert.equal(extractSessionCookie(response.headers.getSetCookie()), null);
});

test('player resolutions never consume the admin failure budget', async () => {
  for (let i = 0; i < ADMIN_LOGIN_LIMITS.perEmail + 5; i += 1) {
    const response = await login(`player-${i}@example.com`, 'pw');
    assert.equal(response.status, 200);
  }
  const admin = await login(TEST_EMAIL, TEST_PASSWORD);
  assert.equal(admin.status, 200);
});

test('login rejects missing or non-string fields with 400', async () => {
  for (const body of [{}, { email: TEST_EMAIL }, { email: { $ne: null }, password: ['x'] }]) {
    const response = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Arcadia-Request': '1' },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 400);
  }
});

test('admin login is rate limited after repeated failures on the admin email', async () => {
  for (let attempt = 0; attempt < ADMIN_LOGIN_LIMITS.perEmail; attempt += 1) {
    const response = await login(TEST_EMAIL, `wrong-${attempt}`);
    assert.equal(response.status, 401, `attempt ${attempt + 1} is still a plain failure`);
  }

  // The budget is spent: even the correct password is refused for the window.
  const blocked = await login(TEST_EMAIL, TEST_PASSWORD);
  assert.equal(blocked.status, 429);
  assert.ok(blocked.headers.get('retry-after'), 'Retry-After header present');
  assert.equal((await blocked.json()).error, 'Too many login attempts. Please try again later.');

  // Other emails from the same IP are still resolved (IP budget not reached).
  const player = await login('player@example.com', 'pw');
  assert.equal(player.status, 200);
});

// ---- Session verification (me) ----------------------------------------------

test('GET /me requires authentication', async () => {
  assert.equal((await me()).status, 401);
});

test('GET /me rejects a forged cookie', async () => {
  assert.equal((await me('not-a-jwt')).status, 401);
});

test('GET /me returns the admin identity for a valid session', async () => {
  const { cookie } = await loginSuccessfully();
  const response = await me(cookie);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    admin: { username: TEST_USERNAME, displayName: 'Super Admin', role: 'SUPER_ADMIN' },
  });
});

test('a session stops working when ADMIN_USERNAME is rotated', async () => {
  const { cookie } = await loginSuccessfully();
  process.env.ADMIN_USERNAME = 'rotated-admin';
  resetAdminPanelConfigForTests();
  assert.equal((await me(cookie)).status, 401);
});

test('a session stops working when ADMIN_JWT_SECRET is rotated', async () => {
  const { cookie } = await loginSuccessfully();
  process.env.ADMIN_JWT_SECRET = crypto.randomBytes(48).toString('hex');
  resetAdminPanelConfigForTests();
  assert.equal((await me(cookie)).status, 401);
});

// ---- Isolation from player auth ----------------------------------------------

test('a player access token is not accepted as an admin session', async () => {
  const jwt = require('jsonwebtoken');
  const playerLike = jwt.sign(
    { type: 'access', username: TEST_USERNAME, jti: crypto.randomUUID() },
    PLAYER_JWT_SECRET,
    { algorithm: 'HS256', issuer: 'arcadia-backend', audience: 'arcadia-web', expiresIn: '5m' },
  );
  assert.equal((await me(playerLike)).status, 401);
});

test('the admin session grants nothing on player routes', async () => {
  const { cookie } = await loginSuccessfully();
  const response = await fetch(`${baseUrl}/api/v1/account/profile`, {
    headers: { Cookie: `arcadia_admin_session=${cookie}` },
  });
  assert.equal(response.status, 401);
});

// ---- Logout ------------------------------------------------------------------

test('logout clears the cookie and revokes the session server-side', async () => {
  const { cookie } = await loginSuccessfully();

  const response = await fetch(`${baseUrl}/api/admin/auth/logout`, {
    method: 'POST',
    headers: { Cookie: `arcadia_admin_session=${cookie}`, 'X-Arcadia-Request': '1' },
  });
  assert.equal(response.status, 200);
  const cleared = response.headers.getSetCookie().find((c) => c.startsWith('arcadia_admin_session='));
  assert.ok(cleared, 'cookie clearing header present');
  assert.match(cleared, /Expires=Thu, 01 Jan 1970/i);
  assert.match(cleared, /Path=\/api\/admin(;|$)/i);

  assert.equal((await me(cookie)).status, 401, 'logged-out token is rejected');
});

test('logout is idempotent and works without a session', async () => {
  const response = await fetch(`${baseUrl}/api/admin/auth/logout`, {
    method: 'POST',
    headers: { 'X-Arcadia-Request': '1' },
  });
  assert.equal(response.status, 200);
});

test('there is no admin registration endpoint', async () => {
  const response = await fetch(`${baseUrl}/api/admin/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Arcadia-Request': '1' },
    body: JSON.stringify({ username: 'attacker', password: 'password12345' }),
  });
  assert.equal(response.status, 404);
});

// ---- CORS, CSRF and headers --------------------------------------------------

test('CORS allows only the configured frontend origin, with credentials', async () => {
  const allowed = await fetch(`${baseUrl}/api/admin/auth/me`, { headers: { Origin: FRONTEND_ORIGIN } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), FRONTEND_ORIGIN);
  assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');

  const preflight = await fetch(`${baseUrl}/api/admin/auth/login`, {
    method: 'OPTIONS',
    headers: {
      Origin: FRONTEND_ORIGIN,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,x-arcadia-request',
    },
  });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers'), /X-Arcadia-Request/i);

  const foreign = await fetch(`${baseUrl}/api/admin/auth/me`, { headers: { Origin: 'https://evil.example.com' } });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers.get('access-control-allow-origin'), null);
});

test('browser POSTs without X-Arcadia-Request are refused', async () => {
  const response = await fetch(`${baseUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: FRONTEND_ORIGIN },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, 'Request verification failed');
});

test('a POST carrying the admin cookie needs X-Arcadia-Request even without Origin', async () => {
  const { cookie } = await loginSuccessfully();
  const response = await fetch(`${baseUrl}/api/admin/auth/logout`, {
    method: 'POST',
    headers: { Cookie: `arcadia_admin_session=${cookie}` },
  });
  assert.equal(response.status, 403);
  assert.equal((await me(cookie)).status, 200, 'the refused logout did not revoke the session');
});

test('security headers are present and x-powered-by is disabled', async () => {
  const response = await me();
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

// ---- Panel disabled (no admin variables) ---------------------------------------

test('with the panel disabled every email, including ADMIN_EMAIL, resolves to player', withoutAdminPanel(async () => {
  process.env.ADMIN_EMAIL = TEST_EMAIL; // still set for `npm run provision:admin`
  resetAdminPanelConfigForTests();

  const response = await login(TEST_EMAIL, TEST_PASSWORD);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { accountType: 'player' });
  assert.equal(extractSessionCookie(response.headers.getSetCookie()), null);
}));

test('with the panel disabled /me is 401 and logout still succeeds', withoutAdminPanel(async () => {
  assert.equal((await me('anything')).status, 401);
  const logout = await fetch(`${baseUrl}/api/admin/auth/logout`, {
    method: 'POST',
    headers: { 'X-Arcadia-Request': '1', Cookie: 'arcadia_admin_session=anything' },
  });
  assert.equal(logout.status, 200);
}));

// ---- Configuration validation ------------------------------------------------

const VALID_SOURCE = Object.freeze({ ...ADMIN_PANEL_ENV, JWT_SECRET: PLAYER_JWT_SECRET });

function assertSafeConfigError(source, pattern) {
  assert.throws(() => validateAdminPanelConfig(source), (error) => {
    assert.match(error.message, pattern);
    assert.equal(error.safeMessage, error.message);
    for (const secret of [TEST_PASSWORD_HASH, ADMIN_JWT_SECRET, PLAYER_JWT_SECRET]) {
      assert.equal(error.message.includes(secret), false, 'error never echoes a value');
    }
    return true;
  });
}

test('no admin panel variables means the panel is disabled', () => {
  assert.equal(validateAdminPanelConfig({ JWT_SECRET: PLAYER_JWT_SECRET }), null);
  assert.equal(validateAdminPanelConfig({ JWT_SECRET: PLAYER_JWT_SECRET, ADMIN_EMAIL: TEST_EMAIL }), null);
});

test('a partial configuration names every missing variable', () => {
  assertSafeConfigError(
    { JWT_SECRET: PLAYER_JWT_SECRET, ADMIN_EMAIL: TEST_EMAIL, ADMIN_USERNAME: TEST_USERNAME },
    /partly configured: set ADMIN_PASSWORD_HASH, ADMIN_JWT_SECRET/,
  );
});

test('config validation rejects each invalid value with a safe message', () => {
  assertSafeConfigError({ ...VALID_SOURCE, ADMIN_USERNAME: 'ab' }, /ADMIN_USERNAME/);
  assertSafeConfigError({ ...VALID_SOURCE, ADMIN_USERNAME: 'a'.repeat(65) }, /ADMIN_USERNAME/);
  assertSafeConfigError({ ...VALID_SOURCE, ADMIN_EMAIL: '' }, /ADMIN_EMAIL/);
  assertSafeConfigError({ ...VALID_SOURCE, ADMIN_EMAIL: 'not-an-email' }, /ADMIN_EMAIL/);
  assertSafeConfigError({ ...VALID_SOURCE, ADMIN_PASSWORD_HASH: 'not-a-bcrypt-hash' }, /ADMIN_PASSWORD_HASH/);
  assertSafeConfigError({ ...VALID_SOURCE, ADMIN_JWT_SECRET: 'x'.repeat(31) }, /ADMIN_JWT_SECRET must be at least 32/);
  assertSafeConfigError({ ...VALID_SOURCE, ADMIN_JWT_SECRET: PLAYER_JWT_SECRET }, /different from JWT_SECRET/);
  assertSafeConfigError({ ...VALID_SOURCE, ADMIN_SESSION_TTL_MINUTES: '4' }, /ADMIN_SESSION_TTL_MINUTES/);
  assertSafeConfigError({ ...VALID_SOURCE, ADMIN_SESSION_TTL_MINUTES: '721' }, /ADMIN_SESSION_TTL_MINUTES/);
  assertSafeConfigError({ ...VALID_SOURCE, ADMIN_SESSION_TTL_MINUTES: '1.5' }, /ADMIN_SESSION_TTL_MINUTES/);
});

test('config validation accepts a complete configuration and normalizes it', () => {
  const config = validateAdminPanelConfig({
    ...VALID_SOURCE,
    ADMIN_EMAIL: '  Someone@Example.com ',
    ADMIN_JWT_SECRET: 'z'.repeat(32),
    ADMIN_SESSION_TTL_MINUTES: '',
  });
  assert.equal(config.email, 'someone@example.com');
  assert.equal(config.sessionTtlMinutes, 240);
  assert.equal(Object.isFrozen(config), true);

  assert.equal(validateAdminPanelConfig({ ...VALID_SOURCE, ADMIN_SESSION_TTL_MINUTES: '5' }).sessionTtlMinutes, 5);
  assert.equal(validateAdminPanelConfig({ ...VALID_SOURCE, ADMIN_SESSION_TTL_MINUTES: '720' }).sessionTtlMinutes, 720);
});
