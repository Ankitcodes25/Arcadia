const bcrypt = require('bcryptjs');
const { getEnv } = require('../config/env');

/** Hashes a password with the configured bcrypt cost. Used by the setup script and tests. */
async function hashPassword(password) {
  return bcrypt.hash(password, getEnv().bcryptCost);
}

/**
 * Password verification: bcrypt.compare against the single configured hash.
 * Used only on the admin branch of resolveLogin (the email has already matched
 * timing-safely), so the admin password check itself stays constant-work.
 */
async function verifyPassword(password, passwordHash) {
  if (typeof password !== 'string' || typeof passwordHash !== 'string') {
    return false;
  }
  try {
    return await bcrypt.compare(password, passwordHash);
  } catch {
    return false;
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
};
