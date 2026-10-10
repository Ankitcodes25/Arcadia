const { OAuth2Client } = require('google-auth-library');
const { OAuthState } = require('../models/OAuthState');
const { OAuthHandoff } = require('../models/OAuthHandoff');
const { Session } = require('../models/Session');
const {
  User,
  USER_ROLES,
  ACCOUNT_STATUSES,
  GOOGLE_PROVIDER,
} = require('../models/User');
const normalizeEmail = require('../utils/normalizeEmail');
const { toSafeUser } = require('../utils/safeUser');
const { signAccessToken } = require('../utils/jwt');
const {
  generateOAuthState,
  generateOAuthHandoffCode,
  generateOAuthCodeVerifier,
  generateOAuthNonce,
  isValidOAuthCodeVerifier,
  derivePkceChallenge,
  isValidOAuthState,
  isValidOAuthHandoffCode,
  hashOAuthValue,
  verifyOAuthValue,
} = require('../utils/oauth');
const { getGoogleOAuthConfig } = require('../config/googleOAuth');
const { createUserWithPlayerId } = require('./playerIdService');
const {
  getTrustedGooglePictureUrl,
  normalizeDisplayName,
  getDisplayNameValidationError,
} = require('../utils/profileValidation');
const {
  AVATAR_TYPES,
  DEFAULT_LOCAL_AVATAR_ID,
  GOOGLE_AVATAR_VALUE,
} = require('../config/avatar');

const GOOGLE_ISSUERS = new Set([
  'accounts.google.com',
  'https://accounts.google.com',
]);
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const OAUTH_HANDOFF_TTL_MS = 2 * 60 * 1000;

function createError(message, statusCode, oauthErrorCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.expose = true;
  if (oauthErrorCode) {
    error.oauthErrorCode = oauthErrorCode;
  }
  return error;
}

function getRequestMetadata(req) {
  const ip = typeof req?.ip === 'string' ? req.ip.trim().slice(0, 64) : null;
  const userAgent = typeof req?.get === 'function'
    ? (req.get('user-agent') || '').trim().slice(0, 512)
    : null;

  return {
    lastLoginIp: ip || null,
    lastLoginUserAgent: userAgent || null,
  };
}

const defaultClientFactory = (config) => new OAuth2Client(config);
let clientFactory = defaultClientFactory;

function setGoogleClientFactoryForTests(factory) {
  if (factory !== null && typeof factory !== 'function') {
    throw new Error('Google client factory must be a function');
  }

  clientFactory = factory || defaultClientFactory;
}

function resetGoogleClientFactoryForTests() {
  clientFactory = defaultClientFactory;
}

function getClient(config) {
  return clientFactory(config);
}

async function createOAuthState() {
  await OAuthState.init();

  const state = generateOAuthState();
  const codeVerifier = generateOAuthCodeVerifier();
  const nonce = generateOAuthNonce();

  await OAuthState.create({
    stateHash: hashOAuthValue(state),
    codeVerifier,
    nonce,
    expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
  });

  return {
    state,
    codeVerifier,
    nonce,
    codeChallenge: derivePkceChallenge(codeVerifier),
  };
}

function buildGoogleAuthorizationUrl(
  state,
  config = getGoogleOAuthConfig(),
  transaction,
) {
  if (
    !isValidOAuthState(state)
    || !transaction
    || !isValidOAuthCodeVerifier(transaction.codeVerifier)
    || typeof transaction.nonce !== 'string'
    || !transaction.nonce
  ) {
    throw createError('Invalid OAuth state', 400, 'invalid_state');
  }

  return getClient(config).generateAuthUrl({
    access_type: 'online',
    scope: config.scopes,
    state,
    code_challenge: derivePkceChallenge(transaction.codeVerifier),
    code_challenge_method: 'S256',
    nonce: transaction.nonce,
  });
}

async function consumeOAuthState({ state, stateCookie }) {
  if (!isValidOAuthState(state) || !isValidOAuthState(stateCookie)) {
    throw createError('Invalid OAuth state', 400, 'invalid_state');
  }

  let stateCookieHash;
  try {
    stateCookieHash = hashOAuthValue(stateCookie);
  } catch {
    throw createError('Invalid OAuth state', 400, 'invalid_state');
  }

  if (!verifyOAuthValue(state, stateCookieHash)) {
    throw createError('Invalid OAuth state', 400, 'invalid_state');
  }

  const now = new Date();
  const stateRecord = await OAuthState.findOneAndUpdate(
    {
      stateHash: hashOAuthValue(state),
      consumedAt: null,
      expiresAt: { $gt: now },
    },
    {
      $set: { consumedAt: now },
      $unset: { codeVerifier: 1, nonce: 1 },
    },
    { returnDocument: 'before' },
  ).select('+codeVerifier +nonce');

  if (!stateRecord) {
    throw createError('Invalid or expired OAuth state', 400, 'invalid_state');
  }

  return stateRecord;
}

function validateGoogleIdentity(payload, clientId) {
  if (!payload || !GOOGLE_ISSUERS.has(payload.iss)) {
    throw createError('Google identity could not be verified', 401, 'authentication_failed');
  }

  if (
    payload.aud !== clientId
    || typeof payload.sub !== 'string'
    || !payload.sub.trim()
    || payload.sub.length > 255
  ) {
    throw createError('Google identity could not be verified', 401, 'authentication_failed');
  }

  if (payload.email_verified !== true) {
    throw createError('Google email is not verified', 401, 'authentication_failed');
  }

  const email = normalizeEmail(payload.email);
  if (!normalizeEmail.isValidEmail(email)) {
    throw createError('Google identity could not be verified', 401, 'authentication_failed');
  }

  const rawName = typeof payload.name === 'string' ? normalizeDisplayName(payload.name) : '';
  const nameError = getDisplayNameValidationError(rawName);
  const name = rawName && !nameError
    ? rawName.slice(0, 80)
    : email.split('@')[0].slice(0, 80);

  return {
    googleId: payload.sub.trim().slice(0, 255),
    email,
    name,
    pictureUrl: getTrustedGooglePictureUrl(payload.picture),
  };
}

async function exchangeAuthorizationCode(code, { codeVerifier, nonce } = {}) {
  if (typeof code !== 'string' || !code || code.length > 2048) {
    throw createError('Invalid Google authorization code', 400, 'authentication_failed');
  }

  if (!isValidOAuthCodeVerifier(codeVerifier) || typeof nonce !== 'string' || !nonce) {
    throw createError('Invalid OAuth transaction', 400, 'invalid_state');
  }

  const config = getGoogleOAuthConfig();
  let payload;

  try {
    const client = getClient(config);
    const tokenResponse = await client.getToken({
      code,
      codeVerifier,
    });
    const idToken = tokenResponse && tokenResponse.tokens && tokenResponse.tokens.id_token;

    if (!idToken) {
      throw new Error('Missing Google ID token');
    }

    const ticket = await client.verifyIdToken({
      idToken,
      audience: config.clientId,
    });
    payload = ticket.getPayload();
  } catch (error) {
    if (error && error.expose) {
      throw error;
    }

    throw createError('Google authentication failed', 502, 'authentication_failed');
  }

  let nonceMatches = false;
  try {
    nonceMatches = Boolean(
      payload
      && typeof payload.nonce === 'string'
      && verifyOAuthValue(payload.nonce, hashOAuthValue(nonce)),
    );
  } catch {
    nonceMatches = false;
  }

  if (!nonceMatches) {
    throw createError('Google identity nonce is invalid', 401, 'authentication_failed');
  }

  return validateGoogleIdentity(payload, config.clientId);
}

async function findOrCreateGoogleUser(identity, req) {
  const now = new Date();
  const metadata = getRequestMetadata(req);
  const linkedUser = await User.findOne({
    'google.provider': GOOGLE_PROVIDER,
    'google.subject': identity.googleId,
  });

  if (linkedUser) {
    if (linkedUser.status !== ACCOUNT_STATUSES.ACTIVE) {
      throw createError('Google sign-in could not be completed', 403, 'authentication_failed');
    }

    await User.updateOne(
      { _id: linkedUser._id },
      {
        $set: {
          'google.email': identity.email,
          'google.pictureUrl': identity.pictureUrl || null,
          'google.linkedAt': now,
          lastLoginAt: now,
          ...metadata,
        },
      },
    );

    linkedUser.google.email = identity.email;
    linkedUser.google.pictureUrl = identity.pictureUrl || null;
    linkedUser.google.linkedAt = now;
    linkedUser.lastLoginAt = now;
    Object.assign(linkedUser, metadata);
    return { user: linkedUser, created: false };
  }

  const existingEmailUser = await User.findOne({ email: identity.email });
  if (existingEmailUser) {
    throw createError(
      'Google sign-in could not be completed',
      409,
      'account_exists',
    );
  }

  try {
    // createUserWithPlayerId gives the new Google account its permanent Player
    // ID server side, regenerating it if the unique index rejects a collision.
    const user = await createUserWithPlayerId({
      email: identity.email,
      name: identity.name,
      displayName: identity.name,
      avatar: identity.pictureUrl
        ? { type: AVATAR_TYPES.GOOGLE, value: GOOGLE_AVATAR_VALUE }
        : { type: AVATAR_TYPES.LOCAL, value: DEFAULT_LOCAL_AVATAR_ID },
      role: USER_ROLES.USER,
      status: ACCOUNT_STATUSES.ACTIVE,
      google: {
        provider: GOOGLE_PROVIDER,
        subject: identity.googleId,
        email: identity.email,
        pictureUrl: identity.pictureUrl || null,
        linkedAt: now,
      },
      lastLoginAt: now,
      ...metadata,
    });
    return { user, created: true };
  } catch (error) {
    if (error && error.code === 11000) {
      const isEmailConflict = Boolean(
        error.keyPattern
        && Object.prototype.hasOwnProperty.call(error.keyPattern, 'email'),
      );
      throw createError(
        'Google sign-in could not be completed',
        409,
        isEmailConflict ? 'account_exists' : 'authentication_failed',
      );
    }

    throw error;
  }
}

async function createOAuthHandoff({ userId, sessionId, credentialVersion }) {
  await OAuthHandoff.init();

  const code = generateOAuthHandoffCode();
  await OAuthHandoff.create({
    codeHash: hashOAuthValue(code),
    userId,
    sessionId,
    credentialVersion,
    expiresAt: new Date(Date.now() + OAUTH_HANDOFF_TTL_MS),
  });

  return code;
}

async function consumeOAuthHandoff(code) {
  if (!isValidOAuthHandoffCode(code)) {
    throw createError('Invalid or expired OAuth handoff', 401, 'authentication_failed');
  }

  const handoff = await OAuthHandoff.findOneAndUpdate(
    {
      codeHash: hashOAuthValue(code),
      consumedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { $set: { consumedAt: new Date() } },
    { returnDocument: 'after' },
  ).select('+codeHash');

  if (!handoff || !verifyOAuthValue(code, handoff.codeHash)) {
    throw createError('Invalid or expired OAuth handoff', 401, 'authentication_failed');
  }

  const session = await Session.findById(handoff.sessionId);
  if (
    !session
    || session.revokedAt
    || session.expiresAt <= new Date()
    || session.credentialVersion !== handoff.credentialVersion
  ) {
    throw createError('Invalid or expired OAuth handoff', 401, 'authentication_failed');
  }

  const user = await User.findById(handoff.userId).select('-passwordHash');
  if (
    !user
    || user.status !== ACCOUNT_STATUSES.ACTIVE
    || user.tokenVersion !== handoff.credentialVersion
  ) {
    throw createError('Google sign-in could not be completed', 403, 'authentication_failed');
  }

  return {
    token: signAccessToken(user),
    user: toSafeUser(user),
  };
}

function buildFrontendSuccessUrl(frontendSuccessUrl, code) {
  const url = new URL(frontendSuccessUrl);
  const fragment = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
  fragment.set('oauth_code', code);
  url.hash = fragment.toString();
  return url.toString();
}

module.exports = {
  createOAuthState,
  buildGoogleAuthorizationUrl,
  consumeOAuthState,
  exchangeAuthorizationCode,
  findOrCreateGoogleUser,
  createOAuthHandoff,
  consumeOAuthHandoff,
  buildFrontendSuccessUrl,
  setGoogleClientFactoryForTests,
  resetGoogleClientFactoryForTests,
  getGoogleOAuthConfig,
};
