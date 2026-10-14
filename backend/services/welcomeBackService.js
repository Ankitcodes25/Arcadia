const { Session } = require('../models/Session');
const { getWelcomeBackInactivityDays } = require('../config/email');

const DAY_MS = 24 * 60 * 60 * 1000;

function toTime(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

/*
 * When the account was last active before the sign-in that started at
 * `signInStartedAt`: the latest of its previous sign-in, its most recent
 * refresh-session use and its creation.
 *
 * Session use matters because a player who stays signed in through the
 * refresh cookie plays every day without ever signing in again; judging by
 * lastLoginAt alone would welcome them back after a month of daily play.
 * Sessions touched at or after `signInStartedAt` belong to the current sign-in
 * and are excluded.
 */
async function getLastActivityBefore({ userId, previousLoginAt, createdAt, signInStartedAt }) {
  const latestSession = await Session.findOne({
    userId,
    lastUsedAt: { $lt: signInStartedAt },
  })
    .sort({ lastUsedAt: -1 })
    .select('lastUsedAt')
    .lean();

  const times = [
    toTime(previousLoginAt),
    toTime(createdAt),
    toTime(latestSession && latestSession.lastUsedAt),
  ].filter((time) => time !== null);

  return times.length > 0 ? new Date(Math.max(...times)) : null;
}

/*
 * True when this sign-in comes after at least WELCOME_BACK_INACTIVITY_DAYS of
 * inactivity. With no activity record at all there is nothing to measure the
 * absence against, so no email is sent.
 */
async function isReturningAfterInactivity({ userId, previousLoginAt, createdAt, signInStartedAt }) {
  const lastActivity = await getLastActivityBefore({
    userId,
    previousLoginAt,
    createdAt,
    signInStartedAt,
  });
  if (!lastActivity) return false;

  const thresholdMs = getWelcomeBackInactivityDays() * DAY_MS;
  return signInStartedAt.getTime() - lastActivity.getTime() >= thresholdMs;
}

module.exports = {
  getLastActivityBefore,
  isReturningAfterInactivity,
};
