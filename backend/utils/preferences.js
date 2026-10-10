/*
 * Account preferences: the single definition of what a preference is, what its
 * canonical default is, and how a stored document is read back.
 *
 * Two rules hold everywhere in this file:
 *
 *  - The values here are the CANONICAL defaults. The reset endpoint writes
 *    exactly these values, and an account that predates preferences reads back
 *    exactly these values, so "reset" and "never touched" are the same state.
 *
 *  - Stored data is never trusted. `getPreferences` re-validates every field it
 *    reads from a document, so a document holding a legacy or corrupted value
 *    cannot leak an out-of-range volume or an unknown enum into an API
 *    response or into a leaderboard query.
 *
 * Privacy is enforced by these helpers rather than by each caller, because the
 * same question ("may this viewer see this profile?") must never be answered
 * twice with different results. Arcadia has no friendship graph yet, so
 * `FRIENDS` fails closed: with no way to prove a friendship, no other viewer
 * is allowed in. When a friendship model exists it is consulted here, in one
 * place, and every caller inherits the answer.
 */

const PROFILE_VISIBILITY = Object.freeze({
  PUBLIC: 'PUBLIC',
  FRIENDS: 'FRIENDS',
  NO_ONE: 'NO_ONE',
});

const LEADERBOARD_VISIBILITY = Object.freeze({
  SHOW: 'SHOW',
  HIDE: 'HIDE',
});

const PREFERENCE_DEFAULTS = Object.freeze({
  soundEffects: true,
  soundVolume: 100,
  profileVisibility: PROFILE_VISIBILITY.PUBLIC,
  leaderboardVisibility: LEADERBOARD_VISIBILITY.SHOW,
});

const PREFERENCE_KEYS = Object.freeze(Object.keys(PREFERENCE_DEFAULTS));

const PROFILE_VISIBILITY_VALUES = Object.freeze(Object.values(PROFILE_VISIBILITY));
const LEADERBOARD_VISIBILITY_VALUES = Object.freeze(Object.values(LEADERBOARD_VISIBILITY));

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isValidVolume(value) {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= 0
    && value <= 100;
}

/*
 * The stored document is merged with the canonical defaults key by key, and
 * every value is re-validated on the way out. An account created before
 * preferences existed simply reads as the defaults, which is why no migration
 * is needed and why the reset endpoint and an old account agree.
 */
function getPreferences(user) {
  const stored = isPlainObject(user && user.preferences) ? user.preferences : {};

  return {
    soundEffects: typeof stored.soundEffects === 'boolean'
      ? stored.soundEffects
      : PREFERENCE_DEFAULTS.soundEffects,
    soundVolume: isValidVolume(stored.soundVolume)
      ? stored.soundVolume
      : PREFERENCE_DEFAULTS.soundVolume,
    profileVisibility: PROFILE_VISIBILITY_VALUES.includes(stored.profileVisibility)
      ? stored.profileVisibility
      : PREFERENCE_DEFAULTS.profileVisibility,
    leaderboardVisibility: LEADERBOARD_VISIBILITY_VALUES.includes(stored.leaderboardVisibility)
      ? stored.leaderboardVisibility
      : PREFERENCE_DEFAULTS.leaderboardVisibility,
  };
}

/*
 * The one validation pass for a preference write. Returns either the exact
 * `$set` patch to apply or a human readable reason the write was rejected, so
 * a caller can never apply half of a request: either the whole patch is valid
 * or nothing is written.
 */
function resolvePreferenceUpdates(body) {
  if (!isPlainObject(body)) {
    return { error: 'Request body must be an object', updates: null };
  }

  const keys = Object.keys(body);
  if (keys.length === 0) {
    return { error: 'No preference changes were provided', updates: null };
  }

  const updates = {};
  for (const key of keys) {
    switch (key) {
      case 'soundEffects': {
        if (typeof body[key] !== 'boolean') {
          return { error: 'soundEffects must be true or false', updates: null };
        }
        updates[key] = body[key];
        break;
      }
      case 'soundVolume': {
        if (!isValidVolume(body[key])) {
          return { error: 'soundVolume must be a whole number between 0 and 100', updates: null };
        }
        updates[key] = body[key];
        break;
      }
      case 'profileVisibility': {
        if (!PROFILE_VISIBILITY_VALUES.includes(body[key])) {
          return { error: 'profileVisibility must be PUBLIC, FRIENDS or NO_ONE', updates: null };
        }
        updates[key] = body[key];
        break;
      }
      case 'leaderboardVisibility': {
        if (!LEADERBOARD_VISIBILITY_VALUES.includes(body[key])) {
          return { error: 'leaderboardVisibility must be SHOW or HIDE', updates: null };
        }
        updates[key] = body[key];
        break;
      }
      default:
        return { error: 'Request contains unsupported fields', updates: null };
    }
  }

  return { error: null, updates };
}

/*
 * May `viewerId` (a signed-in account id, or null for an anonymous caller) see
 * the profile owned by `user`?
 *
 * Arcadia has no friendship model, so `FRIENDS` cannot be satisfied by anyone
 * but the owner: with no relationship data to check, the answer fails closed
 * rather than open. `PUBLIC` is the only state another account can satisfy.
 */
function canViewProfile(user, viewerId) {
  const preferences = getPreferences(user);
  const ownerId = user && (user._id || user.id) ? String(user._id || user.id) : null;

  if (viewerId && ownerId && String(viewerId) === ownerId) {
    return true;
  }

  return preferences.profileVisibility === PROFILE_VISIBILITY.PUBLIC;
}

/*
 * The filter every public leaderboard query must be built from.
 *
 * `HIDE` is excluded by an explicit match, while every other stored value —
 * including accounts that predate the field and hold nothing at all — keeps
 * showing. Visibility therefore hides an account without ever touching the
 * progression data itself, so XP and levels are untouched by the choice.
 */
function getPublicLeaderboardFilter() {
  return {
    'preferences.leaderboardVisibility': { $ne: LEADERBOARD_VISIBILITY.HIDE },
  };
}

module.exports = {
  PROFILE_VISIBILITY,
  LEADERBOARD_VISIBILITY,
  PREFERENCE_DEFAULTS,
  PREFERENCE_KEYS,
  getPreferences,
  resolvePreferenceUpdates,
  canViewProfile,
  getPublicLeaderboardFilter,
};
