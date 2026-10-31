/*
 * Session cookie configuration for the admin session.
 *
 * The admin session exists ONLY as an HTTP-only cookie — no token is ever
 * returned to JavaScript, and nothing is stored in localStorage or
 * sessionStorage on the frontend. The cookie is scoped to the admin API
 * routes, marked Secure in production, and uses SameSite so browsers will
 * not attach it to cross-site requests.
 */

const { getEnv } = require('./env');

const ADMIN_SESSION_COOKIE_NAME = 'arcadia_admin_session';

function getCookieOptions() {
  const { isProduction, cookieSameSite, sessionTtlMinutes } = getEnv();

  return Object.freeze({
    httpOnly: true,
    secure: isProduction,
    sameSite: cookieSameSite,
    // Scoped to the admin API only — the cookie is never sent to any other path.
    path: '/api/admin',
    maxAge: sessionTtlMinutes * 60 * 1000,
  });
}

function parseCookieHeader(header) {
  if (typeof header !== 'string' || !header) {
    return {};
  }

  return header.split(';').reduce((cookies, part) => {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex < 1) {
      return cookies;
    }

    const name = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();

    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      return cookies;
    }

    return cookies;
  }, {});
}

function getSessionToken(req) {
  const cookies = parseCookieHeader(req.headers && req.headers.cookie);
  return cookies[ADMIN_SESSION_COOKIE_NAME] || null;
}

function setSessionCookie(res, token) {
  return res.cookie(ADMIN_SESSION_COOKIE_NAME, token, getCookieOptions());
}

function clearSessionCookie(res) {
  // maxAge is intentionally omitted so the browser treats this as an expiry delete.
  const { maxAge: _maxAge, ...deleteOptions } = getCookieOptions();
  return res.clearCookie(ADMIN_SESSION_COOKIE_NAME, deleteOptions);
}

module.exports = {
  ADMIN_SESSION_COOKIE_NAME,
  getCookieOptions,
  parseCookieHeader,
  getSessionToken,
  setSessionCookie,
  clearSessionCookie,
};
