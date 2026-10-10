const crypto = require('node:crypto');

const TOKEN_BYTES = 32;
const RESET_PREFIX = 'arc_reset_';
const TOKEN_PATTERN = /^arc_reset_[A-Za-z0-9_-]{43}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/i;

function generateSecureToken(prefix) {
  return `${prefix}${crypto.randomBytes(TOKEN_BYTES).toString('base64url')}`;
}

function generatePasswordResetToken() {
  return generateSecureToken(RESET_PREFIX);
}

function isValidSecureToken(value) {
  return typeof value === 'string' && TOKEN_PATTERN.test(value);
}

function hashSecureToken(value) {
  if (!isValidSecureToken(value)) {
    throw new Error('Invalid secure token');
  }

  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function verifySecureTokenHash(value, expectedHash) {
  if (!isValidSecureToken(value) || !HASH_PATTERN.test(expectedHash || '')) {
    return false;
  }

  const actual = Buffer.from(hashSecureToken(value), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

module.exports = {
  generatePasswordResetToken,
  isValidSecureToken,
  hashSecureToken,
  verifySecureTokenHash,
};
