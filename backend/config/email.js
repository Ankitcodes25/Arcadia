const { allowedOrigins, frontendUrl } = require('./env');
const normalizeEmail = require('../utils/normalizeEmail');

const DEFAULT_WELCOME_BACK_INACTIVITY_DAYS = 30;
const MAX_WELCOME_BACK_INACTIVITY_DAYS = 3650;
const warnedConfigurationKeys = new Set();

// Logged once per process per problem, so a bad value is visible without
// flooding the log on every sign-in.
function warnConfigurationOnce(key, message) {
  if (warnedConfigurationKeys.has(key)) return;
  warnedConfigurationKeys.add(key);
  console.warn(message);
}

const REQUIRED_SMTP_VARIABLES = [
  'EMAIL_FROM',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'FRONTEND_PASSWORD_RESET_URL',
];

function optionalValue(source, name) {
  const value = source[name];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isHttpUrl(value, nodeEnv = 'development') {
  try {
    const url = new URL(value);
    const validProtocol = url.protocol === 'http:' || url.protocol === 'https:';
    const validProductionTransport = nodeEnv !== 'production' || url.protocol === 'https:';
    const validProductionOrigin = nodeEnv !== 'production' || allowedOrigins.includes(url.origin);
    return validProtocol
      && validProductionTransport
      && validProductionOrigin
      && Boolean(url.hostname)
      && !url.username
      && !url.password
      && !url.hash;
  } catch {
    return false;
  }
}

function getEmailConfig(source = process.env) {
  const provider = (optionalValue(source, 'EMAIL_PROVIDER') || 'disabled').toLowerCase();

  if (provider === 'disabled' || provider === 'none') {
    return Object.freeze({ configured: false, provider: 'disabled', reason: 'not_configured' });
  }

  if (provider !== 'smtp') {
    return Object.freeze({ configured: false, provider, reason: 'unsupported_provider' });
  }

  const values = Object.fromEntries(
    REQUIRED_SMTP_VARIABLES.map((name) => [name, optionalValue(source, name)]),
  );

  if (REQUIRED_SMTP_VARIABLES.some((name) => !values[name])) {
    return Object.freeze({ configured: false, provider, reason: 'not_configured' });
  }

  const nodeEnv = source.NODE_ENV || process.env.NODE_ENV || 'development';
  if (!isHttpUrl(values.FRONTEND_PASSWORD_RESET_URL, nodeEnv)) {
    return Object.freeze({ configured: false, provider, reason: 'invalid_configuration' });
  }

  const port = Number(values.SMTP_PORT);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return Object.freeze({ configured: false, provider, reason: 'invalid_configuration' });
  }

  return Object.freeze({
    configured: true,
    provider,
    from: values.EMAIL_FROM,
    host: values.SMTP_HOST,
    port,
    user: values.SMTP_USER,
    password: values.SMTP_PASSWORD,
    resetUrl: values.FRONTEND_PASSWORD_RESET_URL,
    frontendUrl,
  });
}

function isEmailConfigured(source = process.env) {
  return getEmailConfig(source).configured;
}

/*
 * The inbox that receives problem reports and is shown as the support contact
 * in emails. Returns null when unset or invalid; reports are still saved, they
 * just are not emailed.
 */
function getSupportInboxEmail(source = process.env) {
  const value = optionalValue(source, 'SUPPORT_INBOX_EMAIL');
  if (!value) return null;
  if (!normalizeEmail.isValidEmail(value)) {
    warnConfigurationOnce(
      'SUPPORT_INBOX_EMAIL',
      '[email] SUPPORT_INBOX_EMAIL is not a valid address, so problem reports are saved but not emailed. '
        + 'Fix SUPPORT_INBOX_EMAIL in backend/.env and restart the backend.',
    );
    return null;
  }
  return normalizeEmail(value);
}

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);

/*
 * Where email images are hosted, e.g. https://api.example.com/email-assets (the
 * backend serves backend/assets/email there). Images are linked, never attached.
 * Gmail fetches images through its own proxy, so the URL must be public HTTPS;
 * anything else returns null and emails are sent in their image-free layout.
 */
function getEmailAssetBaseUrl(source = process.env) {
  const value = optionalValue(source, 'EMAIL_ASSET_BASE_URL');
  if (!value) {
    warnConfigurationOnce(
      'EMAIL_ASSET_BASE_URL:missing',
      '[email] EMAIL_ASSET_BASE_URL is not set, so emails are sent without images. '
        + 'Set it in backend/.env to the public HTTPS address of /email-assets on the deployed backend '
        + '(e.g. https://api.example.com/email-assets) and restart the backend.',
    );
    return null;
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    url = null;
  }
  const isPublicHttps = Boolean(url)
    && url.protocol === 'https:'
    && !LOOPBACK_HOSTNAMES.has(url.hostname)
    && !url.username
    && !url.password
    && !url.search
    && !url.hash;
  if (!isPublicHttps) {
    warnConfigurationOnce(
      'EMAIL_ASSET_BASE_URL:invalid',
      '[email] EMAIL_ASSET_BASE_URL must be a public https:// address (email providers cannot load images from '
        + 'localhost or plain http), so emails are sent without images. Fix it in backend/.env and restart the backend.',
    );
    return null;
  }
  return url.toString().replace(/\/+$/, '');
}

/*
 * How long an account must be inactive before a sign-in sends the welcome-back
 * email. An invalid value falls back to the default rather than emailing on
 * every sign-in.
 */
function getWelcomeBackInactivityDays(source = process.env) {
  const value = optionalValue(source, 'WELCOME_BACK_INACTIVITY_DAYS');
  if (!value) return DEFAULT_WELCOME_BACK_INACTIVITY_DAYS;

  const days = /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(days) || days < 1 || days > MAX_WELCOME_BACK_INACTIVITY_DAYS) {
    warnConfigurationOnce(
      'WELCOME_BACK_INACTIVITY_DAYS',
      `[email] WELCOME_BACK_INACTIVITY_DAYS must be a whole number from 1 to ${MAX_WELCOME_BACK_INACTIVITY_DAYS}; `
        + `using ${DEFAULT_WELCOME_BACK_INACTIVITY_DAYS}. Fix it in backend/.env and restart the backend.`,
    );
    return DEFAULT_WELCOME_BACK_INACTIVITY_DAYS;
  }
  return days;
}

module.exports = {
  DEFAULT_WELCOME_BACK_INACTIVITY_DAYS,
  getEmailAssetBaseUrl,
  getEmailConfig,
  getSupportInboxEmail,
  getWelcomeBackInactivityDays,
  isEmailConfigured,
};
