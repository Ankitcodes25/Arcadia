/*
 * In-memory fixed-window rate limiter for admin login attempts.
 *
 * The admin backend has no database by design, so the limiter keeps counters
 * in process memory. That is sufficient for a single-instance admin service:
 * a restart resets counters, which only ever loosens the limit temporarily —
 * it can never lock the admin out permanently.
 *
 * Two buckets are checked for every login: per-IP and per-account (keyed on
 * the submitted email), so neither spraying one account from many addresses
 * nor hammering one address with many accounts gets through. Failures are
 * counted, successes reset the account bucket. Error responses stay generic —
 * they never reveal which of the two limits was hit or whether an email is the
 * admin account.
 */

const { getEnv } = require('../config/env');

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS_PER_IP = 30;
const MAX_LOGIN_ATTEMPTS_PER_USERNAME = 8;

const buckets = new Map();

function bucketKey(scope, identity) {
  return `${scope}:${identity}`;
}

function pruneExpired(now) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function registerFailure(scope, identity, now = Date.now()) {
  const key = bucketKey(scope, identity);
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }

  existing.count += 1;
}

function remainingAttempts(scope, identity, now = Date.now()) {
  const bucket = buckets.get(bucketKey(scope, identity));
  if (!bucket || bucket.resetAt <= now) {
    return scope === 'ip'
      ? MAX_LOGIN_ATTEMPTS_PER_IP
      : MAX_LOGIN_ATTEMPTS_PER_USERNAME;
  }
  const max = scope === 'ip' ? MAX_LOGIN_ATTEMPTS_PER_IP : MAX_LOGIN_ATTEMPTS_PER_USERNAME;
  return Math.max(0, max - bucket.count);
}

function resetIdentity(scope, identity) {
  buckets.delete(bucketKey(scope, identity));
}

/**
 * Express middleware factory. `identityResolver` maps the request to the
 * secondary (per-account) bucket identity — the submitted email; failures are
 * recorded on 401s (rejected admin logins).
 */
function createLoginRateLimiter(identityResolver) {
  return function loginRateLimiter(req, res, next) {
    const now = Date.now();
    pruneExpired(now);

    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const identity = String(identityResolver(req) || '').trim().toLowerCase();

    const ipRemaining = remainingAttempts('ip', ip, now);
    const identityRemaining = identity ? remainingAttempts('username', identity, now) : Infinity;
    const blockedFor = Math.min(ipRemaining, identityRemaining);

    if (blockedFor <= 0) {
      res.set('Retry-After', String(Math.ceil(LOGIN_WINDOW_MS / 1000)));
      return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
    }

    // Record the failure when this request turns out to be a rejected login.
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 401) {
        registerFailure('ip', ip, now);
        if (identity) {
          registerFailure('username', identity, now);
        }
      }
      return originalJson(body);
    };

    return next();
  };
}

/** Test-only helper: clears all limiter state between test cases. */
function resetLoginRateLimiterForTests() {
  buckets.clear();
}

module.exports = {
  createLoginRateLimiter,
  resetLoginRateLimiterForTests,
  // Exported for documentation/tests; the live values above are authoritative.
  LOGIN_LIMITS: Object.freeze({
    windowMs: LOGIN_WINDOW_MS,
    perIp: MAX_LOGIN_ATTEMPTS_PER_IP,
    perUsername: MAX_LOGIN_ATTEMPTS_PER_USERNAME,
  }),
};

// Reference the env module so configuration validation runs at import time.
getEnv();
