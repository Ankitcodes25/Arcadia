const {
  USER_ROLES,
  ACCOUNT_STATUSES,
  GOOGLE_PROVIDER,
} = require('../models/User');
const {
  AVATAR_TYPES,
  DEFAULT_LOCAL_AVATAR_ID,
  GOOGLE_AVATAR_VALUE,
  isAllowedLocalAvatarId,
} = require('../config/avatar');
const { getTrustedGooglePictureUrl } = require('./profileValidation');
const { getProgression } = require('./progression');
const { isValidPlayerId } = require('./playerId');

function getGoogleIdentity(user, source) {
  if (user && typeof user === 'object' && user.google) {
    return user.google;
  }

  return source && source.google ? source.google : null;
}

function getSafeAvatar(sourceAvatar, googlePictureUrl) {
  const requestedType = sourceAvatar && sourceAvatar.type;
  const useGoogle = requestedType === AVATAR_TYPES.GOOGLE && Boolean(googlePictureUrl);
  const type = useGoogle ? AVATAR_TYPES.GOOGLE : AVATAR_TYPES.LOCAL;
  const requestedValue = sourceAvatar && sourceAvatar.value;
  const value = useGoogle
    ? GOOGLE_AVATAR_VALUE
    : isAllowedLocalAvatarId(requestedValue)
      ? requestedValue
      : DEFAULT_LOCAL_AVATAR_ID;

  return { type, value };
}

function toSafeUser(user) {
  if (!user) {
    return null;
  }

  const source = typeof user.toObject === 'function' ? user.toObject() : user;
  const id = source._id || source.id;
  const googleIdentity = getGoogleIdentity(user, source);
  const googlePictureUrl = getTrustedGooglePictureUrl(
    googleIdentity && googleIdentity.pictureUrl,
  );
  const avatar = getSafeAvatar(source.avatar, googlePictureUrl);
  const hasUsername = typeof source.username === 'string' && source.username.length > 0;

  return {
    id: id ? String(id) : null,
    email: typeof source.email === 'string' ? source.email : '',
    name: typeof source.name === 'string' ? source.name : '',
    username: hasUsername ? source.username : null,
    displayName: typeof source.displayName === 'string'
      ? source.displayName
      : typeof source.name === 'string' ? source.name : '',
    avatar,
    avatarSource: avatar.type,
    googleAvatarAvailable: Boolean(googlePictureUrl),
    googleAvatarUrl: googlePictureUrl || null,
    authProvider: (
      googleIdentity && googleIdentity.provider === GOOGLE_PROVIDER
    ) || source.authProvider === 'GOOGLE'
      ? 'GOOGLE'
      : 'PASSWORD',
    usernameSetupRequired: !hasUsername,
    // The permanent public Player ID. Only ever exposed when it is well formed,
    // so an account awaiting its backfill reports null rather than a broken value.
    playerId: isValidPlayerId(source.playerId) ? source.playerId : null,
    progression: getProgression(source.totalXp),
    role: source.role === USER_ROLES.ADMIN ? USER_ROLES.ADMIN : USER_ROLES.USER,
    status: Object.values(ACCOUNT_STATUSES).includes(source.status)
      ? source.status
      : ACCOUNT_STATUSES.ACTIVE,
    createdAt: source.createdAt || null,
    updatedAt: source.updatedAt || null,
    lastLoginAt: source.lastLoginAt || null,
  };
}

/*
 * Gaming statistics.
 *
 * No Arcadia game records exist yet, so these are neutral zero values rather
 * than invented numbers. They live on the account profile response only, which
 * keeps every gaming stat owned by the backend and gives the future game
 * systems one place to populate real values. Level and badge progression are
 * derived from XP alone and never read from here.
 */
function toGamingStats(source) {
  const gamesPlayed = Number(source && source.gamesPlayed);
  const gamesWon = Number(source && source.gamesWon);

  return {
    gamesPlayed: Number.isFinite(gamesPlayed) && gamesPlayed > 0 ? Math.floor(gamesPlayed) : 0,
    gamesWon: Number.isFinite(gamesWon) && gamesWon > 0 ? Math.floor(gamesWon) : 0,
    totalScore: 0,
    bestScore: 0,
    currentStreak: 0,
    winRatePercent: 0,
  };
}

function toAccountProfile(user) {
  const safeUser = toSafeUser(user);
  if (!safeUser) {
    return null;
  }

  const source = typeof user.toObject === 'function' ? user.toObject() : user;

  return {
    ...safeUser,
    googleAvatarUrl: safeUser.googleAvatarUrl,
    gamingStats: toGamingStats(source && source.gamingStats),
  };
}

module.exports = {
  toSafeUser,
  toAccountProfile,
};
