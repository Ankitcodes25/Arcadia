const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const {
  User,
  ACCOUNT_STATUSES,
  GOOGLE_PROVIDER,
} = require('../models/User');
const { Session } = require('../models/Session');
const { toAccountProfile } = require('../utils/safeUser');
const {
  normalizeUsername,
  toDisplayUsername,
  getUsernameValidationError,
} = require('../utils/username');
const {
  normalizeDisplayName,
  getDisplayNameValidationError,
  getTrustedGooglePictureUrl,
} = require('../utils/profileValidation');
const {
  AVATAR_TYPES,
  GOOGLE_AVATAR_VALUE,
  isAllowedLocalAvatarId,
  isSupportedAvatarType,
} = require('../config/avatar');
const {
  getPasswordValidationError,
  getBcryptByteLengthError,
} = require('../utils/passwordPolicy');
const { hashPassword } = require('../utils/bcrypt');
const { PasswordResetToken } = require('../models/PasswordResetToken');
const {
  isValidRefreshToken,
  hashRefreshToken,
} = require('../utils/refreshToken');
const { revokeAllRefreshSessions } = require('./refreshSessionService');
const {
  getPreferences,
  resolvePreferenceUpdates,
  PREFERENCE_DEFAULTS,
} = require('../utils/preferences');

const USERNAME_CHANGE_COOLDOWN_MS = 60 * 1000;

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.expose = true;
  return error;
}

function isRequestObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function assertOnlyKeys(body, allowedKeys) {
  if (!isRequestObject(body)) {
    throw createError('Request body must be an object', 400);
  }

  const unexpectedKey = Object.keys(body).find((key) => !allowedKeys.includes(key));
  if (unexpectedKey) {
    throw createError('Request contains unsupported fields', 400);
  }
}

function parseObjectId(value, message = 'Invalid ID') {
  if (typeof value !== 'string' || !mongoose.isValidObjectId(value)) {
    throw createError(message, 400);
  }

  return new mongoose.Types.ObjectId(value).toString();
}

async function getProfile(userId) {
  const user = await User.findById(userId);
  if (!user) {
    throw createError('Account not found', 404);
  }

  return toAccountProfile(user);
}

async function getSettings(userId) {
  return getProfile(userId);
}

/*
 * The preferences resource.
 *
 * Every read goes through `getPreferences`, which re-validates each stored
 * value against the canonical defaults, so a document written before the
 * field existed — or corrupted in between — still answers with a legal
 * preference set. Nothing here is derived on the client, and the privacy
 * values are enforced by the same helpers the rest of the backend reads from,
 * so the stored value and the enforced behaviour can never disagree.
 */
async function getAccountPreferences(userId) {
  const user = await User.findById(userId);
  if (!user) {
    throw createError('Account not found', 404);
  }

  return getPreferences(user);
}

/*
 * A partial preference write: only the keys that were sent are validated and
 * applied, in one update, so a rejected key leaves the stored set untouched.
 */
async function updateAccountPreferences({ userId, body }) {
  const resolved = resolvePreferenceUpdates(body);
  if (resolved.error) {
    throw createError(resolved.error, 400);
  }

  const { updates } = resolved;
  const guard = { _id: userId, status: ACCOUNT_STATUSES.ACTIVE };
  const setDoc = {};
  for (const [key, value] of Object.entries(updates)) {
    setDoc[`preferences.${key}`] = value;
  }

  const user = await User.findOneAndUpdate(
    guard,
    { $set: setDoc },
    { returnDocument: 'after' },
  );
  if (!user) {
    throw createError('Account not found', 404);
  }

  return getPreferences(user);
}

/*
 * Reset writes the canonical defaults back and reports exactly what the
 * backend now stores. Only preferences are touched: progression, identity,
 * matches and every other account record are outside this endpoint by design.
 */
async function resetAccountPreferences(userId) {
  const guard = { _id: userId, status: ACCOUNT_STATUSES.ACTIVE };
  const setDoc = {};
  for (const [key, value] of Object.entries(PREFERENCE_DEFAULTS)) {
    setDoc[`preferences.${key}`] = value;
  }

  const user = await User.findOneAndUpdate(
    guard,
    { $set: setDoc },
    { returnDocument: 'after' },
  );
  if (!user) {
    throw createError('Account not found', 404);
  }

  return getPreferences(user);
}

async function checkUsernameAvailability(username) {
  const validationError = getUsernameValidationError(username);
  if (validationError) {
    return { available: false };
  }

  const normalized = normalizeUsername(username);
  const existing = await User.exists({ usernameNormalized: normalized });
  return { available: !existing };
}

/*
 * The one place a username change is validated and turned into the values that
 * are written. `setUsername`, the Google onboarding completion and the combined
 * profile save all go through here, so there is a single username rule set, a
 * single cooldown rule and a single comparison-only normalization.
 */
function resolveUsernameChange({ currentUsername, currentNormalized, currentChangedAt, nextUsername, now }) {
  const validationError = getUsernameValidationError(nextUsername);
  if (validationError) {
    throw createError(validationError, 400);
  }

  const displayUsername = toDisplayUsername(nextUsername);
  const normalized = normalizeUsername(nextUsername);

  // The comparison value can be unchanged while the visible casing/spacing
  // still needs to be updated, so both forms have to match to be a no-op.
  if (currentNormalized === normalized && currentUsername === displayUsername) {
    return { changed: false };
  }

  if (
    currentChangedAt
    && currentChangedAt.getTime() > now.getTime() - USERNAME_CHANGE_COOLDOWN_MS
  ) {
    throw createError('Username can be changed once every 60 seconds', 429);
  }

  return {
    changed: true,
    username: displayUsername,
    usernameNormalized: normalized,
    usernameChangedAt: now,
  };
}

/*
 * The one place an avatar selection is validated. Only the two supported sources
 * exist: an allowlisted local Arcadia avatar, or the trusted Google picture the
 * account already owns. A URL is never accepted.
 */
function resolveAvatarSelection({ requestedAvatar, user }) {
  if (!isRequestObject(requestedAvatar)) {
    throw createError('Avatar must be an object', 400);
  }

  const unexpectedKey = Object.keys(requestedAvatar).find(
    (key) => !['type', 'value'].includes(key),
  );
  if (unexpectedKey) {
    throw createError('Request contains unsupported fields', 400);
  }

  if (!isSupportedAvatarType(requestedAvatar.type)) {
    throw createError('Avatar type must be local or google', 400);
  }

  if (requestedAvatar.type === AVATAR_TYPES.LOCAL) {
    if (!isAllowedLocalAvatarId(requestedAvatar.value)) {
      throw createError('Invalid local avatar', 400);
    }

    return {
      type: AVATAR_TYPES.LOCAL,
      value: requestedAvatar.value,
    };
  }

  if (
    requestedAvatar.value !== undefined
    && requestedAvatar.value !== GOOGLE_AVATAR_VALUE
  ) {
    throw createError('Invalid Google avatar selection', 400);
  }

  const googlePictureUrl = getTrustedGooglePictureUrl(
    user.google && user.google.pictureUrl,
  );
  if (
    !user.google
    || user.google.provider !== GOOGLE_PROVIDER
    || !googlePictureUrl
  ) {
    throw createError('Google profile picture is unavailable', 400);
  }

  return {
    type: AVATAR_TYPES.GOOGLE,
    value: GOOGLE_AVATAR_VALUE,
  };
}

function isSameAvatar(currentAvatar, nextAvatar) {
  return Boolean(currentAvatar)
    && currentAvatar.type === nextAvatar.type
    && currentAvatar.value === nextAvatar.value;
}

async function setUsername({ userId, body }) {
  assertOnlyKeys(body, ['username']);
  const { username } = body;
  // Rejected before any lookup, so an invalid username is a 400 for everyone.
  const usernameError = getUsernameValidationError(username);
  if (usernameError) {
    throw createError(usernameError, 400);
  }

  const user = await User.findById(userId)
    .select('+usernameNormalized +usernameChangedAt');
  if (!user) {
    throw createError('Account not found', 404);
  }

  if (user.status !== ACCOUNT_STATUSES.ACTIVE) {
    throw createError('Account is inactive', 403);
  }

  const change = resolveUsernameChange({
    currentUsername: user.username,
    currentNormalized: user.usernameNormalized,
    currentChangedAt: user.usernameChangedAt,
    nextUsername: username,
    now: new Date(),
  });

  if (!change.changed) {
    return toAccountProfile(user);
  }

  let updatedUser;
  try {
    updatedUser = await User.findOneAndUpdate(
      {
        _id: userId,
        usernameNormalized: user.usernameNormalized || null,
      },
      {
        $set: {
          username: change.username,
          usernameNormalized: change.usernameNormalized,
          usernameChangedAt: change.usernameChangedAt,
        },
      },
      { returnDocument: 'after' },
    ).select('+usernameNormalized +usernameChangedAt');
  } catch (error) {
    if (error && error.code === 11000) {
      throw createError('That username is already taken', 409);
    }
    throw error;
  }

  if (!updatedUser) {
    const latestUser = await User.findById(userId)
      .select('+usernameNormalized +usernameChangedAt');
    if (latestUser && latestUser.usernameNormalized === change.usernameNormalized) {
      return toAccountProfile(latestUser);
    }
    throw createError('Username changed concurrently; please retry', 409);
  }

  return toAccountProfile(updatedUser);
}

/*
 * The My Profile "Save Changes" write.
 *
 * Every field is validated before anything is written and the whole change is
 * applied with one MongoDB update, so a rejected field can never leave a half
 * applied profile behind. Only the fields that actually changed are sent, which
 * keeps an avatar-only save from touching the username cooldown.
 */
async function updateProfile({ userId, body }) {
  assertOnlyKeys(body, ['displayName', 'username', 'avatar']);

  const hasDisplayName = Object.prototype.hasOwnProperty.call(body, 'displayName');
  const hasUsername = Object.prototype.hasOwnProperty.call(body, 'username');
  const hasAvatar = Object.prototype.hasOwnProperty.call(body, 'avatar');

  if (!hasDisplayName && !hasUsername && !hasAvatar) {
    throw createError('No profile changes were provided', 400);
  }

  let displayName;
  if (hasDisplayName) {
    const displayNameError = getDisplayNameValidationError(body.displayName);
    if (displayNameError) {
      throw createError(displayNameError, 400);
    }
    displayName = normalizeDisplayName(body.displayName);
  }

  const user = await User.findById(userId).select('+usernameNormalized +usernameChangedAt');
  if (!user) {
    throw createError('Account not found', 404);
  }

  // Same condition as the previous display-name-only write: an account that is
  // not active cannot be edited through this endpoint.
  if (user.status !== ACCOUNT_STATUSES.ACTIVE) {
    throw createError('Account not found', 404);
  }

  const now = new Date();
  const updates = {};
  const guard = { _id: userId, status: ACCOUNT_STATUSES.ACTIVE };
  let usernameChange = { changed: false };

  if (hasUsername) {
    usernameChange = resolveUsernameChange({
      currentUsername: user.username,
      currentNormalized: user.usernameNormalized,
      currentChangedAt: user.usernameChangedAt,
      nextUsername: body.username,
      now,
    });

    if (usernameChange.changed) {
      updates.username = usernameChange.username;
      updates.usernameNormalized = usernameChange.usernameNormalized;
      updates.usernameChangedAt = usernameChange.usernameChangedAt;
      // A concurrent username change is detected instead of overwritten.
      guard.usernameNormalized = user.usernameNormalized || null;
    }
  }

  if (hasAvatar) {
    const avatar = resolveAvatarSelection({ requestedAvatar: body.avatar, user });
    if (!isSameAvatar(user.avatar, avatar)) {
      updates.avatar = avatar;
    }
  }

  if (hasDisplayName && displayName !== user.displayName) {
    updates.displayName = displayName;
  }

  if (!Object.keys(updates).length) {
    return toAccountProfile(user);
  }

  let updatedUser;
  try {
    updatedUser = await User.findOneAndUpdate(
      guard,
      { $set: updates },
      { returnDocument: 'after' },
    ).select('+usernameNormalized +usernameChangedAt');
  } catch (error) {
    if (error && error.code === 11000) {
      throw createError('That username is already taken', 409);
    }
    throw error;
  }

  if (!updatedUser) {
    if (usernameChange.changed) {
      const latestUser = await User.findById(userId)
        .select('+usernameNormalized +usernameChangedAt');
      if (
        latestUser
        && latestUser.usernameNormalized === usernameChange.usernameNormalized
        && latestUser.username === usernameChange.username
      ) {
        return toAccountProfile(latestUser);
      }
    }
    throw createError('Profile changed concurrently; please retry', 409);
  }

  return toAccountProfile(updatedUser);
}

async function updateAvatar({ userId, body }) {
  assertOnlyKeys(body, ['type', 'value']);
  if (!isSupportedAvatarType(body.type)) {
    throw createError('Avatar type must be local or google', 400);
  }

  const user = await User.findById(userId);
  if (!user) {
    throw createError('Account not found', 404);
  }
  if (user.status !== ACCOUNT_STATUSES.ACTIVE) {
    throw createError('Account is inactive', 403);
  }

  const avatar = resolveAvatarSelection({
    requestedAvatar: { type: body.type, value: body.value },
    user,
  });

  const updatedUser = await User.findOneAndUpdate(
    { _id: userId },
    { $set: { avatar } },
    { returnDocument: 'after' },
  );
  if (!updatedUser) {
    throw createError('Account not found', 404);
  }
  return toAccountProfile(updatedUser);
}

async function changePassword({ userId, body }) {
  assertOnlyKeys(body, ['currentPassword', 'newPassword']);
  const { currentPassword, newPassword } = body;
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    throw createError('Current and new passwords are required', 400);
  }

  const user = await User.findById(userId).select('+passwordHash');
  if (!user) {
    throw createError('Account not found', 404);
  }
  if (!user.passwordHash) {
    throw createError('Password authentication is not configured for this account', 400);
  }

  const currentPasswordLengthError = getBcryptByteLengthError(currentPassword);
  if (currentPasswordLengthError) {
    throw createError('Current password is incorrect', 401);
  }

  const currentPasswordMatches = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!currentPasswordMatches) {
    throw createError('Current password is incorrect', 401);
  }

  const passwordError = getPasswordValidationError(newPassword);
  if (passwordError) {
    throw createError(passwordError, 400);
  }

  const passwordHash = await hashPassword(newPassword);
  const updatedUser = await User.findOneAndUpdate(
    {
      _id: userId,
      status: ACCOUNT_STATUSES.ACTIVE,
      tokenVersion: user.tokenVersion,
    },
    {
      $set: { passwordHash },
      $inc: { tokenVersion: 1 },
    },
    { returnDocument: 'after' },
  ).select('-passwordHash');

  if (!updatedUser) {
    throw createError('Account changed concurrently; please log in again', 409);
  }

  await revokeAllRefreshSessions(userId);
  await PasswordResetToken.updateMany(
    { userId, consumedAt: null },
    { $set: { consumedAt: new Date() } },
  );

  return { message: 'Password changed successfully. Please log in again.' };
}

function getDeviceLabel(userAgent) {
  if (typeof userAgent !== 'string' || !userAgent.trim()) {
    return 'Unknown device';
  }

  const value = userAgent.toLowerCase();
  const browser = value.includes('edg/')
    ? 'Edge'
    : value.includes('chrome/')
      ? 'Chrome'
      : value.includes('firefox/')
        ? 'Firefox'
        : value.includes('safari/')
          ? 'Safari'
          : 'Browser';
  const platform = value.includes('android')
    ? 'Android'
    : value.includes('iphone') || value.includes('ipad')
      ? 'iOS'
      : value.includes('mac os')
        ? 'macOS'
        : value.includes('windows')
          ? 'Windows'
          : value.includes('linux')
            ? 'Linux'
            : 'Unknown platform';

  return `${browser} on ${platform}`;
}

async function getCurrentSessionId(userId, currentRefreshToken) {
  if (!isValidRefreshToken(currentRefreshToken)) {
    return null;
  }

  const currentHash = hashRefreshToken(currentRefreshToken);
  const currentSession = await Session.findOne({
    userId,
    refreshTokenHash: currentHash,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  }).select('_id');

  return currentSession ? String(currentSession._id) : null;
}

function toSafeSession(session, currentSessionId) {
  return {
    id: String(session._id),
    createdAt: session.createdAt || null,
    lastUsedAt: session.lastUsedAt || null,
    expiresAt: session.expiresAt || null,
    current: String(session._id) === currentSessionId,
    device: getDeviceLabel(session.userAgent),
  };
}

async function listSessions({ userId, currentRefreshToken }) {
  const currentSessionId = await getCurrentSessionId(userId, currentRefreshToken);
  const sessions = await Session.find({
    userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .select('+userAgent')
    .sort({ lastUsedAt: -1, createdAt: -1 });

  return sessions.map((session) => toSafeSession(session, currentSessionId));
}

async function revokeSession({ userId, sessionId, currentRefreshToken }) {
  const normalizedSessionId = parseObjectId(sessionId, 'Invalid session ID');
  const session = await Session.findOne({
    _id: normalizedSessionId,
    userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  }).select('_id');
  if (!session) {
    throw createError('Session not found', 404);
  }

  const currentSessionId = await getCurrentSessionId(userId, currentRefreshToken);
  const current = String(session._id) === currentSessionId;
  const result = await Session.updateOne(
    { _id: session._id, userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  if (!result.matchedCount) {
    throw createError('Session not found', 404);
  }

  return {
    current,
    message: current
      ? 'Current session revoked. Please log in again.'
      : 'Session revoked',
  };
}

async function logoutOtherSessions({ userId, currentRefreshToken }) {
  const currentSessionId = await getCurrentSessionId(userId, currentRefreshToken);
  if (!currentSessionId) {
    throw createError('Current session not found', 400);
  }

  const result = await Session.updateMany(
    {
      userId,
      _id: { $ne: currentSessionId },
      revokedAt: null,
    },
    { $set: { revokedAt: new Date() } },
  );

  return {
    revokedCount: Number(result.modifiedCount || 0),
    message: 'Other sessions revoked',
  };
}

module.exports = {
  USERNAME_CHANGE_COOLDOWN_MS,
  getProfile,
  getSettings,
  checkUsernameAvailability,
  setUsername,
  updateProfile,
  updateAvatar,
  changePassword,
  listSessions,
  revokeSession,
  logoutOtherSessions,
  getAccountPreferences,
  updateAccountPreferences,
  resetAccountPreferences,
};
