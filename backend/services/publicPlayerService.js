const mongoose = require('mongoose');
const { User, ACCOUNT_STATUSES } = require('../models/User');
const { Match } = require('../models/Match');
const { toSafeUser } = require('../utils/safeUser');
const { normalizeUsername, USERNAME_MAX_LENGTH } = require('../utils/username');
const { canViewProfile } = require('../utils/preferences');

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.expose = true;
  return error;
}

async function getPublicPlayerProfile({ playerId, username, viewerId }) {
  const hasPlayerId = typeof playerId === 'string' && playerId.length > 0;
  const hasUsername = typeof username === 'string' && username.trim().length > 0;
  if (hasPlayerId === hasUsername) {
    throw createError('Provide exactly one player identifier', 400);
  }

  let target;
  if (hasPlayerId) {
    if (!mongoose.isValidObjectId(playerId)) {
      throw createError('Player profile not found', 404);
    }
    target = await User.findOne({
      _id: new mongoose.Types.ObjectId(playerId),
      status: ACCOUNT_STATUSES.ACTIVE,
    });
  } else {
    const normalized = normalizeUsername(username);
    if (!normalized || [...normalized].length > USERNAME_MAX_LENGTH) {
      throw createError('Player profile not found', 404);
    }
    target = await User.findOne({
      usernameNormalized: normalized,
      status: ACCOUNT_STATUSES.ACTIVE,
    }).select('+usernameNormalized');
  }

  if (
    !target
    || String(target._id) === String(viewerId)
  ) {
    throw createError('Player profile not found', 404);
  }
  if (!canViewProfile(target, viewerId)) {
    throw createError('This profile is private', 403);
  }

  const safe = toSafeUser(target);
  const completedMatches = await Match.countDocuments({ userId: target._id });
  return {
    id: safe.id,
    username: safe.username,
    playerId: safe.playerId,
    avatar: safe.avatar,
    avatarUrl: safe.avatar.type === 'google' ? safe.googleAvatarUrl : null,
    progression: safe.progression,
    completedMatches,
    createdAt: safe.createdAt,
  };
}

module.exports = {
  getPublicPlayerProfile,
};
