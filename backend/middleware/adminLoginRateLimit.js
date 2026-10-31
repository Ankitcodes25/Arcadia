/*
 * Failure-only rate limiter for the Admin Panel login resolver.
 *
 * Every Arcadia login passes through the resolver first, so this cannot use
 * the shared Mongo limiter in rateLimit.js: that one counts every request and
 * would throttle ordinary players. Only rejected admin logins (401) stay
 * counted, per IP and per submitted email, in a fixed 15-minute window held in
 * process memory; in-flight and aborted attempts hold their slot too. A restart resets the counters, which can only loosen the
 * limit, never lock the admin out. The 429 never says which bucket was hit.
 */

const { getRequestIp } = require('./rateLimit');
const normalizeEmail = require('../utils/normalizeEmail');

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_IP = 30;
const MAX_FAILURES_PER_EMAIL = 8;
const RATE_LIMIT_MESSAGE = 'Too many login attempts. Please try again later.';

const buckets = new Map(); // `${scope}:${identity}` -> { count, resetAt }

function pruneExpired(now) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

/** Counts the attempt and returns the exact bucket (window) it was counted in. */
function reserveAttempt(key, now) {
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const bucket = { count: 1, resetAt: now + LOGIN_WINDOW_MS };
    buckets.set(key, bucket);
    return bucket;
  }
  existing.count += 1;
  return existing;
}

/** Gives a slot back only to the window it was taken from, never a newer one. */
function releaseAttempt(key, bucket) {
  if (buckets.get(key) === bucket && bucket.count > 0) {
    bucket.count -= 1;
  }
}

function isExhausted(key, limit) {
  const bucket = buckets.get(key);
  return Boolean(bucket && bucket.count >= limit);
}

function adminLoginRateLimit(req, res, next) {
  const now = Date.now();
  pruneExpired(now);

  const ipKey = `ip:${getRequestIp(req)}`;
  const email = normalizeEmail(req.body && req.body.email);
  const emailKey = email ? `email:${email}` : null;

  if (isExhausted(ipKey, MAX_FAILURES_PER_IP) || (emailKey && isExhausted(emailKey, MAX_FAILURES_PER_EMAIL))) {
    res.set('Retry-After', String(Math.ceil(LOGIN_WINDOW_MS / 1000)));
    return res.status(429).json({ error: RATE_LIMIT_MESSAGE });
  }

  // Reserve the slot before the (slow, bcrypt) password check so parallel
  // attempts cannot all pass the check above. It is handed back only once a
  // response has been fully sent with a non-401 status; an attempt the client
  // aborts before that keeps its slot, counted like a failure.
  const reservations = (emailKey ? [ipKey, emailKey] : [ipKey])
    .map((key) => [key, reserveAttempt(key, now)]);

  res.once('finish', () => {
    if (res.statusCode !== 401) {
      reservations.forEach(([key, bucket]) => releaseAttempt(key, bucket));
    }
  });

  return next();
}

/** Test-only: clears all limiter state between test cases. */
function resetAdminLoginRateLimitForTests() {
  buckets.clear();
}

module.exports = {
  adminLoginRateLimit,
  resetAdminLoginRateLimitForTests,
  ADMIN_LOGIN_LIMITS: Object.freeze({
    windowMs: LOGIN_WINDOW_MS,
    perIp: MAX_FAILURES_PER_IP,
    perEmail: MAX_FAILURES_PER_EMAIL,
  }),
};
