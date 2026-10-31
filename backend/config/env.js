require('dotenv').config();

const MIN_JWT_SECRET_LENGTH = 32;
const DEFAULT_PORT = 4000;
const MONGO_URI_PATTERN = /^mongodb(?:\+srv)?:\/\//i;
const ALLOWED_NODE_ENVS = new Set(['development', 'test', 'production']);
const DEFAULT_DEVELOPMENT_ORIGINS = Object.freeze([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);
const ALLOWED_COOKIE_SAME_SITE = new Set(['lax', 'strict', 'none']);
const MIN_BCRYPT_COST = 10;
const MAX_BCRYPT_COST = 15;
const DEFAULT_HSTS_MAX_AGE = 31536000;

function createSafeConfigError(message) {
  const error = new Error(message);
  error.safeMessage = message;
  return error;
}

function requiredValue(source, name) {
  const value = source[name];

  if (typeof value !== 'string' || value.trim() === '') {
    throw createSafeConfigError(`${name} is required`);
  }

  return value.trim();
}

function validateNodeEnv(value) {
  const nodeEnv = typeof value === 'string' && value.trim()
    ? value.trim().toLowerCase()
    : 'development';

  if (!ALLOWED_NODE_ENVS.has(nodeEnv)) {
    throw new Error('NODE_ENV must be development, test, or production');
  }

  return nodeEnv;
}

function validatePort(value) {
  if (value === undefined || value === '') {
    return DEFAULT_PORT;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('PORT must be an integer between 0 and 65535');
  }

  return port;
}

function validateMongoUri(value, nodeEnv = 'development') {
  if (typeof value !== 'string' || !MONGO_URI_PATTERN.test(value)) {
    throw createSafeConfigError('MONGODB_URI must be a valid mongodb:// or mongodb+srv:// URI');
  }

  if (/[\s\u0000-\u001F\u007F]/.test(value)) {
    throw createSafeConfigError('MONGODB_URI contains invalid characters');
  }

  const uriParts = value.match(/^(mongodb(?:\+srv)?:\/\/)([^/?#]+)([^?#]*)(?:\?([^#]*))?$/i);
  let scheme;
  let pathname;
  let query;
  let parsed;
  try {
    if (!uriParts) {
      throw new Error('Invalid MongoDB URI');
    }

    [, scheme, , pathname] = uriParts;
    const authority = uriParts[2];
    query = uriParts[4];
    const credentialsEnd = authority.lastIndexOf('@');
    const credentials = credentialsEnd === -1 ? '' : authority.slice(0, credentialsEnd + 1);
    const hosts = authority.slice(credentialsEnd + 1).split(',');

    if (!hosts.length || hosts.some((host) => !host) || (scheme.toLowerCase().startsWith('mongodb+srv') && hosts.length !== 1)) {
      throw new Error('Invalid MongoDB hosts');
    }

    for (const host of hosts) {
      parsed = new URL(`${scheme}${credentials}${host}${pathname}${query === undefined ? '' : `?${query}`}`);
      if (!parsed.hostname) {
        throw new Error('Invalid MongoDB host');
      }
    }
  } catch {
    throw createSafeConfigError('MONGODB_URI must be a valid mongodb:// or mongodb+srv:// URI');
  }

  if (!pathname || pathname === '/' || !parsed.hostname) {
    throw createSafeConfigError('MONGODB_URI must include a database name');
  }

  if (nodeEnv === 'production' && scheme.toLowerCase() === 'mongodb://') {
    const tlsEnabled = /(?:^|&)(?:tls|ssl)=true(?:&|$)/i.test(query || '');
    if (!tlsEnabled) {
      throw createSafeConfigError('MONGODB_URI must enable TLS in production');
    }
  }

  return value;
}

function parseOrigin(value, nodeEnv) {
  if (value === '*' || value === 'null') {
    throw new Error('FRONTEND_URL/CORS_ORIGIN cannot use a wildcard or null origin');
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid frontend origin: ${value}`);
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:')
    || url.username
    || url.password
    || url.search
    || url.hash
    || (url.pathname && url.pathname !== '/')
  ) {
    throw new Error(`Invalid frontend origin: ${value}`);
  }

  if (nodeEnv === 'production' && url.protocol !== 'https:') {
    throw new Error('Frontend origins must use HTTPS in production');
  }

  return url.origin;
}

function parseAllowedOrigins(source, nodeEnv) {
  const configured = [source.FRONTEND_URL, source.CORS_ORIGIN]
    .filter((value) => typeof value === 'string' && value.trim())
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);

  if (!configured.length) {
    if (nodeEnv === 'production') {
      throw new Error('FRONTEND_URL or CORS_ORIGIN is required in production');
    }
    return [...DEFAULT_DEVELOPMENT_ORIGINS];
  }

  return Object.freeze([...new Set(configured.map((value) => parseOrigin(value, nodeEnv)))]);
}

function parseCookieSameSite(value, nodeEnv) {
  const sameSite = typeof value === 'string' && value.trim()
    ? value.trim().toLowerCase()
    : nodeEnv === 'production' ? 'none' : 'lax';

  if (!ALLOWED_COOKIE_SAME_SITE.has(sameSite)) {
    throw new Error('COOKIE_SAME_SITE must be lax, strict, or none');
  }

  if (sameSite === 'none' && nodeEnv !== 'production') {
    throw new Error('COOKIE_SAME_SITE=none is only allowed in production');
  }

  return sameSite;
}

function parseTrustProxy(value) {
  if (value === undefined || value === '' || value === 'false') {
    return false;
  }

  if (value === true || value === 'true' || value === '*') {
    throw new Error('TRUST_PROXY must be false, a hop count, or explicit proxy addresses');
  }

  const text = String(value).trim();
  if (/^\d+$/.test(text)) {
    const hops = Number(text);
    if (!Number.isInteger(hops) || hops > 10) {
      throw new Error('TRUST_PROXY hop count must be between 0 and 10');
    }
    return hops;
  }

  if (!text || text.includes('*')) {
    throw new Error('TRUST_PROXY must be false, a hop count, or explicit proxy addresses');
  }

  return text;
}

function parseBcryptCost(value, nodeEnv) {
  if (value === undefined || value === '') {
    return nodeEnv === 'production' ? 12 : 10;
  }

  const cost = Number(value);
  if (!Number.isInteger(cost) || cost < MIN_BCRYPT_COST || cost > MAX_BCRYPT_COST) {
    throw new Error(`BCRYPT_COST must be an integer between ${MIN_BCRYPT_COST} and ${MAX_BCRYPT_COST}`);
  }

  return cost;
}

function parseHstsMaxAge(value, nodeEnv) {
  if (nodeEnv !== 'production') {
    return 0;
  }

  if (value === undefined || value === '') {
    return DEFAULT_HSTS_MAX_AGE;
  }

  const maxAge = Number(value);
  if (!Number.isInteger(maxAge) || maxAge < 0 || maxAge > 63072000) {
    throw new Error('SECURITY_HSTS_MAX_AGE must be between 0 and 63072000');
  }

  return maxAge;
}

function validateEnvironment(source = process.env) {
  const nodeEnv = validateNodeEnv(source.NODE_ENV);
  const mongoUri = validateMongoUri(requiredValue(source, 'MONGODB_URI'), nodeEnv);
  const jwtSecret = requiredValue(source, 'JWT_SECRET');

  if (jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`);
  }

  if (
    nodeEnv === 'production'
    && (new Set(jwtSecret).size < 12 || /^(change|replace|example|your|test)/i.test(jwtSecret))
  ) {
    throw new Error('JWT_SECRET must be a high-entropy production secret');
  }

  const allowedOrigins = parseAllowedOrigins(source, nodeEnv);

  return Object.freeze({
    nodeEnv,
    isProduction: nodeEnv === 'production',
    port: validatePort(source.PORT),
    mongoUri,
    jwtSecret,
    allowedOrigins,
    frontendUrl: allowedOrigins[0],
    corsOrigin: allowedOrigins.join(','),
    cookieSameSite: parseCookieSameSite(source.COOKIE_SAME_SITE, nodeEnv),
    trustProxy: parseTrustProxy(source.TRUST_PROXY),
    bcryptCost: parseBcryptCost(source.BCRYPT_COST, nodeEnv),
    securityHstsMaxAge: parseHstsMaxAge(source.SECURITY_HSTS_MAX_AGE, nodeEnv),
  });
}

function getAdminProvisioningConfig(source = process.env) {
  const environment = validateEnvironment(source);
  const email = requiredValue(source, 'ADMIN_EMAIL');
  const password = source.ADMIN_PASSWORD;
  const name = typeof source.ADMIN_NAME === 'string' && source.ADMIN_NAME.trim()
    ? source.ADMIN_NAME.trim()
    : 'Arcadia Administrator';

  if (typeof password !== 'string' || password.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters');
  }

  if (Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('ADMIN_PASSWORD must not exceed 72 UTF-8 bytes');
  }

  if (name.length > 80) {
    throw new Error('ADMIN_NAME must be at most 80 characters');
  }

  return {
    mongoUri: environment.mongoUri,
    email,
    password,
    name,
  };
}

const environment = validateEnvironment();

module.exports = {
  ...environment,
  ALLOWED_NODE_ENVS,
  DEFAULT_DEVELOPMENT_ORIGINS,
  validateEnvironment,
  validateMongoUri,
  getAdminProvisioningConfig,
};
