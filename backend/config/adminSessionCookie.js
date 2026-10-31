const { isProduction, cookieSameSite } = require('./env');
const { parseCookieHeader } = require('./refreshCookie');
const { getAdminPanelConfig } = require('./adminPanel');

// The Admin Panel session exists only as this HTTP-only cookie: the token is
// never returned to JavaScript or stored in localStorage/sessionStorage.
const ADMIN_SESSION_COOKIE_NAME = 'arcadia_admin_session';

const ADMIN_SESSION_COOKIE_OPTIONS = Object.freeze({
  httpOnly: true,
  secure: isProduction,
  sameSite: cookieSameSite,
  // Scoped to the admin auth API only; never sent to player routes.
  path: '/api/admin',
});

function getAdminSessionToken(req) {
  const cookies = parseCookieHeader(req.headers && req.headers.cookie);
  return cookies[ADMIN_SESSION_COOKIE_NAME] || null;
}

function setAdminSessionCookie(res, token) {
  return res.cookie(ADMIN_SESSION_COOKIE_NAME, token, {
    ...ADMIN_SESSION_COOKIE_OPTIONS,
    maxAge: getAdminPanelConfig().sessionTtlMinutes * 60 * 1000,
  });
}

function clearAdminSessionCookie(res) {
  return res.clearCookie(ADMIN_SESSION_COOKIE_NAME, ADMIN_SESSION_COOKIE_OPTIONS);
}

module.exports = {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_COOKIE_OPTIONS,
  getAdminSessionToken,
  setAdminSessionCookie,
  clearAdminSessionCookie,
};
