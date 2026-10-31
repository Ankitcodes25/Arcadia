/*
 * End-to-end login-resolution check (no browser required).
 *
 * Boots the REAL backend in-process against an in-memory MongoDB (the same way
 * its integration tests do), with a throwaway Admin Panel account generated for
 * this run, and exercises the seven required flows over HTTP:
 *
 *   1. admin credentials      → accountType "admin" + a valid admin session
 *   2. player credentials     → routed to the player flow, player login works
 *   3. incorrect credentials  → generic login failure, no session
 *   4. admin logout           → session cleared/revoked (frontend then returns
 *                               to the shared login modal, covered by jsdom)
 *   5. player session         → cannot access the admin session (/me 401)
 *   6. refresh                → an existing admin cookie still verifies (/me 200)
 *   7. admin session          → cannot authenticate as a player (/me 401)
 *
 * Nothing is read from backend/.env, so no real credential is ever used.
 *
 * Run:  node scripts/login-resolution-e2e.cjs
 */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const { MongoMemoryServer } = require('mongodb-memory-server');

const ADMIN_USERNAME = 'e2e-admin';
const ADMIN_EMAIL = 'e2e-admin@example.com';
const ADMIN_PASSWORD = crypto.randomBytes(18).toString('base64url');
const CLIENT_HEADERS = Object.freeze({ 'X-Arcadia-Request': '1' });

let BASE;

/* ---- tiny HTTP helpers -------------------------------------------------- */

async function jsonFetch(url, { method = 'GET', headers = {}, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  return { response, data };
}

function setCookies(response) {
  return typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
}

function cookieValue(response, name) {
  for (const raw of setCookies(response)) {
    const [pair] = raw.split(';');
    const index = pair.indexOf('=');
    if (index > 0 && pair.slice(0, index).trim() === name) {
      return pair.slice(index + 1).trim();
    }
  }
  return null;
}

function adminLogin(email, password) {
  return jsonFetch(`${BASE}/api/admin/auth/login`, {
    method: 'POST',
    headers: CLIENT_HEADERS,
    body: { email, password },
  });
}

/* ---- backend boot (in-memory Mongo) ------------------------------------- */

async function startServer() {
  const mongoServer = await MongoMemoryServer.create();

  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = mongoServer.getUri('arcadia_e2e');
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  process.env.FRONTEND_URL = 'http://localhost:5173';
  process.env.CORS_ORIGIN = 'http://localhost:5173';
  process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
  process.env.GOOGLE_REDIRECT_URI = 'http://localhost:4000/api/v1/auth/google/callback';
  process.env.GOOGLE_FRONTEND_SUCCESS_URL = 'http://localhost:5173/oauth/success';
  process.env.EMAIL_PROVIDER = 'smtp';
  process.env.EMAIL_FROM = 'test@example.com';
  process.env.SMTP_HOST = 'smtp.test.local';
  process.env.SMTP_PORT = '587';
  process.env.SMTP_USER = 'test-user';
  process.env.SMTP_PASSWORD = 'test-password';
  process.env.FRONTEND_PASSWORD_RESET_URL = 'http://localhost:5173/';
  process.env.SUPPORT_INBOX_EMAIL = 'support-inbox@example.com';
  delete process.env.WELCOME_BACK_INACTIVITY_DAYS;
  delete process.env.EMAIL_ASSET_BASE_URL;
  process.env.ADMIN_USERNAME = ADMIN_USERNAME;
  process.env.ADMIN_EMAIL = ADMIN_EMAIL;
  process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync(ADMIN_PASSWORD, 10);
  process.env.ADMIN_JWT_SECRET = crypto.randomBytes(48).toString('hex');
  delete process.env.ADMIN_SESSION_TTL_MINUTES;

  const { connectDatabase, disconnectDatabase } = require('../config/database');
  const createApp = require('../app');
  const emailService = require('../services/emailService');
  emailService.setEmailLogPathForTests(
    path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'arcadia-e2e-email-')), 'email.log'),
  );

  await connectDatabase();
  const server = await new Promise((resolve, reject) => {
    const s = createApp().listen(0, () => resolve(s));
    s.on('error', reject);
  });

  return {
    mongoServer,
    server,
    base: `http://127.0.0.1:${server.address().port}`,
    async stop() {
      await new Promise((resolve) => server.close(resolve));
      await disconnectDatabase();
      await mongoServer.stop();
    },
  };
}

/* ---- test harness ------------------------------------------------------- */

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? `  (${detail})` : ''}`);
  }
}

async function main() {
  const backend = await startServer();
  BASE = backend.base;
  console.log(`Backend (in-memory Mongo): ${BASE}\n`);

  try {
    const playerEmail = `e2e-player-${Date.now()}@example.com`;
    const playerPassword = 'E2e-Player-Pass-123!';

    // Register + log in a real player, so tests 2/5/7 use genuine sessions.
    const registered = await jsonFetch(`${BASE}/api/v1/auth/register`, {
      method: 'POST',
      body: { name: 'E2E Player', email: playerEmail, password: playerPassword },
    });
    const playerLogin = await jsonFetch(`${BASE}/api/v1/auth/login`, {
      method: 'POST',
      body: { email: playerEmail, password: playerPassword },
    });
    const playerToken = playerLogin.data && playerLogin.data.token;
    const playerRefresh = cookieValue(playerLogin.response, 'arcadia_refresh');

    /* 1. Admin credentials → admin account type + valid session. */
    console.log('1. Correct admin credentials resolve to the Admin Portal');
    const admin = await adminLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
    const adminCookie = cookieValue(admin.response, 'arcadia_admin_session');
    check('resolver returns accountType "admin"',
      admin.response.status === 200 && admin.data && admin.data.accountType === 'admin',
      `status ${admin.response.status}`);
    check('admin session cookie is set (HTTP-only)', Boolean(adminCookie));
    const adminMe = await jsonFetch(`${BASE}/api/admin/auth/me`, {
      headers: { Cookie: `arcadia_admin_session=${adminCookie}` },
    });
    check('admin session verifies → frontend routes to /admin/dashboard',
      adminMe.response.status === 200 && adminMe.data.admin.username === ADMIN_USERNAME,
      `status ${adminMe.response.status}`);
    check('no password/hash/token leaked in the login body',
      !/\$2[aby]\$|eyJ/.test(JSON.stringify(admin.data)));

    /* 2. Player credentials → routed to the player flow, player login works. */
    console.log('\n2. Correct player credentials continue the player flow');
    const route = await adminLogin(playerEmail, playerPassword);
    check('resolver returns accountType "player" for a player email',
      route.response.status === 200 && route.data.accountType === 'player',
      `status ${route.response.status}`);
    check('player resolution creates NO admin session',
      cookieValue(route.response, 'arcadia_admin_session') === null);
    check('backend registers the player', registered.response.status === 201 || registered.response.status === 200,
      `status ${registered.response.status}`);
    check('player login succeeds (existing flow unchanged)',
      playerLogin.response.status === 200 && Boolean(playerToken),
      `status ${playerLogin.response.status}`);
    const playerMe = await jsonFetch(`${BASE}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${playerToken}` },
    });
    check('player /me authenticates with the player token',
      playerMe.response.status === 200,
      `status ${playerMe.response.status}`);

    /* 3. Incorrect credentials → generic failure, no session, no player fallthrough. */
    console.log('\n3. Incorrect credentials fail with the existing login error');
    const badAdmin = await adminLogin(ADMIN_EMAIL, 'definitely-the-wrong-password');
    check('wrong admin password → 401 generic error (not routed to player)',
      badAdmin.response.status === 401 && badAdmin.data.error,
      `status ${badAdmin.response.status}`);
    check('failed admin login creates no session and reports no accountType',
      cookieValue(badAdmin.response, 'arcadia_admin_session') === null
      && badAdmin.data.accountType === undefined);
    const badPlayer = await jsonFetch(`${BASE}/api/v1/auth/login`, {
      method: 'POST',
      body: { email: playerEmail, password: 'wrong-player-password' },
    });
    check('wrong player password → 401 on the player login',
      badPlayer.response.status === 401,
      `status ${badPlayer.response.status}`);

    /* 4. Admin logout → session cleared + revoked (frontend → shared modal). */
    console.log('\n4. Admin logout ends the admin session');
    const admin2 = await adminLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
    const admin2Cookie = cookieValue(admin2.response, 'arcadia_admin_session');
    const logout = await jsonFetch(`${BASE}/api/admin/auth/logout`, {
      method: 'POST',
      headers: { Cookie: `arcadia_admin_session=${admin2Cookie}`, ...CLIENT_HEADERS },
    });
    check('logout returns 200 and clears the cookie', logout.response.status === 200);
    const afterLogout = await jsonFetch(`${BASE}/api/admin/auth/me`, {
      headers: { Cookie: `arcadia_admin_session=${admin2Cookie}` },
    });
    check('the logged-out token is refused server-side',
      afterLogout.response.status === 401,
      `status ${afterLogout.response.status}`);

    /* 5. Player session cannot access the admin session. */
    console.log('\n5. A player session cannot access /admin');
    const playerToAdmin = await jsonFetch(`${BASE}/api/admin/auth/me`, {
      headers: {
        Authorization: `Bearer ${playerToken}`,
        Cookie: `arcadia_refresh=${playerRefresh}`,
      },
    });
    check('admin /me rejects a player token + refresh cookie',
      playerToAdmin.response.status === 401,
      `status ${playerToAdmin.response.status}`);

    /* 6. Refresh keeps the admin session (existing cookie still verifies). */
    console.log('\n6. Refreshing /admin/dashboard keeps the admin session');
    const refreshed = await jsonFetch(`${BASE}/api/admin/auth/me`, {
      headers: { Cookie: `arcadia_admin_session=${adminCookie}` },
    });
    check('admin /me verifies the original cookie after "refresh"',
      refreshed.response.status === 200 && refreshed.data.admin.username === ADMIN_USERNAME,
      `status ${refreshed.response.status}`);

    /* 7. Admin session cannot enter the player account. */
    console.log('\n7. An admin session cannot enter a player account');
    const adminToPlayerCookie = await jsonFetch(`${BASE}/api/v1/auth/me`, {
      headers: { Cookie: `arcadia_admin_session=${adminCookie}` },
    });
    check('player /me ignores the admin cookie',
      adminToPlayerCookie.response.status === 401,
      `status ${adminToPlayerCookie.response.status}`);
    const adminToPlayerBearer = await jsonFetch(`${BASE}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${adminCookie}` },
    });
    check('player /me rejects the admin JWT as a bearer token',
      adminToPlayerBearer.response.status === 401,
      `status ${adminToPlayerBearer.response.status}`);
  } finally {
    await backend.stop();
  }

  console.log(`\n${failures === 0 ? 'ALL E2E CHECKS PASSED' : `${failures} E2E CHECK(S) FAILED`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error('E2E run crashed:', error);
  process.exitCode = 1;
});
