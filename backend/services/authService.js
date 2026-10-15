const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { User, USER_ROLES, ACCOUNT_STATUSES } = require('../models/User');
const normalizeEmail = require('../utils/normalizeEmail');
const { toSafeUser } = require('../utils/safeUser');
const { signAccessToken } = require('../utils/jwt');
const {
  getPasswordValidationError,
  getBcryptByteLengthError,
} = require('../utils/passwordPolicy');
const { hashPassword, needsRehash } = require('../utils/bcrypt');
const { createUserWithPlayerId } = require('./playerIdService');
const {
  normalizeDisplayName,
  getDisplayNameValidationError,
} = require('../utils/profileValidation');
const {
  normalizeUsername,
  toDisplayUsername,
  getUsernameValidationError,
} = require('../utils/username');

const INVALID_CREDENTIALS = 'Invalid email or password';
// A valid fixed hash keeps unknown-account login work comparable to a wrong password.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('arcadia-dummy-password', 10);

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.expose = true;
  return error;
}

function normalizeDatabaseError(error) {
  if (error && error.name === 'ValidationError' && !error.statusCode) {
    error.statusCode = 400;
  }

  if (error && error.code === 11000 && !error.statusCode) {
    error.statusCode = 409;
  }

  return error;
}

async function register({ email, password, name, username } = {}) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedName = normalizeDisplayName(name);
  const nameError = getDisplayNameValidationError(normalizedName);
  const passwordError = getPasswordValidationError(password);
  const usernameProvided = username !== undefined;
  const displayUsername = usernameProvided ? toDisplayUsername(username) : null;
  const normalizedUsername = usernameProvided ? normalizeUsername(username) : null;
  const usernameError = usernameProvided ? getUsernameValidationError(username) : null;

  if (nameError) {
    throw createError(nameError, 400);
  }

  if (!normalizeEmail.isValidEmail(normalizedEmail)) {
    throw createError('A valid email is required', 400);
  }

  if (passwordError) {
    throw createError(passwordError, 400);
  }

  if (usernameError) {
    throw createError(usernameError, 400);
  }

  await User.init();

  const existingUser = await User.exists({ email: normalizedEmail });
  if (existingUser) {
    throw createError('Unable to create an account with those details', 409);
  }

  if (normalizedUsername && await User.exists({ usernameNormalized: normalizedUsername })) {
    throw createError('That username is already taken', 409);
  }

  const passwordHash = await hashPassword(password);
  let user;

  try {
    // createUserWithPlayerId generates the permanent Player ID server side and
    // regenerates it if the unique index ever rejects a collision.
    user = await createUserWithPlayerId({
      email: normalizedEmail,
      name: normalizedName,
      displayName: normalizedName,
      username: displayUsername,
      usernameNormalized: normalizedUsername,
      usernameChangedAt: normalizedUsername ? new Date() : null,
      passwordHash,
      role: USER_ROLES.USER,
      status: ACCOUNT_STATUSES.ACTIVE,
    });
  } catch (error) {
    const databaseError = normalizeDatabaseError(error);
    if (databaseError.code === 11000) {
      if (
        normalizedUsername
        && (
          databaseError.keyPattern?.usernameNormalized
          || databaseError.keyValue?.usernameNormalized
        )
      ) {
        throw createError('That username is already taken', 409);
      }
      throw createError('Unable to create an account with those details', 409);
    }
    throw databaseError;
  }

  return {
    token: signAccessToken(user),
    user: toSafeUser(user),
  };
}

async function login({ email, password } = {}, metadata = {}) {
  const normalizedEmail = normalizeEmail(email);
  const passwordError = getBcryptByteLengthError(password);

  if (!normalizeEmail.isValidEmail(normalizedEmail) || typeof password !== 'string' || !password || passwordError) {
    throw createError(INVALID_CREDENTIALS, 401);
  }

  const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');

  const passwordHash = user && user.passwordHash ? user.passwordHash : DUMMY_PASSWORD_HASH;
  const passwordMatches = await bcrypt.compare(password, passwordHash);
  if (!user || !user.passwordHash || !passwordMatches) {
    throw createError(INVALID_CREDENTIALS, 401);
  }

  if (await needsRehash(user.passwordHash)) {
    const upgradedHash = await hashPassword(password);
    await User.updateOne({ _id: user._id }, { $set: { passwordHash: upgradedHash } });
    user.passwordHash = upgradedHash;
  }

  if (user.status !== ACCOUNT_STATUSES.ACTIVE) {
    throw createError(INVALID_CREDENTIALS, 401);
  }

  // Read before it is overwritten: the welcome-back decision needs the sign-in
  // before this one.
  const previousLoginAt = user.lastLoginAt || null;
  const lastLoginAt = new Date();
  const loginUpdate = { lastLoginAt };

  if (typeof metadata.ip === 'string' && metadata.ip.trim()) {
    loginUpdate.lastLoginIp = metadata.ip.trim().slice(0, 64);
  }

  if (typeof metadata.userAgent === 'string' && metadata.userAgent.trim()) {
    loginUpdate.lastLoginUserAgent = metadata.userAgent.trim().slice(0, 512);
  }

  await User.updateOne({ _id: user._id }, { $set: loginUpdate });
  user.lastLoginAt = lastLoginAt;

  // previousLoginAt is server-side context for the controller, not part of the
  // login response body.
  return {
    token: signAccessToken(user),
    user: toSafeUser(user),
    previousLoginAt,
  };
}

async function getUserById(id) {
  if (typeof id !== 'string' || !mongoose.isValidObjectId(id)) {
    return null;
  }

  return User.findById(id).select('-passwordHash');
}

module.exports = {
  register,
  login,
  getUserById,
  INVALID_CREDENTIALS,
};
