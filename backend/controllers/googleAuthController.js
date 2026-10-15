const googleOAuthService = require('../services/googleOAuthService');
const emailService = require('../services/emailService');
const welcomeBackService = require('../services/welcomeBackService');
const refreshSessionService = require('../services/refreshSessionService');
const { getGoogleOAuthConfig } = require('../config/googleOAuth');
const {
  getOAuthStateCookie,
  setOAuthStateCookie,
  clearOAuthStateCookie,
} = require('../config/oauthCookie');
const {
  setRefreshCookie,
  clearRefreshCookie,
} = require('../config/refreshCookie');

const SAFE_OAUTH_ERROR_CODES = new Set([
  'access_denied',
  'account_exists',
  'authentication_failed',
  'invalid_state',
]);

function redirectWithOAuthError(res, config, errorCode) {
  clearOAuthStateCookie(res);
  const url = new URL(config.frontendSuccessUrl);
  const fragment = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
  fragment.set('oauth_error', errorCode);
  url.hash = fragment.toString();
  return res.redirect(url.toString());
}

function getOAuthErrorCode(error) {
  const errorCode = error && error.oauthErrorCode;
  if (SAFE_OAUTH_ERROR_CODES.has(errorCode)) {
    return errorCode;
  }

  if (error && error.statusCode === 400) {
    return 'invalid_state';
  }

  return 'authentication_failed';
}

async function start(req, res, next) {
  try {
    const config = getGoogleOAuthConfig();
    const transaction = await googleOAuthService.createOAuthState();
    const authorizationUrl = googleOAuthService.buildGoogleAuthorizationUrl(
      transaction.state,
      config,
      transaction,
    );
    setOAuthStateCookie(res, transaction.state);
    return res.redirect(authorizationUrl);
  } catch (error) {
    return next(error);
  }
}

async function callback(req, res, next) {
  let config;
  let createdRefreshToken = null;

  try {
    config = getGoogleOAuthConfig();
    const state = typeof req.query.state === 'string' ? req.query.state : null;
    const stateCookie = getOAuthStateCookie(req);

    const transaction = await googleOAuthService.consumeOAuthState({ state, stateCookie });

    if (typeof req.query.error === 'string') {
      return redirectWithOAuthError(res, config, 'access_denied');
    }

    const code = typeof req.query.code === 'string' ? req.query.code : null;
    const identity = await googleOAuthService.exchangeAuthorizationCode(code, {
      codeVerifier: transaction.codeVerifier,
      nonce: transaction.nonce,
    });
    const signInStartedAt = new Date();
    const {
      user,
      created,
      previousLoginAt,
    } = await googleOAuthService.findOrCreateGoogleUser(identity, req);
    const session = await refreshSessionService.createRefreshSession({
      userId: user._id,
      req,
    });

    createdRefreshToken = session.refreshToken;
    setRefreshCookie(res, session.refreshToken);

    const handoffCode = await googleOAuthService.createOAuthHandoff({
      userId: user._id,
      sessionId: session.session._id,
      credentialVersion: user.tokenVersion,
    });

    // Google accounts keep their verified Google name; the Arcadia username is
    // only used as a greeting fallback when no name is available.
    const greetingName = user.displayName || user.name || user.username;

    try {
      if (created) {
        await emailService.sendWelcomeEmail({
          to: user.email,
          displayName: greetingName,
        });
      } else if (await welcomeBackService.isReturningAfterInactivity({
        userId: user._id,
        previousLoginAt,
        createdAt: user.createdAt,
        signInStartedAt,
      })) {
        await emailService.sendWelcomeBackEmail({
          to: user.email,
          displayName: greetingName,
        });
      }
    } catch {
      // Welcome delivery must never block Google authentication.
    }

    const successUrl = googleOAuthService.buildFrontendSuccessUrl(
      config.frontendSuccessUrl,
      handoffCode,
    );

    clearOAuthStateCookie(res);
    return res.redirect(successUrl);
  } catch (error) {
    clearOAuthStateCookie(res);

    if (createdRefreshToken) {
      await refreshSessionService.revokeRefreshToken(createdRefreshToken).catch(() => {});
      clearRefreshCookie(res);
    }

    if (config) {
      return redirectWithOAuthError(res, config, getOAuthErrorCode(error));
    }

    return next(error);
  }
}

async function exchange(req, res, next) {
  try {
    if (
      !req.body
      || typeof req.body !== 'object'
      || Array.isArray(req.body)
      || Object.keys(req.body).some((key) => key !== 'code')
    ) {
      return res.status(400).json({ error: 'Request contains unsupported fields' });
    }
    const code = req.body && typeof req.body.code === 'string' ? req.body.code : null;
    const result = await googleOAuthService.consumeOAuthHandoff(code);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  start,
  callback,
  exchange,
};
