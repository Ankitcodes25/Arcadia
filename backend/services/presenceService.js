const mongoose = require('mongoose');
const { Session } = require('../models/Session');

/*
 * Lightweight presence built on the refresh sessions Arcadia already creates.
 *
 * A signed-in client sends a heartbeat at a short interval. The heartbeat only
 * touches `lastUsedAt` on the account's non-revoked, unexpired sessions, and a
 * player is reported online only while one of those sessions was touched inside
 * the online window. Nothing is inferred from leaderboard data, match data or a
 * client-supplied status, so "online" always means a real authenticated session
 * has checked in recently.
 */
const ONLINE_WINDOW_MS = 2 * 60 * 1000;

function toObjectIds(userIds) {
  return (Array.isArray(userIds) ? userIds : [])
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));
}

async function touchPresence(userId, now = new Date()) {
  if (!mongoose.isValidObjectId(userId)) return;
  await Session.updateMany(
    {
      userId: new mongoose.Types.ObjectId(userId),
      revokedAt: null,
      expiresAt: { $gt: now },
    },
    { $set: { lastUsedAt: now } },
  );
}

async function listOnlineUserIds(userIds, now = new Date()) {
  const ids = toObjectIds(userIds);
  if (!ids.length) return new Set();

  const onlineIds = await Session.distinct('userId', {
    userId: { $in: ids },
    revokedAt: null,
    expiresAt: { $gt: now },
    lastUsedAt: { $gte: new Date(now.getTime() - ONLINE_WINDOW_MS) },
  });

  return new Set(onlineIds.map((id) => String(id)));
}

module.exports = {
  ONLINE_WINDOW_MS,
  touchPresence,
  listOnlineUserIds,
};
