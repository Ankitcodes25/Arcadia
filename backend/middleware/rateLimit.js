const crypto = require('node:crypto');
const { jwtSecret, nodeEnv } = require('../config/env');
const { RateLimitBucket } = require('../models/RateLimitBucket');
const normalizeEmail = require('../utils/normalizeEmail');
const { normalizeUsername } = require('../utils/username');
const { isValidRefreshToken } = require('../utils/refreshToken');

const RATE_LIMIT_MESSAGE = 'Too many requests. Please try again later.';
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

function getRequestIp(req) {
  if (typeof req.ip === 'string' && req.ip.trim()) {
    return req.ip.trim().slice(0, 64);
  }

  if (req.socket && typeof req.socket.remoteAddress === 'string') {
    return req.socket.remoteAddress.slice(0, 64);
  }

  return 'unknown';
}

function getIpIdentifier(req) {
  return `ip:${getRequestIp(req)}`;
}

function getEmailIdentifier(req) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const email = normalizeEmail(body.email) || 'missing';
  return `email:${email}`;
}

function getUsernameBodyIdentifier(req) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  return `username:${normalizeUsername(body.username) || 'missing'}`;
}

function getUsernameQueryIdentifier(req) {
  return `username:${normalizeUsername(req.query && req.query.username) || 'missing'}`;
}

function getUserIdentifier(req) {
  const userId = req.user && req.user.id
    ? req.user.id
    : req.auth && req.auth.userId;
  return `user:${userId || 'anonymous'}`;
}

function getRefreshTokenIdentifier(req) {
  const cookie = req.cookies && req.cookies.arcadia_refresh;
  const rawCookie = typeof req.headers.cookie === 'string'
    ? req.headers.cookie
      .split(';')
      .map((part) => part.trim().split('='))
      .find(([name]) => name === 'arcadia_refresh')?.[1]
    : null;
  let token = cookie || rawCookie || null;
  if (typeof token === 'string') {
    try {
      token = decodeURIComponent(token);
    } catch {
      token = null;
    }
  }
  return `refresh:${isValidRefreshToken(token) ? token : 'missing'}`;
}

function getHandoffIdentifier(req) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  return `handoff:${typeof body.code === 'string' ? body.code : 'missing'}`;
}

function getResetTokenIdentifier(req) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  return `reset:${typeof body.token === 'string' ? body.token : 'missing'}`;
}

function hashRateLimitKey(scope, identifier, windowStart) {
  return crypto
    .createHmac('sha256', jwtSecret)
    .update(`${scope}\u0000${identifier}\u0000${windowStart}`, 'utf8')
    .digest('hex');
}

async function incrementBucket({ scope, identifier, windowMs, now }) {
  await RateLimitBucket.init();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const keyHash = hashRateLimitKey(scope, identifier, windowStart);
  const filter = { keyHash };
  const update = {
    $setOnInsert: {
      route: scope,
      windowStart,
      expiresAt: new Date(windowStart + windowMs),
    },
    $inc: { count: 1 },
  };
  const options = {
    upsert: true,
    returnDocument: 'after',
    setDefaultsOnInsert: true,
  };

  try {
    const bucket = await RateLimitBucket.findOneAndUpdate(filter, update, options);
    if (bucket) return bucket;
  } catch (error) {
    if (!error || error.code !== 11000) throw error;
  }

  return RateLimitBucket.findOne(filter);
}

function createRateLimit({
  scope,
  limit,
  windowMs,
  identifier = getIpIdentifier,
  message = RATE_LIMIT_MESSAGE,
  clock = () => Date.now(),
}) {
  if (!scope || !Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowMs) || windowMs < 1) {
    throw new Error('Invalid rate limit configuration');
  }

  return async function rateLimit(req, res, next) {
    try {
      const now = clock();
      const identifierValue = typeof identifier === 'function'
        ? identifier(req)
        : String(identifier);
      const bucket = await incrementBucket({
        scope,
        identifier: identifierValue,
        windowMs,
        now,
      });

      if (!bucket) {
        throw new Error('Rate limit counter unavailable');
      }

      const resetAt = bucket.windowStart + windowMs;
      const remaining = Math.max(0, limit - bucket.count);
      res.set({
        'RateLimit-Limit': String(limit),
        'RateLimit-Remaining': String(remaining),
        'RateLimit-Reset': String(Math.max(0, Math.ceil(resetAt / 1000))),
        'RateLimit-Policy': `${limit};w=${Math.ceil(windowMs / 1000)}`,
      });

      if (bucket.count > limit) {
        res.set('Retry-After', String(Math.max(1, Math.ceil((resetAt - now) / 1000))));
        return res.status(429).json({ error: message });
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

const policies = Object.freeze({
  register: [
    { scope: 'auth:register:ip', limit: 20, windowMs: HOUR_MS, identifier: getIpIdentifier },
    { scope: 'auth:register:email', limit: 8, windowMs: HOUR_MS, identifier: getEmailIdentifier },
  ],
  login: [
    { scope: 'auth:login:ip', limit: 60, windowMs: 15 * MINUTE_MS, identifier: getIpIdentifier },
    { scope: 'auth:login:email', limit: 20, windowMs: 15 * MINUTE_MS, identifier: getEmailIdentifier },
  ],
  refresh: [
    { scope: 'auth:refresh:ip', limit: 120, windowMs: 15 * MINUTE_MS, identifier: getIpIdentifier },
    { scope: 'auth:refresh:token', limit: 30, windowMs: 15 * MINUTE_MS, identifier: getRefreshTokenIdentifier },
  ],
  logout: [
    { scope: 'auth:logout:ip', limit: 60, windowMs: 15 * MINUTE_MS, identifier: getIpIdentifier },
  ],
  logoutAll: [
    { scope: 'auth:logout-all:user', limit: 10, windowMs: 15 * MINUTE_MS, identifier: getUserIdentifier },
  ],
  forgotPassword: [
    { scope: 'auth:forgot-password:ip', limit: 30, windowMs: HOUR_MS, identifier: getIpIdentifier },
    { scope: 'auth:forgot-password:email', limit: 5, windowMs: HOUR_MS, identifier: getEmailIdentifier },
  ],
  resetPassword: [
    { scope: 'auth:reset-password:ip', limit: 60, windowMs: HOUR_MS, identifier: getIpIdentifier },
    { scope: 'auth:reset-password:token', limit: 20, windowMs: HOUR_MS, identifier: getResetTokenIdentifier },
  ],
  googleStart: [
    { scope: 'auth:google:start:ip', limit: 30, windowMs: 10 * MINUTE_MS, identifier: getIpIdentifier },
  ],
  googleCallback: [
    { scope: 'auth:google:callback:ip', limit: 60, windowMs: 10 * MINUTE_MS, identifier: getIpIdentifier },
  ],
  googleExchange: [
    { scope: 'auth:google:exchange:ip', limit: 60, windowMs: 10 * MINUTE_MS, identifier: getIpIdentifier },
    { scope: 'auth:google:exchange:code', limit: 20, windowMs: 10 * MINUTE_MS, identifier: getHandoffIdentifier },
  ],
  usernameAvailability: [
    { scope: 'account:username-availability:ip', limit: 120, windowMs: 5 * MINUTE_MS, identifier: getIpIdentifier },
    { scope: 'account:username-availability:name', limit: 60, windowMs: 5 * MINUTE_MS, identifier: getUsernameQueryIdentifier },
  ],
  usernameChange: [
    { scope: 'account:username:ip', limit: 30, windowMs: HOUR_MS, identifier: getIpIdentifier },
    { scope: 'account:username:user', limit: 10, windowMs: HOUR_MS, identifier: getUserIdentifier },
  ],
  changePassword: [
    { scope: 'account:change-password:ip', limit: 30, windowMs: 15 * MINUTE_MS, identifier: getIpIdentifier },
    { scope: 'account:change-password:user', limit: 10, windowMs: 15 * MINUTE_MS, identifier: getUserIdentifier },
  ],
  sessionManagement: [
    { scope: 'account:sessions:ip', limit: 120, windowMs: 15 * MINUTE_MS, identifier: getIpIdentifier },
    { scope: 'account:sessions:user', limit: 60, windowMs: 15 * MINUTE_MS, identifier: getUserIdentifier },
  ],
  preferences: [
    { scope: 'account:preferences:ip', limit: 120, windowMs: 15 * MINUTE_MS, identifier: getIpIdentifier },
    { scope: 'account:preferences:user', limit: 60, windowMs: 15 * MINUTE_MS, identifier: getUserIdentifier },
  ],
  accountDeletion: [
    { scope: 'account:delete:ip', limit: 10, windowMs: HOUR_MS, identifier: getIpIdentifier },
    { scope: 'account:delete:user', limit: 5, windowMs: HOUR_MS, identifier: getUserIdentifier },
  ],
  adminMutation: [
    { scope: 'admin:mutation:ip', limit: 120, windowMs: 15 * MINUTE_MS, identifier: getIpIdentifier },
    { scope: 'admin:mutation:user', limit: 60, windowMs: 15 * MINUTE_MS, identifier: getUserIdentifier },
  ],
});

const limiters = Object.fromEntries(
  Object.entries(policies).map(([name, policy]) => [
    name,
    Object.freeze(policy.map((options) => Object.freeze(createRateLimit(options)))),
  ]),
);

module.exports = {
  ...limiters,
  RATE_LIMIT_MESSAGE,
  createRateLimit,
  incrementBucket,
  getIpIdentifier,
  getEmailIdentifier,
  getUserIdentifier,
  isTestEnvironment: nodeEnv === 'test',
};
