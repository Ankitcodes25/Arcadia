const authService = require('../services/authService');
const emailService = require('../services/emailService');
const welcomeBackService = require('../services/welcomeBackService');
const refreshSessionService = require('../services/refreshSessionService');
const { revokeAllUserSessions } = require('../services/userSecurityService');
const {
  getRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
} = require('../config/refreshCookie');
const {
  validateRegistration,
  validateLogin,
} = require('../validators/authValidator');
const { toSafeUser } = require('../utils/safeUser');

async function issueRefreshCookie(res, userId, req) {
  const session = await refreshSessionService.createRefreshSession({ userId, req });
  setRefreshCookie(res, session.refreshToken);
}

// Password signups do not ask for a display name, so the Arcadia username is
// used as the greeting when no display name exists yet.
function getWelcomeGreetingName(user) {
  return user.displayName || user.name || user.username;
}

async function sendWelcomeAfterSignup(user) {
  try {
    await emailService.sendWelcomeEmail({
      to: user.email,
      displayName: getWelcomeGreetingName(user),
    });
  } catch {
    // Welcome delivery must never block account creation.
  }
}

// Sends the welcome-back email only when this sign-in follows the configured
// inactivity period (WELCOME_BACK_INACTIVITY_DAYS, default 30).
async function sendWelcomeBackIfReturning(user, previousLoginAt, signInStartedAt) {
  try {
    const returning = await welcomeBackService.isReturningAfterInactivity({
      userId: user.id,
      previousLoginAt,
      createdAt: user.createdAt,
      signInStartedAt,
    });
    if (!returning) return;

    await emailService.sendWelcomeBackEmail({
      to: user.email,
      displayName: getWelcomeGreetingName(user),
    });
  } catch {
    // Welcome-back delivery must never block authentication.
  }
}

async function register(req, res, next) {
  try {
    const validationError = validateRegistration(req.body);
    if (validationError) return res.status(400).json({ error: validationError });

    // Signup is final: the account is created ACTIVE and the session is issued
    // immediately, so there is no pending state to wait on and no email to
    // confirm before the player can log in.
    const result = await authService.register(req.body);

    await sendWelcomeAfterSignup(result.user);
    await issueRefreshCookie(res, result.user.id, req);
    return res.status(201).json(result);
  } catch (error) {
    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const validationError = validateLogin(req.body);
    if (validationError) return res.status(400).json({ error: validationError });

    const signInStartedAt = new Date();
    const { previousLoginAt, ...result } = await authService.login(req.body, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    await issueRefreshCookie(res, result.user.id, req);
    await sendWelcomeBackIfReturning(result.user, previousLoginAt, signInStartedAt);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

async function refresh(req, res, next) {
  const refreshToken = getRefreshToken(req);

  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token required' });
  }

  try {
    const result = await refreshSessionService.rotateRefreshSession({
      refreshToken,
      req,
    });
    setRefreshCookie(res, result.refreshToken);
    let released = false;
    const releaseClaim = () => {
      if (released) return;
      released = true;
      void refreshSessionService.releaseRotationClaim(result.rotationClaim);
    };
    res.once('finish', releaseClaim);
    res.once('close', releaseClaim);
    return res.json({
      token: result.accessToken,
      user: toSafeUser(result.user),
    });
  } catch (error) {
    clearRefreshCookie(res);
    return next(error);
  }
}

async function logout(req, res, next) {
  const refreshToken = getRefreshToken(req);

  try {
    if (refreshToken) {
      await refreshSessionService.revokeRefreshToken(refreshToken);
    }

    clearRefreshCookie(res);
    return res.json({ message: 'Logged out successfully' });
  } catch (error) {
    clearRefreshCookie(res);
    return next(error);
  }
}

async function logoutAll(req, res, next) {
  try {
    const userId = req.auth && req.auth.userId
      ? req.auth.userId
      : req.user && req.user.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = await revokeAllUserSessions(userId);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    clearRefreshCookie(res);
    return res.json({ message: 'All sessions revoked' });
  } catch (error) {
    clearRefreshCookie(res);
    return next(error);
  }
}

async function me(req, res, next) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    /*
     * `req.user` is the already serialized safe user produced by the auth
     * middleware, so it is re-read from the database here instead of being
     * re-serialized. That keeps `/me` derived from the current account record,
     * which is where the authoritative username, avatar and XP totals live.
     */
    const user = await authService.getUserById(req.user.id);

    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    return res.json(toSafeUser(user));
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  me,
};
