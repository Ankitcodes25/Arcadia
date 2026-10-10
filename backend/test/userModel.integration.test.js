const { after, afterEach, before, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { once } = require('node:events');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;
let mongoose;
let User;
let USER_ROLES;
let ACCOUNT_STATUSES;
let GOOGLE_PROVIDER;
let authService;
let provisionAdmin;
let toSafeUser;
let connectDatabase;
let disconnectDatabase;
let validateEnvironment;
let createApp;
let signAccessToken;
let verifyAccessToken;
let Session;
let generateRefreshToken;
let hashRefreshToken;
let verifyRefreshTokenHash;
let isValidRefreshToken;
let hashSecureToken;
let REFRESH_COOKIE_NAME;
let OAuthState;
let OAuthHandoff;
let PasswordResetToken;
let RateLimitBucket;
let AdminMutationLock;
let accountProfileService;
let emailService;
let LOCAL_AVATAR_IDS;
let USERNAME_CHANGE_COOLDOWN_MS;
let getUsernameLength;
let getUsernameValidationError;
let normalizeUsername;
let toDisplayUsername;
let RESERVED_USERNAMES;
let emailMessages;
let googleOAuthService;
let progressionService;
let XP_GRANT_SOURCES;
let XP_REWARDS;
let MATCH_RESULTS;
let XP_AWARD_REASONS;
let XP_EARNING_GAME;
let getProgression;
let getLevelFromTotalXp;
let getCumulativeXpForLevel;
let getXpToAdvanceFromLevel;
let normalizeTotalXp;
let MAX_TOTAL_XP;
let getLevelBadge;
let LEVEL_BADGE_TIERS;
let generatePlayerId;
let isValidPlayerId;
let PLAYER_ID_PATTERN;
let PLAYER_ID_ALPHABET;
let playerIdService;
let backfillMissingPlayerIds;
let generateOAuthState;
let generateOAuthHandoffCode;
let generateOAuthCodeVerifier;
let derivePkceChallenge;
let isValidOAuthCodeVerifier;
let hashOAuthValue;
let isValidOAuthState;
let isValidOAuthHandoffCode;
let OAUTH_STATE_COOKIE_NAME;
let googleMockPayload;
let googleMockRequests;
let preferencesUtils;

before(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = mongoServer.getUri('arcadia_test');
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

  mongoose = require('mongoose');
  ({ User, USER_ROLES, ACCOUNT_STATUSES, GOOGLE_PROVIDER } = require('../models/User'));
  authService = require('../services/authService');
  ({ provisionAdmin } = require('../services/adminProvisioner'));
  ({ toSafeUser } = require('../utils/safeUser'));
  ({ connectDatabase, disconnectDatabase } = require('../config/database'));
  ({ validateEnvironment } = require('../config/env'));
  createApp = require('../app');
  ({ signAccessToken, verifyAccessToken } = require('../utils/jwt'));
  ({ Session } = require('../models/Session'));
({ Match, OPPONENT_TYPES, MATCH_RESULTS } = require('../models/Match'));
  ({ generateRefreshToken, hashRefreshToken, verifyRefreshTokenHash, isValidRefreshToken } = require('../utils/refreshToken'));
  ({ hashSecureToken } = require('../utils/secureToken'));
  ({ REFRESH_COOKIE_NAME } = require('../config/refreshCookie'));
  ({ OAuthState } = require('../models/OAuthState'));
  ({ OAuthHandoff } = require('../models/OAuthHandoff'));
  ({ PasswordResetToken } = require('../models/PasswordResetToken'));
  ({ RateLimitBucket } = require('../models/RateLimitBucket'));
  ({ AdminMutationLock } = require('../models/AdminMutationLock'));
  accountProfileService = require('../services/accountProfileService');
  preferencesUtils = require('../utils/preferences');
  ({ LOCAL_AVATAR_IDS } = require('../config/avatar'));
  ({ USERNAME_CHANGE_COOLDOWN_MS } = accountProfileService);
  ({
    getUsernameLength,
    getUsernameValidationError,
    normalizeUsername,
    toDisplayUsername,
    RESERVED_USERNAMES,
  } = require('../utils/username'));
  emailService = require('../services/emailService');
  googleOAuthService = require('../services/googleOAuthService');
  progressionService = require('../services/progressionService');
  ({
    XP_GRANT_SOURCES,
    XP_REWARDS,
    MATCH_RESULTS,
    XP_AWARD_REASONS,
  } = progressionService);
  ({
    getProgression,
    getLevelFromTotalXp,
    getCumulativeXpForLevel,
    getXpToAdvanceFromLevel,
    normalizeTotalXp,
    MAX_TOTAL_XP,
    XP_EARNING_GAME,
  } = require('../utils/progression'));
  ({ getLevelBadge, LEVEL_BADGE_TIERS } = require('../config/levelBadges'));
  ({
    generatePlayerId,
    isValidPlayerId,
    PLAYER_ID_PATTERN,
    PLAYER_ID_ALPHABET,
  } = require('../utils/playerId'));
  playerIdService = require('../services/playerIdService');
  ({ backfillMissingPlayerIds } = playerIdService);
  ({
    generateOAuthState,
    generateOAuthHandoffCode,
    generateOAuthCodeVerifier,
    derivePkceChallenge,
    isValidOAuthCodeVerifier,
    hashOAuthValue,
    isValidOAuthState,
    isValidOAuthHandoffCode,
  } = require('../utils/oauth'));
  ({ OAUTH_STATE_COOKIE_NAME } = require('../config/oauthCookie'));

  await connectDatabase();
  await User.syncIndexes();
  await Session.syncIndexes();
  await OAuthState.syncIndexes();
  await OAuthHandoff.syncIndexes();
  await PasswordResetToken.syncIndexes();
  await RateLimitBucket.syncIndexes();
  await AdminMutationLock.syncIndexes();
});

after(async () => {
  if (disconnectDatabase) {
    await disconnectDatabase();
  }

  if (mongoServer) {
    await mongoServer.stop();
  }
});

beforeEach(async () => {
  await RateLimitBucket.deleteMany({});
  await AdminMutationLock.deleteMany({});
  await PasswordResetToken.deleteMany({});
  await OAuthHandoff.deleteMany({});
  await OAuthState.deleteMany({});
  await Session.deleteMany({});
  await Match.deleteMany({});
  await User.deleteMany({});
  emailMessages = [];
  emailService.setEmailTransportForTests(async (message) => {
    emailMessages.push(message);
    return { sent: true };
  });
});

afterEach(() => {
  googleOAuthService.resetGoogleClientFactoryForTests();
  emailService.resetEmailTransportForTests();
});

async function startHttpServer() {
  const server = createApp().listen(0);
  await once(server, 'listening');
  return server;
}

function getServerUrl(server) {
  return `http://127.0.0.1:${server.address().port}`;
}

async function stopHttpServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function requestJson(server, path, options = {}) {
  const { csrfHeader = true, ...fetchOptions } = options;
  const headers = { ...(fetchOptions.headers || {}) };
  let body = fetchOptions.body;

  if (body !== undefined && typeof body !== 'string') {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(body);
  }

  const method = (fetchOptions.method || 'GET').toUpperCase();
  if (csrfHeader && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    headers['x-arcadia-request'] = '1';
  }

  const response = await fetch(`${getServerUrl(server)}${path}`, {
    ...fetchOptions,
    headers,
    body,
  });
  const text = await response.text();
  let parsedBody = null;

  if (text) {
    try {
      parsedBody = JSON.parse(text);
    } catch {
      parsedBody = text;
    }
  }

  return { response, body: parsedBody };
}

function getCookieValue(response, cookieName) {
  const setCookieHeader = response.headers.get('set-cookie') || '';
  const prefix = `${cookieName}=`;
  const start = setCookieHeader.indexOf(prefix);

  if (start < 0) {
    return null;
  }

  return setCookieHeader.slice(start + prefix.length).split(';')[0];
}

function getRefreshCookie(response) {
  return getCookieValue(response, REFRESH_COOKIE_NAME);
}

function getSetCookieHeader(response) {
  return response.headers.get('set-cookie') || '';
}

async function registerAndLogin(server, email = 'session@example.com') {
  const password = 'session-password-123';
  const registered = await requestJson(server, '/api/v1/auth/register', {
    method: 'POST',
    body: {
      name: 'Session User',
      email,
      password,
    },
  });
  const loggedIn = await requestJson(server, '/api/v1/auth/login', {
    method: 'POST',
    body: { email, password },
  });

  return { registered, loggedIn, refreshCookie: getRefreshCookie(loggedIn.response) };
}

/*
 * Runs one complete Google sign-in through the real state/PKCE/nonce/handoff
 * path and returns the authenticated headers, so a test can act as a Google
 * account that has just been created.
 */
async function signInWithGoogle(server) {
  setGoogleMock();
  const started = await startGoogleOAuth(server);
  const callback = await completeGoogleCallback(server, {
    state: started.state,
    stateCookie: started.stateCookie,
  });
  const location = callback.response.headers.get('location');
  const handoffCode = getLocationQuery(location, 'oauth_code');
  const refreshCookie = getRefreshCookie(callback.response);
  const exchanged = await requestJson(server, '/api/v1/auth/google/exchange', {
    method: 'POST',
    body: { code: handoffCode },
  });

  return {
    callback,
    handoffCode,
    refreshCookie,
    token: exchanged.body.token,
    userId: exchanged.body.user.id,
    user: exchanged.body.user,
    headers: {
      authorization: `Bearer ${exchanged.body.token}`,
      cookie: `${REFRESH_COOKIE_NAME}=${refreshCookie}`,
    },
  };
}

/** Moves a username change outside the cooldown window. */
async function clearUsernameCooldown(userId) {
  await User.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(userId) },
    {
      $set: {
        usernameChangedAt: new Date(Date.now() - USERNAME_CHANGE_COOLDOWN_MS - 1000),
      },
    },
  );
}

/**
 * Records a server-validated Arcadion match result through the progression
 * service. Defaults to the only outcome that grants XP: a verified win against
 * ARCADION.
 */
function recordArcadionResult(userId, overrides = {}) {
  return progressionService.awardArcadionXp({
    userId,
    game: XP_EARNING_GAME,
    result: MATCH_RESULTS.WIN,
    verified: true,
    ...overrides,
  });
}

async function provisionAndLoginAdmin(
  server,
  email = 'admin@example.com',
  password = 'admin-password-123',
) {
  const provisioned = await provisionAdmin({
    name: 'Test Administrator',
    email,
    password,
  });
  const loggedIn = await requestJson(server, '/api/v1/auth/login', {
    method: 'POST',
    body: { email, password },
  });

  return {
    admin: provisioned.user,
    loggedIn,
    token: loggedIn.body.token,
    refreshCookie: getRefreshCookie(loggedIn.response),
  };
}

function hashBootstrapTestRateLimitKey(route, identifier, windowStart) {
  return crypto
    .createHmac('sha256', process.env.JWT_SECRET)
    .update(`${route}\u0000${identifier}\u0000${windowStart}`, 'utf8')
    .digest('hex');
}

async function createBootstrapTestAuthRecords(user, email, suffix) {
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  const session = await Session.create({
    userId: user._id,
    refreshTokenHash: `bootstrap-refresh-${suffix}`,
    familyId: `bootstrap-family-${suffix}`,
    expiresAt,
  });
  const oauthHandoff = await OAuthHandoff.create({
    codeHash: `bootstrap-handoff-${suffix}`,
    userId: user._id,
    sessionId: session._id,
    expiresAt,
  });
  const passwordResetToken = await PasswordResetToken.create({
    userId: user._id,
    tokenHash: `bootstrap-reset-${suffix}`,
    expiresAt,
  });
  const windowStart = Math.floor(Date.now() / (10 * 60 * 1000)) * (10 * 60 * 1000);
  const userRateLimit = await RateLimitBucket.create({
    keyHash: hashBootstrapTestRateLimitKey(
      'account:sessions:user',
      `user:${user._id}`,
      windowStart,
    ),
    route: 'account:sessions:user',
    windowStart,
    expiresAt: new Date(windowStart + 15 * 60 * 1000),
  });
  const emailRateLimit = await RateLimitBucket.create({
    keyHash: hashBootstrapTestRateLimitKey(
      'auth:login:email',
      `email:${email}`,
      windowStart,
    ),
    route: 'auth:login:email',
    windowStart,
    expiresAt: new Date(windowStart + 15 * 60 * 1000),
  });

  return {
    session,
    oauthHandoff,
    passwordResetToken,
    userRateLimit,
    emailRateLimit,
  };
}

async function assertBootstrapAuthRecordsExist(userId, records) {
  assert.ok(await Session.findById(records.session._id));
  assert.ok(await OAuthHandoff.findById(records.oauthHandoff._id));
  assert.ok(await PasswordResetToken.findById(records.passwordResetToken._id));
  assert.ok(await RateLimitBucket.findById(records.userRateLimit._id));
  assert.ok(await RateLimitBucket.findById(records.emailRateLimit._id));
  assert.equal(await Session.countDocuments({ userId }), 1);
  assert.equal(await OAuthHandoff.countDocuments({ userId }), 1);
  assert.equal(await PasswordResetToken.countDocuments({ userId }), 1);
}

async function assertBootstrapAuthRecordsDeleted(userId, records) {
  assert.equal(await Session.findById(records.session._id), null);
  assert.equal(await OAuthHandoff.findById(records.oauthHandoff._id), null);
  assert.equal(await PasswordResetToken.findById(records.passwordResetToken._id), null);
  assert.equal(await RateLimitBucket.findById(records.userRateLimit._id), null);
  assert.equal(await RateLimitBucket.findById(records.emailRateLimit._id), null);
  assert.equal(await Session.countDocuments({ userId }), 0);
  assert.equal(await OAuthHandoff.countDocuments({ userId }), 0);
  assert.equal(await PasswordResetToken.countDocuments({ userId }), 0);
}

function assertNoSensitiveFields(payload) {
  const serialized = JSON.stringify(payload);
  for (const field of [
    'password',
    'passwordHash',
    'refreshToken',
    'refreshTokenHash',
    'resetToken',
    'resetTokenHash',
    'GOOGLE_CLIENT_SECRET',
    'SMTP_PASSWORD',
    'JWT_SECRET',
    'tokenVersion',
    'userId',
  ]) {
    assert.equal(serialized.includes(field), false, `${field} must not be serialized`);
  }
}

function googlePayload(overrides = {}) {
  return {
    iss: 'https://accounts.google.com',
    aud: process.env.GOOGLE_CLIENT_ID,
    sub: 'google-subject-123',
    email: 'oauth-user@example.com',
    email_verified: true,
    name: 'Google User',
    picture: 'https://lh3.googleusercontent.com/a/arcadia-test-profile',
    ...overrides,
  };
}

function setGoogleMock(payload = googlePayload()) {
  googleMockPayload = payload;
  googleMockRequests = [];
  googleOAuthService.setGoogleClientFactoryForTests(() => ({
    generateAuthUrl: ({ state, code_challenge: codeChallenge, code_challenge_method: codeChallengeMethod, nonce }) => {
      const query = new URLSearchParams({
        state,
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod,
        nonce,
      });
      return `https://accounts.google.com/o/oauth2/v2/auth?${query.toString()}`;
    },
    getToken: async ({ code, codeVerifier }) => {
      googleMockRequests.push({ code, codeVerifier });
      if (code === 'invalid-code') {
        throw new Error('mock invalid code');
      }
      return { tokens: { id_token: 'mock-google-id-token' } };
    },
    verifyIdToken: async ({ audience }) => ({
      getPayload: () => ({ ...googleMockPayload, aud: googleMockPayload.aud || audience }),
    }),
  }));
}

async function startGoogleOAuth(server) {
  const result = await requestJson(server, '/api/v1/auth/google', {
    method: 'GET',
    redirect: 'manual',
  });
  const location = result.response.headers.get('location');
  const state = location ? new URL(location).searchParams.get('state') : null;
  const stateCookie = getCookieValue(result.response, OAUTH_STATE_COOKIE_NAME);

  return { ...result, location, state, stateCookie };
}

async function completeGoogleCallback(
  server,
  {
    state,
    stateCookie,
    code = 'valid-code',
    error,
    nonceOverride,
    omitNonce = false,
    extraQuery = {},
  },
) {
  if (state && googleMockPayload) {
    const stateRecord = await OAuthState.findOne({ stateHash: hashOAuthValue(state) })
      .select('+nonce');
    if (stateRecord) {
      googleMockPayload.nonce = nonceOverride === undefined
        ? stateRecord.nonce
        : nonceOverride;
    }
    if (omitNonce) {
      delete googleMockPayload.nonce;
    }
  }

  const query = new URLSearchParams();
  if (state) query.set('state', state);
  if (code) query.set('code', code);
  if (error) query.set('error', error);
  for (const [key, value] of Object.entries(extraQuery)) {
    query.set(key, value);
  }

  return requestJson(server, `/api/v1/auth/google/callback?${query.toString()}`, {
    method: 'GET',
    redirect: 'manual',
    headers: {
      'user-agent': 'google-oauth-test',
      ...(stateCookie ? { cookie: `${OAUTH_STATE_COOKIE_NAME}=${stateCookie}` } : {}),
    },
  });
}

function getLocationQuery(location, key) {
  const url = new URL(location, 'http://localhost');
  return url.searchParams.get(key)
    || new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash).get(key);
}

const WELCOME_SUBJECT = 'Welcome to Arcadia 🎮 — Your Journey Starts Here';
const WELCOME_BACK_SUBJECT = 'Welcome Back to Arcadia 🎮';

function getEmailsWithSubject(subject) {
  return emailMessages.filter((message) => message.subject === subject);
}

function clearEmailMessages() {
  emailMessages.length = 0;
}

function getEmailToken(message, parameter) {
  const match = message.text.match(/https?:\/\/[^\s]+/);
  if (!match) {
    return null;
  }

  const url = new URL(match[0]);
  return url.searchParams.get(parameter)
    || new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash).get(parameter);
}

test('creates users with normalized email, USER role, active status, and timestamps', async () => {
  const user = await User.create({
    email: '  Player@Example.COM  ',
    name: '  Player  ',
    passwordHash: 'hashed-password',
  });

  assert.equal(user.email, 'player@example.com');
  assert.equal(user.name, 'Player');
  assert.equal(user.role, USER_ROLES.USER);
  assert.equal(user.status, ACCOUNT_STATUSES.ACTIVE);
  assert.equal(user.tokenVersion, 0);
  assert.ok(user.createdAt instanceof Date);
  assert.ok(user.updatedAt instanceof Date);
  assert.equal(user.toJSON().passwordHash, undefined);
});

test('enforces a unique normalized email', async () => {
  await User.create({
    email: 'same@example.com',
    passwordHash: 'first-hash',
  });

  await assert.rejects(
    () => User.create({
      email: ' SAME@EXAMPLE.COM ',
      passwordHash: 'second-hash',
    }),
    (error) => error && error.code === 11000,
  );
});

test('does not select password hashes unless explicitly requested and safe serialization is allowlisted', async () => {
  const created = await User.create({
    email: 'safe@example.com',
    passwordHash: 'secret-hash',
    google: {
      provider: GOOGLE_PROVIDER,
      subject: 'google-subject-123',
      email: 'safe@example.com',
    },
  });

  const withoutHash = await User.findById(created._id);
  assert.equal(withoutHash.passwordHash, undefined);

  const withHash = await User.findById(created._id).select('+passwordHash');
  assert.equal(withHash.passwordHash, 'secret-hash');

  const safe = toSafeUser(withoutHash);
  assert.equal(safe.passwordHash, undefined);
  assert.equal(safe.google, undefined);
  assert.deepEqual(
    Object.keys(safe).sort(),
    [
      'authProvider',
      'avatar',
      'avatarSource',
      'createdAt',
      'displayName',
      'email',
      'googleAvatarAvailable',
      'googleAvatarUrl',
      'id',
      'lastLoginAt',
      'name',
      'playerId',
      'progression',
      'role',
      'status',
      'updatedAt',
      'username',
      'usernameSetupRequired',
    ].sort(),
  );
});

test('public registration stores a hash, ignores a client-supplied role, and returns safe data', async () => {
  const result = await authService.register({
    email: 'Public@Example.com',
    password: 'public-password-123',
    name: 'Public User',
    role: USER_ROLES.ADMIN,
  });

  assert.equal(result.user.role, USER_ROLES.USER);
  assert.equal(result.user.passwordHash, undefined);

  const stored = await User.findOne({ email: 'public@example.com' }).select('+passwordHash');
  assert.equal(stored.role, USER_ROLES.USER);
  assert.notEqual(stored.passwordHash, 'public-password-123');
  assert.equal(await bcrypt.compare('public-password-123', stored.passwordHash), true);
});

test('login updates last-login metadata without exposing credentials', async () => {
  await authService.register({
    name: 'Login Metadata User',
    email: 'login@example.com',
    password: 'login-password-123',
  });

  const result = await authService.login(
    { email: ' LOGIN@EXAMPLE.COM ', password: 'login-password-123' },
    { ip: '127.0.0.1', userAgent: 'integration-test' },
  );

  assert.equal(result.user.passwordHash, undefined);
  assert.ok(result.user.lastLoginAt instanceof Date);

  const stored = await User.findOne({ email: 'login@example.com' }).select('+passwordHash');
  assert.equal(stored.lastLoginIp, '127.0.0.1');
  assert.equal(stored.lastLoginUserAgent, 'integration-test');
});

test('non-active accounts cannot authenticate', async () => {
  await User.create({
    email: 'suspended@example.com',
    passwordHash: await bcrypt.hash('suspended-password-123', 10),
    status: ACCOUNT_STATUSES.SUSPENDED,
  });

  await assert.rejects(
    () => authService.login({
      email: 'suspended@example.com',
      password: 'suspended-password-123',
    }),
    (error) => error && error.statusCode === 401,
  );
});

test('controlled admin provisioning creates one admin and is idempotent', async () => {
  const result = await provisionAdmin({
    email: 'Admin@Example.com',
    password: 'admin-password-123',
    name: 'Arcadia Admin',
  });

  assert.equal(result.created, true);
  assert.equal(result.replacedUser, false);
  assert.equal(result.adminCount, 1);
  assert.equal(result.user.role, USER_ROLES.ADMIN);
  assert.equal(result.user.passwordHash, undefined);

  const rerun = await provisionAdmin({
    email: 'admin@example.com',
    password: 'admin-password-123',
  });

  assert.equal(rerun.created, false);
  assert.equal(rerun.replacedUser, false);
  assert.equal(rerun.adminCount, 1);
  assert.equal(rerun.user.id, result.user.id);
  assert.equal(rerun.user.role, USER_ROLES.ADMIN);
  assert.equal(await User.countDocuments({ role: USER_ROLES.ADMIN }), 1);
  assert.equal(await AdminMutationLock.countDocuments({}), 0);
});

test('admin bootstrap replaces only the exact USER and all of its auth/security records', async () => {
  const normalizedEmail = 'bootstrap-replace@example.com';
  const oldUser = await User.create({
    email: normalizedEmail,
    name: 'Existing Bootstrap User',
    passwordHash: 'old-user-password-hash',
    role: USER_ROLES.USER,
    status: ACCOUNT_STATUSES.ACTIVE,
  });
  const oldUserId = oldUser._id;
  const targetRecords = await createBootstrapTestAuthRecords(oldUser, normalizedEmail, 'target');
  const unrelatedUser = await User.create({
    email: 'unrelated-user@example.com',
    name: 'Unrelated User',
    passwordHash: 'unrelated-password-hash',
    role: USER_ROLES.USER,
  });
  const unrelatedRecords = await createBootstrapTestAuthRecords(
    unrelatedUser,
    unrelatedUser.email,
    'unrelated',
  );
  const unrelatedOAuthState = await OAuthState.create({
    stateHash: 'unrelated-oauth-state',
    codeVerifier: 'unrelated-code-verifier',
    nonce: 'unrelated-nonce',
    expiresAt: new Date(Date.now() + 60 * 1000),
  });

  const result = await provisionAdmin({
    email: normalizedEmail.toUpperCase(),
    password: 'fresh-admin-password-123',
    name: 'Fresh Arcadia Admin',
  });

  assert.equal(result.created, true);
  assert.equal(result.replacedUser, true);
  assert.equal(result.adminCount, 1);
  assert.notEqual(result.user.id, String(oldUserId));
  assert.equal(result.user.role, USER_ROLES.ADMIN);
  assert.equal(result.user.passwordHash, undefined);
  assert.equal(await User.findById(oldUserId), null);

  const freshAdmin = await User.findOne({ email: normalizedEmail }).select('+passwordHash');
  assert.equal(freshAdmin.role, USER_ROLES.ADMIN);
  assert.equal(freshAdmin.status, ACCOUNT_STATUSES.ACTIVE);
  assert.equal(await bcrypt.compare('fresh-admin-password-123', freshAdmin.passwordHash), true);
  assert.equal(await bcrypt.compare('old-user-password-123', freshAdmin.passwordHash), false);

  await assertBootstrapAuthRecordsDeleted(oldUserId, targetRecords);
  assert.ok(await User.findById(unrelatedUser._id));
  await assertBootstrapAuthRecordsExist(unrelatedUser._id, unrelatedRecords);
  assert.ok(await OAuthState.findById(unrelatedOAuthState._id));
  assert.equal(await User.countDocuments({ role: USER_ROLES.ADMIN }), 1);
  assert.equal(await AdminMutationLock.countDocuments({}), 0);
});

test('admin bootstrap leaves an existing ADMIN and its records untouched', async () => {
  const normalizedEmail = 'existing-bootstrap-admin@example.com';
  const first = await provisionAdmin({
    email: normalizedEmail,
    password: 'existing-admin-password-123',
    name: 'Existing Admin',
  });
  const existingAdmin = await User.findOne({ email: normalizedEmail });
  const records = await createBootstrapTestAuthRecords(existingAdmin, normalizedEmail, 'existing-admin');

  const rerun = await provisionAdmin({
    email: normalizedEmail.toUpperCase(),
    password: 'existing-admin-password-123',
  });

  assert.equal(rerun.created, false);
  assert.equal(rerun.replacedUser, false);
  assert.equal(rerun.adminCount, 1);
  assert.equal(rerun.user.id, first.user.id);
  assert.equal(await User.findById(existingAdmin._id).then((user) => user.role), USER_ROLES.ADMIN);
  await assertBootstrapAuthRecordsExist(existingAdmin._id, records);
  assert.equal(await User.countDocuments({ role: USER_ROLES.ADMIN }), 1);
  assert.equal(await AdminMutationLock.countDocuments({}), 0);
});

test('admin bootstrap aborts without mutation when another admin already exists', async () => {
  const existingAdmin = await User.create({
    email: 'other-admin@example.com',
    passwordHash: 'other-admin-password-hash',
    role: USER_ROLES.ADMIN,
    status: ACCOUNT_STATUSES.ACTIVE,
  });
  const targetUser = await User.create({
    email: 'blocked-bootstrap-user@example.com',
    passwordHash: 'blocked-user-password-hash',
    role: USER_ROLES.USER,
  });
  const targetRecords = await createBootstrapTestAuthRecords(
    targetUser,
    targetUser.email,
    'blocked-target',
  );

  await assert.rejects(
    () => provisionAdmin({
      email: targetUser.email,
      password: 'blocked-admin-password-123',
      name: 'Blocked Admin',
    }),
    (error) => error?.provisioningCode === 'ANOTHER_ADMIN_EXISTS' && error?.statusCode === 409,
  );

  assert.ok(await User.findById(targetUser._id));
  await assertBootstrapAuthRecordsExist(targetUser._id, targetRecords);
  assert.equal(await User.findById(existingAdmin._id).then((user) => user.role), USER_ROLES.ADMIN);
  assert.equal(await User.countDocuments({ role: USER_ROLES.ADMIN }), 1);

  await assert.rejects(
    () => provisionAdmin({
      email: 'missing-bootstrap@example.com',
      password: 'missing-admin-password-123',
      name: 'Missing Admin',
    }),
    (error) => error?.provisioningCode === 'ANOTHER_ADMIN_EXISTS' && error?.statusCode === 409,
  );
  assert.equal(await User.findOne({ email: 'missing-bootstrap@example.com' }), null);
  assert.equal(await User.countDocuments({ role: USER_ROLES.ADMIN }), 1);
  assert.equal(await AdminMutationLock.countDocuments({}), 0);
});

test('standalone admin bootstrap restores the exact USER when admin creation fails', async () => {
  const normalizedEmail = 'rollback-create@example.com';
  const oldUser = await User.create({
    email: normalizedEmail,
    name: 'Rollback User',
    passwordHash: await bcrypt.hash('rollback-old-password-123', 10),
    role: USER_ROLES.USER,
    status: ACCOUNT_STATUSES.ACTIVE,
  });
  const oldUserId = oldUser._id;
  const records = await createBootstrapTestAuthRecords(oldUser, normalizedEmail, 'rollback-create');
  const originalCreate = User.create;
  User.create = async () => {
    throw new Error('forced admin creation failure');
  };

  try {
    await assert.rejects(
      () => provisionAdmin({
        email: normalizedEmail,
        password: 'rollback-admin-password-123',
        name: 'Rollback Admin',
      }),
      (error) => error?.safeMessage === 'Admin bootstrap failed; rollback completed',
    );
  } finally {
    User.create = originalCreate;
  }

  const restoredUser = await User.findById(oldUserId).select('+passwordHash');
  assert.equal(restoredUser.email, normalizedEmail);
  assert.equal(restoredUser.role, USER_ROLES.USER);
  assert.equal(restoredUser.status, ACCOUNT_STATUSES.ACTIVE);
  assert.equal(await bcrypt.compare('rollback-old-password-123', restoredUser.passwordHash), true);
  assert.equal(await bcrypt.compare('rollback-admin-password-123', restoredUser.passwordHash), false);
  await assertBootstrapAuthRecordsExist(oldUserId, records);
  assert.equal(await User.countDocuments({ role: USER_ROLES.ADMIN }), 0);
  assert.equal(await AdminMutationLock.countDocuments({}), 0);
});

test('standalone admin bootstrap restores records when associated-data deletion fails', async () => {
  const normalizedEmail = 'rollback-delete@example.com';
  const oldUser = await User.create({
    email: normalizedEmail,
    name: 'Rollback Deletion User',
    passwordHash: 'rollback-deletion-password-hash',
    role: USER_ROLES.USER,
    status: ACCOUNT_STATUSES.ACTIVE,
  });
  const oldUserId = oldUser._id;
  const records = await createBootstrapTestAuthRecords(oldUser, normalizedEmail, 'rollback-delete');
  const originalDeleteMany = OAuthHandoff.collection.deleteMany;
  OAuthHandoff.collection.deleteMany = async () => {
    throw new Error('forced auth-record deletion failure');
  };

  try {
    await assert.rejects(
      () => provisionAdmin({
        email: normalizedEmail,
        password: 'rollback-delete-password-123',
        name: 'Rollback Deletion Admin',
      }),
      (error) => error?.safeMessage === 'Admin bootstrap failed; rollback completed',
    );
  } finally {
    OAuthHandoff.collection.deleteMany = originalDeleteMany;
  }

  const restoredUser = await User.findById(oldUserId);
  assert.equal(restoredUser.email, normalizedEmail);
  assert.equal(restoredUser.role, USER_ROLES.USER);
  assert.equal(restoredUser.status, ACCOUNT_STATUSES.ACTIVE);
  await assertBootstrapAuthRecordsExist(oldUserId, records);
  assert.equal(await User.countDocuments({ role: USER_ROLES.ADMIN }), 0);
  assert.equal(await AdminMutationLock.countDocuments({}), 0);
});

test('versioned registration validates input, normalizes email, and ignores client roles', async () => {
  const server = await startHttpServer();

  try {
    const registered = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: '  Ankit Das  ',
        email: '  User@Example.COM  ',
        password: 'register-password-123',
        role: USER_ROLES.ADMIN,
      },
    });

    assert.equal(registered.response.status, 201);
    assert.equal(registered.body.user.email, 'user@example.com');
    assert.equal(registered.body.user.name, 'Ankit Das');
    assert.equal(registered.body.user.role, USER_ROLES.USER);
    assert.equal(registered.body.user.status, ACCOUNT_STATUSES.ACTIVE);
    assert.equal(registered.body.user.passwordHash, undefined);
    assert.equal(typeof registered.body.token, 'string');
    assert.equal(isValidRefreshToken(getRefreshCookie(registered.response)), true);

    const duplicate = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'Another User',
        email: ' USER@EXAMPLE.COM ',
        password: 'another-password-123',
      },
    });

    assert.equal(duplicate.response.status, 409);
    assert.equal(duplicate.body.error, 'Unable to create an account with those details');

    const withoutDisplayName = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        username: 'Ankit Das',
        email: 'missing-name@example.com',
        password: 'missing-name-password',
      },
    });

    // Arcadia signup no longer asks for a display name, so registration must
    // succeed and keep the entered username exactly as it was typed.
    assert.equal(withoutDisplayName.response.status, 201);
    assert.equal(withoutDisplayName.body.user.name, '');
    assert.equal(withoutDisplayName.body.user.displayName, '');
    assert.equal(withoutDisplayName.body.user.username, 'Ankit Das');
    assert.equal(withoutDisplayName.body.user.usernameSetupRequired, false);
  } finally {
    await stopHttpServer(server);
  }
});

test('login returns generic failures and rejects inactive accounts', async () => {
  const server = await startHttpServer();

  try {
    await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'Login User',
        email: 'login-api@example.com',
        password: 'login-api-password-123',
      },
    });

    const successfulLogin = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: {
        email: ' LOGIN-API@EXAMPLE.COM ',
        password: 'login-api-password-123',
      },
    });

    assert.equal(successfulLogin.response.status, 200);
    assert.equal(successfulLogin.body.user.email, 'login-api@example.com');
    assert.equal(successfulLogin.body.user.passwordHash, undefined);
    assert.ok(successfulLogin.body.user.lastLoginAt);

    const wrongPassword = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: {
        email: 'login-api@example.com',
        password: 'wrong-password-123',
      },
    });

    const unknownEmail = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: {
        email: 'unknown-api@example.com',
        password: 'wrong-password-123',
      },
    });

    assert.equal(wrongPassword.response.status, 401);
    assert.equal(unknownEmail.response.status, 401);
    assert.deepEqual(wrongPassword.body, unknownEmail.body);
    assert.equal(wrongPassword.body.error, 'Invalid email or password');

    await User.create({
      email: 'inactive-api@example.com',
      passwordHash: await bcrypt.hash('inactive-api-password-123', 10),
      status: ACCOUNT_STATUSES.SUSPENDED,
    });

    const inactiveLogin = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: {
        email: 'inactive-api@example.com',
        password: 'inactive-api-password-123',
      },
    });

    assert.equal(inactiveLogin.response.status, 401);
    assert.equal(inactiveLogin.body.error, 'Invalid email or password');
  } finally {
    await stopHttpServer(server);
  }
});

test('JWT middleware protects /me, uses current database role, and hides credentials', async () => {
  const server = await startHttpServer();

  try {
    const registered = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'JWT User',
        email: 'jwt-api@example.com',
        password: 'jwt-api-password-123',
      },
    });

    const token = registered.body.token;
    const claims = verifyAccessToken(token);

    assert.equal(claims.sub, registered.body.user.id);
    assert.equal(claims.role, USER_ROLES.USER);
    assert.equal(claims.type, 'access');
    assert.equal(claims.tokenVersion, 0);
    assert.ok(claims.iat);
    assert.ok(claims.exp);
    assert.equal(claims.password, undefined);
    assert.equal(claims.passwordHash, undefined);
    assert.equal(claims.refreshToken, undefined);
    assert.equal(claims.clientSecret, undefined);
    assert.equal(claims.email, undefined);

    const me = await requestJson(server, '/api/v1/auth/me', {
      headers: { authorization: `Bearer ${token}` },
    });

    assert.equal(me.response.status, 200);
    assert.equal(me.body.id, registered.body.user.id);
    assert.equal(me.body.role, USER_ROLES.USER);
    assert.equal(me.body.passwordHash, undefined);
    assert.equal(JSON.stringify(me.body).includes('passwordHash'), false);

    const missingAuth = await requestJson(server, '/api/v1/auth/me');
    assert.equal(missingAuth.response.status, 401);

    const invalidAuth = await requestJson(server, '/api/v1/auth/me', {
      headers: { authorization: 'Bearer invalid-token' },
    });
    assert.equal(invalidAuth.response.status, 401);

    const missingVersionToken = jwt.sign(
      { sub: registered.body.user.id, role: USER_ROLES.USER, type: 'access' },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '5m' },
    );
    const missingVersionAuth = await requestJson(server, '/api/v1/auth/me', {
      headers: { authorization: `Bearer ${missingVersionToken}` },
    });
    assert.equal(missingVersionAuth.response.status, 401);

    const expiredToken = jwt.sign(
      { sub: registered.body.user.id, role: USER_ROLES.USER, type: 'access' },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: -1 },
    );
    const expiredAuth = await requestJson(server, '/api/v1/auth/me', {
      headers: { authorization: `Bearer ${expiredToken}` },
    });
    assert.equal(expiredAuth.response.status, 401);

    const forgedRoleToken = signAccessToken({
      _id: registered.body.user.id,
      role: USER_ROLES.ADMIN,
    });
    const roleChecked = await requestJson(server, '/api/v1/auth/me', {
      headers: { authorization: `Bearer ${forgedRoleToken}` },
    });
    assert.equal(roleChecked.response.status, 200);
    assert.equal(roleChecked.body.role, USER_ROLES.USER);

    const inactiveUser = await User.create({
      email: 'inactive-me@example.com',
      passwordHash: await bcrypt.hash('inactive-me-password-123', 10),
      status: ACCOUNT_STATUSES.SUSPENDED,
    });
    const inactiveToken = signAccessToken({
      _id: inactiveUser._id,
      role: USER_ROLES.USER,
    });
    const inactiveMe = await requestJson(server, '/api/v1/auth/me', {
      headers: { authorization: `Bearer ${inactiveToken}` },
    });
    assert.equal(inactiveMe.response.status, 403);
    assert.equal(inactiveMe.body.error, 'Account is inactive');

    const legacyRoute = await requestJson(server, '/auth/me', {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(legacyRoute.response.status, 200);
    assert.equal(legacyRoute.body.id, registered.body.user.id);
  } finally {
    await stopHttpServer(server);
  }
});

test('backward-compatible auth routes use the same service and malformed JSON is rejected safely', async () => {
  const server = await startHttpServer();

  try {
    const registered = await requestJson(server, '/auth/register', {
      method: 'POST',
      body: {
        name: 'Legacy User',
        email: 'legacy@example.com',
        password: 'legacy-password-123',
      },
    });
    assert.equal(registered.response.status, 201);

    const loginResult = await requestJson(server, '/auth/login', {
      method: 'POST',
      body: {
        email: 'legacy@example.com',
        password: 'legacy-password-123',
      },
    });
    assert.equal(loginResult.response.status, 200);

    const malformed = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    assert.equal(malformed.response.status, 400);
    assert.equal(malformed.body.error, 'Malformed JSON request');
    assert.equal(JSON.stringify(malformed.body).includes('SyntaxError'), false);
  } finally {
    await stopHttpServer(server);
  }
});

test('login creates a hashed refresh session and sets an HTTP-only cookie', async () => {
  const server = await startHttpServer();

  try {
    const { registered, loggedIn, refreshCookie } = await registerAndLogin(server, 'session-login@example.com');

    assert.equal(registered.response.status, 201);
    assert.equal(loggedIn.response.status, 200);
    assert.equal(isValidRefreshToken(refreshCookie), true);
    assert.equal(loggedIn.body.refreshToken, undefined);
    assert.equal(JSON.stringify(loggedIn.body).includes(refreshCookie), false);

    const cookieHeader = getSetCookieHeader(loggedIn.response);
    assert.match(cookieHeader, /HttpOnly/i);
    assert.match(cookieHeader, /Path=\//i);
    assert.match(cookieHeader, /SameSite=Lax/i);
    assert.match(cookieHeader, /Max-Age=2592000/i);

    const refreshTokenHash = hashRefreshToken(refreshCookie);
    const session = await Session.findOne({ refreshTokenHash }).select('+refreshTokenHash');
    const user = await User.findById(registered.body.user.id);

    assert.ok(session);
    assert.equal(session.userId.toString(), user._id.toString());
    assert.equal(session.refreshTokenHash, refreshTokenHash);
    assert.equal(verifyRefreshTokenHash(refreshCookie, refreshTokenHash), true);
    assert.equal(verifyRefreshTokenHash(generateRefreshToken(), refreshTokenHash), false);
    assert.notEqual(session.refreshTokenHash, refreshCookie);
    assert.equal(await Session.findOne({ refreshTokenHash: refreshCookie }), null);
  } finally {
    await stopHttpServer(server);
  }
});

test('refresh rotates the token and session while preserving access-token behavior', async () => {
  const server = await startHttpServer();

  try {
    const { registered, loggedIn, refreshCookie: oldCookie } = await registerAndLogin(server, 'rotation@example.com');
    const oldHash = hashRefreshToken(oldCookie);
    const oldSession = await Session.findOne({ refreshTokenHash: oldHash });
    assert.ok(oldSession);
    assert.equal(oldSession.credentialVersion, 0);

    const refreshed = await requestJson(server, '/api/v1/auth/refresh', {
      method: 'POST',
      headers: { cookie: `${REFRESH_COOKIE_NAME}=${oldCookie}` },
    });

    assert.equal(refreshed.response.status, 200);
    assert.equal(refreshed.body.refreshToken, undefined);
    assert.equal(typeof refreshed.body.token, 'string');
    assert.equal(verifyAccessToken(refreshed.body.token).tokenVersion, 0);
    assert.equal(refreshed.body.user.passwordHash, undefined);

    const newCookie = getRefreshCookie(refreshed.response);
    assert.equal(isValidRefreshToken(newCookie), true);
    assert.notEqual(newCookie, oldCookie);

    const newHash = hashRefreshToken(newCookie);
    const newSession = await Session.findOne({ refreshTokenHash: newHash });
    const revokedOldSession = await Session.findById(oldSession._id);

    assert.ok(newSession);
    assert.equal(revokedOldSession.revokedAt instanceof Date, true);
    assert.equal(newSession.revokedAt, null);
    assert.equal(newSession.familyId, oldSession.familyId);
     assert.equal(newSession.credentialVersion, oldSession.credentialVersion);
    assert.equal(revokedOldSession.replacedBySessionId.toString(), newSession._id.toString());
    assert.equal(JSON.stringify(refreshed.body).includes(newCookie), false);

    const meWithOldAccessToken = await requestJson(server, '/api/v1/auth/me', {
      headers: { authorization: `Bearer ${loggedIn.body.token}` },
    });
    assert.equal(meWithOldAccessToken.response.status, 200);
    assert.equal(meWithOldAccessToken.body.id, registered.body.user.id);

    const meWithNewAccessToken = await requestJson(server, '/api/v1/auth/me', {
      headers: { authorization: `Bearer ${refreshed.body.token}` },
    });
    assert.equal(meWithNewAccessToken.response.status, 200);
  } finally {
    await stopHttpServer(server);
  }
});

test('reusing a rotated refresh token revokes the token family', async () => {
  const server = await startHttpServer();

  try {
    const { refreshCookie: oldCookie } = await registerAndLogin(server, 'reuse@example.com');
    const refreshed = await requestJson(server, '/api/v1/auth/refresh', {
      method: 'POST',
      headers: { cookie: `${REFRESH_COOKIE_NAME}=${oldCookie}` },
    });
    const newCookie = getRefreshCookie(refreshed.response);

    const replay = await requestJson(server, '/api/v1/auth/refresh', {
      method: 'POST',
      headers: { cookie: `${REFRESH_COOKIE_NAME}=${oldCookie}` },
    });

    assert.equal(replay.response.status, 401);
    assert.equal(replay.body.error, 'Refresh token reuse detected');
    assert.match(getSetCookieHeader(replay.response), /arcadia_refresh=;/i);

    const familySessions = await Session.find({ familyId: (await Session.findOne({ refreshTokenHash: hashRefreshToken(oldCookie) })).familyId });
    assert.equal(familySessions.every((session) => session.revokedAt instanceof Date), true);

    const replayNew = await requestJson(server, '/api/v1/auth/refresh', {
      method: 'POST',
      headers: { cookie: `${REFRESH_COOKIE_NAME}=${newCookie}` },
    });
    assert.equal(replayNew.response.status, 401);
  } finally {
    await stopHttpServer(server);
  }
});

test('refresh rejects missing, expired, and revoked cookies', async () => {
  const server = await startHttpServer();

  try {
    const missing = await requestJson(server, '/api/v1/auth/refresh', { method: 'POST' });
    assert.equal(missing.response.status, 401);
    assert.equal(missing.body.error, 'Refresh token required');

    const { registered, refreshCookie: expiredCookie } = await registerAndLogin(server, 'expired-refresh@example.com');
    const expiredSession = await Session.findOne({ refreshTokenHash: hashRefreshToken(expiredCookie) });
    await Session.updateOne({ _id: expiredSession._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    const expired = await requestJson(server, '/api/v1/auth/refresh', {
      method: 'POST',
      headers: { cookie: `${REFRESH_COOKIE_NAME}=${expiredCookie}` },
    });
    assert.equal(expired.response.status, 401);

    const { refreshCookie: revokedCookie } = await registerAndLogin(server, 'revoked-refresh@example.com');
    const logoutResult = await requestJson(server, '/api/v1/auth/logout', {
      method: 'POST',
      headers: { cookie: `${REFRESH_COOKIE_NAME}=${revokedCookie}` },
    });
    assert.equal(logoutResult.response.status, 200);

    const revoked = await requestJson(server, '/api/v1/auth/refresh', {
      method: 'POST',
      headers: { cookie: `${REFRESH_COOKIE_NAME}=${revokedCookie}` },
    });
    assert.equal(revoked.response.status, 401);
    assert.equal(revoked.body.error, 'Refresh token reuse detected');

    assert.ok(registered);
  } finally {
    await stopHttpServer(server);
  }
});

test('inactive users cannot refresh and logout is idempotent', async () => {
  const server = await startHttpServer();

  try {
    const { registered, refreshCookie } = await registerAndLogin(server, 'inactive-refresh@example.com');
    await User.updateOne(
      { _id: registered.body.user.id },
      { $set: { status: ACCOUNT_STATUSES.SUSPENDED } },
    );

    const inactiveRefresh = await requestJson(server, '/api/v1/auth/refresh', {
      method: 'POST',
      headers: { cookie: `${REFRESH_COOKIE_NAME}=${refreshCookie}` },
    });
    assert.equal(inactiveRefresh.response.status, 403);
    assert.equal(inactiveRefresh.body.error, 'Account is inactive');
    assert.match(getSetCookieHeader(inactiveRefresh.response), /arcadia_refresh=;/i);

    const noCookieLogout = await requestJson(server, '/api/v1/auth/logout', { method: 'POST' });
    assert.equal(noCookieLogout.response.status, 200);
    assert.equal(noCookieLogout.body.message, 'Logged out successfully');
  } finally {
    await stopHttpServer(server);
  }
});

test('logout-all revokes every refresh session for the authenticated user', async () => {
  const server = await startHttpServer();

  try {
    const registered = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'Multi Session User',
        email: 'multi-session@example.com',
        password: 'multi-session-password-123',
      },
    });
    const firstLogin = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'multi-session@example.com', password: 'multi-session-password-123' },
    });
    const secondLogin = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'multi-session@example.com', password: 'multi-session-password-123' },
    });
    const firstCookie = getRefreshCookie(firstLogin.response);
    const secondCookie = getRefreshCookie(secondLogin.response);

    const logoutAll = await requestJson(server, '/api/v1/auth/logout-all', {
      method: 'POST',
      headers: { authorization: `Bearer ${secondLogin.body.token}` },
    });
    assert.equal(logoutAll.response.status, 200);
    assert.equal(logoutAll.body.message, 'All sessions revoked');

    const staleAccess = await requestJson(server, '/api/v1/auth/me', {
      headers: { authorization: `Bearer ${secondLogin.body.token}` },
    });
    assert.equal(staleAccess.response.status, 401);

    const sessions = await Session.find({ userId: registered.body.user.id });
    assert.equal(sessions.length, 3);
    assert.equal(sessions.every((session) => session.revokedAt instanceof Date), true);

    for (const cookie of [firstCookie, secondCookie]) {
      const refreshAttempt = await requestJson(server, '/api/v1/auth/refresh', {
        method: 'POST',
        headers: { cookie: `${REFRESH_COOKIE_NAME}=${cookie}` },
      });
      assert.equal(refreshAttempt.response.status, 401);
    }
  } finally {
    await stopHttpServer(server);
  }
});

test('Google OAuth start creates a random, hashed, short-lived state attempt', async () => {
  const server = await startHttpServer();

  try {
    setGoogleMock();
    const first = await startGoogleOAuth(server);
    const second = await startGoogleOAuth(server);

    assert.equal(first.response.status, 302);
    assert.ok(first.location.startsWith('https://accounts.google.com/'));
    assert.equal(isValidOAuthState(first.state), true);
    assert.equal(isValidOAuthState(first.stateCookie), true);
    assert.notEqual(first.state, second.state);

    const stateRecord = await OAuthState.findOne({ stateHash: hashOAuthValue(first.state) })
      .select('+stateHash +codeVerifier +nonce');
    assert.ok(stateRecord);
    assert.equal(stateRecord.stateHash, hashOAuthValue(first.state));
    assert.notEqual(stateRecord.stateHash, first.state);
    assert.equal(isValidOAuthCodeVerifier(stateRecord.codeVerifier), true);
    assert.ok(stateRecord.codeVerifier.length >= 43);
    assert.ok(stateRecord.nonce.length >= 32);
    assert.equal(derivePkceChallenge(stateRecord.codeVerifier), new URL(first.location).searchParams.get('code_challenge'));
    assert.equal(new URL(first.location).searchParams.get('code_challenge_method'), 'S256');
    assert.equal(new URL(first.location).searchParams.get('nonce'), stateRecord.nonce);
    assert.equal(stateRecord.expiresAt instanceof Date, true);
    const secondStateRecord = await OAuthState.findOne({ stateHash: hashOAuthValue(second.state) })
      .select('+codeVerifier +nonce');
    assert.notEqual(secondStateRecord.codeVerifier, stateRecord.codeVerifier);
    assert.notEqual(secondStateRecord.nonce, stateRecord.nonce);
    assert.equal(await OAuthState.countDocuments({ stateHash: first.state }), 0);
  } finally {
    await stopHttpServer(server);
  }
});

test('Google OAuth rejects invalid, expired, and reused state', async () => {
  const server = await startHttpServer();

  try {
    setGoogleMock();
    const invalid = await completeGoogleCallback(server, {
      state: 'arc_state_invalid',
      stateCookie: 'arc_state_invalid',
    });
    assert.equal(invalid.response.status, 302);
    assert.equal(getLocationQuery(invalid.response.headers.get('location'), 'oauth_error'), 'invalid_state');

    const expiredStart = await startGoogleOAuth(server);
    await OAuthState.updateOne(
      { stateHash: hashOAuthValue(expiredStart.state) },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    const expired = await completeGoogleCallback(server, {
      state: expiredStart.state,
      stateCookie: expiredStart.stateCookie,
    });
    assert.equal(expired.response.status, 302);
    assert.equal(getLocationQuery(expired.response.headers.get('location'), 'oauth_error'), 'invalid_state');

    const reusableStart = await startGoogleOAuth(server);
    const firstCallback = await completeGoogleCallback(server, {
      state: reusableStart.state,
      stateCookie: reusableStart.stateCookie,
    });
    assert.equal(firstCallback.response.status, 302);
    const reused = await completeGoogleCallback(server, {
      state: reusableStart.state,
      stateCookie: reusableStart.stateCookie,
    });
    assert.equal(reused.response.status, 302);
    assert.equal(getLocationQuery(reused.response.headers.get('location'), 'oauth_error'), 'invalid_state');
  } finally {
    await stopHttpServer(server);
  }
});

test('Google identity validation rejects invalid issuer, audience, and unverified email', async () => {
  const invalidPayloads = [
    googlePayload({ iss: 'https://evil.example.com' }),
    googlePayload({ aud: 'wrong-client-id' }),
    googlePayload({ email_verified: false }),
    googlePayload({ nonce: 'wrong-nonce' }),
    googlePayload({ nonce: undefined }),
  ];

  const codeVerifier = generateOAuthCodeVerifier();
  const nonce = 'direct-test-nonce';
  for (const payload of invalidPayloads) {
    const payloadWithNonce = Object.prototype.hasOwnProperty.call(payload, 'nonce')
      ? payload
      : { ...payload, nonce };
    setGoogleMock(payloadWithNonce);
    await assert.rejects(
      () => googleOAuthService.exchangeAuthorizationCode('valid-code', {
        codeVerifier,
        nonce,
      }),
      (error) => error && error.statusCode === 401,
    );
  }

  assert.throws(
    () => googleOAuthService.getGoogleOAuthConfig({}),
    /Google OAuth is not configured/,
  );
});

test('PKCE verifier is generated server-side, sent only to Google exchange, and consumed atomically', async () => {
  const server = await startHttpServer();

  try {
    setGoogleMock();
    const started = await startGoogleOAuth(server);
    const transaction = await OAuthState.findOne({ stateHash: hashOAuthValue(started.state) })
      .select('+codeVerifier +nonce');
    const locationUrl = new URL(started.location);

    assert.equal(isValidOAuthCodeVerifier(transaction.codeVerifier), true);
    assert.equal(derivePkceChallenge(transaction.codeVerifier), locationUrl.searchParams.get('code_challenge'));
    assert.equal(locationUrl.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(locationUrl.searchParams.get('code_verifier'), null);
    assert.equal(locationUrl.searchParams.get('nonce'), transaction.nonce);

    const callback = await completeGoogleCallback(server, {
      state: started.state,
      stateCookie: started.stateCookie,
      extraQuery: { code_verifier: 'client-supplied-verifier' },
    });
    assert.equal(callback.response.status, 302);
    assert.equal(googleMockRequests[0].codeVerifier, transaction.codeVerifier);
    assert.notEqual(googleMockRequests[0].codeVerifier, 'client-supplied-verifier');

    const consumed = await OAuthState.findById(transaction._id).select('+codeVerifier +nonce');
    assert.equal(consumed.codeVerifier, undefined);
    assert.equal(consumed.nonce, undefined);
  } finally {
    await stopHttpServer(server);
  }
});

test('OIDC nonce is transaction-bound and missing or mismatched nonce is rejected', async () => {
  const server = await startHttpServer();

  try {
    setGoogleMock();
    const wrongNonceStart = await startGoogleOAuth(server);
    const wrongNonce = await completeGoogleCallback(server, {
      state: wrongNonceStart.state,
      stateCookie: wrongNonceStart.stateCookie,
      nonceOverride: 'wrong-nonce',
    });
    assert.equal(wrongNonce.response.status, 302);
    assert.equal(getLocationQuery(wrongNonce.response.headers.get('location'), 'oauth_error'), 'authentication_failed');

    const missingNonceStart = await startGoogleOAuth(server);
    const missingNonce = await completeGoogleCallback(server, {
      state: missingNonceStart.state,
      stateCookie: missingNonceStart.stateCookie,
      omitNonce: true,
    });
    assert.equal(missingNonce.response.status, 302);
    assert.equal(getLocationQuery(missingNonce.response.headers.get('location'), 'oauth_error'), 'authentication_failed');
    assert.equal(await User.countDocuments({ 'google.subject': 'google-subject-123' }), 0);
  } finally {
    await stopHttpServer(server);
  }
});

test('verified Google identity creates a USER and completes through a one-time handoff', async () => {
  const server = await startHttpServer();

  try {
    setGoogleMock();
    const started = await startGoogleOAuth(server);
    const transaction = await OAuthState.findOne({ stateHash: hashOAuthValue(started.state) })
      .select('+codeVerifier +nonce');
    const callback = await completeGoogleCallback(server, {
      state: started.state,
      stateCookie: started.stateCookie,
      extraQuery: { code_verifier: 'attacker-controlled-verifier' },
    });

    assert.equal(callback.response.status, 302);
    assert.equal(googleMockRequests.length, 1);
    assert.equal(googleMockRequests[0].code, 'valid-code');
    assert.equal(googleMockRequests[0].codeVerifier, transaction.codeVerifier);
    const consumedTransaction = await OAuthState.findById(transaction._id)
      .select('+codeVerifier +nonce');
    assert.equal(consumedTransaction.codeVerifier, undefined);
    assert.equal(consumedTransaction.nonce, undefined);
    const location = callback.response.headers.get('location');
    const handoffCode = getLocationQuery(location, 'oauth_code');
    assert.equal(isValidOAuthHandoffCode(handoffCode), true);
    assert.equal(getLocationQuery(location, 'token'), null);
    assert.equal(getLocationQuery(location, 'access_token'), null);
    assert.equal(getLocationQuery(location, 'refresh_token'), null);
    assert.equal(getLocationQuery(location, 'code_verifier'), null);
    assert.equal(getLocationQuery(location, 'code_challenge'), null);
    assert.equal(getLocationQuery(location, 'nonce'), null);
    assert.equal(JSON.stringify(location).includes(transaction.codeVerifier), false);
    assert.equal(JSON.stringify(location).includes(transaction.nonce), false);
    assert.equal(JSON.stringify(location).includes('mock-google-id-token'), false);

    const refreshCookie = getCookieValue(callback.response, REFRESH_COOKIE_NAME);
    assert.equal(isValidRefreshToken(refreshCookie), true);

    const user = await User.findOne({ email: 'oauth-user@example.com' }).select('+passwordHash');
    assert.ok(user);
    assert.equal(user.role, USER_ROLES.USER);
    assert.equal(user.status, ACCOUNT_STATUSES.ACTIVE);
    assert.equal(user.passwordHash, undefined);
    assert.equal(user.google.provider, 'GOOGLE');
    assert.equal(user.google.subject, 'google-subject-123');
    assert.equal(user.avatar.type, 'google');
    assert.equal(user.avatar.value, 'google');
    assert.ok(user.lastLoginAt instanceof Date);
    assert.ok(user.lastLoginIp);
    assert.equal(user.lastLoginUserAgent, 'google-oauth-test');

    const session = await Session.findOne({ userId: user._id, revokedAt: null }).select('+refreshTokenHash');
    assert.ok(session);
    assert.equal(session.refreshTokenHash, hashRefreshToken(refreshCookie));
    assert.equal(await Session.findOne({ refreshTokenHash: refreshCookie }), null);

    const handoff = await OAuthHandoff.findOne({ codeHash: hashOAuthValue(handoffCode) }).select('+codeHash');
    assert.ok(handoff);
    assert.equal(handoff.userId.toString(), user._id.toString());
    assert.equal(handoff.sessionId.toString(), session._id.toString());
    assert.equal(handoff.codeHash, hashOAuthValue(handoffCode));
    assert.equal(handoff.accessToken, undefined);

    const exchanged = await requestJson(server, '/api/v1/auth/google/exchange', {
      method: 'POST',
      body: { code: handoffCode },
    });
    assert.equal(exchanged.response.status, 200);
    assert.equal(exchanged.body.user.id, user._id.toString());
    assert.equal(exchanged.body.user.passwordHash, undefined);
    assert.equal(exchanged.body.googleToken, undefined);
    assert.equal(JSON.stringify(exchanged.body).includes('mock-google-id-token'), false);
    assert.equal(verifyAccessToken(exchanged.body.token).sub, user._id.toString());

    const consumedHandoff = await OAuthHandoff.findById(handoff._id);
    assert.ok(consumedHandoff.consumedAt instanceof Date);

    const replay = await requestJson(server, '/api/v1/auth/google/exchange', {
      method: 'POST',
      body: { code: handoffCode },
    });
    assert.equal(replay.response.status, 401);
  } finally {
    await stopHttpServer(server);
  }
});

test('existing Google identity logs in again and updates normal session metadata', async () => {
  const server = await startHttpServer();

  try {
    setGoogleMock();
    const firstStart = await startGoogleOAuth(server);
    const firstCallback = await completeGoogleCallback(server, {
      state: firstStart.state,
      stateCookie: firstStart.stateCookie,
    });
    assert.equal(firstCallback.response.status, 302);

    const secondStart = await startGoogleOAuth(server);
    const secondCallback = await completeGoogleCallback(server, {
      state: secondStart.state,
      stateCookie: secondStart.stateCookie,
    });
    assert.equal(secondCallback.response.status, 302);

    const user = await User.findOne({ 'google.subject': 'google-subject-123' });
    assert.equal(await User.countDocuments({ 'google.subject': 'google-subject-123' }), 1);
    assert.ok(user.lastLoginAt instanceof Date);
    assert.equal(await Session.countDocuments({ userId: user._id, revokedAt: null }), 2);
  } finally {
    await stopHttpServer(server);
  }
});

test('Google login rejects inactive accounts and does not overwrite password accounts', async () => {
  const server = await startHttpServer();

  try {
    setGoogleMock();
    const firstStart = await startGoogleOAuth(server);
    const firstCallback = await completeGoogleCallback(server, {
      state: firstStart.state,
      stateCookie: firstStart.stateCookie,
    });
    const user = await User.findOne({ 'google.subject': 'google-subject-123' });
    await User.updateOne({ _id: user._id }, { $set: { status: ACCOUNT_STATUSES.SUSPENDED } });

    const inactiveStart = await startGoogleOAuth(server);
    const inactiveCallback = await completeGoogleCallback(server, {
      state: inactiveStart.state,
      stateCookie: inactiveStart.stateCookie,
    });
    assert.equal(inactiveCallback.response.status, 302);
    assert.equal(getLocationQuery(inactiveCallback.response.headers.get('location'), 'oauth_error'), 'authentication_failed');

    const localUser = await authService.register({
      name: 'Local User',
      email: 'local-conflict@example.com',
      password: 'local-conflict-password-123',
    });
    const originalLocalUser = await User.findById(localUser.user.id).select('+passwordHash');
    const originalLocalPasswordHash = originalLocalUser.passwordHash;
    const localSessionCountBeforeGoogle = await Session.countDocuments({ userId: localUser.user.id });
    setGoogleMock(googlePayload({
      sub: 'different-google-subject',
      email: 'local-conflict@example.com',
    }));
    const conflictStart = await startGoogleOAuth(server);
    const conflictCallback = await completeGoogleCallback(server, {
      state: conflictStart.state,
      stateCookie: conflictStart.stateCookie,
    });
    assert.equal(conflictCallback.response.status, 302);
    const conflictLocation = conflictCallback.response.headers.get('location');
    assert.equal(getLocationQuery(conflictLocation, 'oauth_error'), 'account_exists');
    assert.equal(getLocationQuery(conflictLocation, 'oauth_code'), null);
    assert.equal(getLocationQuery(conflictLocation, 'role'), null);

    const unchangedLocalUser = await User.findById(localUser.user.id).select('+passwordHash');
    assert.equal(unchangedLocalUser.role, USER_ROLES.USER);
    assert.equal(unchangedLocalUser.google?.subject, undefined);
    assert.equal(unchangedLocalUser.passwordHash, originalLocalPasswordHash);
    assert.equal(await User.countDocuments({ email: 'local-conflict@example.com' }), 1);
    assert.equal(await User.countDocuments({ 'google.subject': 'different-google-subject' }), 0);
    assert.equal(await OAuthHandoff.countDocuments({ userId: localUser.user.id }), 0);
    assert.equal(
      await Session.countDocuments({ userId: localUser.user.id }),
      localSessionCountBeforeGoogle,
    );
    assert.ok(firstCallback.response.status === 302);
  } finally {
    await stopHttpServer(server);
  }
});

test('Google login uses the same safe account-exists condition for an existing ADMIN password account', async () => {
  const server = await startHttpServer();

  try {
    const existingAdmin = await User.create({
      email: 'oauth-role-conflict@example.com',
      name: 'Existing Password Admin',
      passwordHash: await bcrypt.hash('existing-admin-password-123', 10),
      role: USER_ROLES.ADMIN,
      status: ACCOUNT_STATUSES.ACTIVE,
    });
    const existingAdminId = existingAdmin._id;
    const originalPasswordHash = existingAdmin.passwordHash;
    setGoogleMock(googlePayload({
      sub: 'admin-conflict-google-subject',
      email: 'oauth-role-conflict@example.com',
    }));

    const started = await startGoogleOAuth(server);
    const callback = await completeGoogleCallback(server, {
      state: started.state,
      stateCookie: started.stateCookie,
    });
    const location = callback.response.headers.get('location');

    assert.equal(callback.response.status, 302);
    assert.equal(getLocationQuery(location, 'oauth_error'), 'account_exists');
    assert.equal(getLocationQuery(location, 'oauth_code'), null);
    assert.equal(getLocationQuery(location, 'role'), null);
    assert.equal(location.includes('ADMIN'), false);
    assert.equal(location.includes(originalPasswordHash), false);

    const unchangedAdmin = await User.findById(existingAdminId).select('+passwordHash');
    assert.equal(unchangedAdmin.role, USER_ROLES.ADMIN);
    assert.equal(unchangedAdmin.google?.subject, undefined);
    assert.equal(Boolean(unchangedAdmin.passwordHash), true);
    assert.equal(unchangedAdmin.passwordHash === originalPasswordHash, true);
    assert.equal(await User.countDocuments({ email: 'oauth-role-conflict@example.com' }), 1);
    assert.equal(await User.countDocuments({ 'google.subject': 'admin-conflict-google-subject' }), 0);
    assert.equal(await Session.countDocuments({ userId: existingAdminId }), 0);
    assert.equal(await OAuthHandoff.countDocuments({ userId: existingAdminId }), 0);
  } finally {
    await stopHttpServer(server);
  }
});

test('Google callback handles user denial safely', async () => {
  const server = await startHttpServer();

  try {
    setGoogleMock();
    const started = await startGoogleOAuth(server);
    const denied = await completeGoogleCallback(server, {
      state: started.state,
      stateCookie: started.stateCookie,
      code: null,
      error: 'access_denied',
    });

    assert.equal(denied.response.status, 302);
    assert.equal(getLocationQuery(denied.response.headers.get('location'), 'oauth_error'), 'access_denied');
    assert.equal(await User.countDocuments({ 'google.subject': 'google-subject-123' }), 0);
  } finally {
    await stopHttpServer(server);
  }
});

test('password signup sends exactly one welcome email with the configured frontend CTA', async () => {
  const server = await startHttpServer();

  try {
    const response = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'Welcome New User',
        email: 'welcome-new@example.com',
        password: 'welcome-new-password-123',
      },
    });

    assert.equal(response.response.status, 201);
    const welcomeEmails = getEmailsWithSubject(WELCOME_SUBJECT);
    assert.equal(welcomeEmails.length, 1);
    assert.equal(welcomeEmails[0].to, 'welcome-new@example.com');
    assert.match(welcomeEmails[0].text, /Your Arcadia account is ready/);
    assert.match(welcomeEmails[0].text, /ENTER ARCADIA → http:\/\/localhost:5173\//);
    assert.match(welcomeEmails[0].html, /WELCOME TO ARCADIA/);
    assert.equal(getEmailsWithSubject(WELCOME_BACK_SUBJECT).length, 0);
    assert.equal(emailMessages.length, 1, 'signup sends only the welcome email');
  } finally {
    await stopHttpServer(server);
  }
});

test('existing password login sends exactly one safe welcome-back email', async () => {
  const server = await startHttpServer();

  try {
    await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'Returning Password User',
        email: 'welcome-back-password@example.com',
        password: 'welcome-back-password-123',
      },
    });
    clearEmailMessages();

    const response = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: {
        email: 'welcome-back-password@example.com',
        password: 'welcome-back-password-123',
      },
    });

    assert.equal(response.response.status, 200);
    const welcomeBackEmails = getEmailsWithSubject(WELCOME_BACK_SUBJECT);
    assert.equal(welcomeBackEmails.length, 1);
    assert.equal(welcomeBackEmails[0].to, 'welcome-back-password@example.com');
    assert.match(welcomeBackEmails[0].text, /Your games are waiting/);
    assert.match(welcomeBackEmails[0].text, /RETURN TO ARCADIA → http:\/\/localhost:5173\//);
    assert.match(welcomeBackEmails[0].html, /WELCOME BACK/);
    assert.doesNotMatch(welcomeBackEmails[0].text, /ADMIN|passwordHash|accessToken|refreshToken|Bearer/);
    assert.equal(getEmailsWithSubject(WELCOME_SUBJECT).length, 0);
  } finally {
    await stopHttpServer(server);
  }
});

test('new Google OAuth signup sends one welcome and no welcome-back email', async () => {
  const server = await startHttpServer();

  try {
    setGoogleMock();
    const started = await startGoogleOAuth(server);
    const callback = await completeGoogleCallback(server, {
      state: started.state,
      stateCookie: started.stateCookie,
    });

    assert.equal(callback.response.status, 302);
    assert.equal(getEmailsWithSubject(WELCOME_SUBJECT).length, 1);
    assert.equal(getEmailsWithSubject(WELCOME_BACK_SUBJECT).length, 0);
    assert.equal(emailMessages.length, 1, 'a Google signup sends only the welcome email');
    assert.equal(getEmailsWithSubject(WELCOME_SUBJECT)[0].to, 'oauth-user@example.com');
  } finally {
    await stopHttpServer(server);
  }
});

test('existing Google OAuth login sends one welcome-back email without duplicate sends', async () => {
  const server = await startHttpServer();

  try {
    setGoogleMock();
    const firstStart = await startGoogleOAuth(server);
    const firstCallback = await completeGoogleCallback(server, {
      state: firstStart.state,
      stateCookie: firstStart.stateCookie,
    });
    assert.equal(firstCallback.response.status, 302);
    assert.equal(getEmailsWithSubject(WELCOME_SUBJECT).length, 1);
    clearEmailMessages();

    const secondStart = await startGoogleOAuth(server);
    const secondCallback = await completeGoogleCallback(server, {
      state: secondStart.state,
      stateCookie: secondStart.stateCookie,
    });

    assert.equal(secondCallback.response.status, 302);
    assert.equal(getEmailsWithSubject(WELCOME_BACK_SUBJECT).length, 1);
    assert.equal(getEmailsWithSubject(WELCOME_SUBJECT).length, 0);
  } finally {
    await stopHttpServer(server);
  }
});

test('failed login, refresh, me, and logout do not send welcome-back email', async () => {
  const server = await startHttpServer();

  try {
    const registered = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'No Extra Email User',
        email: 'no-extra-email@example.com',
        password: 'no-extra-email-password-123',
      },
    });
    assert.equal(registered.response.status, 201);
    clearEmailMessages();

    const failed = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: {
        email: 'no-extra-email@example.com',
        password: 'wrong-password-123',
      },
    });
    assert.equal(failed.response.status, 401);
    assert.equal(getEmailsWithSubject(WELCOME_BACK_SUBJECT).length, 0);

    const loggedIn = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: {
        email: 'no-extra-email@example.com',
        password: 'no-extra-email-password-123',
      },
    });
    assert.equal(loggedIn.response.status, 200);
    const accessToken = loggedIn.body.token;
    const firstRefreshCookie = getRefreshCookie(loggedIn.response);
    clearEmailMessages();

    const refreshed = await requestJson(server, '/api/v1/auth/refresh', {
      method: 'POST',
      headers: { cookie: `${REFRESH_COOKIE_NAME}=${firstRefreshCookie}` },
    });
    assert.equal(refreshed.response.status, 200);

    const me = await requestJson(server, '/api/v1/auth/me', {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assert.equal(me.response.status, 200);

    const loggedOut = await requestJson(server, '/api/v1/auth/logout', {
      method: 'POST',
      headers: { cookie: `${REFRESH_COOKIE_NAME}=${getRefreshCookie(refreshed.response)}` },
    });
    assert.equal(loggedOut.response.status, 200);
    assert.equal(getEmailsWithSubject(WELCOME_BACK_SUBJECT).length, 0);
  } finally {
    await stopHttpServer(server);
  }
});

test('welcome delivery failures do not block password signup or login', async () => {
  const server = await startHttpServer();

  try {
    emailService.setEmailTransportForTests(async () => {
      throw new Error('test transport failure');
    });
    const signup = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'Transport Failure Signup',
        email: 'transport-signup@example.com',
        password: 'transport-signup-password-123',
      },
    });
    assert.equal(signup.response.status, 201);
    assert.ok(await User.exists({ email: 'transport-signup@example.com' }));

    emailService.setEmailTransportForTests(async (message) => {
      emailMessages.push(message);
      return { sent: true };
    });
    const registered = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'Transport Failure Login',
        email: 'transport-login@example.com',
        password: 'transport-login-password-123',
      },
    });
    assert.equal(registered.response.status, 201);
    clearEmailMessages();

    emailService.setEmailTransportForTests(async () => {
      throw new Error('test transport failure');
    });
    const login = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: {
        email: 'transport-login@example.com',
        password: 'transport-login-password-123',
      },
    });

    assert.equal(login.response.status, 200);
    assert.equal(login.body.user.email, 'transport-login@example.com');
  } finally {
    await stopHttpServer(server);
  }
});

test('admin welcome-back content does not disclose role information', async () => {
  const server = await startHttpServer();

  try {
    await User.create({
      email: 'welcome-admin@example.com',
      name: 'Welcome Admin',
      displayName: 'Welcome Admin',
      passwordHash: await bcrypt.hash('welcome-admin-password-123', 10),
      role: USER_ROLES.ADMIN,
      status: ACCOUNT_STATUSES.ACTIVE,
    });
    clearEmailMessages();

    const login = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: {
        email: 'welcome-admin@example.com',
        password: 'welcome-admin-password-123',
      },
    });

    assert.equal(login.response.status, 200);
    const welcomeBackEmails = getEmailsWithSubject(WELCOME_BACK_SUBJECT);
    assert.equal(welcomeBackEmails.length, 1);
    assert.doesNotMatch(welcomeBackEmails[0].text, /ADMIN|passwordHash|accessToken|refreshToken|Bearer/);
    assert.doesNotMatch(welcomeBackEmails[0].html, /ADMIN|passwordHash|accessToken|refreshToken|Bearer/);
  } finally {
    await stopHttpServer(server);
  }
});

test('failed Google authentication does not send a welcome email', async () => {
  const server = await startHttpServer();

  try {
    setGoogleMock();
    const started = await startGoogleOAuth(server);
    const callback = await completeGoogleCallback(server, {
      state: started.state,
      stateCookie: started.stateCookie,
      nonceOverride: 'wrong-nonce',
    });

    assert.equal(callback.response.status, 302);
    assert.equal(getEmailsWithSubject(WELCOME_SUBJECT).length, 0);
    assert.equal(getEmailsWithSubject(WELCOME_BACK_SUBJECT).length, 0);
  } finally {
    await stopHttpServer(server);
  }
});

test('a freshly registered account is active immediately and needs no verification step', async () => {
  const server = await startHttpServer();

  try {
    const registered = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'Instant Player',
        email: 'verify-registration@example.com',
        password: 'verify-registration-password',
      },
    });

    assert.equal(registered.response.status, 201);
    assert.equal(registered.body.user.status, ACCOUNT_STATUSES.ACTIVE);

    // No verification state of any kind rides along on the response.
    assert.equal(registered.body.user.emailVerified, undefined);
    assert.equal(registered.body.verificationEmailSent, undefined);
    assert.equal(registered.body.verificationToken, undefined);

    // Signup composes the welcome mail only; no verification email exists.
    assert.equal(emailMessages.length, 1);
    assert.equal(emailMessages[0].subject, WELCOME_SUBJECT);

    // The stored document carries no verification fields at all.
    const stored = await User.collection.findOne({ email: 'verify-registration@example.com' });
    assert.ok(stored);
    assert.equal(Object.hasOwn(stored, 'emailVerified'), false);
    assert.equal(Object.hasOwn(stored, 'verificationEmailRequestedAt'), false);
    assert.equal(stored.passwordHash.includes('verify-registration-password'), false);

    // The session issued at signup already works, so there is nothing to wait for.
    const me = await requestJson(server, '/api/v1/auth/me', {
      headers: { authorization: `Bearer ${registered.body.token}` },
    });
    assert.equal(me.response.status, 200);

    // And a brand-new login works straight away as well.
    const loggedIn = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: {
        email: 'verify-registration@example.com',
        password: 'verify-registration-password',
      },
    });
    assert.equal(loggedIn.response.status, 200);
    assert.equal(loggedIn.body.user.status, ACCOUNT_STATUSES.ACTIVE);
    assert.equal(loggedIn.body.user.emailVerified, undefined);
  } finally {
    await stopHttpServer(server);
  }
});

test('an account that still stores pre-existing verification leftovers can log in and play', async () => {
  const server = await startHttpServer();

  try {
    const registered = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'Legacy Unverified',
        email: 'legacy-unverified@example.com',
        password: 'legacy-unverified-password',
      },
    });
    assert.equal(registered.response.status, 201);

    // Simulate a document written before verification was removed: the fields
    // are still sitting in storage, and nothing in the schema reads them back.
    await User.collection.updateOne(
      { email: 'legacy-unverified@example.com' },
      {
        $set: {
          emailVerified: false,
          verificationEmailRequestedAt: new Date('2024-01-01T00:00:00.000Z'),
        },
      },
    );

    const loggedIn = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: {
        email: 'legacy-unverified@example.com',
        password: 'legacy-unverified-password',
      },
    });

    assert.equal(loggedIn.response.status, 200);
    assert.equal(loggedIn.body.user.status, ACCOUNT_STATUSES.ACTIVE);
    assert.equal(loggedIn.body.user.emailVerified, undefined);

    const me = await requestJson(server, '/api/v1/auth/me', {
      headers: { authorization: `Bearer ${loggedIn.body.token}` },
    });
    assert.equal(me.response.status, 200);
    assert.equal(me.body.emailVerified, undefined);
  } finally {
    await stopHttpServer(server);
  }
});

test('the verify-email and resend-verification endpoints no longer exist', async () => {
  const server = await startHttpServer();

  try {
    const verifyGet = await requestJson(server, '/api/v1/auth/verify-email?token=anything');
    const verifyPost = await requestJson(server, '/api/v1/auth/verify-email', {
      method: 'POST',
      body: { token: 'anything' },
    });
    const resend = await requestJson(server, '/api/v1/auth/resend-verification', {
      method: 'POST',
      body: { email: 'legacy-unverified@example.com' },
    });

    assert.equal(verifyGet.response.status, 404);
    assert.equal(verifyPost.response.status, 404);
    assert.equal(resend.response.status, 404);

    // The compatibility mount drops them too, while reset still answers.
    const compatResend = await requestJson(server, '/auth/resend-verification', {
      method: 'POST',
      body: { email: 'legacy-unverified@example.com' },
    });
    const compatVerify = await requestJson(server, '/auth/verify-email');
    assert.equal(compatResend.response.status, 404);
    assert.equal(compatVerify.response.status, 404);
  } finally {
    await stopHttpServer(server);
  }
});

test('a password signup cannot take over an email that already belongs to a Google account', async () => {
  const server = await startHttpServer();

  try {
    await User.create({
      email: 'google-owned@example.com',
      name: 'Google Owned',
      role: USER_ROLES.USER,
      status: ACCOUNT_STATUSES.ACTIVE,
      google: {
        provider: GOOGLE_PROVIDER,
        subject: 'google-owned-subject',
        email: 'google-owned@example.com',
      },
    });

    const registered = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'Impostor',
        email: ' GOOGLE-OWNED@EXAMPLE.COM ',
        password: 'impostor-password-123',
      },
    });

    assert.equal(registered.response.status, 409);
    assert.equal(registered.body.error, 'Unable to create an account with those details');

    // No account was created, no credential was attached and no link was made.
    assert.equal(await User.countDocuments({ email: 'google-owned@example.com' }), 1);
    const googleUser = await User.findOne({ email: 'google-owned@example.com' }).select('+passwordHash');
    assert.equal(googleUser.google.subject, 'google-owned-subject');
    assert.equal(googleUser.passwordHash, undefined);
    assert.equal(googleUser.status, ACCOUNT_STATUSES.ACTIVE);

    // The Google account itself still signs in exactly as before.
    setGoogleMock(googlePayload({ sub: 'google-owned-subject', email: 'google-owned@example.com' }));
    const started = await startGoogleOAuth(server);
    const callback = await completeGoogleCallback(server, {
      state: started.state,
      stateCookie: started.stateCookie,
    });
    assert.equal(callback.response.status, 302);
    assert.equal(await User.countDocuments({ email: 'google-owned@example.com' }), 1);
  } finally {
    await stopHttpServer(server);
  }
});

test('registration remains successful when email delivery is not configured', async () => {
  const server = await startHttpServer();
  const emailVariables = [
    'EMAIL_PROVIDER',
    'EMAIL_FROM',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASSWORD',
    'FRONTEND_PASSWORD_RESET_URL',
  ];
  const savedEmailEnvironment = Object.fromEntries(
    emailVariables.map((name) => [name, process.env[name]]),
  );

  try {
    for (const name of emailVariables) {
      delete process.env[name];
    }

    const registered = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'No Email Provider',
        email: 'no-email-provider@example.com',
        password: 'no-email-provider-password',
      },
    });

    assert.equal(registered.response.status, 201);
    assert.equal(emailMessages.length, 0);
    assert.ok(await User.exists({ email: 'no-email-provider@example.com' }));
  } finally {
    for (const [name, value] of Object.entries(savedEmailEnvironment)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
    await stopHttpServer(server);
  }
});

test('forgot-password is generic and stores only a reset-token hash', async () => {
  const server = await startHttpServer();

  try {
    const user = await authService.register({
      name: 'Reset User',
      email: 'reset-user@example.com',
      password: 'reset-user-password',
    });

    const response = await requestJson(server, '/api/v1/auth/forgot-password', {
      method: 'POST',
      body: { email: ' RESET-USER@EXAMPLE.COM ' },
    });
    assert.equal(response.response.status, 200);
    assert.equal(response.body.message, 'If the account is eligible, a password reset email has been sent.');
    assert.equal(response.body.resetToken, undefined);

    const rawToken = getEmailToken(emailMessages.at(-1), 'reset_token');
    assert.ok(rawToken);
    const stored = await PasswordResetToken.findOne({ userId: user.user.id }).select('+tokenHash');
    assert.equal(stored.tokenHash, hashSecureToken(rawToken));
    assert.notEqual(stored.tokenHash, rawToken);
    assert.equal(stored.toJSON().tokenHash, undefined);

    const unknown = await requestJson(server, '/api/v1/auth/forgot-password', {
      method: 'POST',
      body: { email: 'unknown-reset@example.com' },
    });
    assert.deepEqual(unknown.body, response.body);
  } finally {
    await stopHttpServer(server);
  }
});

test('password reset changes the hash, consumes the token, revokes sessions, and requires login again', async () => {
  const server = await startHttpServer();

  try {
    await authService.register({
      name: 'Reset Login User',
      email: 'reset-login@example.com',
      password: 'old-password-123',
    });
    const loginBefore = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'reset-login@example.com', password: 'old-password-123' },
    });
    const oldRefreshCookie = getRefreshCookie(loginBefore.response);
    const oldAccessToken = loginBefore.body.token;

    await requestJson(server, '/api/v1/auth/forgot-password', {
      method: 'POST',
      body: { email: 'reset-login@example.com' },
    });
    const rawToken = getEmailToken(emailMessages.at(-1), 'reset_token');
    const reset = await requestJson(server, '/api/v1/auth/reset-password', {
      method: 'POST',
      body: { token: rawToken, password: 'new-password-123' },
    });

    assert.equal(reset.response.status, 200);
    assert.equal(reset.body.password, undefined);
    assert.equal(reset.body.passwordHash, undefined);
    assert.equal(reset.body.token, undefined);

    const staleAccess = await requestJson(server, '/api/v1/auth/me', {
      headers: { authorization: `Bearer ${oldAccessToken}` },
    });
    assert.equal(staleAccess.response.status, 401);
    assert.equal(staleAccess.body.error, 'Invalid or expired token');

    const user = await User.findOne({ email: 'reset-login@example.com' }).select('+passwordHash');
    assert.equal(await bcrypt.compare('new-password-123', user.passwordHash), true);
    assert.equal(await bcrypt.compare('old-password-123', user.passwordHash), false);
    assert.equal(await Session.countDocuments({ userId: user._id, revokedAt: null }), 0);

    const oldRefresh = await requestJson(server, '/api/v1/auth/refresh', {
      method: 'POST',
      headers: { cookie: `${REFRESH_COOKIE_NAME}=${oldRefreshCookie}` },
    });
    assert.equal(oldRefresh.response.status, 401);

    const replay = await requestJson(server, '/api/v1/auth/reset-password', {
      method: 'POST',
      body: { token: rawToken, password: 'another-password-123' },
    });
    assert.equal(replay.response.status, 400);

    const newLogin = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'reset-login@example.com', password: 'new-password-123' },
    });
    assert.equal(newLogin.response.status, 200);

    const newAccess = await requestJson(server, '/api/v1/auth/me', {
      headers: { authorization: `Bearer ${newLogin.body.token}` },
    });
    assert.equal(newAccess.response.status, 200);
  } finally {
    await stopHttpServer(server);
  }
});

test('expired and invalid reset tokens are rejected without changing authentication', async () => {
  const server = await startHttpServer();

  try {
    const user = await authService.register({
      name: 'Expired Reset User',
      email: 'expired-reset@example.com',
      password: 'expired-reset-password',
    });
    await requestJson(server, '/api/v1/auth/forgot-password', {
      method: 'POST',
      body: { email: user.user.email },
    });
    const rawToken = getEmailToken(emailMessages.at(-1), 'reset_token');
    const record = await PasswordResetToken.findOne({ userId: user.user.id, consumedAt: null });
    await PasswordResetToken.updateOne({ _id: record._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    const expired = await requestJson(server, '/api/v1/auth/reset-password', {
      method: 'POST',
      body: { token: rawToken, password: 'new-expired-password' },
    });
    assert.equal(expired.response.status, 400);

    const invalid = await requestJson(server, '/api/v1/auth/reset-password', {
      method: 'POST',
      body: { token: 'arc_reset_invalid', password: 'new-invalid-password' },
    });
    assert.equal(invalid.response.status, 400);
  } finally {
    await stopHttpServer(server);
  }
});

test('Google-only accounts do not receive a fake password reset token', async () => {
  const server = await startHttpServer();

  try {
    await User.create({
      email: 'google-reset@example.com',
      name: 'Google Reset User',
      role: USER_ROLES.USER,
      status: ACCOUNT_STATUSES.ACTIVE,
      google: {
        provider: GOOGLE_PROVIDER,
        subject: 'google-reset-subject',
        email: 'google-reset@example.com',
      },
    });

    const response = await requestJson(server, '/api/v1/auth/forgot-password', {
      method: 'POST',
      body: { email: 'google-reset@example.com' },
    });
    assert.equal(response.response.status, 200);
    assert.equal(response.body.message, 'If the account is eligible, a password reset email has been sent.');
    assert.equal(await PasswordResetToken.countDocuments({ userId: (await User.findOne({ email: 'google-reset@example.com' }))._id }), 0);
    assert.equal(emailMessages.filter((message) => message.to === 'google-reset@example.com').length, 0);
  } finally {
    await stopHttpServer(server);
  }
});

test('account-action routes are available through the compatibility auth mount', async () => {
  const server = await startHttpServer();

  try {
    const forgot = await requestJson(server, '/auth/forgot-password', {
      method: 'POST',
      body: { email: 'compatibility@example.com' },
    });
    assert.equal(forgot.response.status, 200);
    assert.equal(forgot.body.message, 'If the account is eligible, a password reset email has been sent.');

    // The removed verification actions are not mounted here either.
    const resend = await requestJson(server, '/auth/resend-verification', {
      method: 'POST',
      body: { email: 'compatibility@example.com' },
    });
    assert.equal(resend.response.status, 404);
  } finally {
    await stopHttpServer(server);
  }
});

test('admin RBAC requires authentication and the current database ADMIN role', async () => {
  const server = await startHttpServer();

  try {
    const user = await registerAndLogin(server, 'rbac-user@example.com');
    const unauthenticated = await requestJson(server, '/api/v1/admin/users');
    assert.equal(unauthenticated.response.status, 401);

    const userRequest = await requestJson(server, '/api/v1/admin/users', {
      headers: { authorization: `Bearer ${user.loggedIn.body.token}` },
    });
    assert.equal(userRequest.response.status, 403);

    const admin = await provisionAndLoginAdmin(server, 'rbac-admin@example.com');
    const allowed = await requestJson(server, '/api/v1/admin/users', {
      headers: { authorization: `Bearer ${admin.token}` },
    });
    assert.equal(allowed.response.status, 200);
    assert.equal(Array.isArray(allowed.body.users), true);
    assertNoSensitiveFields(allowed.body);

    const compatibility = await requestJson(server, '/admin/users', {
      headers: { authorization: `Bearer ${admin.token}` },
    });
    assert.equal(compatibility.response.status, 200);

    const userClaims = verifyAccessToken(user.loggedIn.body.token);
    const forgedAdminToken = signAccessToken({
      _id: user.registered.body.user.id,
      role: USER_ROLES.ADMIN,
      tokenVersion: userClaims.tokenVersion,
    });
    const forgedRoleRequest = await requestJson(server, '/api/v1/admin/users', {
      headers: { authorization: `Bearer ${forgedAdminToken}` },
    });
    assert.equal(forgedRoleRequest.response.status, 403);

    await User.updateOne(
      { _id: admin.admin.id },
      { $set: { role: USER_ROLES.USER } },
    );
    const changedDatabaseRole = await requestJson(server, '/api/v1/admin/users', {
      headers: { authorization: `Bearer ${admin.token}` },
    });
    assert.equal(changedDatabaseRole.response.status, 403);
  } finally {
    await stopHttpServer(server);
  }
});

test('admin user list and details are paginated and safely serialized', async () => {
  const server = await startHttpServer();

  try {
    const admin = await provisionAndLoginAdmin(server, 'list-admin@example.com');
    const firstUser = await registerAndLogin(server, 'list-user-one@example.com');
    await registerAndLogin(server, 'list-user-two@example.com');

    const firstPage = await requestJson(server, '/api/v1/admin/users?page=1&limit=1', {
      headers: { authorization: `Bearer ${admin.token}` },
    });
    assert.equal(firstPage.response.status, 200);
    assert.equal(firstPage.body.users.length, 1);
    assert.equal(firstPage.body.pagination.page, 1);
    assert.equal(firstPage.body.pagination.limit, 1);
    assert.equal(firstPage.body.pagination.total, 3);
    assert.equal(firstPage.body.pagination.totalPages, 3);
    assertNoSensitiveFields(firstPage.body);

    const secondPage = await requestJson(server, '/api/v1/admin/users?page=2&limit=1', {
      headers: { authorization: `Bearer ${admin.token}` },
    });
    assert.equal(secondPage.response.status, 200);
    assert.equal(secondPage.body.users.length, 1);
    assert.notEqual(secondPage.body.users[0].id, firstPage.body.users[0].id);

    const clamped = await requestJson(server, '/api/v1/admin/users?limit=999', {
      headers: { authorization: `Bearer ${admin.token}` },
    });
    assert.equal(clamped.response.status, 200);
    assert.equal(clamped.body.pagination.limit, 100);

    for (const query of ['page=0', 'limit=0', 'page=NaN', 'limit=Infinity', 'limit=-1']) {
      const invalid = await requestJson(server, `/api/v1/admin/users?${query}`, {
        headers: { authorization: `Bearer ${admin.token}` },
      });
      assert.equal(invalid.response.status, 400, query);
    }

    const details = await requestJson(server, `/api/v1/admin/users/${firstUser.registered.body.user.id}`, {
      headers: { authorization: `Bearer ${admin.token}` },
    });
    assert.equal(details.response.status, 200);
    assert.equal(details.body.user.id, firstUser.registered.body.user.id);
    assertNoSensitiveFields(details.body);

    const invalidId = await requestJson(server, '/api/v1/admin/users/not-an-object-id', {
      headers: { authorization: `Bearer ${admin.token}` },
    });
    assert.equal(invalidId.response.status, 400);

    const missing = await requestJson(server, '/api/v1/admin/users/000000000000000000000000', {
      headers: { authorization: `Bearer ${admin.token}` },
    });
    assert.equal(missing.response.status, 404);
  } finally {
    await stopHttpServer(server);
  }
});

test('admin status management deactivates and reactivates users without issuing tokens', async () => {
  const server = await startHttpServer();

  try {
    const admin = await provisionAndLoginAdmin(server, 'status-admin@example.com');
    const target = await registerAndLogin(server, 'status-target@example.com');
    const targetId = target.registered.body.user.id;

    const deactivated = await requestJson(server, `/api/v1/admin/users/${targetId}/status`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${admin.token}` },
      body: { status: 'INACTIVE' },
    });
    assert.equal(deactivated.response.status, 200);
    assert.equal(deactivated.body.user.status, ACCOUNT_STATUSES.SUSPENDED);
    assert.equal(deactivated.body.token, undefined);
    assertNoSensitiveFields(deactivated.body);

    const staleAccess = await requestJson(server, '/api/v1/auth/me', {
      headers: { authorization: `Bearer ${target.loggedIn.body.token}` },
    });
    assert.equal(staleAccess.response.status, 401);

    const staleRefresh = await requestJson(server, '/api/v1/auth/refresh', {
      method: 'POST',
      headers: { cookie: `${REFRESH_COOKIE_NAME}=${target.refreshCookie}` },
    });
    assert.equal(staleRefresh.response.status, 401);
    assert.equal(await Session.countDocuments({ userId: targetId, revokedAt: null }), 0);

    const inactiveDetails = await requestJson(server, `/api/v1/admin/users/${targetId}`, {
      headers: { authorization: `Bearer ${admin.token}` },
    });
    assert.equal(inactiveDetails.response.status, 200);
    assert.equal(inactiveDetails.body.user.status, ACCOUNT_STATUSES.SUSPENDED);

    const reactivated = await requestJson(server, `/api/v1/admin/users/${targetId}/status`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${admin.token}` },
      body: { status: 'ACTIVE' },
    });
    assert.equal(reactivated.response.status, 200);
    assert.equal(reactivated.body.user.status, ACCOUNT_STATUSES.ACTIVE);
    assert.equal(reactivated.body.token, undefined);

    const stillStale = await requestJson(server, '/api/v1/auth/me', {
      headers: { authorization: `Bearer ${target.loggedIn.body.token}` },
    });
    assert.equal(stillStale.response.status, 401);

    const newLogin = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'status-target@example.com', password: 'session-password-123' },
    });
    assert.equal(newLogin.response.status, 200);
    const newAccess = await requestJson(server, '/api/v1/auth/me', {
      headers: { authorization: `Bearer ${newLogin.body.token}` },
    });
    assert.equal(newAccess.response.status, 200);

    const selfDeactivation = await requestJson(server, `/api/v1/admin/users/${admin.admin.id.toUpperCase()}/status`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${admin.token}` },
      body: { status: 'INACTIVE' },
    });
    assert.equal(selfDeactivation.response.status, 403);
    const adminStillValid = await requestJson(server, '/api/v1/admin/users', {
      headers: { authorization: `Bearer ${admin.token}` },
    });
    assert.equal(adminStillValid.response.status, 200);

    const invalidStatus = await requestJson(server, `/api/v1/admin/users/${targetId}/status`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${admin.token}` },
      body: { status: 'DELETED' },
    });
    assert.equal(invalidStatus.response.status, 400);
  } finally {
    await stopHttpServer(server);
  }
});

test('admin logout-all revokes a target user sessions and access tokens', async () => {
  const server = await startHttpServer();

  try {
    const admin = await provisionAndLoginAdmin(server, 'revoke-admin@example.com');
    const target = await registerAndLogin(server, 'revoke-target@example.com');

    const response = await requestJson(server, `/api/v1/admin/users/${target.registered.body.user.id}/logout-all`, {
      method: 'POST',
      headers: { authorization: `Bearer ${admin.token}` },
    });
    assert.equal(response.response.status, 200);
    assert.equal(response.body.message, 'All user sessions revoked');
    assert.equal(response.body.token, undefined);
    assertNoSensitiveFields(response.body);

    const staleAccess = await requestJson(server, '/api/v1/auth/me', {
      headers: { authorization: `Bearer ${target.loggedIn.body.token}` },
    });
    assert.equal(staleAccess.response.status, 401);

    const staleRefresh = await requestJson(server, '/api/v1/auth/refresh', {
      method: 'POST',
      headers: { cookie: `${REFRESH_COOKIE_NAME}=${target.refreshCookie}` },
    });
    assert.equal(staleRefresh.response.status, 401);
    assert.equal(await Session.countDocuments({ userId: target.registered.body.user.id, revokedAt: null }), 0);

    const newLogin = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'revoke-target@example.com', password: 'session-password-123' },
    });
    assert.equal(newLogin.response.status, 200);
  } finally {
    await stopHttpServer(server);
  }
});

test('admin role management is allowlisted, invalidates old tokens, and protects self-demotion', async () => {
  const server = await startHttpServer();

  try {
    const admin = await provisionAndLoginAdmin(server, 'role-admin@example.com');
    const target = await registerAndLogin(server, 'role-target@example.com');

    const userAttempt = await requestJson(server, `/api/v1/admin/users/${target.registered.body.user.id}/role`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${target.loggedIn.body.token}` },
      body: { role: USER_ROLES.ADMIN },
    });
    assert.equal(userAttempt.response.status, 403);

    const invalidRole = await requestJson(server, `/api/v1/admin/users/${target.registered.body.user.id}/role`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${admin.token}` },
      body: { role: 'SUPER_ADMIN' },
    });
    assert.equal(invalidRole.response.status, 400);

    const promoted = await requestJson(server, `/api/v1/admin/users/${target.registered.body.user.id}/role`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${admin.token}` },
      body: { role: USER_ROLES.ADMIN },
    });
    assert.equal(promoted.response.status, 200);
    assert.equal(promoted.body.user.role, USER_ROLES.ADMIN);
    assertNoSensitiveFields(promoted.body);

    const staleTargetAccess = await requestJson(server, '/api/v1/auth/me', {
      headers: { authorization: `Bearer ${target.loggedIn.body.token}` },
    });
    assert.equal(staleTargetAccess.response.status, 401);

    const staleTargetRefresh = await requestJson(server, '/api/v1/auth/refresh', {
      method: 'POST',
      headers: { cookie: `${REFRESH_COOKIE_NAME}=${target.refreshCookie}` },
    });
    assert.equal(staleTargetRefresh.response.status, 401);
    assert.equal(await Session.countDocuments({ userId: target.registered.body.user.id, revokedAt: null }), 0);

    const promotedLogin = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'role-target@example.com', password: 'session-password-123' },
    });
    assert.equal(promotedLogin.response.status, 200);
    assert.equal(promotedLogin.body.user.role, USER_ROLES.ADMIN);

    const promotedAdminRequest = await requestJson(server, '/api/v1/admin/users', {
      headers: { authorization: `Bearer ${promotedLogin.body.token}` },
    });
    assert.equal(promotedAdminRequest.response.status, 200);

    const selfDemotion = await requestJson(server, `/api/v1/admin/users/${admin.admin.id.toUpperCase()}/role`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${admin.token}` },
      body: { role: USER_ROLES.USER },
    });
    assert.equal(selfDemotion.response.status, 403);
    assert.equal((await User.findById(admin.admin.id)).role, USER_ROLES.ADMIN);

    const demoted = await requestJson(server, `/api/v1/admin/users/${target.registered.body.user.id}/role`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${admin.token}` },
      body: { role: USER_ROLES.USER },
    });
    assert.equal(demoted.response.status, 200);
    assert.equal(demoted.body.user.role, USER_ROLES.USER);

    const demotedAdminAccess = await requestJson(server, '/api/v1/auth/me', {
      headers: { authorization: `Bearer ${promotedLogin.body.token}` },
    });
    assert.equal(demotedAdminAccess.response.status, 401);
  } finally {
    await stopHttpServer(server);
  }
});

test('registration accepts Unicode usernames, preserves the entered form, and keeps uniqueness case-insensitive', async () => {
  const server = await startHttpServer();

  try {
    const registered = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        username: 'Ankit Das',
        email: 'username-owner@example.com',
        password: 'username-owner-password',
      },
    });
    assert.equal(registered.response.status, 201);
    assert.equal(registered.body.user.username, 'Ankit Das');
    assert.equal(registered.body.user.usernameSetupRequired, false);
    assert.equal(registered.body.user.name, '');
    assert.equal(registered.body.user.displayName, '');

    const stored = await User.findOne({ email: 'username-owner@example.com' })
      .select('+usernameNormalized');
    // The visible username keeps the exact entered form; the normalized value
    // exists only for comparison and uniqueness.
    assert.equal(stored.username, 'Ankit Das');
    assert.equal(stored.usernameNormalized, 'ankit das');

    const duplicate = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        username: 'ANKIT DAS',
        email: 'username-duplicate@example.com',
        password: 'username-duplicate-password',
      },
    });
    assert.equal(duplicate.response.status, 409);
    assert.equal(duplicate.body.error, 'That username is already taken');

    const unavailable = await requestJson(
      server,
      '/api/v1/account/username-availability?username=AnKiT%20DaS',
    );
    assert.equal(unavailable.response.status, 200);
    assert.deepEqual(unavailable.body, { available: false });

    const compatibility = await requestJson(
      server,
      '/account/username-availability?username=available_name',
    );
    assert.deepEqual(compatibility.body, { available: true });

    const legacy = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        email: 'legacy-username@example.com',
        password: 'legacy-username-password',
      },
    });
    assert.equal(legacy.response.status, 201);
    assert.equal(legacy.body.user.username, null);
    assert.equal(legacy.body.user.usernameSetupRequired, true);
  } finally {
    await stopHttpServer(server);
  }
});

test('username rules allow visible Unicode and reject unsafe, out-of-range and reserved values', () => {
  // Exactly 20 code points, plus 20 code points that need 40 UTF-16 units.
  const twentyCharacters = 'Ankit Das Arcadia 25';
  assert.equal(getUsernameLength(twentyCharacters), 20);
  const twentyEmoji = '\u{1F600}'.repeat(20);
  assert.equal(getUsernameLength(twentyEmoji), 20);
  assert.equal(twentyEmoji.length, 40);

  const accepted = [
    'Ankit',
    'Ankit Das',
    'Ankit_Das',
    'Ankit@Arcadia',
    'ARCADIA 25',
    'Ａｎｋｉｔ',
    'Ankit ⚡',
    'player!',
    '<script>',
    '../../',
    '\u{1F600}ab',
    twentyCharacters,
    twentyEmoji,
  ];

  for (const username of accepted) {
    assert.equal(getUsernameValidationError(username), null, username);
    // The stored visible form keeps the exact entered characters.
    assert.equal(toDisplayUsername(username), username, username);
  }

  const rejected = [
    '',
    '   ',
    'ab',
    '\u{1F642}',
    'Ankit Das Arcadia 250',
    'bad\u0001name',
    'zero\u200bwidth',
    'bidi\u202Eoverride',
    'line\u2028break',
    'private\uE000use',
    'admin',
    'Admin',
    'ARCADIA',
    'help',
  ];

  for (const username of rejected) {
    assert.notEqual(getUsernameValidationError(username), null, username);
  }

  // Reserved names stay blocked regardless of the allowed character set.
  for (const reserved of RESERVED_USERNAMES) {
    assert.notEqual(getUsernameValidationError(reserved), null, reserved);
    assert.notEqual(getUsernameValidationError(reserved.toUpperCase()), null, reserved);
  }

  // Only the comparison value is case folded; the visible value never is.
  assert.equal(normalizeUsername('Ankit Das'), 'ankit das');
  assert.equal(toDisplayUsername('Ankit Das'), 'Ankit Das');
  assert.equal(normalizeUsername('ANKIT@Arcadia'), 'ankit@arcadia');
  assert.equal(toDisplayUsername('  Ankit Das  '), 'Ankit Das');
});

test('registration and availability enforce the same username rules over HTTP', async () => {
  const server = await startHttpServer();

  try {
    // Representative accepted values: visible punctuation, spaces, uppercase,
    // Unicode and an emoji-counted username must all be stored as entered.
    const accepted = ['Ankit@Arcadia', 'Ａｎｋｉｔ', '\u{1F600}ab'];
    for (const [index, username] of accepted.entries()) {
      const response = await requestJson(server, '/api/v1/auth/register', {
        method: 'POST',
        body: {
          username,
          email: `username-valid-${index}@example.com`,
          password: 'username-valid-password',
        },
      });
      assert.equal(response.response.status, 201, username);
      assert.equal(response.body.user.username, username, username);

      const available = await requestJson(
        server,
        `/api/v1/account/username-availability?username=${encodeURIComponent(username)}`,
      );
      assert.equal(available.response.status, 200, username);
      assert.deepEqual(available.body, { available: false }, username);
    }

    // Rejected values stay rejected over HTTP, and availability never leaks or
    // accepts an invalid, unsafe or reserved name.
    const rejected = ['', 'ab', 'zero\u200bwidth', 'admin', 'Ankit Das Arcadia 250'];
    for (const [index, username] of rejected.entries()) {
      const response = await requestJson(server, '/api/v1/auth/register', {
        method: 'POST',
        body: {
          username,
          email: `username-invalid-${index}@example.com`,
          password: 'username-invalid-password',
        },
      });
      assert.equal(response.response.status, 400, username);

      const available = await requestJson(
        server,
        `/api/v1/account/username-availability?username=${encodeURIComponent(username)}`,
      );
      assert.equal(available.response.status, 200, username);
      assert.deepEqual(available.body, { available: false }, username);
    }
  } finally {
    await stopHttpServer(server);
  }
});

test('username setup is atomic, cooldown-protected, and cannot mass-assign security fields', async () => {
  const server = await startHttpServer();

  try {
    const account = await registerAndLogin(server, 'username-setup@example.com');
    const userId = account.registered.body.user.id;
    const originalVersion = (await User.findById(userId)).tokenVersion;

    const available = await requestJson(
      server,
      '/api/v1/account/username-availability?username=Player_01',
    );
    assert.deepEqual(available.body, { available: true });

    const massAssignment = await requestJson(server, '/api/v1/account/username', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${account.loggedIn.body.token}` },
      body: {
        username: 'Player_01',
        role: USER_ROLES.ADMIN,
        status: ACCOUNT_STATUSES.SUSPENDED,
        tokenVersion: 99,
      },
    });
    assert.equal(massAssignment.response.status, 400);

    const first = await requestJson(server, '/api/v1/account/username', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${account.loggedIn.body.token}` },
      body: { username: 'Player_01' },
    });
    assert.equal(first.response.status, 200);
    assert.equal(first.body.user.username, 'Player_01');

    const cooldown = await requestJson(server, '/api/v1/account/username', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${account.loggedIn.body.token}` },
      body: { username: 'player_02' },
    });
    assert.equal(cooldown.response.status, 429);
    assert.equal(cooldown.body.error, 'Username can be changed once every 60 seconds');

    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { $set: { usernameChangedAt: new Date(Date.now() - USERNAME_CHANGE_COOLDOWN_MS - 1000) } },
    );
    const second = await requestJson(server, '/api/v1/account/username', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${account.loggedIn.body.token}` },
      body: { username: 'PLAYER_02' },
    });
    assert.equal(second.response.status, 200);
    assert.equal(second.body.user.username, 'PLAYER_02');

    // A case-only change keeps the same comparison value but must still update
    // the visible username instead of being treated as a no-op.
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { $set: { usernameChangedAt: new Date(Date.now() - USERNAME_CHANGE_COOLDOWN_MS - 1000) } },
    );
    const recased = await requestJson(server, '/api/v1/account/username', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${account.loggedIn.body.token}` },
      body: { username: 'player_02' },
    });
    assert.equal(recased.response.status, 200);
    assert.equal(recased.body.user.username, 'player_02');

    const stored = await User.findById(userId);
    assert.equal(stored.role, USER_ROLES.USER);
    assert.equal(stored.status, ACCOUNT_STATUSES.ACTIVE);
    assert.equal(stored.tokenVersion, originalVersion);
    assert.equal(stored.email, 'username-setup@example.com');
  } finally {
    await stopHttpServer(server);
  }
});

test('profile and settings return safe data and only allow display-name updates', async () => {
  const server = await startHttpServer();

  try {
    const account = await registerAndLogin(server, 'profile-safe@example.com');
    const headers = { authorization: `Bearer ${account.loggedIn.body.token}` };
    const profile = await requestJson(server, '/api/v1/account/profile', { headers });
    assert.equal(profile.response.status, 200);
    assert.equal(profile.body.user.username, null);
    assert.equal(profile.body.user.displayName, 'Session User');
    assert.equal(profile.body.user.avatar.type, 'local');
    assert.equal(profile.body.user.googleAvatarAvailable, false);
    assertNoSensitiveFields(profile.body);

    const settings = await requestJson(server, '/api/v1/account/settings', { headers });
    assert.equal(settings.response.status, 200);
    assert.equal(settings.body.settings.email, 'profile-safe@example.com');
    assertNoSensitiveFields(settings.body);

    const updated = await requestJson(server, '/api/v1/account/profile', {
      method: 'PATCH',
      headers,
      body: { displayName: '  Arcadia   Player  ' },
    });
    assert.equal(updated.response.status, 200);
    assert.equal(updated.body.user.displayName, 'Arcadia Player');

    for (const displayName of ['<script>alert(1)</script>', 'Bad\u0001Name', 'Bad\nName', 'x'.repeat(81)]) {
      const invalid = await requestJson(server, '/api/v1/account/profile', {
        method: 'PATCH',
        headers,
        body: { displayName },
      });
      assert.equal(invalid.response.status, 400);
    }

    const massAssignment = await requestJson(server, '/api/v1/account/profile', {
      method: 'PATCH',
      headers,
      body: {
        displayName: 'Safe Name',
        role: USER_ROLES.ADMIN,
        status: ACCOUNT_STATUSES.SUSPENDED,
        email: 'changed@example.com',
        tokenVersion: 99,
        google: { provider: GOOGLE_PROVIDER },
      },
    });
    assert.equal(massAssignment.response.status, 400);

    const stored = await User.findById(account.registered.body.user.id);
    assert.equal(stored.displayName, 'Arcadia Player');
    assert.equal(stored.role, USER_ROLES.USER);
    assert.equal(stored.status, ACCOUNT_STATUSES.ACTIVE);
    assert.equal(stored.email, 'profile-safe@example.com');
    assert.equal(stored.google?.provider, undefined);
    assert.equal(stored.google?.subject, undefined);
  } finally {
    await stopHttpServer(server);
  }
});

test('local avatar selection is authoritative and cannot mutate account identity or accept URLs', async () => {
  const server = await startHttpServer();

  try {
    const account = await registerAndLogin(server, 'local-avatar@example.com');
    const headers = { authorization: `Bearer ${account.loggedIn.body.token}` };
    const before = await User.findById(account.registered.body.user.id).select('+tokenVersion');

    const selected = await requestJson(server, '/api/v1/account/avatar', {
      method: 'PATCH',
      headers,
      body: { type: 'local', value: 'avatar-03' },
    });
    assert.equal(selected.response.status, 200);
    assert.deepEqual(selected.body.user.avatar, { type: 'local', value: 'avatar-03' });
    assert.equal(selected.body.user.avatarSource, 'local');

    for (const body of [
      { type: 'local', value: 'avatar-99' },
      { type: 'url', value: 'https://example.com/avatar.png' },
      { type: 'google', value: 'https://example.com/google.png' },
    ]) {
      const invalid = await requestJson(server, '/api/v1/account/avatar', {
        method: 'PATCH',
        headers,
        body,
      });
      assert.equal(invalid.response.status, 400);
    }

    const after = await User.findById(account.registered.body.user.id).select('+tokenVersion');
    assert.equal(after.username, before.username);
    assert.equal(after.email, before.email);
    assert.equal(after.role, before.role);
    assert.equal(after.status, before.status);
    assert.equal(after.tokenVersion, before.tokenVersion);
    assert.equal(after.google?.provider, undefined);
    assert.equal(after.google?.subject, undefined);
  } finally {
    await stopHttpServer(server);
  }
});

test('verified Google avatars can switch both ways and fall back safely when unavailable', async () => {
  const server = await startHttpServer();

  try {
    setGoogleMock();
    const started = await startGoogleOAuth(server);
    const callback = await completeGoogleCallback(server, {
      state: started.state,
      stateCookie: started.stateCookie,
    });
    const handoffCode = getLocationQuery(callback.response.headers.get('location'), 'oauth_code');
    const refreshCookie = getRefreshCookie(callback.response);
    const exchanged = await requestJson(server, '/api/v1/auth/google/exchange', {
      method: 'POST',
      body: { code: handoffCode },
    });
    const headers = {
      authorization: `Bearer ${exchanged.body.token}`,
      cookie: `${REFRESH_COOKIE_NAME}=${refreshCookie}`,
    };

    const profile = await requestJson(server, '/api/v1/account/profile', { headers });
    assert.equal(profile.body.user.googleAvatarAvailable, true);
    assert.equal(
      profile.body.user.googleAvatarUrl,
      'https://lh3.googleusercontent.com/a/arcadia-test-profile',
    );
    assert.equal(profile.body.user.avatar.type, 'google');

    const userId = profile.body.user.id;
    const before = await User.findById(userId).select('+tokenVersion');
    const googleAvatar = await requestJson(server, '/api/v1/account/avatar', {
      method: 'PATCH',
      headers,
      body: { type: 'google' },
    });
    assert.equal(googleAvatar.response.status, 200);
    assert.deepEqual(googleAvatar.body.user.avatar, { type: 'google', value: 'google' });

    const localAvatar = await requestJson(server, '/api/v1/account/avatar', {
      method: 'PATCH',
      headers,
      body: { type: 'local', value: LOCAL_AVATAR_IDS[4] },
    });
    assert.equal(localAvatar.response.status, 200);
    assert.equal(localAvatar.body.user.avatar.value, LOCAL_AVATAR_IDS[4]);

    await requestJson(server, '/api/v1/account/avatar', {
      method: 'PATCH',
      headers,
      body: { type: 'google' },
    });
    await User.updateOne({ _id: userId }, { $set: { 'google.pictureUrl': null } });
    const fallback = await requestJson(server, '/api/v1/account/profile', { headers });
    assert.equal(fallback.body.user.googleAvatarAvailable, false);
    assert.equal(fallback.body.user.googleAvatarUrl, null);
    assert.equal(fallback.body.user.avatar.type, 'local');

    const after = await User.findById(userId).select('+tokenVersion');
    assert.equal(after.email, before.email);
    assert.equal(after.role, before.role);
    assert.equal(after.status, before.status);
    assert.equal(after.tokenVersion, before.tokenVersion);
    assert.equal(after.google.subject, before.google.subject);
  } finally {
    await stopHttpServer(server);
  }
});

test('password change verifies the current password, revokes sessions, and never configures Google-only accounts', async () => {
  const server = await startHttpServer();

  try {
    const account = await registerAndLogin(server, 'change-password@example.com');
    const oldAccessToken = account.loggedIn.body.token;
    const oldRefreshCookie = account.refreshCookie;
    const headers = { authorization: `Bearer ${oldAccessToken}` };

    const wrongCurrent = await requestJson(server, '/api/v1/account/change-password', {
      method: 'POST',
      headers,
      body: { currentPassword: 'wrong-password', newPassword: 'new-password-123' },
    });
    assert.equal(wrongCurrent.response.status, 401);

    const weakPassword = await requestJson(server, '/api/v1/account/change-password', {
      method: 'POST',
      headers,
      body: { currentPassword: 'session-password-123', newPassword: 'short' },
    });
    assert.equal(weakPassword.response.status, 400);

    const changed = await requestJson(server, '/api/v1/account/change-password', {
      method: 'POST',
      headers,
      body: {
        currentPassword: 'session-password-123',
        newPassword: 'new-password-123',
      },
    });
    assert.equal(changed.response.status, 200);
    assertNoSensitiveFields(changed.body);

    const staleAccess = await requestJson(server, '/api/v1/auth/me', { headers });
    assert.equal(staleAccess.response.status, 401);
    const staleRefresh = await requestJson(server, '/api/v1/auth/refresh', {
      method: 'POST',
      headers: { cookie: `${REFRESH_COOKIE_NAME}=${oldRefreshCookie}` },
    });
    assert.equal(staleRefresh.response.status, 401);
    const oldLogin = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'change-password@example.com', password: 'session-password-123' },
    });
    assert.equal(oldLogin.response.status, 401);
    const newLogin = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'change-password@example.com', password: 'new-password-123' },
    });
    assert.equal(newLogin.response.status, 200);

    const googleUser = await User.create({
      email: 'google-password-change@example.com',
      name: 'Google Password User',
      displayName: 'Google Password User',
      google: {
        provider: GOOGLE_PROVIDER,
        subject: 'google-password-subject',
        email: 'google-password-change@example.com',
        pictureUrl: 'https://lh3.googleusercontent.com/a/google-password-user',
      },
    });
    const googleToken = signAccessToken(googleUser);
    const googleResponse = await requestJson(server, '/api/v1/account/change-password', {
      method: 'POST',
      headers: { authorization: `Bearer ${googleToken}` },
      body: { currentPassword: 'anything', newPassword: 'new-password-123' },
    });
    assert.equal(googleResponse.response.status, 400);
    assert.equal(
      googleResponse.body.error,
      'Password authentication is not configured for this account',
    );
    const unchangedGoogleUser = await User.findById(googleUser._id).select('+passwordHash');
    assert.equal(unchangedGoogleUser.passwordHash, undefined);
  } finally {
    await stopHttpServer(server);
  }
});

test('account sessions are owner-scoped, safely listed, individually revocable, and support logout-others', async () => {
  const server = await startHttpServer();

  try {
    const account = await registerAndLogin(server, 'sessions-owner@example.com');
    const secondLogin = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'sessions-owner@example.com', password: 'session-password-123' },
    });
    const thirdLogin = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'sessions-owner@example.com', password: 'session-password-123' },
    });
    const currentCookie = getRefreshCookie(thirdLogin.response);
    const currentHash = hashRefreshToken(currentCookie);
    const currentSession = await Session.findOne({ refreshTokenHash: currentHash });
    const otherOwnSession = await Session.findOne({
      userId: account.registered.body.user.id,
      _id: { $ne: currentSession._id },
      revokedAt: null,
    });
    const headers = {
      authorization: `Bearer ${thirdLogin.body.token}`,
      cookie: `${REFRESH_COOKIE_NAME}=${currentCookie}`,
    };

    const listed = await requestJson(server, '/api/v1/account/sessions', { headers });
    assert.equal(listed.response.status, 200);
    assert.equal(listed.body.sessions.length, 4);
    assert.equal(listed.body.sessions.filter((session) => session.current).length, 1);
    assertNoSensitiveFields(listed.body);
    for (const session of listed.body.sessions) {
      assert.deepEqual(
        Object.keys(session).sort(),
        ['createdAt', 'current', 'device', 'expiresAt', 'id', 'lastUsedAt'].sort(),
      );
    }

    const otherAccount = await registerAndLogin(server, 'sessions-other@example.com');
    const foreignSession = await Session.findOne({
      userId: otherAccount.registered.body.user.id,
      revokedAt: null,
    });
    const foreignAttempt = await requestJson(
      server,
      `/api/v1/account/sessions/${foreignSession._id}`,
      { method: 'DELETE', headers },
    );
    assert.equal(foreignAttempt.response.status, 404);
    assert.ok(await Session.findById(foreignSession._id));

    const revoked = await requestJson(
      server,
      `/api/v1/account/sessions/${otherOwnSession._id}`,
      { method: 'DELETE', headers },
    );
    assert.equal(revoked.response.status, 200);
    assert.equal(revoked.body.current, false);
    assert.equal(getSetCookieHeader(revoked.response), '');

    const logoutOthers = await requestJson(
      server,
      '/api/v1/account/sessions/logout-others',
      { method: 'POST', headers },
    );
    assert.equal(logoutOthers.response.status, 200);
    assert.equal(logoutOthers.body.revokedCount, 2);
    assert.equal(
      await Session.countDocuments({ userId: account.registered.body.user.id, revokedAt: null }),
      1,
    );

    const newCurrentLogin = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'sessions-owner@example.com', password: 'session-password-123' },
    });
    const newCurrentCookie = getRefreshCookie(newCurrentLogin.response);
    const revokeCurrent = await requestJson(
      server,
      `/api/v1/account/sessions/${(await Session.findOne({
        refreshTokenHash: hashRefreshToken(newCurrentCookie),
      }))._id}`,
      {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${newCurrentLogin.body.token}`,
          cookie: `${REFRESH_COOKIE_NAME}=${newCurrentCookie}`,
        },
      },
    );
    assert.equal(revokeCurrent.response.status, 200);
    assert.equal(revokeCurrent.body.current, true);
    assert.match(getSetCookieHeader(revokeCurrent.response), /arcadia_refresh=;/i);
  } finally {
    await stopHttpServer(server);
  }
});

test('environment validation requires a database URI and a sufficiently long JWT secret', () => {
  const validSecret = 'a'.repeat(32);
  assert.throws(
    () => validateEnvironment({ MONGODB_URI: '', JWT_SECRET: validSecret }),
    /MONGODB_URI is required/,
  );
  assert.throws(
    () => validateEnvironment({ MONGODB_URI: 'mongodb://localhost/arcadia', JWT_SECRET: 'short' }),
    /JWT_SECRET must be at least 32 characters/,
  );
  assert.throws(
    () => validateEnvironment({ MONGODB_URI: 'mongodb+srv://cluster.example', JWT_SECRET: 'a'.repeat(32) }),
    /MONGODB_URI must include a database name/,
  );
});

test('security headers, explicit CORS, and CSRF protection are enforced', async () => {
  const server = await startHttpServer();
  try {
    const missing = await requestJson(server, '/api/v1/account/profile');
    assert.equal(missing.response.headers.get('x-powered-by'), null);
    assert.equal(missing.response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(missing.response.headers.get('x-frame-options'), 'DENY');
    assert.equal(missing.response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(missing.response.headers.get('cache-control'), 'no-store');
    assert.match(missing.response.headers.get('content-security-policy'), /frame-ancestors 'none'/);

    const allowed = await requestJson(server, '/api/v1/account/username-availability?username=allowed_user', {
      headers: { origin: 'http://localhost:5173' },
    });
    assert.equal(allowed.response.status, 200);
    assert.equal(allowed.response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    assert.equal(allowed.response.headers.get('access-control-allow-credentials'), 'true');

    const rejected = await requestJson(server, '/api/v1/account/username-availability?username=allowed_user', {
      headers: { origin: 'https://evil.example' },
    });
    assert.equal(rejected.response.status, 403);
    assert.equal(rejected.response.headers.get('access-control-allow-origin'), null);

    const preflight = await requestJson(server, '/api/v1/auth/refresh', {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'X-Arcadia-Request',
      },
    });
    assert.equal(preflight.response.status, 204);
    assert.equal(preflight.response.headers.get('access-control-allow-origin'), 'http://localhost:5173');

    const csrf = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      csrfHeader: false,
      headers: { origin: 'http://localhost:5173' },
      body: { email: 'csrf@example.com', password: 'csrf-password-123' },
    });
    assert.equal(csrf.response.status, 403);
    assert.equal(csrf.body.error, 'Request verification failed');

    const notFound = await requestJson(server, '/api/v1/no-such-route');
    assert.equal(notFound.response.status, 404);
    assert.equal(notFound.body.error, 'Route not found');
  } finally {
    await stopHttpServer(server);
  }
});

test('sensitive login requests receive a generic rate-limit response', async () => {
  const server = await startHttpServer();
  try {
    let last;
    for (let index = 0; index < 21; index += 1) {
      last = await requestJson(server, '/api/v1/auth/login', {
        method: 'POST',
        body: { email: 'rate-limit@example.com', password: 'short' },
      });
    }
    assert.equal(last.response.status, 429);
    assert.equal(last.body.error, 'Too many requests. Please try again later.');
    assert.ok(Number(last.response.headers.get('retry-after')) >= 1);
    assert.equal(last.response.headers.get('ratelimit-limit'), '20');
    assert.notEqual(last.response.headers.get('access-control-allow-origin'), '*');
  } finally {
    await stopHttpServer(server);
  }
});

test('hostile JWT claims and authorization headers fail closed', async () => {
  const server = await startHttpServer();
  try {
    const account = await registerAndLogin(server, 'hostile-jwt@example.com');
    const userId = account.loggedIn.body.user.id;
    const now = Math.floor(Date.now() / 1000);
    const base = {
      sub: userId,
      role: 'USER',
      type: 'access',
      tokenVersion: 0,
      iat: now,
      exp: now + 300,
    };
    const token = (payload, options = {}) => jwt.sign(payload, process.env.JWT_SECRET, {
      algorithm: 'HS256',
      issuer: 'arcadia-backend',
      audience: 'arcadia-web',
      jwtid: crypto.randomUUID(),
      noTimestamp: true,
      ...options,
    });
    const { exp: _exp, ...withoutExpiration } = base;
    const hostileTokens = [
      jwt.sign(base, 'wrong-secret', {
        algorithm: 'HS256',
        issuer: 'arcadia-backend',
        audience: 'arcadia-web',
        jwtid: crypto.randomUUID(),
        noTimestamp: true,
      }),
      token({ ...base, type: 'refresh' }),
      token({ ...base, sub: 'not-an-object-id' }),
      token({ ...base, tokenVersion: '0' }),
      token({ ...base, role: 'SUPER_ADMIN' }),
      token(withoutExpiration),
      token(base, { algorithm: 'HS384' }),
    ];
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify(base)).toString('base64url');
    hostileTokens.push(`${header}.${payload}.`);

    for (const hostileToken of hostileTokens) {
      const response = await requestJson(server, '/api/v1/auth/me', {
        headers: { authorization: `Bearer ${hostileToken}` },
      });
      assert.equal(response.response.status, 401);
    }

    for (const malformedHeader of ['Basic token', 'Bearer', 'Bearer one two', 'Bearer a.b.c.d']) {
      const response = await requestJson(server, '/api/v1/auth/me', {
        headers: { authorization: malformedHeader },
      });
      assert.equal(response.response.status, 401);
    }

    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { $set: { tokenVersion: 'malformed' } },
    );
    const malformedPersistedVersion = await requestJson(server, '/api/v1/auth/me', {
      headers: { authorization: `Bearer ${account.loggedIn.body.token}` },
    });
    assert.equal(malformedPersistedVersion.response.status, 401);
  } finally {
    await stopHttpServer(server);
  }
});

test('concurrent refresh rotation does not revoke the winning session', async () => {
  const server = await startHttpServer();
  try {
    const account = await registerAndLogin(server, 'concurrent-refresh@example.com');
    const oldCookie = account.refreshCookie;
    const responses = await Promise.all([
      requestJson(server, '/api/v1/auth/refresh', {
        method: 'POST',
        headers: { cookie: `${REFRESH_COOKIE_NAME}=${oldCookie}` },
      }),
      requestJson(server, '/api/v1/auth/refresh', {
        method: 'POST',
        headers: { cookie: `${REFRESH_COOKIE_NAME}=${oldCookie}` },
      }),
    ]);
    const statuses = responses.map((result) => result.response.status).sort();
    assert.deepEqual(statuses, [200, 401]);
    const winner = responses.find((result) => result.response.status === 200);
    const oldSession = await Session.findOne({ refreshTokenHash: hashRefreshToken(oldCookie) });
    assert.equal(await Session.countDocuments({ familyId: oldSession.familyId, revokedAt: null }), 1);
    const winnerCookie = getRefreshCookie(winner.response);
    const usable = await requestJson(server, '/api/v1/auth/refresh', {
      method: 'POST',
      headers: { cookie: `${REFRESH_COOKIE_NAME}=${winnerCookie}` },
    });
    assert.equal(usable.response.status, 200);
  } finally {
    await stopHttpServer(server);
  }
});

test('outstanding password-reset tokens are consumed by a password change', async () => {
  const server = await startHttpServer();
  try {
    const account = await registerAndLogin(server, 'reset-invalidation@example.com');
    const forgot = await requestJson(server, '/api/v1/auth/forgot-password', {
      method: 'POST',
      body: { email: account.loggedIn.body.user.email },
    });
    assert.equal(forgot.response.status, 200);
    const resetToken = getEmailToken(emailMessages.at(-1), 'reset_token');
    const resetRecord = await PasswordResetToken.findOne({ tokenHash: hashSecureToken(resetToken) });
    assert.equal(resetRecord.credentialVersion, 0);
    const changed = await requestJson(server, '/api/v1/account/change-password', {
      method: 'POST',
      headers: { authorization: `Bearer ${account.loggedIn.body.token}` },
      body: {
        currentPassword: 'session-password-123',
        newPassword: 'new-session-password-123',
        role: 'ADMIN',
      },
    });
    assert.equal(changed.response.status, 400);

    const validChange = await requestJson(server, '/api/v1/account/change-password', {
      method: 'POST',
      headers: { authorization: `Bearer ${account.loggedIn.body.token}` },
      body: {
        currentPassword: 'session-password-123',
        newPassword: 'new-session-password-123',
      },
    });
    assert.equal(validChange.response.status, 200);
    const resetAttempt = await requestJson(server, '/api/v1/auth/reset-password', {
      method: 'POST',
      body: { token: resetToken, password: 'attacker-password-123' },
    });
    assert.equal(resetAttempt.response.status, 400);
    const newLogin = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: { email: account.loggedIn.body.user.email, password: 'new-session-password-123' },
    });
    assert.equal(newLogin.response.status, 200);
  } finally {
    await stopHttpServer(server);
  }
});

test('OAuth state and handoff consumption are single-use under concurrency', async () => {
  const stateTransaction = await googleOAuthService.createOAuthState();
  const stateResults = await Promise.allSettled([
    googleOAuthService.consumeOAuthState({
      state: stateTransaction.state,
      stateCookie: stateTransaction.state,
    }),
    googleOAuthService.consumeOAuthState({
      state: stateTransaction.state,
      stateCookie: stateTransaction.state,
    }),
  ]);
  assert.equal(stateResults.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(stateResults.filter((result) => result.status === 'rejected').length, 1);

  const created = await authService.register({
    name: 'OAuth Race User',
    email: 'oauth-race@example.com',
    password: 'oauth-race-password-123',
  });
  const refreshService = require('../services/refreshSessionService');
  const session = await refreshService.createRefreshSession({
    userId: created.user.id,
    req: { ip: '127.0.0.1', get: () => 'oauth-race' },
  });
  const code = await googleOAuthService.createOAuthHandoff({
    userId: created.user.id,
    sessionId: session.session._id,
    credentialVersion: 0,
  });
  const handoffResults = await Promise.allSettled([
    googleOAuthService.consumeOAuthHandoff(code),
    googleOAuthService.consumeOAuthHandoff(code),
  ]);
  assert.equal(handoffResults.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(handoffResults.filter((result) => result.status === 'rejected').length, 1);
});

test('production configuration fails closed for unsafe environments', () => {
  const secret = crypto.randomBytes(32).toString('hex');
  assert.throws(
    () => validateEnvironment({
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb://localhost/arcadia',
      JWT_SECRET: secret,
      FRONTEND_URL: 'http://example.com',
    }),
    /TLS|FRONTEND_URL|origin/i,
  );
  assert.throws(
    () => validateEnvironment({
      NODE_ENV: 'prodction',
      MONGODB_URI: 'mongodb://localhost/arcadia',
      JWT_SECRET: secret,
    }),
    /NODE_ENV/,
  );
  assert.throws(
    () => validateEnvironment({
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb+srv://cluster.example/arcadia?tls=true',
      JWT_SECRET: secret,
      FRONTEND_URL: 'https://example.com/path',
    }),
    /origin/i,
  );
});

test('production cookie and OAuth settings require secure explicit transport', () => {
  const script = `
    const refresh = require('./config/refreshCookie');
    const oauth = require('./config/oauthCookie');
    process.stdout.write(JSON.stringify({
      refresh: refresh.REFRESH_COOKIE_OPTIONS,
      oauth: oauth.OAUTH_STATE_COOKIE_OPTIONS,
    }));
  `;
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb+srv://cluster.example/arcadia?tls=true',
      JWT_SECRET: crypto.randomBytes(32).toString('hex'),
      FRONTEND_URL: 'https://accounts.example.com',
      CORS_ORIGIN: 'https://accounts.example.com',
      COOKIE_SAME_SITE: 'none',
      TRUST_PROXY: 'false',
    },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const options = JSON.parse(result.stdout);
  assert.equal(options.refresh.httpOnly, true);
  assert.equal(options.refresh.secure, true);
  assert.equal(options.refresh.sameSite, 'none');
  assert.equal(options.oauth.httpOnly, true);
  assert.equal(options.oauth.secure, true);
  assert.equal(options.oauth.sameSite, 'lax');
});

test('missing Google OAuth configuration returns a safe 503 instead of a generic server error', async () => {
  const server = await startHttpServer();
  const names = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REDIRECT_URI',
    'GOOGLE_FRONTEND_SUCCESS_URL',
  ];
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    const response = await requestJson(server, '/api/v1/auth/google');
    assert.equal(response.response.status, 503);
    assert.deepEqual(response.body, { error: 'Google OAuth is not configured' });
    assert.equal(response.response.headers.get('cache-control'), 'no-store');
  } finally {
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
    await stopHttpServer(server);
  }
});

/* ==================================================================
   ACCOUNT IDENTITY: normal signup, Google onboarding, My Profile save
   ================================================================== */

test('normal signup stores the entered username and serves it back from the database', async () => {
  const server = await startHttpServer();

  try {
    const registered = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        username: '  Ankit@Arcadia  ',
        email: 'identity-signup@example.com',
        password: 'identity-signup-password',
      },
    });

    assert.equal(registered.response.status, 201);
    assert.equal(registered.body.user.username, 'Ankit@Arcadia');
    assert.equal(registered.body.user.usernameSetupRequired, false);

    // The exact visible form is stored; the comparison value is only folded.
    const stored = await User.findOne({ email: 'identity-signup@example.com' })
      .select('+usernameNormalized');
    assert.equal(stored.username, 'Ankit@Arcadia');
    assert.equal(stored.usernameNormalized, 'ankit@arcadia');

    // A later session never has to trust a stale client value.
    const login = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'identity-signup@example.com', password: 'identity-signup-password' },
    });
    assert.equal(login.response.status, 200);
    assert.equal(login.body.user.username, 'Ankit@Arcadia');

    const profile = await requestJson(server, '/api/v1/account/profile', {
      headers: { authorization: `Bearer ${login.body.token}` },
    });
    assert.equal(profile.body.user.username, 'Ankit@Arcadia');
    assert.equal(profile.body.user.usernameSetupRequired, false);
  } finally {
    await stopHttpServer(server);
  }
});

test('a new Google account requires username setup until the username is stored', async () => {
  const server = await startHttpServer();

  try {
    const google = await signInWithGoogle(server);

    // Google sign-in alone never invents a username.
    assert.equal(google.user.username, null);
    assert.equal(google.user.usernameSetupRequired, true);
    assert.equal(
      (await User.findById(google.userId)).username,
      null,
      'no username is written by the OAuth flow',
    );

    // The onboarding state is visible on the profile response too.
    const beforeSetup = await requestJson(server, '/api/v1/account/profile', {
      headers: google.headers,
    });
    assert.equal(beforeSetup.response.status, 200);
    assert.equal(beforeSetup.body.user.username, null);
    assert.equal(beforeSetup.body.user.usernameSetupRequired, true);

    // A Google account can never take a username it already owns.
    const completed = await requestJson(server, '/api/v1/account/username', {
      method: 'PATCH',
      headers: google.headers,
      body: { username: '  Ｇoogle Player  ' },
    });
    assert.equal(completed.response.status, 200);
    assert.equal(completed.body.user.username, 'Ｇoogle Player');
    assert.equal(completed.body.user.usernameSetupRequired, false);

    const stored = await User.findById(google.userId).select('+usernameNormalized');
    assert.equal(stored.username, 'Ｇoogle Player');
    assert.equal(stored.usernameNormalized, 'ｇoogle player');

    // Setup stays complete for later sessions, and the Google identity is intact.
    const profile = await requestJson(server, '/api/v1/account/profile', {
      headers: google.headers,
    });
    assert.equal(profile.body.user.usernameSetupRequired, false);
    assert.equal(profile.body.user.authProvider, 'GOOGLE');
    assert.equal(profile.body.user.googleAvatarAvailable, true);
    const refreshedUser = await User.findById(google.userId);
    assert.equal(refreshedUser.google.subject, 'google-subject-123');
    assert.equal(refreshedUser.tokenVersion, 0);
  } finally {
    await stopHttpServer(server);
  }
});

test('the combined profile save persists username and avatar together', async () => {
  const server = await startHttpServer();

  try {
    const account = await registerAndLogin(server, 'combined-save@example.com');
    const userId = account.registered.body.user.id;
    const headers = { authorization: `Bearer ${account.loggedIn.body.token}` };

    const saved = await requestJson(server, '/api/v1/account/profile', {
      method: 'PATCH',
      headers,
      body: {
        username: 'Combined Save',
        avatar: { type: 'local', value: LOCAL_AVATAR_IDS[2] },
      },
    });

    assert.equal(saved.response.status, 200);
    assert.equal(saved.body.user.username, 'Combined Save');
    assert.deepEqual(saved.body.user.avatar, {
      type: 'local',
      value: LOCAL_AVATAR_IDS[2],
    });
    assertNoSensitiveFields(saved.body);

    const stored = await User.findById(userId).select('+usernameNormalized');
    assert.equal(stored.username, 'Combined Save');
    assert.equal(stored.usernameNormalized, 'combined save');
    assert.equal(stored.avatar.value, LOCAL_AVATAR_IDS[2]);

    // Reopening the profile reads the same values back from the database.
    const reopened = await requestJson(server, '/api/v1/account/profile', { headers });
    assert.equal(reopened.body.user.username, 'Combined Save');
    assert.equal(reopened.body.user.avatar.value, LOCAL_AVATAR_IDS[2]);
  } finally {
    await stopHttpServer(server);
  }
});

test('the combined profile save keeps a single username rule set and cooldown', async () => {
  const server = await startHttpServer();

  try {
    const owner = await registerAndLogin(server, 'combined-owner@example.com');
    await requestJson(server, '/api/v1/account/username', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${owner.loggedIn.body.token}` },
      body: { username: 'Taken_Name' },
    });
    const ownerId = owner.registered.body.user.id;
    const ownerAvatar = (await User.findById(ownerId)).avatar;

    const account = await registerAndLogin(server, 'combined-rules@example.com');
    const userId = account.registered.body.user.id;
    const headers = { authorization: `Bearer ${account.loggedIn.body.token}` };

    // Rejected usernames are rejected here too, and nothing is written.
    for (const username of ['', 'ab', 'admin', 'zero\u200bwidth', 'x'.repeat(21)]) {
      const rejected = await requestJson(server, '/api/v1/account/profile', {
        method: 'PATCH',
        headers,
        body: { username, avatar: { type: 'local', value: LOCAL_AVATAR_IDS[0] } },
      });
      assert.equal(rejected.response.status, 400, username);
    }
    const untouched = await User.findById(userId).select('+usernameNormalized');
    assert.equal(untouched.username, null);
    assert.equal(untouched.avatar.value, 'avatar-01');

    // A taken username is refused, and the avatar in the same request is not applied.
    const duplicate = await requestJson(server, '/api/v1/account/profile', {
      method: 'PATCH',
      headers,
      body: {
        username: 'TAKEN_NAME',
        avatar: { type: 'local', value: LOCAL_AVATAR_IDS[3] },
      },
    });
    assert.equal(duplicate.response.status, 409);
    assert.equal(duplicate.body.error, 'That username is already taken');
    const afterDuplicate = await User.findById(userId).select('+usernameNormalized');
    assert.equal(afterDuplicate.username, null);
    assert.equal(afterDuplicate.avatar.value, 'avatar-01');
    assert.equal((await User.findById(ownerId)).avatar.value, ownerAvatar.value);

    // A case-only change keeps the same comparison value but updates the visible form.
    await clearUsernameCooldown(userId);
    const first = await requestJson(server, '/api/v1/account/profile', {
      method: 'PATCH',
      headers,
      body: { username: 'Case_Only' },
    });
    assert.equal(first.response.status, 200);
    assert.equal(first.body.user.username, 'Case_Only');

    // The cooldown still applies to the combined save.
    const cooldown = await requestJson(server, '/api/v1/account/profile', {
      method: 'PATCH',
      headers,
      body: {
        username: 'case_only_two',
        avatar: { type: 'local', value: LOCAL_AVATAR_IDS[4] },
      },
    });
    assert.equal(cooldown.response.status, 429);
    assert.equal(cooldown.body.error, 'Username can be changed once every 60 seconds');
    const afterCooldown = await User.findById(userId).select('+usernameNormalized');
    assert.equal(afterCooldown.username, 'Case_Only');
    assert.equal(afterCooldown.avatar.value, 'avatar-01', 'the avatar was not applied');

    // An avatar-only save never consumes or blocks on the username cooldown.
    await clearUsernameCooldown(userId);
    const recased = await requestJson(server, '/api/v1/account/profile', {
      method: 'PATCH',
      headers,
      body: { username: 'case_only' },
    });
    assert.equal(recased.response.status, 200);
    assert.equal(recased.body.user.username, 'case_only');
    const avatarOnly = await requestJson(server, '/api/v1/account/profile', {
      method: 'PATCH',
      headers,
      body: { avatar: { type: 'local', value: LOCAL_AVATAR_IDS[4] } },
    });
    assert.equal(avatarOnly.response.status, 200);
    assert.equal(avatarOnly.body.user.avatar.value, LOCAL_AVATAR_IDS[4]);
    assert.equal(avatarOnly.body.user.username, 'case_only');

    // A suspended account is refused by the existing access-token middleware
    // before the profile write is ever reached, so no identity field can change.
    await User.updateOne(
      { _id: userId },
      { $set: { status: ACCOUNT_STATUSES.SUSPENDED } },
    );
    const inactive = await requestJson(server, '/api/v1/account/profile', {
      method: 'PATCH',
      headers,
      body: { username: 'suspended_change' },
    });
    assert.equal(inactive.response.status, 403);
    assert.equal(inactive.body.error, 'Account is inactive');
    const suspendedUser = await User.findById(userId).select('+usernameNormalized');
    assert.equal(suspendedUser.username, 'case_only');
    assert.equal(suspendedUser.avatar.value, LOCAL_AVATAR_IDS[4]);

    // The service refuses the same account when it is called directly.
    await assert.rejects(
      () => accountProfileService.updateProfile({
        userId,
        body: { username: 'suspended_change' },
      }),
      (error) => error && error.statusCode === 404,
    );
    assert.equal((await User.findById(userId)).username, 'case_only');
  } finally {
    await stopHttpServer(server);
  }
});

test('a failed profile save leaves the stored profile completely intact', async () => {
  const server = await startHttpServer();

  try {
    const account = await registerAndLogin(server, 'failed-save@example.com');
    const userId = account.registered.body.user.id;
    const headers = { authorization: `Bearer ${account.loggedIn.body.token}` };

    await requestJson(server, '/api/v1/account/username', {
      method: 'PATCH',
      headers,
      body: { username: 'Original Name' },
    });
    await requestJson(server, '/api/v1/account/avatar', {
      method: 'PATCH',
      headers,
      body: { type: 'local', value: LOCAL_AVATAR_IDS[1] },
    });
    const before = await requestJson(server, '/api/v1/account/profile', { headers });
    assert.equal(before.body.user.username, 'Original Name');

    const rejectedBodies = [
      { username: 'Replacement', avatar: { type: 'local', value: 'avatar-99' } },
      { username: 'Replacement', avatar: { type: 'url', value: 'https://evil.example/a.png' } },
      { username: 'Replacement', avatar: { type: 'google' } },
      { username: 'Replacement', avatar: { type: 'local', value: 'avatar-02', url: 'https://evil.example/a.png' } },
      { username: 'Replacement', displayName: 'Bad\u0001Name' },
      { displayName: 'Fine Name', totalXp: 999999 },
    ];

    for (const body of rejectedBodies) {
      const response = await requestJson(server, '/api/v1/account/profile', {
        method: 'PATCH',
        headers,
        body,
      });
      assert.ok(response.response.status >= 400, JSON.stringify(body));
      assert.ok(response.response.status < 500, JSON.stringify(body));
    }

    const stored = await User.findById(userId).select('+usernameNormalized');
    assert.equal(stored.username, 'Original Name');
    assert.equal(stored.usernameNormalized, 'original name');
    assert.equal(stored.avatar.value, LOCAL_AVATAR_IDS[1]);
    assert.equal(stored.displayName, 'Session User');
    assert.equal(stored.totalXp, 0);

    // A no-op save is reported as a success and writes nothing.
    const noChange = await requestJson(server, '/api/v1/account/profile', {
      method: 'PATCH',
      headers,
      body: { username: 'Original Name', avatar: { type: 'local', value: LOCAL_AVATAR_IDS[1] } },
    });
    assert.equal(noChange.response.status, 200);
    assert.equal(noChange.body.user.username, 'Original Name');
    assert.equal(noChange.body.user.avatar.value, LOCAL_AVATAR_IDS[1]);

    const empty = await requestJson(server, '/api/v1/account/profile', {
      method: 'PATCH',
      headers,
      body: {},
    });
    assert.equal(empty.response.status, 400);
  } finally {
    await stopHttpServer(server);
  }
});

/* ==================================================================
   XP, LEVEL, BADGE AND TITLE
   ================================================================== */

test('a new account starts with zero XP at Level 0', async () => {
  const server = await startHttpServer();

  try {
    const created = await User.create({ email: 'xp-start@example.com', name: 'XP Starter' });
    assert.equal(created.totalXp, 0);

    const registered = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        username: 'xp_starter',
        email: 'xp-start-signup@example.com',
        password: 'xp-start-password',
      },
    });
    assert.equal(registered.response.status, 201);
    assert.equal(registered.body.user.progression.totalXp, 0);
    assert.equal(registered.body.user.progression.level, 0);
    assert.equal(registered.body.user.progression.title, 'Arcadia Rookie');
    assert.equal((await User.findOne({ email: 'xp-start-signup@example.com' })).totalXp, 0);

    // XP is not part of the account profile identity surface.
    const account = await registerAndLogin(server, 'xp-start-account@example.com');
    const profile = await requestJson(server, '/api/v1/account/profile', {
      headers: { authorization: `Bearer ${account.loggedIn.body.token}` },
    });
    assert.equal(profile.body.user.progression.totalXp, 0);
    assert.equal(profile.body.user.progression.level, 0);
    assert.equal(profile.body.user.progression.currentLevelXp, 0);
    assert.equal(profile.body.user.progression.nextLevelXp, 100);
    assert.equal(profile.body.user.progression.progressPercent, 0);
  } finally {
    await stopHttpServer(server);
  }
});

test('total XP maps to the documented level at every exact boundary', () => {
  const boundaries = [
    [0, 0],
    [1, 0],
    [99, 0],
    [100, 1],
    [299, 1],
    [300, 2],
    [599, 2],
    [600, 3],
    [999, 3],
    [1000, 4],
    [1499, 4],
    [1500, 5],
    [2049, 5],
    [2050, 6],
    [2649, 6],
    [2650, 7],
    [3299, 7],
    [3300, 8],
    [3999, 8],
    [4000, 9],
  ];

  for (const [totalXp, level] of boundaries) {
    assert.equal(getLevelFromTotalXp(totalXp), level, `${totalXp} XP`);
    assert.equal(getProgression(totalXp).level, level, `${totalXp} XP`);
  }

  // One XP below a cumulative boundary never reaches that level.
  for (let level = 1; level <= 10; level += 1) {
    const cumulative = getCumulativeXpForLevel(level);
    assert.equal(getLevelFromTotalXp(cumulative - 1), level - 1, `${cumulative - 1} XP`);
  }
});

test('the per-level XP requirement steps up by 50 after Level 5', () => {
  const requirements = [];
  for (let level = 0; level <= 12; level += 1) {
    requirements.push(getXpToAdvanceFromLevel(level));
  }

  assert.deepEqual(requirements, [
    100, 200, 300, 400, 500, 550, 600, 650, 700, 750, 800, 850, 900,
  ]);

  // The cumulative total is what the level is actually derived from.
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(getCumulativeXpForLevel),
    [0, 100, 300, 600, 1000, 1500, 2050, 2650, 3300, 4000, 4750],
  );

  // Each level is reached at exactly the cumulative total, and the XP already
  // banked inside a level never reaches the next level's requirement.
  for (let level = 1; level <= 40; level += 1) {
    const cumulative = getCumulativeXpForLevel(level);
    assert.equal(getLevelFromTotalXp(cumulative), level, `level ${level}`);
    assert.equal(
      getLevelFromTotalXp(cumulative + getXpToAdvanceFromLevel(level) - 1),
      level,
      `level ${level} top`,
    );
  }
});

test('progression is deterministic and never produces NaN or Infinity', () => {
  const unusable = [undefined, null, -1, -0.5, -1e9, NaN, Infinity, -Infinity, 'abc', {}];
  for (const value of unusable) {
    const progression = getProgression(value);
    assert.equal(progression.totalXp, 0, String(value));
    assert.equal(progression.level, 0, String(value));
    assert.equal(progression.currentLevelXp, 0, String(value));
    assert.equal(progression.nextLevelXp, 100, String(value));
    assert.equal(progression.progressPercent, 0, String(value));
  }

  assert.equal(normalizeTotalXp(Number.MAX_SAFE_INTEGER), MAX_TOTAL_XP);
  assert.equal(normalizeTotalXp(1e30), MAX_TOTAL_XP);

  // Very high totals stay finite, stay at Level 0 for a hostile negative input
  // and never overflow into a broken progress bar.
  for (const totalXp of [1e6, 1e9, 1e12, 1e15, MAX_TOTAL_XP]) {
    for (const view of [getProgression(totalXp), getProgression(-totalXp)]) {
      assert.ok(Number.isFinite(view.progressPercent), String(totalXp));
      assert.ok(Number.isFinite(view.currentLevelXp), String(totalXp));
      assert.ok(Number.isFinite(view.nextLevelXp), String(totalXp));
      assert.ok(Number.isInteger(view.level) && view.level >= 0, String(totalXp));
      assert.ok(view.progressPercent >= 0 && view.progressPercent <= 100, String(totalXp));
    }
  }

  // Identical input always produces an identical view.
  for (const totalXp of [0, 20, 99, 100, 2050, 40000]) {
    assert.deepEqual(getProgression(totalXp), getProgression(totalXp), String(totalXp));
  }

  // Progress is reported inside the current level only.
  assert.deepEqual(getProgression(180), {
    totalXp: 180,
    level: 1,
    currentLevelXp: 80,
    nextLevelXp: 200,
    progressPercent: 40,
    title: 'Arcadia Rookie',
    badgeKey: 'bronze',
    themeKey: 'bronze',
  });
  assert.equal(getProgression(199).progressPercent, 50);
  assert.equal(getProgression(200).progressPercent, 50);
  assert.equal(getProgression(299).progressPercent, 100);
  // Crossing into the next level resets the bar instead of exceeding 100%.
  assert.equal(getProgression(300).currentLevelXp, 0);
  assert.equal(getProgression(300).progressPercent, 0);
});

test('every level maps to the documented badge, title and theme', () => {
  const expectedTiers = [
    { maxLevel: 4, title: 'Arcadia Rookie', badgeKey: 'bronze', themeKey: 'bronze' },
    { maxLevel: 9, title: 'Arcadia Challenger', badgeKey: 'silver', themeKey: 'silver' },
    { maxLevel: 14, title: 'Arcadia Veteran', badgeKey: 'gold', themeKey: 'gold' },
    { maxLevel: 19, title: 'Arcadia Master', badgeKey: 'diamond', themeKey: 'diamond' },
    { maxLevel: 29, title: 'Arcadia Legend', badgeKey: 'crown', themeKey: 'crown' },
    { maxLevel: null, title: 'Arcadia Supreme', badgeKey: 'flame', themeKey: 'flame' },
  ];

  assert.equal(LEVEL_BADGE_TIERS.length, expectedTiers.length);
  for (const [index, tier] of LEVEL_BADGE_TIERS.entries()) {
    assert.equal(tier.minLevel, index === 0 ? 0 : expectedTiers[index - 1].maxLevel + 1);
    assert.equal(tier.maxLevel, expectedTiers[index].maxLevel);
    assert.equal(tier.title, expectedTiers[index].title);
    assert.equal(tier.badgeKey, expectedTiers[index].badgeKey);
    assert.equal(tier.themeKey, expectedTiers[index].themeKey);
  }

  // Every level from 0 to 200, plus the open ended top tier, resolves a tier.
  for (let level = 0; level <= 200; level += 1) {
    const expected = expectedTiers.find(
      (tier) => tier.maxLevel === null || level <= tier.maxLevel,
    );
    const badge = getLevelBadge(level);
    assert.equal(badge.title, expected.title, `level ${level}`);
    assert.equal(badge.badgeKey, expected.badgeKey, `level ${level}`);
    assert.equal(badge.themeKey, expected.themeKey, `level ${level}`);

    const progression = getProgression(getCumulativeXpForLevel(level));
    assert.equal(progression.title, expected.title, `level ${level}`);
    assert.equal(progression.badgeKey, expected.badgeKey, `level ${level}`);
    assert.equal(progression.themeKey, expected.themeKey, `level ${level}`);
  }

  // The animated flame tier is a stable key only; no animation is decided here.
  assert.deepEqual(Object.keys(getLevelBadge(30)).sort(), [
    'badgeKey',
    'maxLevel',
    'minLevel',
    'themeKey',
    'title',
  ]);
  assert.equal(getLevelBadge(5000).badgeKey, 'flame');
  assert.equal(getLevelBadge(5000).title, 'Arcadia Supreme');
  // A hostile or missing level still resolves the first tier instead of crashing.
  assert.equal(getLevelBadge(-5).title, 'Arcadia Rookie');
  assert.equal(getLevelBadge(undefined).title, 'Arcadia Rookie');
});

test('the account profile response carries progression and no security fields', async () => {
  const server = await startHttpServer();

  try {
    const account = await registerAndLogin(server, 'progression-profile@example.com');
    const userId = account.registered.body.user.id;
    const headers = { authorization: `Bearer ${account.loggedIn.body.token}` };

    const awarded = await recordArcadionResult(userId, { reference: 'test:one-win' });
    assert.equal(awarded.awardedXp, 20);
    assert.equal(awarded.reason, XP_AWARD_REASONS.ARCADION_WIN);
    assert.equal(awarded.progression.totalXp, 20);
    assert.equal(awarded.progression.level, 0);

    const profile = await requestJson(server, '/api/v1/account/profile', { headers });
    assert.equal(profile.response.status, 200);
    assert.deepEqual(
      Object.keys(profile.body.user.progression).sort(),
      [
        'badgeKey',
        'currentLevelXp',
        'level',
        'nextLevelXp',
        'progressPercent',
        'themeKey',
        'title',
        'totalXp',
      ],
    );
    assert.equal(profile.body.user.progression.totalXp, 20);
    assert.equal(profile.body.user.progression.level, 0);
    assert.equal(profile.body.user.progression.currentLevelXp, 20);
    assert.equal(profile.body.user.progression.nextLevelXp, 100);
    assert.equal(profile.body.user.progression.progressPercent, 20);
    assert.equal(profile.body.user.progression.title, 'Arcadia Rookie');
    assert.equal(profile.body.user.progression.badgeKey, 'bronze');
    assert.equal(profile.body.user.progression.themeKey, 'bronze');

    // Gaming statistics are present but neutral: no game data is invented.
    assert.deepEqual(profile.body.user.gamingStats, {
      gamesPlayed: 0,
      gamesWon: 0,
      totalScore: 0,
      bestScore: 0,
      currentStreak: 0,
      winRatePercent: 0,
    });

    // Identity, joined date and provider still come from the same record.
    assert.equal(profile.body.user.id, userId);
    assert.equal(profile.body.user.email, 'progression-profile@example.com');
    assert.equal(profile.body.user.authProvider, 'PASSWORD');
    assert.equal(profile.body.user.avatar.type, 'local');
    assert.ok(profile.body.user.createdAt);

    assertNoSensitiveFields(profile.body);

    // Progression is the only new surface, and it stays free of security fields.
    const serialized = JSON.stringify(profile.body);
    for (const field of [
      'passwordHash', 'tokenVersion', 'usernameNormalized',
      'usernameChangedAt', '"google"', 'pictureUrl', '"subject"', 'lastLoginIp',
    ]) {
      assert.equal(serialized.includes(field), false, `${field} must not be serialized`);
    }
  } finally {
    await stopHttpServer(server);
  }
});

test('the auth responses carry the same progression as the profile', async () => {
  const server = await startHttpServer();

  try {
    const account = await registerAndLogin(server, 'progression-auth@example.com');
    await recordArcadionResult(account.registered.body.user.id);

    const me = await requestJson(server, '/api/v1/auth/me', {
      headers: { authorization: `Bearer ${account.loggedIn.body.token}` },
    });
    assert.equal(me.body.progression.totalXp, 20);
    assert.equal(me.body.progression.level, 0);
    assert.equal(me.body.gamingStats, undefined, 'gaming stats stay on the profile only');

    const refreshed = await requestJson(server, '/api/v1/auth/refresh', {
      method: 'POST',
      headers: { cookie: `${REFRESH_COOKIE_NAME}=${account.refreshCookie}` },
    });
    assert.equal(refreshed.response.status, 200);
    assert.equal(refreshed.body.user.progression.totalXp, 20);
    assert.equal(refreshed.body.user.username, null);
  } finally {
    await stopHttpServer(server);
  }
});

test('XP can never be assigned arbitrarily by a client', async () => {
  const server = await startHttpServer();

  try {
    const account = await registerAndLogin(server, 'xp-client@example.com');
    const userId = account.registered.body.user.id;
    const headers = {
      authorization: `Bearer ${account.loggedIn.body.token}`,
      cookie: `${REFRESH_COOKIE_NAME}=${account.refreshCookie}`,
    };

    // No account endpoint accepts an XP field, on any route or verb.
    const attempts = [
      { path: '/api/v1/account/profile', method: 'PATCH', body: { totalXp: 5000 } },
      { path: '/api/v1/account/profile', method: 'PATCH', body: { xp: 5000 } },
      { path: '/api/v1/account/profile', method: 'PATCH', body: { level: 12, title: 'Arcadia Supreme', badgeKey: 'flame' } },
      { path: '/api/v1/account/username', method: 'PATCH', body: { username: 'xp_client', totalXp: 5000 } },
      { path: '/api/v1/account/avatar', method: 'PATCH', body: { type: 'local', value: 'avatar-02', totalXp: 5000 } },
      // A client cannot report a match outcome either.
      { path: '/api/v1/account/profile', method: 'PATCH', body: { result: 'WIN' } },
      { path: '/api/v1/account/profile', method: 'PATCH', body: { game: 'arcadion', verified: true, result: 'WIN' } },
      { path: '/api/v1/account/username', method: 'PATCH', body: { username: 'xp_client', game: 'arcadion', result: 'WIN' } },
    ];

    for (const attempt of attempts) {
      const response = await requestJson(server, attempt.path, {
        method: attempt.method,
        headers,
        body: attempt.body,
      });
      assert.equal(response.response.status, 400, `${attempt.method} ${attempt.path}`);
      assert.equal(response.body.error, 'Request contains unsupported fields');
    }

    // The settings response is read-only: it is not an XP write surface either.
    const settingsWrite = await requestJson(server, '/api/v1/account/settings', {
      method: 'PATCH',
      headers,
      body: { totalXp: 5000 },
    });
    assert.equal(settingsWrite.response.status, 404);

    // There is no XP endpoint at all: any guess is a 404, never a mutation.
    for (const path of [
      '/api/v1/account/xp',
      '/api/v1/account/progression',
      '/api/v1/account/level',
      '/api/v1/account/arcadion',
      '/api/v1/account/arcadion/result',
      '/api/v1/account/arcadion/win',
      '/api/v1/xp',
      '/api/v1/account/award-xp',
    ]) {
      for (const method of ['GET', 'POST', 'PATCH']) {
        const response = await requestJson(server, path, {
          method,
          headers,
          body: method === 'GET' ? undefined : { amount: 5000, totalXp: 5000 },
        });
        assert.equal(response.response.status, 404, `${method} ${path}`);
      }
    }

    // Registration cannot smuggle one in either.
    const registered = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        username: 'xp_smuggle',
        email: 'xp-smuggle@example.com',
        password: 'xp-smuggle-password',
        totalXp: 5000,
        level: 12,
      },
    });
    assert.equal(registered.response.status, 201);
    assert.equal(registered.body.user.progression.totalXp, 0);
    assert.equal((await User.findOne({ email: 'xp-smuggle@example.com' })).totalXp, 0);

    assert.equal((await User.findById(userId)).totalXp, 0);
  } finally {
    await stopHttpServer(server);
  }
});

test('XP can never become negative and is only granted server-side', async () => {
  const server = await startHttpServer();

  try {
    const account = await registerAndLogin(server, 'xp-negative@example.com');
    const userId = account.registered.body.user.id;

    // The schema refuses a negative or fractional total outright.
    for (const invalidXp of [-1, -500, 1.5]) {
      await assert.rejects(
        () => User.updateOne(
          { _id: userId },
          { $set: { totalXp: invalidXp } },
          { runValidators: true },
        ),
        (error) => error && error.name === 'ValidationError',
        `totalXp ${String(invalidXp)}`,
      );
    }
    // A non-numeric total cannot even be cast into the field.
    await assert.rejects(
      () => User.updateOne(
        { _id: userId },
        { $set: { totalXp: 'many' } },
        { runValidators: true },
      ),
      (error) => error && error.name === 'CastError',
    );
    await assert.rejects(
      () => User.create({ email: 'xp-negative-create@example.com', totalXp: -1 }),
      (error) => error && error.name === 'ValidationError',
    );
    assert.equal((await User.findById(userId)).totalXp, 0);

    /*
     * A total that was corrupted outside the schema degrades to a clean Level 0
     * account instead of leaking NaN, and the grant service refuses to build on
     * it, so a malformed value can never be turned into progression.
     */
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { $set: { totalXp: 'malformed' } },
    );
    const malformedProfile = await requestJson(server, '/api/v1/account/profile', {
      headers: { authorization: `Bearer ${account.loggedIn.body.token}` },
    });
    assert.equal(malformedProfile.response.status, 200);
    assert.equal(malformedProfile.body.user.progression.totalXp, 0);
    assert.equal(malformedProfile.body.user.progression.level, 0);
    assert.equal(malformedProfile.body.user.progression.progressPercent, 0);
    await assert.rejects(
      () => recordArcadionResult(userId),
      (error) => error && error.statusCode === 404,
    );
    assert.equal(
      (await User.collection.findOne({ _id: new mongoose.Types.ObjectId(userId) })).totalXp,
      'malformed',
    );
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { $set: { totalXp: 0 } },
    );

    // The only exported entry point refuses an unusable target account.
    await assert.rejects(
      () => recordArcadionResult('not-an-object-id'),
      (error) => error && error.statusCode === 400,
    );
    await assert.rejects(
      () => recordArcadionResult('000000000000000000000000'),
      (error) => error && error.statusCode === 404,
    );
    assert.equal((await User.findById(userId)).totalXp, 0);

    // A total that was corrupted outside the schema is never incremented, and a
    // suspended account is never awarded.
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { $set: { totalXp: -500 } },
    );
    await assert.rejects(
      () => recordArcadionResult(userId),
      (error) => error && error.statusCode === 404,
    );
    assert.equal((await User.findById(userId)).totalXp, -500);
    // Even a corrupted negative total is reported as a clean Level 0 account.
    assert.equal(getProgression((await User.findById(userId)).totalXp).level, 0);
    assert.equal(getProgression((await User.findById(userId)).totalXp).totalXp, 0);

    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { $set: { totalXp: 0, status: ACCOUNT_STATUSES.SUSPENDED } },
    );
    await assert.rejects(
      () => recordArcadionResult(userId),
      (error) => error && error.statusCode === 404,
    );
    assert.equal((await User.findById(userId)).totalXp, 0);
  } finally {
    await stopHttpServer(server);
  }
});

test('only a verified Arcadion win awards XP', async () => {
  const server = await startHttpServer();

  try {
    const account = await registerAndLogin(server, 'arcadion-only@example.com');
    const userId = account.registered.body.user.id;
    const expectStoredTotal = async (expected) => {
      assert.equal((await User.findById(userId)).totalXp, expected);
    };

    // A loss never moves the total, however many are recorded.
    for (const result of [MATCH_RESULTS.LOSS, MATCH_RESULTS.DRAW, 'win', 'WON', null, undefined, '']) {
      const outcome = await recordArcadionResult(userId, { result });
      assert.equal(outcome.awardedXp, 0, String(result));
      assert.equal(outcome.reason, XP_AWARD_REASONS.NOT_A_WIN, String(result));
      assert.equal(outcome.progression.level, 0, String(result));
      await expectStoredTotal(0);
    }

    // Any non-Arcadion match never moves the total, even a win.
    for (const game of ['ludo', 'tic-tac-toe', 'memory', 'snake-ladder', 'friends', '', null, undefined, 'ARCADION']) {
      const outcome = await recordArcadionResult(userId, { game });
      assert.equal(outcome.awardedXp, 0, String(game));
      assert.equal(outcome.reason, XP_AWARD_REASONS.NOT_ARCADION, String(game));
      await expectStoredTotal(0);
    }

    // An unverified Arcadion win never moves the total.
    for (const verified of [false, undefined, null, 0, 'true', 1]) {
      const outcome = await recordArcadionResult(userId, { verified });
      assert.equal(outcome.awardedXp, 0, String(verified));
      assert.equal(outcome.reason, XP_AWARD_REASONS.UNVERIFIED, String(verified));
      await expectStoredTotal(0);
    }

    // Only the exact verified ARCADION win grants the reward.
    const win = await recordArcadionResult(userId);
    assert.equal(win.awardedXp, XP_REWARDS.ARCADION_WIN);
    assert.equal(XP_REWARDS.ARCADION_WIN, 20);
    assert.equal(win.reason, XP_AWARD_REASONS.ARCADION_WIN);
    assert.equal(win.progression.totalXp, 20);
    await expectStoredTotal(20);

    // And the level only moves once the threshold is actually reached.
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { $set: { totalXp: 80 } },
    );
    const beforeThreshold = await recordArcadionResult(userId);
    assert.equal(beforeThreshold.awardedXp, 20);
    assert.equal(beforeThreshold.progression.totalXp, 100);
    assert.equal(beforeThreshold.progression.level, 1, 'the fifth win crosses into Level 1');
    await expectStoredTotal(100);

    // A loss after that changes nothing.
    const afterLoss = await recordArcadionResult(userId, { result: MATCH_RESULTS.LOSS });
    assert.equal(afterLoss.awardedXp, 0);
    assert.equal(afterLoss.progression.level, 1);
    await expectStoredTotal(100);

    // The service exposes no way to name a different amount or source.
    assert.equal(progressionService.awardXp, undefined);
    assert.deepEqual(Object.keys(XP_GRANT_SOURCES), ['ARCADION_WIN']);
    assert.deepEqual(XP_REWARDS, { ARCADION_WIN: 20 });
  } finally {
    await stopHttpServer(server);
  }
});

test('XP awards are atomic and keep progression consistent with the stored total', async () => {
  const server = await startHttpServer();

  try {
    const account = await registerAndLogin(server, 'xp-atomic@example.com');
    const userId = account.registered.body.user.id;

    // Five verified Arcadion wins recorded at the same time all land.
    const awards = await Promise.all(
      Array.from({ length: 5 }, () => recordArcadionResult(userId)),
    );
    assert.equal((await User.findById(userId)).totalXp, 100);
    // Each concurrent award reports the total as of its own write, so the
    // reported values form the whole run rather than all being the final total.
    const reportedTotals = awards.map((award) => award.progression.totalXp);
    assert.equal(Math.max(...reportedTotals), 100);
    assert.equal(new Set(reportedTotals).size, 5, reportedTotals.join(','));
    for (const reported of reportedTotals) {
      assert.equal(reported % XP_REWARDS.ARCADION_WIN, 0, String(reported));
      assert.ok(
        reported >= XP_REWARDS.ARCADION_WIN && reported <= 100,
        String(reported),
      );
    }

    const profile = await requestJson(server, '/api/v1/account/profile', {
      headers: { authorization: `Bearer ${account.loggedIn.body.token}` },
    });
    assert.equal(profile.body.user.progression.totalXp, 100);
    assert.equal(profile.body.user.progression.level, 1);
    assert.equal(profile.body.user.progression.currentLevelXp, 0);
    assert.equal(profile.body.user.progression.nextLevelXp, 200);
    // Level 1 still sits in the first badge tier; Challenger starts at Level 5.
    assert.equal(profile.body.user.progression.title, 'Arcadia Rookie');
    assert.equal(profile.body.user.progression.badgeKey, 'bronze');
    assert.equal(getLevelBadge(1).title, 'Arcadia Rookie');
    assert.equal(getProgression(1500).title, 'Arcadia Challenger');
    assert.equal(getProgression(1500).badgeKey, 'silver');
    assert.equal(getProgression(1500).themeKey, 'silver');

    // The view always matches the stored total, for every awardable amount.
    for (const totalXp of [1500, 2050, 3300, 4750]) {
      await User.collection.updateOne(
        { _id: new mongoose.Types.ObjectId(userId) },
        { $set: { totalXp } },
      );
      const updated = await accountProfileService.getProfile(userId);
      assert.equal(updated.progression.totalXp, totalXp);
      assert.equal(updated.progression.level, getLevelFromTotalXp(totalXp));
      assert.equal(
        updated.progression.title,
        getLevelBadge(getLevelFromTotalXp(totalXp)).title,
      );
      // Identity is untouched by a progression-only change.
      assert.equal(updated.email, 'xp-atomic@example.com');
      assert.equal(updated.tokenVersion, undefined);
    }
  } finally {
    await stopHttpServer(server);
  }
});

/* ==================================================================
   ARCADIA PLAYER ID
   ================================================================== */

test('generated Player IDs are well formed, random and never sequential', () => {
  const seen = new Set();
  const generated = [];

  for (let index = 0; index < 2000; index += 1) {
    const playerId = generatePlayerId();
    generated.push(playerId);
    seen.add(playerId);

    // The approved ARC-XXXXXXXX format.
    assert.match(playerId, /^ARC-[A-Z0-9]{8}$/, playerId);
    assert.equal(isValidPlayerId(playerId), true, playerId);
    // Confusable characters are never produced.
    assert.equal(/[IO01]/.test(playerId.slice(4)), false, playerId);
    // The body is drawn from the documented alphabet only.
    for (const character of playerId.slice(4)) {
      assert.equal(PLAYER_ID_ALPHABET.includes(character), true, character);
    }
  }

  // 2000 draws from ~1.1e12 possibilities must all be distinct.
  assert.equal(seen.size, 2000);

  // The alphabet is a power of two, which is what keeps the mapping unbiased.
  assert.equal(PLAYER_ID_ALPHABET.length, 32);
  // The prefix never varies.
  assert.equal(new Set(generated.map((id) => id.slice(0, 4))).size, 1);
  // Not a sequential counter: many different bodies across the range.
  assert.ok(new Set(generated.map((id) => id.slice(4, 6))).size > 400);

  for (const invalid of [
    '', 'ARC-', 'ARC-1234567', 'ARC-123456789', 'arc-7K4M2P9Q',
    'ARC-7k4m2p9q', 'ARC-7K4M2P9', 'ARC-7K4M2P9QA', 'ARC-7K4M2P9!',
    '000000000000000000000001', 'ARC-7K4M2P9Q0', 'ARC-7K4M2P9OI',
  ]) {
    assert.equal(isValidPlayerId(invalid), false, invalid);
    assert.equal(PLAYER_ID_PATTERN.test(invalid), false, invalid);
  }
});

test('a new password signup automatically receives a permanent Player ID', async () => {
  const server = await startHttpServer();

  try {
    const registered = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        username: 'player_one',
        email: 'player-one@example.com',
        password: 'player-one-password',
      },
    });

    assert.equal(registered.response.status, 201);
    const playerId = registered.body.user.playerId;
    assert.equal(isValidPlayerId(playerId), true, String(playerId));

    const stored = await User.findOne({ email: 'player-one@example.com' });
    assert.equal(stored.playerId, playerId);

    // The Player ID is never derived from the database id.
    assert.notEqual(playerId, String(stored._id));
    assert.equal(playerId.includes(String(stored._id)), false);

    // It is not the email, the username or anything else account specific.
    assert.equal(playerId.includes('player-one@example.com'), false);
    assert.equal(playerId.includes('player_one'), false);
  } finally {
    await stopHttpServer(server);
  }
});

test('a new Google account automatically receives a permanent Player ID', async () => {
  const server = await startHttpServer();

  try {
    const google = await signInWithGoogle(server);
    const playerId = google.user.playerId;

    assert.equal(isValidPlayerId(playerId), true, String(playerId));
    const stored = await User.findById(google.userId);
    assert.equal(stored.playerId, playerId);
    assert.notEqual(playerId, String(stored._id));

    // Completing username onboarding does not change it.
    const completed = await requestJson(server, '/api/v1/account/username', {
      method: 'PATCH',
      headers: google.headers,
      body: { username: 'google_player' },
    });
    assert.equal(completed.response.status, 200);
    assert.equal(completed.body.user.playerId, playerId);
  } finally {
    await stopHttpServer(server);
  }
});

test('Player IDs are unique across accounts and across sign-up paths', async () => {
  const server = await startHttpServer();

  try {
    // Kept under the per-IP registration rate limit.
    const created = [];
    for (let index = 0; index < 12; index += 1) {
      const response = await requestJson(server, '/api/v1/auth/register', {
        method: 'POST',
        body: {
          username: `unique_${index}`,
          email: `unique-${index}@example.com`,
          password: 'unique-player-password',
        },
      });
      assert.equal(response.response.status, 201, `unique-${index}`);
      created.push(response.body.user.playerId);
    }

    const google = await signInWithGoogle(server);
    created.push(google.user.playerId);

    assert.equal(new Set(created).size, created.length, 'every Player ID is distinct');
    for (const playerId of created) {
      assert.equal(await User.countDocuments({ playerId }), 1, playerId);
    }
  } finally {
    await stopHttpServer(server);
  }
});

test('the unique index rejects duplicates and a collision is retried, never accepted', async () => {
  // The unique index is what makes a collision detectable at all.
  await User.create({ email: 'index-first@example.com' });
  const taken = (await User.findOne({ email: 'index-first@example.com' })).playerId;

  await assert.rejects(
    () => User.collection.insertOne({
      email: 'index-second@example.com',
      playerId: taken,
      role: 'USER',
      status: 'ACTIVE',
    }),
    (error) => error && error.code === 11000
      && Object.prototype.hasOwnProperty.call(error.keyPattern || {}, 'playerId'),
  );

  // A single collision is recovered transparently with a fresh ID.
  const attempts = [];
  const recovered = await playerIdService.createUserWithPlayerId(
    { email: 'collision-recovered@example.com', role: 'USER', status: 'ACTIVE' },
    {
      generateId: () => {
        attempts.push(true);
        return attempts.length === 1 ? taken : generatePlayerId();
      },
    },
  );
  assert.equal(attempts.length, 2, 'the insert was retried exactly once');
  assert.equal(isValidPlayerId(recovered.playerId), true);
  assert.notEqual(recovered.playerId, taken);
  assert.equal(await User.countDocuments({ playerId: taken }), 1, 'no duplicate was stored');

  // A collision that never clears is reported rather than silently accepted.
  const stuckAttempts = [];
  await assert.rejects(
    () => playerIdService.createUserWithPlayerId(
      { email: 'collision-stuck@example.com', role: 'USER', status: 'ACTIVE' },
      {
        generateId: () => {
          stuckAttempts.push(true);
          return taken;
        },
      },
    ),
    (error) => error && error.code === 11000,
  );
  assert.equal(stuckAttempts.length, playerIdService.MAX_PLAYER_ID_ATTEMPTS);
  assert.equal(await User.countDocuments({ email: 'collision-stuck@example.com' }), 0);

  // An unrelated conflict is re-thrown untouched, so callers keep their mapping.
  await assert.rejects(
    () => playerIdService.createUserWithPlayerId(
      { email: 'index-first@example.com', role: 'USER', status: 'ACTIVE' },
      { generateId: () => generatePlayerId() },
    ),
    (error) => error && error.code === 11000
      && Object.prototype.hasOwnProperty.call(error.keyPattern || {}, 'email'),
  );
});

test('the backfill also recovers from a Player ID collision', async () => {
  const keeper = await User.create({ email: 'backfill-collision-keeper@example.com' });
  const taken = keeper.playerId;

  await User.collection.insertOne({
    email: 'backfill-collision-target@example.com',
    role: 'USER',
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const attempts = [];
  const result = await backfillMissingPlayerIds({
    generateId: () => {
      attempts.push(true);
      return attempts.length === 1 ? taken : generatePlayerId();
    },
  });

  assert.equal(result.failed, 0, JSON.stringify(result));
  assert.equal(result.assigned, 1, JSON.stringify(result));
  assert.equal(attempts.length, 2, 'the backfill regenerated the colliding ID');
  const filled = await User.findOne({ email: 'backfill-collision-target@example.com' });
  assert.equal(isValidPlayerId(filled.playerId), true);
  assert.notEqual(filled.playerId, taken);
  assert.equal(await User.countDocuments({ playerId: taken }), 1);
});

test('a Player ID never changes across the whole account lifecycle', async () => {
  const server = await startHttpServer();

  try {
    const registered = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        username: 'lifecycle_user',
        email: 'lifecycle@example.com',
        password: 'lifecycle-password',
      },
    });
    const playerId = registered.body.user.playerId;
    const userId = registered.body.user.id;
    const headers = { authorization: `Bearer ${registered.body.token}` };

    const me = await requestJson(server, '/api/v1/auth/me', { headers });
    assert.equal(me.body.playerId, playerId, 'auth/me');

    const refreshed = await requestJson(server, '/api/v1/auth/refresh', {
      method: 'POST',
      headers: { cookie: `${REFRESH_COOKIE_NAME}=${getRefreshCookie(registered.response)}` },
    });
    assert.equal(refreshed.body.user.playerId, playerId, 'refresh');

    const profile = await requestJson(server, '/api/v1/account/profile', { headers });
    assert.equal(profile.body.user.playerId, playerId, 'profile');

    const settings = await requestJson(server, '/api/v1/account/settings', { headers });
    assert.equal(settings.body.settings.playerId, playerId, 'settings');

    const login = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'lifecycle@example.com', password: 'lifecycle-password' },
    });
    assert.equal(login.body.user.playerId, playerId, 'login');

    // Username change, avatar change and display name change.
    await clearUsernameCooldown(userId);
    const usernameChange = await requestJson(server, '/api/v1/account/username', {
      method: 'PATCH',
      headers,
      body: { username: 'lifecycle_renamed' },
    });
    assert.equal(usernameChange.body.user.playerId, playerId, 'username change');

    const avatarChange = await requestJson(server, '/api/v1/account/avatar', {
      method: 'PATCH',
      headers,
      body: { type: 'local', value: LOCAL_AVATAR_IDS[2] },
    });
    assert.equal(avatarChange.body.user.playerId, playerId, 'avatar change');

    const displayNameChange = await requestJson(server, '/api/v1/account/profile', {
      method: 'PATCH',
      headers,
      body: { displayName: 'Lifecycle User' },
    });
    assert.equal(displayNameChange.body.user.playerId, playerId, 'display name change');

    // A logout and a fresh login.
    await requestJson(server, '/api/v1/auth/logout', {
      method: 'POST',
      headers: { cookie: `${REFRESH_COOKIE_NAME}=${getRefreshCookie(login.response)}` },
    });
    const relogin = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'lifecycle@example.com', password: 'lifecycle-password' },
    });
    assert.equal(relogin.body.user.playerId, playerId, 'logout then login');

    assert.equal((await User.findById(userId)).playerId, playerId, 'stored value is unchanged');
  } finally {
    await stopHttpServer(server);
  }
});

test('a Player ID cannot be changed by any client request', async () => {
  const server = await startHttpServer();

  try {
    const account = await registerAndLogin(server, 'player-immutable@example.com');
    const userId = account.registered.body.user.id;
    const original = account.registered.body.user.playerId;
    const headers = { authorization: `Bearer ${account.loggedIn.body.token}` };

    // Every write endpoint rejects an unknown field, so playerId never arrives.
    const attempts = [
      { path: '/api/v1/account/profile', body: { displayName: 'Safe Name', playerId: 'ARC-ATTACKER1' } },
      { path: '/api/v1/account/profile', body: { playerId: 'ARC-ATTACKER2' } },
      { path: '/api/v1/account/username', body: { username: 'immutable_user', playerId: 'ARC-ATTACKER3' } },
      { path: '/api/v1/account/avatar', body: { type: 'local', value: 'avatar-02', playerId: 'ARC-ATTACKER4' } },
      { path: '/api/v1/account/username-availability', method: 'PATCH', body: { playerId: 'ARC-ATTACKER5' } },
    ];

    for (const attempt of attempts) {
      const response = await requestJson(server, attempt.path, {
        method: attempt.method || 'PATCH',
        headers,
        body: attempt.body,
      });
      assert.ok(response.response.status >= 400, JSON.stringify(attempt.body));
      assert.ok(response.response.status < 500, JSON.stringify(attempt.body));
    }

    // Signup cannot choose one either.
    const registered = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        email: 'player-chosen@example.com',
        password: 'player-chosen-password',
        playerId: 'ARC-CHOSENBY01',
      },
    });
    assert.equal(registered.response.status, 201);
    assert.notEqual(registered.body.user.playerId, 'ARC-CHOSENBY01', 'the server assigns the ID');
    assert.equal(isValidPlayerId(registered.body.user.playerId), true);

    // The schema is immutable, so even a direct model update cannot change it.
    await User.updateOne({ _id: userId }, { $set: { playerId: 'ARC-ATTACKER6' } });
    assert.equal((await User.findById(userId)).playerId, original, 'the model strips the update');

    // The safe response exposes only the public identifier, never internals.
    const profile = await requestJson(server, '/api/v1/account/profile', { headers });
    assert.equal(profile.body.user.playerId, original);
    assertNoSensitiveFields(profile.body);
  } finally {
    await stopHttpServer(server);
  }
});

test('accounts created before the Player ID are backfilled without overwriting', async () => {
  const server = await startHttpServer();

  try {
    // An account that already has a valid Player ID.
    const existing = await User.create({ email: 'backfill-keep@example.com' });
    const keep = existing.playerId;
    assert.equal(isValidPlayerId(keep), true);

    // Accounts written before the field existed, including a malformed value.
    const withoutOne = await User.collection.insertOne({
      email: 'backfill-missing@example.com',
      role: 'USER',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const withNull = await User.collection.insertOne({
      email: 'backfill-null@example.com',
      playerId: null,
      role: 'USER',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const withMalformed = await User.collection.insertOne({
      email: 'backfill-malformed@example.com',
      playerId: 'not-an-arc-id',
      role: 'USER',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // A legacy account without one still authenticates and reports it as null
    // rather than as a broken value.
    const login = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'backfill-missing@example.com', password: 'anything' },
    });
    assert.equal(login.response.status, 401, 'the legacy account has no password yet');

    const result = await backfillMissingPlayerIds();
    assert.equal(result.failed, 0, JSON.stringify(result));
    assert.equal(result.assigned, 3, JSON.stringify(result));

    const filled = [
      await User.findById(withoutOne.insertedId),
      await User.findById(withNull.insertedId),
      await User.findById(withMalformed.insertedId),
    ];
    for (const user of filled) {
      assert.equal(isValidPlayerId(user.playerId), true, String(user.playerId));
    }
    assert.equal(new Set(filled.map((user) => user.playerId)).size, 3, 'each is distinct');

    // The account that already had a valid ID was never touched.
    assert.equal((await User.findById(existing._id)).playerId, keep);

    // Running it again changes nothing.
    const secondRun = await backfillMissingPlayerIds();
    assert.equal(secondRun.assigned, 0, JSON.stringify(secondRun));
    assert.equal((await User.findById(existing._id)).playerId, keep);
    assert.equal((await User.findById(withoutOne.insertedId)).playerId, filled[0].playerId);

    // A backfilled account now reports its Player ID through the safe response.
    await User.updateOne(
      { _id: withoutOne.insertedId },
      { $set: { passwordHash: await bcrypt.hash('backfill-password-123', 10) } },
    );
    const backfilledLogin = await requestJson(server, '/api/v1/auth/login', {
      method: 'POST',
      body: { email: 'backfill-missing@example.com', password: 'backfill-password-123' },
    });
    assert.equal(backfilledLogin.response.status, 200);
    assert.equal(backfilledLogin.body.user.playerId, filled[0].playerId);
  } finally {
    await stopHttpServer(server);
  }
});

test('the Player ID is a public identifier and never an authorization credential', async () => {
  const server = await startHttpServer();

  try {
    const account = await registerAndLogin(server, 'player-public@example.com');
    const playerId = account.registered.body.user.playerId;
    const userId = account.registered.body.user.id;

    // It cannot stand in for a token.
    const asToken = await requestJson(server, '/api/v1/auth/me', {
      headers: { authorization: `Bearer ${playerId}` },
    });
    assert.equal(asToken.response.status, 401);

    const asRefresh = await requestJson(server, '/api/v1/auth/refresh', {
      method: 'POST',
      headers: { cookie: `${REFRESH_COOKIE_NAME}=${playerId}` },
    });
    assert.equal(asRefresh.response.status, 401);

    // It grants no access to another account's profile.
    await registerAndLogin(server, 'player-other@example.com');
    const asIdentity = await requestJson(
      server,
      `/api/v1/admin/users/${userId}`,
      { headers: { authorization: `Bearer ${playerId}` } },
    );
    assert.equal(asIdentity.response.status, 401);

    // The database ObjectId is never returned as the Player ID.
    assert.notEqual(playerId, userId);
    assert.notEqual(playerId, userId.slice(0, 8));
    assert.match(playerId, /^ARC-/);

    const profile = await requestJson(server, '/api/v1/account/profile', {
      headers: { authorization: `Bearer ${account.loggedIn.body.token}` },
    });
    assert.equal(profile.body.user.playerId, playerId);
    assertNoSensitiveFields(profile.body);
  } finally {
    await stopHttpServer(server);
  }
});

test('the backfill script loads its configuration from a .env like the backend does', async () => {
  /*
   * This is the exact shape that used to fail with "MONGODB_URI is required":
   * the script is run as a fresh process with NO environment variables at all,
   * and the only source of configuration is a .env file in its working
   * directory, which is what `require('../config/env')` loads.
   */
  const os = require('node:os');
  const fs = require('node:fs');
  const scriptPath = path.join(process.cwd(), 'scripts', 'backfill-player-ids.js');

  // Accounts that need a Player ID, plus one that must never be touched.
  const keeper = await User.create({ email: 'script-keeper@example.com' });
  const keeperPlayerId = keeper.playerId;
  const needsOne = await User.collection.insertOne({
    email: 'script-needs-one@example.com',
    role: 'USER',
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const workingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'arcadia-backfill-'));
  const envFile = path.join(workingDirectory, '.env');
  fs.writeFileSync(
    envFile,
    [
      'NODE_ENV=test',
      `MONGODB_URI=${process.env.MONGODB_URI}`,
      `JWT_SECRET=${process.env.JWT_SECRET}`,
      '',
    ].join('\n'),
    'utf8',
  );

  try {
    const run = () => spawnSync(process.execPath, [scriptPath], {
      cwd: workingDirectory,
      // A deliberately bare environment: no MONGODB_URI reaches the child.
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
      encoding: 'utf8',
    });

    const first = run();
    assert.equal(first.status, 0, `stdout: ${first.stdout} stderr: ${first.stderr}`);
    assert.match(first.stdout, /Player ID backfill complete\./);
    assert.match(first.stdout, /assigned: 1, failed: 0/);

    // The account that already had a valid Player ID was not touched.
    assert.equal((await User.findById(keeper._id)).playerId, keeperPlayerId);
    const filled = await User.findById(needsOne.insertedId);
    assert.equal(isValidPlayerId(filled.playerId), true);

    // Rerunning is idempotent and assigns nobody.
    const second = run();
    assert.equal(second.status, 0, `stdout: ${second.stdout} stderr: ${second.stderr}`);
    assert.match(second.stdout, /Accounts needing an ID: 0, assigned: 0, failed: 0/);
    assert.equal((await User.findById(needsOne.insertedId)).playerId, filled.playerId);
  } finally {
    fs.rmSync(workingDirectory, { recursive: true, force: true });
  }
});

test('the backfill script never prints the MongoDB URI or a secret', async () => {
  const scriptSource = fs.readFileSync(
    path.join(process.cwd(), 'scripts', 'backfill-player-ids.js'),
    'utf8',
  );

  // It delegates configuration to config/env rather than reading it directly,
  // so a .env can never be skipped again.
  assert.doesNotMatch(scriptSource, /process\.env\.MONGODB_URI/);
  assert.match(scriptSource, /require\('\.\.\/config\/env'\)/);
  assert.match(scriptSource, /require\('\.\.\/config\/database'\)/);

  // And a failure is reported by category, never by raw driver text, because a
  // driver message can embed the connection string.
  const safeFailure = require('../scripts/backfill-player-ids').printSafeFailure;
  const printed = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args) => printed.push(args.join(' '));
  console.error = (...args) => printed.push(args.join(' '));

  try {
    const uri = process.env.MONGODB_URI;
    safeFailure(Object.assign(
      new Error(`connect ECONNREFUSED ${uri}`),
      { name: 'MongooseServerSelectionError' },
    ));
    safeFailure(new Error('MONGODB_URI is required'));
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }

  const output = printed.join('\n');
  assert.equal(output.includes(process.env.MONGODB_URI), false, 'the URI is never printed');
  assert.equal(/mongodb(\+srv)?:\/\//.test(output), false, 'no connection string is printed');
  assert.match(output, /MongoDB connection problem/);
  // An allowlisted configuration message is still shown, because it is safe.
  assert.match(output, /MONGODB_URI is required/);
});

test('the backfill script reports a configuration failure without a usable .env', async () => {
  const os = require('node:os');
  const fs = require('node:fs');
  const scriptPath = path.join(process.cwd(), 'scripts', 'backfill-player-ids.js');
  const workingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'arcadia-backfill-empty-'));

  try {
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: workingDirectory,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Player ID backfill failed\./);
    assert.match(result.stderr, /MONGODB_URI is required/);
    assert.equal(/mongodb(\+srv)?:\/\//.test(result.stdout + result.stderr), false);
  } finally {
    fs.rmSync(workingDirectory, { recursive: true, force: true });
  }
});

/*
 * Match history.
 *
 * The endpoint is read only and scoped to the signed-in account, so these tests
 * pin three things: one account can never read another's rows, a client has no way
 * to create a match, and the filters work against the stored values.
 *
 * Rows are written here through the model, which is exactly how a trusted
 * server-side game system would record one. No test fabricates a result through
 * the API, because there is no API to fabricate one with.
 */
test('the match history is empty for an account with no completed matches', async () => {
  const server = await startHttpServer();

  try {
    const { loggedIn } = await registerAndLogin(server, 'matches-empty@example.com');

    const response = await requestJson(server, '/api/v1/account/matches', {
      headers: { authorization: `Bearer ${loggedIn.body.token}` },
    });

    assert.equal(response.response.status, 200);
    assert.deepEqual(response.body.matches, [], 'no rows means no fabricated history');
    assert.equal(response.body.total, 0);
    assert.equal(response.body.limit, 25);
  } finally {
    await stopHttpServer(server);
  }
});

test('match history requires authentication', async () => {
  const server = await startHttpServer();

  try {
    const anonymous = await requestJson(server, '/api/v1/account/matches');
    assert.equal(anonymous.response.status, 401, 'no token is rejected');

    const invalid = await requestJson(server, '/api/v1/account/matches', {
      headers: { authorization: 'Bearer not-a-real-token' },
    });
    assert.equal(invalid.response.status, 401, 'a bad token is rejected');
  } finally {
    await stopHttpServer(server);
  }
});

test('a user only ever receives their own match history', async () => {
  const server = await startHttpServer();

  try {
    const first = await registerAndLogin(server, 'matches-first@example.com');
    const second = await registerAndLogin(server, 'matches-second@example.com');

    await Match.create({
      userId: first.registered.body.user.id,
      game: 'arcadion',
      opponentType: OPPONENT_TYPES.ARCADION,
      result: MATCH_RESULTS.WIN,
      completedAt: new Date('2026-05-02T12:00:00.000Z'),
    });

    const own = await requestJson(server, '/api/v1/account/matches', {
      headers: { authorization: `Bearer ${first.loggedIn.body.token}` },
    });
    assert.equal(own.body.total, 1, 'the owner sees their own match');

    const other = await requestJson(server, '/api/v1/account/matches', {
      headers: { authorization: `Bearer ${second.loggedIn.body.token}` },
    });
    assert.equal(other.body.total, 0, 'another account sees none of it');

    // A caller cannot ask for someone else's history by passing an id.
    const attempted = await requestJson(
      server,
      `/api/v1/account/matches?userId=${first.registered.body.user.id}`,
      { headers: { authorization: `Bearer ${second.loggedIn.body.token}` } },
    );
    assert.equal(attempted.body.total, 0, 'a userId in the query is ignored, not honoured');
  } finally {
    await stopHttpServer(server);
  }
});

test('there is no endpoint a client can use to record a match', async () => {
  const server = await startHttpServer();

  try {
    const { loggedIn } = await registerAndLogin(server, 'matches-nowrite@example.com');
    const headers = { authorization: `Bearer ${loggedIn.body.token}` };
    const body = {
      game: 'arcadion',
      opponentType: OPPONENT_TYPES.ARCADION,
      result: MATCH_RESULTS.WIN,
      completedAt: new Date().toISOString(),
    };

    for (const [method, path] of [
      ['POST', '/api/v1/account/matches'],
      ['PUT', '/api/v1/account/matches'],
      ['PATCH', '/api/v1/account/matches'],
    ]) {
      const response = await requestJson(server, path, { method, headers, body });
      assert.ok(
        response.response.status === 404 || response.response.status === 405,
        `${method} ${path} must not exist, got ${response.response.status}`,
      );
    }

    const history = await requestJson(server, '/api/v1/account/matches', { headers });
    assert.equal(history.body.total, 0, 'and nothing was recorded by any of them');
  } finally {
    await stopHttpServer(server);
  }
});

test('match history is returned newest first by completion time', async () => {
  const server = await startHttpServer();

  try {
    const { registered, loggedIn } = await registerAndLogin(server, 'matches-order@example.com');
    const userId = registered.body.user.id;

    // Inserted out of order on purpose.
    await Match.create([
      {
        userId,
        game: 'ludo',
        opponentType: OPPONENT_TYPES.LOCAL,
        result: MATCH_RESULTS.WIN,
        completedAt: new Date('2026-01-10T09:00:00.000Z'),
      },
      {
        userId,
        game: 'arcadion',
        opponentType: OPPONENT_TYPES.ARCADION,
        result: MATCH_RESULTS.LOSS,
        completedAt: new Date('2026-06-20T18:30:00.000Z'),
      },
      {
        userId,
        game: 'memory',
        opponentType: OPPONENT_TYPES.ONLINE_FRIEND,
        result: MATCH_RESULTS.DRAW,
        completedAt: new Date('2026-03-05T20:15:00.000Z'),
      },
    ]);

    const response = await requestJson(server, '/api/v1/account/matches', {
      headers: { authorization: `Bearer ${loggedIn.body.token}` },
    });

    assert.deepEqual(
      response.body.matches.map((match) => match.completedAt),
      [
        '2026-06-20T18:30:00.000Z',
        '2026-03-05T20:15:00.000Z',
        '2026-01-10T09:00:00.000Z',
      ],
      'newest completed match first, oldest last',
    );
    assert.deepEqual(
      response.body.matches.map((match) => match.game),
      ['arcadion', 'memory', 'ludo'],
    );
  } finally {
    await stopHttpServer(server);
  }
});

test('every match exposes only the public match fields', async () => {
  const server = await startHttpServer();

  try {
    const { registered, loggedIn } = await registerAndLogin(server, 'matches-shape@example.com');
    await Match.create({
      userId: registered.body.user.id,
      game: 'arcadion',
      opponentType: OPPONENT_TYPES.ARCADION,
      opponentName: 'Arcadion',
      result: MATCH_RESULTS.WIN,
      completedAt: new Date('2026-04-01T12:00:00.000Z'),
      durationMinutes: 9,
    });

    const response = await requestJson(server, '/api/v1/account/matches', {
      headers: { authorization: `Bearer ${loggedIn.body.token}` },
    });

    const [match] = response.body.matches;
    assert.deepEqual(Object.keys(match).sort(), [
      'completedAt',
      'durationMinutes',
      'game',
      'matchId',
      'opponentName',
      'opponentType',
      'result',
    ]);
    assert.equal(match.game, 'arcadion');
    assert.equal(match.opponentType, 'ARCADION');
    assert.equal(match.result, 'WIN');
    assert.equal(match.durationMinutes, 9);
    assert.match(match.matchId, /^[a-f0-9]{24}$/, 'a stable id is exposed for list keys');

    // Nothing internal leaks, and no other account's data is present.
    const serialised = JSON.stringify(response.body);
    assert.doesNotMatch(serialised, /_id|__v|userId|password|refreshToken/i);
  } finally {
    await stopHttpServer(server);
  }
});

test('the date range filter includes the whole selected end date', async () => {
  const server = await startHttpServer();

  try {
    const { registered, loggedIn } = await registerAndLogin(server, 'matches-range@example.com');
    const userId = registered.body.user.id;

    // One match early in the range day, one late in the same day, one outside.
    await Match.create([
      {
        userId,
        game: 'early',
        opponentType: OPPONENT_TYPES.LOCAL,
        result: MATCH_RESULTS.WIN,
        completedAt: new Date('2026-07-10T00:30:00.000Z'),
      },
      {
        userId,
        game: 'late',
        opponentType: OPPONENT_TYPES.LOCAL,
        result: MATCH_RESULTS.LOSS,
        completedAt: new Date('2026-07-10T23:45:00.000Z'),
      },
      {
        userId,
        game: 'outside',
        opponentType: OPPONENT_TYPES.LOCAL,
        result: MATCH_RESULTS.DRAW,
        completedAt: new Date('2026-07-11T12:00:00.000Z'),
      },
    ]);
    const headers = { authorization: `Bearer ${loggedIn.body.token}` };

    // In UTC these fixtures sit where their names say they do, so a single day
    // must keep the very start AND the very end of it. This is the case that
    // would drop the 23:45 match if the To date were treated as midnight.
    const sameDay = await requestJson(
      server,
      '/api/v1/account/matches?from=2026-07-10&to=2026-07-10',
      { headers },
    );
    assert.deepEqual(
      sameDay.body.matches.map((match) => match.game).sort(),
      ['early', 'late'],
      'a single day range keeps both ends of that day',
    );
    assert.equal(sameDay.body.total, 2, 'and the next day does not leak in');

    // An explicit zero offset is the same answer, so an absent one is UTC.
    const explicitUtc = await requestJson(
      server,
      '/api/v1/account/matches?from=2026-07-10&to=2026-07-10&tzOffsetMinutes=0',
      { headers },
    );
    assert.equal(explicitUtc.body.total, 2, 'an explicit zero offset behaves the same');

    // A reader 5 hours behind UTC has a different 10 July: it runs from 05:00 UTC
    // to 04:59 UTC the next day, so the 00:30 match is already the previous day
    // for them. That is exactly what they would see on screen.
    const behindUtc = await requestJson(
      server,
      '/api/v1/account/matches?from=2026-07-10&to=2026-07-10&tzOffsetMinutes=300',
      { headers },
    );
    assert.deepEqual(
      behindUtc.body.matches.map((match) => match.game),
      ['late'],
      'the day boundaries follow the offset the reader sent',
    );

    // A reader 5 hours ahead of UTC sees the 00:30 match, not the 23:45 one.
    const aheadUtc = await requestJson(
      server,
      '/api/v1/account/matches?from=2026-07-10&to=2026-07-10&tzOffsetMinutes=-300',
      { headers },
    );
    assert.deepEqual(
      aheadUtc.body.matches.map((match) => match.game),
      ['early'],
      'and the other way round for a reader ahead of UTC',
    );

    // An implausible offset is refused rather than silently reinterpreted.
    const badOffset = await requestJson(
      server,
      '/api/v1/account/matches?tzOffsetMinutes=99999',
      { headers },
    );
    assert.equal(badOffset.response.status, 400, 'an impossible offset is rejected');

    const week = await requestJson(
      server,
      '/api/v1/account/matches?from=2026-07-01&to=2026-07-31',
      { headers },
    );
    assert.equal(week.body.total, 3, 'a wider range includes every match inside it');

    const openStart = await requestJson(
      server,
      '/api/v1/account/matches?to=2026-07-10',
      { headers },
    );
    assert.equal(openStart.body.total, 2, 'an open From is allowed');

    const openEnd = await requestJson(
      server,
      '/api/v1/account/matches?from=2026-07-10',
      { headers },
    );
    assert.equal(openEnd.body.total, 3, 'an open To is allowed');
  } finally {
    await stopHttpServer(server);
  }
});

test('an invalid or reversed date range is refused with a safe message', async () => {
  const server = await startHttpServer();

  try {
    const { loggedIn } = await registerAndLogin(server, 'matches-badrange@example.com');
    const headers = { authorization: `Bearer ${loggedIn.body.token}` };

    const reversed = await requestJson(
      server,
      '/api/v1/account/matches?from=2026-08-10&to=2026-08-01',
      { headers },
    );
    assert.equal(reversed.response.status, 400, 'a reversed range is rejected');
    assert.match(reversed.body.error, /From date must not be after/i);

    for (const query of [
      'from=not-a-date',
      'to=2026-13-01',
      'from=2026-02-31',
      'from=2026-1-1',
    ]) {
      const response = await requestJson(server, `/api/v1/account/matches?${query}`, { headers });
      assert.equal(response.response.status, 400, `${query} is rejected`);
      assert.doesNotMatch(response.body.error, /Mongo|ObjectId|undefined|NaN/i);
    }
  } finally {
    await stopHttpServer(server);
  }
});

test('the Played with filter uses the stored opponent type', async () => {
  const server = await startHttpServer();

  try {
    const { registered, loggedIn } = await registerAndLogin(server, 'matches-opponent@example.com');
    const userId = registered.body.user.id;

    await Match.create([
      {
        userId,
        game: 'a1',
        opponentType: OPPONENT_TYPES.ARCADION,
        result: MATCH_RESULTS.WIN,
        completedAt: new Date('2026-09-01T10:00:00.000Z'),
      },
      {
        userId,
        game: 'o1',
        opponentType: OPPONENT_TYPES.ONLINE_FRIEND,
        opponentName: 'Ravi',
        result: MATCH_RESULTS.WIN,
        completedAt: new Date('2026-09-02T10:00:00.000Z'),
      },
      {
        userId,
        game: 'l1',
        opponentType: OPPONENT_TYPES.LOCAL,
        opponentName: 'Guest',
        result: MATCH_RESULTS.DRAW,
        completedAt: new Date('2026-09-03T10:00:00.000Z'),
      },
    ]);
    const headers = { authorization: `Bearer ${loggedIn.body.token}` };

    for (const [value, expected] of [
      ['ARCADION', 'a1'],
      ['ONLINE_FRIEND', 'o1'],
      ['LOCAL', 'l1'],
    ]) {
      const response = await requestJson(
        server,
        `/api/v1/account/matches?opponentType=${value}`,
        { headers },
      );
      assert.equal(response.body.total, 1, `${value} matches one row`);
      assert.equal(response.body.matches[0].game, expected);
      assert.equal(
        response.body.filters.opponentType,
        value,
        'the applied filter is echoed back',
      );
    }

    // An unknown opponent type can never widen the query.
    const bogus = await requestJson(
      server,
      '/api/v1/account/matches?opponentType=ROBOT',
      { headers },
    );
    assert.equal(bogus.response.status, 400, 'an unknown opponent type is rejected');
  } finally {
    await stopHttpServer(server);
  }
});

test('the date and opponent filters combine', async () => {
  const server = await startHttpServer();

  try {
    const { registered, loggedIn } = await registerAndLogin(server, 'matches-combined@example.com');
    const userId = registered.body.user.id;

    await Match.create([
      {
        userId,
        game: 'in-both',
        opponentType: OPPONENT_TYPES.ARCADION,
        result: MATCH_RESULTS.WIN,
        completedAt: new Date('2026-05-10T12:00:00.000Z'),
      },
      {
        userId,
        game: 'wrong-opponent',
        opponentType: OPPONENT_TYPES.LOCAL,
        result: MATCH_RESULTS.WIN,
        completedAt: new Date('2026-05-11T12:00:00.000Z'),
      },
      {
        userId,
        game: 'wrong-date',
        opponentType: OPPONENT_TYPES.ARCADION,
        result: MATCH_RESULTS.LOSS,
        completedAt: new Date('2026-06-11T12:00:00.000Z'),
      },
    ]);
    const headers = { authorization: `Bearer ${loggedIn.body.token}` };

    const response = await requestJson(
      server,
      '/api/v1/account/matches?from=2026-05-01&to=2026-05-31&opponentType=ARCADION',
      { headers },
    );
    assert.equal(response.body.total, 1, 'both filters apply together');
    assert.equal(response.body.matches[0].game, 'in-both');
  } finally {
    await stopHttpServer(server);
  }
});

test('a human or local match is never recorded as Arcadion', async () => {
  const server = await startHttpServer();

  try {
    const { registered, loggedIn } = await registerAndLogin(server, 'matches-human@example.com');
    await Match.create({
      userId: registered.body.user.id,
      game: 'ludo',
      opponentType: OPPONENT_TYPES.ONLINE_FRIEND,
      opponentName: 'Sam',
      result: MATCH_RESULTS.WIN,
      completedAt: new Date('2026-02-02T12:00:00.000Z'),
    });

    const response = await requestJson(server, '/api/v1/account/matches', {
      headers: { authorization: `Bearer ${loggedIn.body.token}` },
    });

    const [match] = response.body.matches;
    assert.equal(match.opponentType, 'ONLINE_FRIEND', 'the stored type is reported as recorded');
    assert.notEqual(
      match.opponentType,
      OPPONENT_TYPES.ARCADION,
      'never reported as Arcadion',
    );
    // The opponent name is the public label only, never account data.
    assert.equal(match.opponentName, 'Sam');
    assert.doesNotMatch(JSON.stringify(response.body), /@|password|email/i);
  } finally {
    await stopHttpServer(server);
  }
});

test('an unsupported opponent type or result cannot be stored at all', async () => {
  const server = await startHttpServer();

  try {
    const { registered } = await registerAndLogin(server, 'matches-invalid@example.com');
    const userId = registered.body.user.id;

    // The enum is the guarantee, so an invalid value fails to persist.
    await assert.rejects(
      Match.create({
        userId,
        game: 'ludo',
        opponentType: 'ROBOT',
        result: MATCH_RESULTS.WIN,
        completedAt: new Date(),
      }),
      /opponentType/,
      'an unknown opponent type is refused',
    );

    await assert.rejects(
      Match.create({
        userId,
        game: 'ludo',
        opponentType: OPPONENT_TYPES.ARCADION,
        result: 'VICTORY',
        completedAt: new Date(),
      }),
      /result/,
      'an unknown result is refused',
    );

    const count = await Match.countDocuments({ userId });
    assert.equal(count, 0, 'neither invalid row was stored');
  } finally {
    await stopHttpServer(server);
  }
});

test('match history never awards XP or changes progression', async () => {
  const server = await startHttpServer();

  try {
    const { registered, loggedIn } = await registerAndLogin(server, 'matches-noxp@example.com');
    const headers = { authorization: `Bearer ${loggedIn.body.token}` };

    const before = await requestJson(server, '/api/v1/account/profile', { headers });
    assert.equal(before.body.user.progression.totalXp, 0, 'a new account starts at zero');

    // Recording and then reading a win must not move XP.
    await Match.create({
      userId: registered.body.user.id,
      game: 'arcadion',
      opponentType: OPPONENT_TYPES.ARCADION,
      result: MATCH_RESULTS.WIN,
      completedAt: new Date(),
    });
    await requestJson(server, '/api/v1/account/matches', { headers });

    const after = await requestJson(server, '/api/v1/account/profile', { headers });
    assert.equal(after.body.user.progression.totalXp, 0, 'displaying a row awards nothing');
    assert.equal(after.body.user.progression.level, 0);
    assert.equal(after.body.user.progression.title, 'Arcadia Rookie');
  } finally {
    await stopHttpServer(server);
  }
});

test('the match history response is never cached', async () => {
  const server = await startHttpServer();

  try {
    const { loggedIn } = await registerAndLogin(server, 'matches-nocache@example.com');
    const response = await requestJson(server, '/api/v1/account/matches', {
      headers: { authorization: `Bearer ${loggedIn.body.token}` },
    });
    assert.equal(response.response.headers.get('cache-control'), 'no-store');
  } finally {
    await stopHttpServer(server);
  }
});

/*
 * Match history: the Result filter and paged retrieval.
 *
 * Both were added so the Match History page can show a complete, honest history
 * rather than one silent page of it. These tests pin that the result filter
 * matches the STORED result, that all three filters combine, and that paging
 * neither repeats nor skips a row and never reports a page as the whole list.
 */
test('the Result filter matches the stored result and is echoed back', async () => {
  const server = await startHttpServer();

  try {
    const { registered, loggedIn } = await registerAndLogin(server, 'mh-result@example.com');
    const userId = registered.body.user.id;

    await Match.create([
      { userId, game: 'w', opponentType: OPPONENT_TYPES.ARCADION, result: MATCH_RESULTS.WIN, completedAt: new Date('2026-03-01T10:00:00.000Z') },
      { userId, game: 'l', opponentType: OPPONENT_TYPES.ARCADION, result: MATCH_RESULTS.LOSS, completedAt: new Date('2026-03-02T10:00:00.000Z') },
      { userId, game: 'd', opponentType: OPPONENT_TYPES.ARCADION, result: MATCH_RESULTS.DRAW, completedAt: new Date('2026-03-03T10:00:00.000Z') },
    ]);
    const headers = { authorization: `Bearer ${loggedIn.body.token}` };

    // The stored value is what is filtered on. The page renames DRAW to "Tie"
    // for the reader, but the value behind the label never changes.
    for (const [value, expected] of [
      ['WIN', 'w'],
      ['LOSS', 'l'],
      ['DRAW', 'd'],
    ]) {
      const response = await requestJson(
        server,
        `/api/v1/account/matches?result=${value}`,
        { headers },
      );
      assert.equal(response.response.status, 200);
      assert.equal(response.body.total, 1, `${value} matches one row`);
      assert.equal(response.body.matches[0].game, expected);
      assert.equal(response.body.filters.result, value, 'the applied result is echoed back');
    }

    const all = await requestJson(server, '/api/v1/account/matches', { headers });
    assert.equal(all.body.filters.result, null, 'no result filter by default');
    assert.equal(all.body.total, 3, 'and all three are still reachable');

    // An unknown result can never widen the query.
    const bogus = await requestJson(
      server,
      '/api/v1/account/matches?result=VICTORY',
      { headers },
    );
    assert.equal(bogus.response.status, 400, 'an unknown result is rejected');
    assert.doesNotMatch(bogus.body.error, /Mongo|ObjectId|undefined|NaN/i);
  } finally {
    await stopHttpServer(server);
  }
});

test('all three filters combine, including the result', async () => {
  const server = await startHttpServer();

  try {
    const { registered, loggedIn } = await registerAndLogin(server, 'mh-all3@example.com');
    const userId = registered.body.user.id;

    await Match.create([
      { userId, game: 'hit', opponentType: OPPONENT_TYPES.ARCADION, result: MATCH_RESULTS.WIN, completedAt: new Date('2026-05-10T12:00:00.000Z') },
      { userId, game: 'wrong-result', opponentType: OPPONENT_TYPES.ARCADION, result: MATCH_RESULTS.LOSS, completedAt: new Date('2026-05-11T12:00:00.000Z') },
      { userId, game: 'wrong-opponent', opponentType: OPPONENT_TYPES.LOCAL, result: MATCH_RESULTS.WIN, completedAt: new Date('2026-05-12T12:00:00.000Z') },
      { userId, game: 'wrong-date', opponentType: OPPONENT_TYPES.ARCADION, result: MATCH_RESULTS.WIN, completedAt: new Date('2026-06-12T12:00:00.000Z') },
    ]);
    const headers = { authorization: `Bearer ${loggedIn.body.token}` };

    const response = await requestJson(
      server,
      '/api/v1/account/matches'
        + '?from=2026-05-01&to=2026-05-31&opponentType=ARCADION&result=WIN',
      { headers },
    );

    assert.equal(response.response.status, 200);
    assert.equal(response.body.total, 1, 'only the row matching all three survives');
    assert.equal(response.body.matches[0].game, 'hit');
    assert.deepEqual(response.body.filters, {
      from: '2026-05-01',
      to: '2026-05-31',
      opponentType: 'ARCADION',
      result: 'WIN',
    });
  } finally {
    await stopHttpServer(server);
  }
});

test('paging walks the whole history without repeating or skipping a match', async () => {
  const server = await startHttpServer();

  try {
    const { registered, loggedIn } = await registerAndLogin(server, 'mh-page@example.com');
    const userId = registered.body.user.id;

    // Seven matches, newest last, so the expected pages can be written out.
    await Match.create(
      Array.from({ length: 7 }, (_, index) => ({
        userId,
        game: `m${index}`,
        opponentType: OPPONENT_TYPES.LOCAL,
        result: MATCH_RESULTS.WIN,
        completedAt: new Date(`2026-01-0${index + 1}T12:00:00.000Z`),
      })),
    );
    const headers = { authorization: `Bearer ${loggedIn.body.token}` };

    const seen = [];
    let offset = 0;
    let pages = 0;

    // Walk the pages exactly as the page's "load more" does.
    for (;;) {
      const response = await requestJson(
        server,
        `/api/v1/account/matches?limit=3&offset=${offset}`,
        { headers },
      );
      assert.equal(response.response.status, 200);
      assert.equal(response.body.total, 7, 'total counts every match, not the page');
      assert.equal(response.body.offset, offset, 'the applied offset is echoed back');

      seen.push(...response.body.matches.map((match) => match.game));
      pages += 1;

      if (!response.body.hasMore) break;
      assert.ok(pages < 10, 'paging terminates rather than looping');
      offset += response.body.limit;
    }

    assert.equal(pages, 3, 'seven rows at three per page is three pages');
    assert.deepEqual(seen, ['m6', 'm5', 'm4', 'm3', 'm2', 'm1', 'm0'], 'newest first, nothing repeated or skipped');
    assert.equal(new Set(seen).size, 7, 'every match appears exactly once');

    // The last page is never described as having more.
    const last = await requestJson(
      server,
      '/api/v1/account/matches?limit=3&offset=6',
      { headers },
    );
    assert.equal(last.body.matches.length, 1, 'the final page holds the remainder');
    assert.equal(last.body.hasMore, false, 'and reports there is nothing after it');

    // An offset past the end is an empty page, not an error and not a wrap-around.
    const past = await requestJson(
      server,
      '/api/v1/account/matches?limit=3&offset=99',
      { headers },
    );
    assert.equal(past.response.status, 200);
    assert.deepEqual(past.body.matches, []);
    assert.equal(past.body.total, 7, 'total still describes the whole history');
    assert.equal(past.body.hasMore, false);

    for (const query of ['offset=-1', 'offset=1.5', 'limit=0', 'limit=-3']) {
      const response = await requestJson(server, `/api/v1/account/matches?${query}`, { headers });
      assert.equal(response.response.status, 400, `${query} is rejected`);
    }
  } finally {
    await stopHttpServer(server);
  }
});

test('paging stays inside the one account and does not leak across accounts', async () => {
  const server = await startHttpServer();

  try {
    const first = await registerAndLogin(server, 'mh-page-a@example.com');
    const second = await registerAndLogin(server, 'mh-page-b@example.com');

    for (let index = 0; index < 4; index += 1) {
      await Match.create({
        userId: first.registered.body.user.id,
        game: `a${index}`,
        opponentType: OPPONENT_TYPES.LOCAL,
        result: MATCH_RESULTS.WIN,
        completedAt: new Date(`2026-04-0${index + 1}T12:00:00.000Z`),
      });
    }
    await Match.create({
      userId: second.registered.body.user.id,
      game: 'b0',
      opponentType: OPPONENT_TYPES.LOCAL,
      result: MATCH_RESULTS.WIN,
      completedAt: new Date('2026-04-05T12:00:00.000Z'),
    });

    const headers = { authorization: `Bearer ${second.loggedIn.body.token}` };
    const response = await requestJson(
      server,
      '/api/v1/account/matches?limit=100&offset=0',
      { headers },
    );

    assert.equal(response.body.total, 1, 'the second account sees only its own single match');
    assert.equal(response.body.matches[0].game, 'b0');
    assert.equal(response.body.hasMore, false);
    // Checked against the game names, not the whole body: a matchId is hex and
    // can contain anything, so a blanket pattern would match by chance.
    assert.deepEqual(
      response.body.matches.map((match) => match.game),
      ['b0'],
      'no page of another account appears in the response',
    );
    assert.doesNotMatch(
      JSON.stringify(response.body.filters),
      /a[0-3]/,
      'and the echoed filters carry nothing from the other account',
    );
  } finally {
    await stopHttpServer(server);
  }
});

test('the account creation date is not a server-side filter input', async () => {
  const server = await startHttpServer();

  try {
    const { loggedIn } = await registerAndLogin(server, 'mh-createdate@example.com');
    const headers = { authorization: `Bearer ${loggedIn.body.token}` };

    // The page uses the account creation date to bound its own calendar, which
    // is a presentation concern. It must not become a query the server honours,
    // because a caller could otherwise narrow another surface by passing it.
    const response = await requestJson(
      server,
      '/api/v1/account/matches?createdAfter=2020-01-01&createdBefore=2030-01-01',
      { headers },
    );
    assert.equal(response.response.status, 200, 'an unknown parameter is simply ignored');
    assert.equal(response.body.total, 0, 'and it does not filter anything');
  } finally {
    await stopHttpServer(server);
  }
});

/* ==================================================================
   Account preferences

   Sound and privacy preferences live on their own resource. The tests
   below pin down three things that must never regress: the canonical
   defaults an untouched account reads back, the fact that every value is
   validated server-side, and that reset touches nothing but preferences.
   ================================================================== */

test('preferences default safely for an existing account and are never exposed elsewhere', async () => {
  const server = await startHttpServer();

  try {
    const account = await registerAndLogin(server, 'prefs-default@example.com');
    const headers = { authorization: `Bearer ${account.loggedIn.body.token}` };

    const preferences = await requestJson(server, '/api/v1/account/preferences', { headers });
    assert.equal(preferences.response.status, 200);
    assert.deepEqual(preferences.body.preferences, {
      soundEffects: true,
      soundVolume: 100,
      profileVisibility: 'PUBLIC',
      leaderboardVisibility: 'SHOW',
    }, 'an account that never set preferences reads the canonical defaults');
    assertNoSensitiveFields(preferences.body);

    // The preferences subdocument must not ride along on the auth or profile
    // reads, so there is no second surface that could leak or overwrite it.
    const me = await requestJson(server, '/api/v1/auth/me', { headers });
    assert.equal(me.response.status, 200);
    assert.equal(
      JSON.stringify(me.body).includes('preferences'),
      false,
      'the auth/me payload carries no preferences subdocument',
    );

    const profile = await requestJson(server, '/api/v1/account/profile', { headers });
    assert.equal(profile.response.status, 200);
    assert.equal(
      JSON.stringify(profile.body).includes('leaderboardVisibility'),
      false,
      'the profile payload carries no preference values',
    );

    // /settings stays the read-only account profile it always was.
    const settings = await requestJson(server, '/api/v1/account/settings', { headers });
    assert.equal(settings.response.status, 200);
    assert.equal(settings.body.settings.email, 'prefs-default@example.com');
  } finally {
    await stopHttpServer(server);
  }
});

test('preferences validate every field server-side and reject unknown keys', async () => {
  const server = await startHttpServer();

  try {
    const account = await registerAndLogin(server, 'prefs-validate@example.com');
    const headers = { authorization: `Bearer ${account.loggedIn.body.token}` };

    const invalidWrites = [
      { soundEffects: 'yes' },
      { soundEffects: 1 },
      { soundVolume: 101 },
      { soundVolume: -1 },
      { soundVolume: 50.5 },
      { soundVolume: 'loud' },
      { profileVisibility: 'SOMEWHERE' },
      { profileVisibility: 'public' },
      { leaderboardVisibility: 'MAYBE' },
      { totalXp: 99999 },
      { role: 'ADMIN' },
      { status: 'DELETED' },
    ];

    for (const body of invalidWrites) {
      const rejected = await requestJson(server, '/api/v1/account/preferences', {
        method: 'PATCH',
        headers,
        body,
      });
      assert.equal(rejected.response.status, 400, `${JSON.stringify(body)} is rejected`);
      assert.ok(rejected.body.error, 'a rejection carries an error message');
    }

    // An empty write is a no-op that must not silently rewrite the record.
    const empty = await requestJson(server, '/api/v1/account/preferences', {
      method: 'PATCH',
      headers,
      body: {},
    });
    assert.equal(empty.response.status, 400);

    // A non-object body is rejected rather than coerced.
    const notAnObject = await requestJson(server, '/api/v1/account/preferences', {
      method: 'PATCH',
      headers,
      body: ['soundEffects'],
    });
    assert.equal(notAnObject.response.status, 400);

    // Nothing above was applied: the stored set is still the defaults.
    const after = await requestJson(server, '/api/v1/account/preferences', { headers });
    assert.deepEqual(after.body.preferences, {
      soundEffects: true,
      soundVolume: 100,
      profileVisibility: 'PUBLIC',
      leaderboardVisibility: 'SHOW',
    });
  } finally {
    await stopHttpServer(server);
  }
});

test('preferences persist partial writes and the backend is the only source of truth', async () => {
  const server = await startHttpServer();

  try {
    const account = await registerAndLogin(server, 'prefs-persist@example.com');
    const headers = { authorization: `Bearer ${account.loggedIn.body.token}` };

    const first = await requestJson(server, '/api/v1/account/preferences', {
      method: 'PATCH',
      headers,
      body: { soundEffects: false, soundVolume: 40 },
    });
    assert.equal(first.response.status, 200);
    assert.deepEqual(first.body.preferences, {
      soundEffects: false,
      soundVolume: 40,
      profileVisibility: 'PUBLIC',
      leaderboardVisibility: 'SHOW',
    }, 'a partial write applies only the keys sent');

    // A second partial write leaves the untouched keys exactly as they were.
    const second = await requestJson(server, '/api/v1/account/preferences', {
      method: 'PATCH',
      headers,
      body: { profileVisibility: 'NO_ONE' },
    });
    assert.deepEqual(second.body.preferences, {
      soundEffects: false,
      soundVolume: 40,
      profileVisibility: 'NO_ONE',
      leaderboardVisibility: 'SHOW',
    });

    // A fresh read agrees with the last write, so the modal can trust it.
    const reread = await requestJson(server, '/api/v1/account/preferences', { headers });
    assert.deepEqual(reread.body.preferences, second.body.preferences);
    assertNoSensitiveFields(reread.body);

    // Boundary values the server accepts.
    const bounds = await requestJson(server, '/api/v1/account/preferences', {
      method: 'PATCH',
      headers,
      body: { soundVolume: 0 },
    });
    assert.equal(bounds.body.preferences.soundVolume, 0);
    const top = await requestJson(server, '/api/v1/account/preferences', {
      method: 'PATCH',
      headers,
      body: { soundVolume: 100 },
    });
    assert.equal(top.body.preferences.soundVolume, 100);
  } finally {
    await stopHttpServer(server);
  }
});

test('resetting preferences restores the defaults and touches nothing else', async () => {
  const server = await startHttpServer();

  try {
    const account = await registerAndLogin(server, 'prefs-reset@example.com');
    const userId = account.registered.body.user.id;
    const headers = { authorization: `Bearer ${account.loggedIn.body.token}` };

    // Give the account real progression and a match so reset has something
    // it must NOT delete, plus a username so identity is non-default too.
    await recordArcadionResult(userId);
    await Match.create({
      userId,
      game: XP_EARNING_GAME,
      opponentType: OPPONENT_TYPES.ARCADION,
      result: MATCH_RESULTS.WIN,
      completedAt: new Date('2026-05-01T12:00:00.000Z'),
    });
    clearUsernameCooldown(userId);
    const named = await requestJson(server, '/api/v1/account/username', {
      method: 'PATCH',
      headers,
      body: { username: 'prefs-reset-player' },
    });
    assert.equal(named.response.status, 200);

    // Move every preference away from its default first.
    const changed = await requestJson(server, '/api/v1/account/preferences', {
      method: 'PATCH',
      headers,
      body: {
        soundEffects: false,
        soundVolume: 5,
        profileVisibility: 'NO_ONE',
        leaderboardVisibility: 'HIDE',
      },
    });
    assert.deepEqual(changed.body.preferences, {
      soundEffects: false,
      soundVolume: 5,
      profileVisibility: 'NO_ONE',
      leaderboardVisibility: 'HIDE',
    });

    const beforeXp = (await User.findById(userId)).totalXp;

    const reset = await requestJson(server, '/api/v1/account/preferences/reset', {
      method: 'POST',
      headers,
    });
    assert.equal(reset.response.status, 200);
    assert.deepEqual(reset.body.preferences, {
      soundEffects: true,
      soundVolume: 100,
      profileVisibility: 'PUBLIC',
      leaderboardVisibility: 'SHOW',
    }, 'reset returns the canonical defaults from the backend');

    // Progression, identity, matches and the account itself all survive.
    const stored = await User.findById(userId);
    assert.equal(stored.totalXp, beforeXp, 'reset never touches XP');
    assert.equal(stored.username, 'prefs-reset-player', 'reset never touches the username');
    assert.equal(stored.status, ACCOUNT_STATUSES.ACTIVE, 'the account is still active');
    assert.equal(await Match.countDocuments({ userId }), 1, 'reset never touches match history');

    // The session is still valid, because reset is not a sign-out.
    const stillMe = await requestJson(server, '/api/v1/auth/me', { headers });
    assert.equal(stillMe.response.status, 200);

    // And the reset is persisted, not just echoed.
    const reread = await requestJson(server, '/api/v1/account/preferences', { headers });
    assert.deepEqual(reread.body.preferences, {
      soundEffects: true,
      soundVolume: 100,
      profileVisibility: 'PUBLIC',
      leaderboardVisibility: 'SHOW',
    });
  } finally {
    await stopHttpServer(server);
  }
});

/* ==================================================================
   Privacy enforcement

   These assertions exercise the shared helpers the rest of the backend
   reads from, so the stored preference and the enforced behaviour can
   never drift apart. Arcadia has no friendship graph yet, so `FRIENDS`
   fails closed rather than open.
   ================================================================== */

test('profile visibility is enforced by the shared helper and fails closed for FRIENDS', async () => {
  const server = await startHttpServer();

  try {
    const owner = await registerAndLogin(server, 'privacy-owner@example.com');
    const other = await registerAndLogin(server, 'privacy-other@example.com');
    const ownerId = owner.registered.body.user.id;
    const otherId = other.registered.body.user.id;
    const headers = { authorization: `Bearer ${owner.loggedIn.body.token}` };

    const ownerDoc = () => User.findById(ownerId);

    // PUBLIC: any other signed-in account, and an anonymous caller, may view.
    assert.equal(preferencesUtils.canViewProfile(await ownerDoc(), otherId), true);
    assert.equal(preferencesUtils.canViewProfile(await ownerDoc(), null), true);
    // The owner always may, whatever the setting.
    assert.equal(preferencesUtils.canViewProfile(await ownerDoc(), ownerId), true);

    await requestJson(server, '/api/v1/account/preferences', {
      method: 'PATCH',
      headers,
      body: { profileVisibility: 'FRIENDS' },
    });

    // No friendship model exists, so FRIENDS denies every other viewer.
    assert.equal(
      preferencesUtils.canViewProfile(await ownerDoc(), otherId),
      false,
      'FRIENDS fails closed while there is no friendship graph to check',
    );
    assert.equal(preferencesUtils.canViewProfile(await ownerDoc(), null), false);
    assert.equal(preferencesUtils.canViewProfile(await ownerDoc(), ownerId), true);

    await requestJson(server, '/api/v1/account/preferences', {
      method: 'PATCH',
      headers,
      body: { profileVisibility: 'NO_ONE' },
    });

    assert.equal(preferencesUtils.canViewProfile(await ownerDoc(), otherId), false);
    assert.equal(preferencesUtils.canViewProfile(await ownerDoc(), null), false);
    assert.equal(preferencesUtils.canViewProfile(await ownerDoc(), ownerId), true);
  } finally {
    await stopHttpServer(server);
  }
});

test('a hidden account leaves the public leaderboard without losing its progression', async () => {
  const server = await startHttpServer();

  try {
    const hidden = await registerAndLogin(server, 'privacy-hidden@example.com');
    const shown = await registerAndLogin(server, 'privacy-shown@example.com');
    const hiddenId = hidden.registered.body.user.id;
    const shownId = shown.registered.body.user.id;
    const hiddenHeaders = { authorization: `Bearer ${hidden.loggedIn.body.token}` };

    // Both accounts earn real progression, so hiding is distinguishable from
    // simply having nothing to show.
    await recordArcadionResult(hiddenId);
    await recordArcadionResult(shownId);
    const xpBeforeHide = (await User.findById(hiddenId)).totalXp;
    assert.ok(xpBeforeHide > 0, 'the hidden account genuinely earned XP first');

    // Before hiding, both accounts match the public leaderboard filter.
    const filter = preferencesUtils.getPublicLeaderboardFilter();
    const beforeIds = (await User.find(filter)).map((doc) => String(doc._id));
    assert.ok(beforeIds.includes(hiddenId), 'the account is listed before it hides');
    assert.ok(beforeIds.includes(shownId), 'the other account is listed too');

    await requestJson(server, '/api/v1/account/preferences', {
      method: 'PATCH',
      headers: hiddenHeaders,
      body: { leaderboardVisibility: 'HIDE' },
    });

    // The filter is what excludes it, not a deleted or zeroed record.
    const afterIds = (await User.find(filter)).map((doc) => String(doc._id));
    assert.equal(afterIds.includes(hiddenId), false, 'a hidden account is excluded');
    assert.ok(afterIds.includes(shownId), 'the other account is unaffected');

    // Exclusion never costs progression: the XP and the account are intact.
    const stored = await User.findById(hiddenId);
    assert.ok(stored, 'the account still exists');
    assert.equal(stored.totalXp, xpBeforeHide, 'hiding never touches XP');
    assert.equal(stored.status, ACCOUNT_STATUSES.ACTIVE);

    // And a hidden account can see itself and un-hide just as before.
    const unhidden = await requestJson(server, '/api/v1/account/preferences', {
      method: 'PATCH',
      headers: hiddenHeaders,
      body: { leaderboardVisibility: 'SHOW' },
    });
    assert.equal(unhidden.body.preferences.leaderboardVisibility, 'SHOW');
    const restoredIds = (await User.find(preferencesUtils.getPublicLeaderboardFilter()))
      .map((doc) => String(doc._id));
    assert.ok(restoredIds.includes(hiddenId), 'SHOW puts the account back');
  } finally {
    await stopHttpServer(server);
  }
});

/* ==================================================================
   Account deletion

   These tests run only against the ephemeral in-memory database the suite
   already uses; they never touch a real environment. They pin down the
   safeguards: the typed confirmation word, password re-authentication for
   password accounts, complete cleanup of the caller's own data, and the
   guarantee that no other account's data is ever removed.
   ================================================================== */

test('account deletion demands the typed confirmation word and the account password', async () => {
  const server = await startHttpServer();

  try {
    const account = await registerAndLogin(server, 'delete-guard@example.com');
    const other = await registerAndLogin(server, 'delete-guard-other@example.com');
    const userId = account.registered.body.user.id;
    const otherId = other.registered.body.user.id;
    const headers = { authorization: `Bearer ${account.loggedIn.body.token}` };

    // Wrong confirmation word: rejected, and nothing is touched.
    const wrongWord = await requestJson(server, '/api/v1/account', {
      method: 'DELETE',
      headers,
      body: { confirmation: 'delete', password: 'session-password-123' },
    });
    assert.equal(wrongWord.response.status, 400);
    assert.ok(await User.findById(userId), 'a wrong confirmation word deletes nothing');

    // Missing confirmation entirely.
    const noWord = await requestJson(server, '/api/v1/account', {
      method: 'DELETE',
      headers,
      body: { password: 'session-password-123' },
    });
    assert.equal(noWord.response.status, 400);
    assert.ok(await User.findById(userId));

    // Right word, missing password: rejected before any destructive step.
    const noPassword = await requestJson(server, '/api/v1/account', {
      method: 'DELETE',
      headers,
      body: { confirmation: 'DELETE' },
    });
    assert.equal(noPassword.response.status, 400);
    assert.ok(await User.findById(userId), 'a password account must re-authenticate');

    // Right word, wrong password: 401, account intact.
    const wrongPassword = await requestJson(server, '/api/v1/account', {
      method: 'DELETE',
      headers,
      body: { confirmation: 'DELETE', password: 'not-the-password' },
    });
    assert.equal(wrongPassword.response.status, 401);
    assert.ok(await User.findById(userId), 'a wrong password deletes nothing');

    // Unsupported fields are rejected outright, so no extra key can smuggle
    // a target account into the request. The id below is a real other user,
    // which proves the caller can never point the deletion at anyone else.
    const extraField = await requestJson(server, '/api/v1/account', {
      method: 'DELETE',
      headers,
      body: { confirmation: 'DELETE', password: 'session-password-123', userId: otherId },
    });
    assert.equal(extraField.response.status, 400);
    assert.ok(await User.findById(userId), 'the caller is still intact');
    assert.ok(await User.findById(otherId), 'and so is the account it tried to name');

    // Every rejected attempt left the session usable, proving no partial
    // state was written along the way.
    const stillMe = await requestJson(server, '/api/v1/auth/me', { headers });
    assert.equal(stillMe.response.status, 200);
  } finally {
    await stopHttpServer(server);
  }
});

test('a confirmed deletion removes the account and all of its own data only', async () => {
  const server = await startHttpServer();

  try {
    const victim = await registerAndLogin(server, 'delete-victim@example.com');
    const bystander = await registerAndLogin(server, 'delete-bystander@example.com');
    const victimId = victim.registered.body.user.id;
    const bystanderId = bystander.registered.body.user.id;
    const victimHeaders = { authorization: `Bearer ${victim.loggedIn.body.token}` };
    const bystanderHeaders = { authorization: `Bearer ${bystander.loggedIn.body.token}` };

    // Build up real owned data for the account that is about to be deleted.
    await recordArcadionResult(victimId);
    await Match.create({
      userId: victimId,
      game: XP_EARNING_GAME,
      opponentType: OPPONENT_TYPES.ARCADION,
      result: MATCH_RESULTS.WIN,
      completedAt: new Date('2026-05-02T12:00:00.000Z'),
    });
    await PasswordResetToken.create({
      userId: victimId,
      // The suite only needs rows that belong to the account; the hash is a
      // syntactically valid token digest, and nothing here verifies it.
      tokenHash: hashSecureToken(`arc_reset_${'a'.repeat(43)}`),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    // The bystander owns data too, which must survive untouched.
    await recordArcadionResult(bystanderId);
    await Match.create({
      userId: bystanderId,
      game: XP_EARNING_GAME,
      opponentType: OPPONENT_TYPES.ARCADION,
      result: MATCH_RESULTS.WIN,
      completedAt: new Date('2026-05-03T12:00:00.000Z'),
    });

    const sessionsBefore = await Session.countDocuments({ userId: victimId });
    assert.ok(sessionsBefore > 0, 'the account has live sessions before deletion');

    const deleted = await requestJson(server, '/api/v1/account', {
      method: 'DELETE',
      headers: victimHeaders,
      body: { confirmation: 'DELETE', password: 'session-password-123' },
    });
    assert.equal(deleted.response.status, 200);
    assert.ok(deleted.body.message, 'the deletion reports a confirmation message');

    // The account itself is gone.
    assert.equal(await User.findById(victimId), null, 'the user document is deleted');

    // Every record owned by the account is gone: no orphans are left behind.
    assert.equal(await Session.countDocuments({ userId: victimId }), 0, 'sessions removed');
    assert.equal(await Match.countDocuments({ userId: victimId }), 0, 'matches removed');
    assert.equal(
      await PasswordResetToken.countDocuments({ userId: victimId }),
      0,
      'reset tokens removed',
    );
    assert.equal(await OAuthHandoff.countDocuments({ userId: victimId }), 0, 'handoffs removed');

    // The stale access token is dead: the user no longer exists to load.
    const stale = await requestJson(server, '/api/v1/auth/me', { headers: victimHeaders });
    assert.equal(stale.response.status, 401, 'the old token can no longer authenticate');

    // A refresh attempt is refused too, so no credential outlives the account.
    const refreshed = await requestJson(server, '/api/v1/auth/refresh', {
      method: 'POST',
      body: {},
    });
    assert.ok(
      refreshed.response.status === 401 || refreshed.response.status === 400,
      `refresh after deletion is refused (got ${refreshed.response.status})`,
    );

    // The refresh cookie is cleared on the deleting response: `clearCookie`
    // emits an expired, empty cookie for the name rather than omitting it.
    const setCookie = deleted.response.headers.get('set-cookie') || '';
    const refreshClear = setCookie
      .split(/,(?=[^;]+=)/)
      .find((part) => part.trim().startsWith(`${REFRESH_COOKIE_NAME}=`));
    assert.ok(refreshClear, 'the deletion response addresses the refresh cookie');
    assert.match(
      refreshClear,
      new RegExp(`^${REFRESH_COOKIE_NAME}=;`),
      'and it clears it to an empty value',
    );
    assert.match(
      refreshClear,
      /expires=Thu, 01 Jan 1970/i,
      'with an expiry in the past, so the browser drops it',
    );

    // The bystander is completely untouched.
    const bystanderStored = await User.findById(bystanderId);
    assert.ok(bystanderStored, 'the other account still exists');
    assert.ok(bystanderStored.totalXp > 0, 'the other account keeps its progression');
    assert.equal(await Match.countDocuments({ userId: bystanderId }), 1, 'its match survives');
    const bystanderStillMe = await requestJson(server, '/api/v1/auth/me', {
      headers: bystanderHeaders,
    });
    assert.equal(bystanderStillMe.response.status, 200, 'the other session still works');
  } finally {
    await stopHttpServer(server);
  }
});

test('a Google-only account can delete itself with the typed confirmation alone', async () => {
  const server = await startHttpServer();

  try {
    const google = await signInWithGoogle(server);
    const headers = { authorization: `Bearer ${google.token}` };

    // No local password exists for a Google account, so there is nothing to
    // re-enter: the typed confirmation word is the only gate. This is the
    // documented limitation of the current architecture.
    const missingWord = await requestJson(server, '/api/v1/account', {
      method: 'DELETE',
      headers,
      body: {},
    });
    assert.equal(missingWord.response.status, 400);
    assert.ok(await User.findById(google.userId), 'no confirmation word deletes nothing');

    const deleted = await requestJson(server, '/api/v1/account', {
      method: 'DELETE',
      headers,
      body: { confirmation: 'DELETE' },
    });
    assert.equal(deleted.response.status, 200);
    assert.equal(await User.findById(google.userId), null, 'the Google account is deleted');

    const stale = await requestJson(server, '/api/v1/auth/me', { headers });
    assert.equal(stale.response.status, 401, 'its token is dead too');
  } finally {
    await stopHttpServer(server);
  }
});
