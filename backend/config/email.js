const { allowedOrigins, frontendUrl } = require('./env');

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

module.exports = {
  getEmailConfig,
  isEmailConfigured,
};
