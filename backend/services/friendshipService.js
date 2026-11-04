const mongoose = require('mongoose');
const { User, USER_ROLES, ACCOUNT_STATUSES } = require('../models/User');
const { FriendRequest } = require('../models/FriendRequest');
const { Friendship } = require('../models/Friendship');
const { Block } = require('../models/Block');
const { toSafeUser } = require('../utils/safeUser');
const { getPreferences, PROFILE_VISIBILITY } = require('../utils/preferences');
const {
  getPairKey,
  getOrderedPair,
  toObjectId,
  escapeRegex,
} = require('../utils/friendship');
const { listOnlineUserIds } = require('./presenceService');
const chatResetService = require('./chatResetService');

const RELATIONSHIP_STATUSES = Object.freeze({
  NONE: 'NONE',
  OUTGOING_PENDING: 'OUTGOING_PENDING',
  INCOMING_PENDING: 'INCOMING_PENDING',
  FRIENDS: 'FRIENDS',
  BLOCKED: 'BLOCKED',
});

const PLAYER_FIELDS = '_id username playerId avatar google preferences';
const SEARCH_LIMIT = 20;

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.expose = true;
  return error;
}

function toIso(value) {
  return value instanceof Date && !Number.isNaN(value.getTime())
    ? value.toISOString()
    : null;
}

function getPlayerSummary(user, onlineIds = new Set()) {
  const safe = toSafeUser(user);
  if (!safe || !safe.id) return null;

  return {
    id: safe.id,
    username: safe.username || 'Player',
    playerId: safe.playerId,
    avatar: safe.avatar,
    avatarUrl: safe.avatar.type === 'google' ? safe.googleAvatarUrl : null,
    online: onlineIds.has(safe.id),
  };
}

function relationship(status, extra = {}) {
  return {
    status,
    requestId: null,
    blockedByMe: false,
    blockedMe: false,
    friendSince: null,
    ...extra,
  };
}

async function findTargetPlayer(targetId) {
  const objectId = toObjectId(targetId);
  if (!objectId) {
    throw createError('Player not found', 404);
  }

  const target = await User.findOne({
    _id: objectId,
    status: ACCOUNT_STATUSES.ACTIVE,
    role: USER_ROLES.USER,
    username: { $type: 'string', $ne: '' },
  }).select(PLAYER_FIELDS).lean();

  if (!target) {
    throw createError('Player not found', 404);
  }

  return target;
}

async function findBlockBetween(firstId, secondId) {
  const first = toObjectId(firstId);
  const second = toObjectId(secondId);
  if (!first || !second) return null;

  return Block.findOne({
    $or: [
      { blocker: first, blocked: second },
      { blocker: second, blocked: first },
    ],
  }).lean();
}

async function areFriends(firstId, secondId) {
  const first = toObjectId(firstId);
  const second = toObjectId(secondId);
  if (!first || !second) return false;

  return Boolean(await Friendship.exists({
    pairKey: getPairKey(first, second),
  }));
}

async function isBlocked(firstId, secondId) {
  return Boolean(await findBlockBetween(firstId, secondId));
}

async function getRelationshipMap(viewerId, targetIds) {
  const viewer = toObjectId(viewerId);
  const ids = (Array.isArray(targetIds) ? targetIds : [])
    .map(toObjectId)
    .filter(Boolean);
  const result = new Map();

  if (!viewer || !ids.length) return result;

  const pairKeys = ids.map((id) => getPairKey(viewer, id));
  const [friendships, requests, blocks] = await Promise.all([
    Friendship.find({ pairKey: { $in: pairKeys } }).lean(),
    FriendRequest.find({ pairKey: { $in: pairKeys } }).lean(),
    Block.find({
      $or: [
        { blocker: viewer, blocked: { $in: ids } },
        { blocker: { $in: ids }, blocked: viewer },
      ],
    }).lean(),
  ]);

  const friendshipByPair = new Map(
    friendships.map((friendship) => [friendship.pairKey, friendship]),
  );
  const requestByPair = new Map(
    requests.map((request) => [request.pairKey, request]),
  );
  // A pair can hold a block in both directions. Keep one flag object per
  // other account and OR the directions together instead of letting the last
  // row overwrite the first.
  const blockFlagsByOther = new Map();
  for (const block of blocks) {
    const otherId = String(block.blocker) === String(viewer)
      ? String(block.blocked)
      : String(block.blocker);
    const flags = blockFlagsByOther.get(otherId) || {
      blockedByMe: false,
      blockedMe: false,
    };
    if (String(block.blocker) === String(viewer)) flags.blockedByMe = true;
    if (String(block.blocked) === String(viewer)) flags.blockedMe = true;
    blockFlagsByOther.set(otherId, flags);
  }

  for (const targetId of ids) {
    const targetKey = String(targetId);
    const pairKey = getPairKey(viewer, targetId);
    const blockFlags = blockFlagsByOther.get(targetKey);

    if (blockFlags) {
      result.set(targetKey, relationship(RELATIONSHIP_STATUSES.BLOCKED, blockFlags));
      continue;
    }

    const friendship = friendshipByPair.get(pairKey);
    if (friendship) {
      result.set(targetKey, relationship(RELATIONSHIP_STATUSES.FRIENDS, {
        friendSince: toIso(friendship.createdAt),
      }));
      continue;
    }

    const pending = requestByPair.get(pairKey);
    if (pending) {
      result.set(
        targetKey,
        relationship(
          String(pending.from) === String(viewer)
            ? RELATIONSHIP_STATUSES.OUTGOING_PENDING
            : RELATIONSHIP_STATUSES.INCOMING_PENDING,
          { requestId: String(pending._id) },
        ),
      );
      continue;
    }

    result.set(targetKey, relationship(RELATIONSHIP_STATUSES.NONE));
  }

  return result;
}

async function getRelationship(viewerId, targetId) {
  if (String(viewerId) === String(targetId)) {
    throw createError('You cannot add yourself as a friend', 400);
  }

  await findTargetPlayer(targetId);
  const map = await getRelationshipMap(viewerId, [targetId]);
  return map.get(String(targetId)) || relationship(RELATIONSHIP_STATUSES.NONE);
}

async function listFriends(userId) {
  const viewer = toObjectId(userId);
  if (!viewer) return [];

  const friendships = await Friendship.find({
    $or: [{ userA: viewer }, { userB: viewer }],
  }).lean();
  if (!friendships.length) return [];

  const friendshipByFriendId = new Map();
  for (const friendship of friendships) {
    const friendId = String(friendship.userA) === String(viewer)
      ? String(friendship.userB)
      : String(friendship.userA);
    friendshipByFriendId.set(friendId, friendship);
  }

  const friendIds = [...friendshipByFriendId.keys()];
  const [users, onlineIds] = await Promise.all([
    User.find({
      _id: { $in: friendIds },
      status: ACCOUNT_STATUSES.ACTIVE,
      role: USER_ROLES.USER,
    }).select(PLAYER_FIELDS).lean(),
    listOnlineUserIds(friendIds),
  ]);

  return users
    .map((user) => {
      const summary = getPlayerSummary(user, onlineIds);
      if (!summary) return null;
      const friendship = friendshipByFriendId.get(summary.id);
      return {
        ...summary,
        friendsSince: toIso(friendship && friendship.createdAt),
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left.online !== right.online) return left.online ? -1 : 1;
      return left.username.localeCompare(right.username, 'en', { sensitivity: 'base' });
    });
}

async function listBlockedUsers(userId) {
  const viewer = toObjectId(userId);
  if (!viewer) return [];

  // Only blocks created by the authenticated viewer are returned. A block held
  // against the viewer is a relationship detail, not an entry they can manage.
  const rows = await Block.find({ blocker: viewer })
    .sort({ createdAt: -1 })
    .lean();
  if (!rows.length) return [];

  const blockedIds = rows.map((row) => String(row.blocked));
  const users = await User.find({
    _id: { $in: blockedIds },
    status: ACCOUNT_STATUSES.ACTIVE,
    role: USER_ROLES.USER,
  }).select(PLAYER_FIELDS).lean();
  const usersById = new Map(users.map((user) => [String(user._id), user]));

  // Presence is only shared between accepted friends. A blocked player is
  // therefore never shown as online here.
  const onlineIds = new Set();
  return rows
    .map((row) => {
      const user = usersById.get(String(row.blocked));
      const summary = user ? getPlayerSummary(user, onlineIds) : null;
      return summary
        ? { ...summary, blockedAt: toIso(row.createdAt) }
        : null;
    })
    .filter(Boolean);
}

async function listRequests(userId) {
  const viewer = toObjectId(userId);
  if (!viewer) {
    return { incoming: [], outgoing: [], incomingCount: 0 };
  }

  const [incomingRows, outgoingRows] = await Promise.all([
    FriendRequest.find({ to: viewer }).sort({ createdAt: -1 }).lean(),
    FriendRequest.find({ from: viewer }).sort({ createdAt: -1 }).lean(),
  ]);

  const otherIds = new Set();
  for (const row of incomingRows) otherIds.add(String(row.from));
  for (const row of outgoingRows) otherIds.add(String(row.to));
  const ids = [...otherIds];

  const users = ids.length
    ? await User.find({
      _id: { $in: ids },
      status: ACCOUNT_STATUSES.ACTIVE,
      role: USER_ROLES.USER,
    }).select(PLAYER_FIELDS).lean()
    : [];
  // Presence is shared with accepted friends only. A pending request is not a
  // friendship, so neither side of it learns whether the other is online.
  const onlineIds = new Set();

  const usersById = new Map(users.map((user) => [String(user._id), user]));

  // Incoming rows are decorated with their sender; outgoing rows with their
  // recipient. The helper above is deliberately told which side to use by
  // building one map per direction, so a request can never show the wrong user.
  const incoming = incomingRows
    .map((row) => {
      const user = usersById.get(String(row.from));
      const summary = user ? getPlayerSummary(user, onlineIds) : null;
      return summary
        ? { id: String(row._id), createdAt: toIso(row.createdAt), user: summary }
        : null;
    })
    .filter(Boolean);
  const outgoing = outgoingRows
    .map((row) => {
      const user = usersById.get(String(row.to));
      const summary = user ? getPlayerSummary(user, onlineIds) : null;
      return summary
        ? { id: String(row._id), createdAt: toIso(row.createdAt), user: summary }
        : null;
    })
    .filter(Boolean);

  return {
    incoming,
    outgoing,
    incomingCount: incoming.length,
  };
}

async function getRequestSummary(userId) {
  const viewer = toObjectId(userId);
  if (!viewer) return { incomingCount: 0 };

  // Count only requests that the Requests tab can actually show. A sender who
  // was suspended or deleted must not leave a phantom badge behind.
  const senders = await FriendRequest.find({ to: viewer }).select('from').lean();
  if (!senders.length) return { incomingCount: 0 };

  const incomingCount = await User.countDocuments({
    _id: { $in: senders.map((request) => request.from) },
    status: ACCOUNT_STATUSES.ACTIVE,
    role: USER_ROLES.USER,
  });
  return { incomingCount };
}

async function sendRequest(viewerId, targetUserId) {
  const viewer = toObjectId(viewerId);
  const targetId = toObjectId(targetUserId);

  if (!viewer) throw createError('Authentication required', 401);
  if (!targetId) throw createError('Invalid player', 400);
  if (String(viewer) === String(targetId)) {
    throw createError('You cannot send a friend request to yourself', 400);
  }

  const target = await findTargetPlayer(targetId);

  if (await isBlocked(viewer, targetId)) {
    throw createError('Friend request unavailable', 403);
  }

  if (getPreferences(target).profileVisibility === PROFILE_VISIBILITY.NO_ONE) {
    throw createError('This player is not accepting friend requests', 403);
  }

  const pairKey = getPairKey(viewer, targetId);
  const [friendship, pending] = await Promise.all([
    Friendship.findOne({ pairKey }).lean(),
    FriendRequest.findOne({ pairKey }).lean(),
  ]);

  if (friendship) {
    throw createError('You are already friends', 409);
  }

  if (pending) {
    throw createError(
      String(pending.from) === String(viewer)
        ? 'Friend request already sent'
        : 'This player has already sent you a friend request',
      409,
    );
  }

  let request;
  try {
    request = await FriendRequest.create({
      from: viewer,
      to: targetId,
      pairKey,
    });
  } catch (error) {
    if (error && error.code === 11000) {
      throw createError('Friend request already sent', 409);
    }
    throw error;
  }

  return {
    relationship: relationship(RELATIONSHIP_STATUSES.OUTGOING_PENDING, {
      requestId: String(request._id),
    }),
    request: {
      id: String(request._id),
      createdAt: toIso(request.createdAt),
    },
  };
}

async function acceptRequest(viewerId, requestId) {
  const viewer = toObjectId(viewerId);
  const id = toObjectId(requestId);
  if (!viewer || !id) throw createError('Friend request not found', 404);

  const request = await FriendRequest.findById(id).lean();
  if (!request) throw createError('Friend request not found', 404);
  if (String(request.to) !== String(viewer)) {
    throw createError('Not allowed to act on this friend request', 403);
  }

  if (await isBlocked(request.from, viewer)) {
    await FriendRequest.deleteOne({ _id: request._id });
    throw createError('Friend request unavailable', 403);
  }

  const pairKey = getPairKey(request.from, request.to);
  const { userA, userB } = getOrderedPair(request.from, request.to);

  // A block marks the old conversation. Discard it before the friendship
  // exists so no chat request can observe the stale thread once both users are
  // friends again. The replacement conversation is created immediately, so
  // both sides list the same new conversation even before the first message.
  const reset = await chatResetService.resetConversationForNewFriendship(
    request.from,
    request.to,
  );

  await Friendship.updateOne(
    { pairKey },
    { $setOnInsert: { userA, userB, pairKey } },
    { upsert: true },
  );
  await FriendRequest.deleteMany({ pairKey });

  const friendUser = await User.findOne({
    _id: request.from,
    status: ACCOUNT_STATUSES.ACTIVE,
    role: USER_ROLES.USER,
  }).select(PLAYER_FIELDS).lean();

  if (!friendUser) {
    await Friendship.deleteOne({ pairKey });
    // The friendship never became visible, so roll the fresh conversation
    // back rather than leaving an empty thread that nobody can use.
    if (reset.reset) {
      await chatResetService.discardFreshConversation(
        reset.conversationId,
        request.from,
        request.to,
      );
    }
    throw createError('Player not found', 404);
  }

  const friendship = await Friendship.findOne({ pairKey }).lean();
  const onlineIds = await listOnlineUserIds([request.from]);
  const friend = {
    ...getPlayerSummary(friendUser, onlineIds),
    friendsSince: toIso(friendship && friendship.createdAt),
  };

  return {
    relationship: relationship(RELATIONSHIP_STATUSES.FRIENDS, {
      friendSince: friend.friendsSince,
    }),
    friend,
  };
}

async function rejectRequest(viewerId, requestId) {
  const viewer = toObjectId(viewerId);
  const id = toObjectId(requestId);
  if (!viewer || !id) throw createError('Friend request not found', 404);

  const request = await FriendRequest.findById(id).lean();
  if (!request) throw createError('Friend request not found', 404);
  if (String(request.to) !== String(viewer)) {
    throw createError('Not allowed to act on this friend request', 403);
  }

  await FriendRequest.deleteOne({ _id: request._id, to: viewer });
  return { relationship: relationship(RELATIONSHIP_STATUSES.NONE) };
}

async function cancelRequest(viewerId, requestId) {
  const viewer = toObjectId(viewerId);
  const id = toObjectId(requestId);
  if (!viewer || !id) throw createError('Friend request not found', 404);

  const request = await FriendRequest.findById(id).lean();
  if (!request) throw createError('Friend request not found', 404);
  if (String(request.from) !== String(viewer)) {
    throw createError('Not allowed to cancel this friend request', 403);
  }

  await FriendRequest.deleteOne({ _id: request._id, from: viewer });
  return { relationship: relationship(RELATIONSHIP_STATUSES.NONE) };
}

async function removeFriend(viewerId, targetUserId) {
  const viewer = toObjectId(viewerId);
  const targetId = toObjectId(targetUserId);
  if (!viewer) throw createError('Authentication required', 401);
  if (!targetId) throw createError('Invalid player', 400);
  if (String(viewer) === String(targetId)) {
    throw createError('You cannot remove yourself', 400);
  }

  // The delete is the existence check: of two concurrent removals exactly one
  // deletes the row and the other is told the friendship no longer exists.
  // Conversation and message documents are deliberately left in place.
  const pairKey = getPairKey(viewer, targetId);
  const result = await Friendship.deleteOne({ pairKey });
  if (!result.deletedCount) {
    throw createError('You are not friends with this player', 404);
  }
  await FriendRequest.deleteMany({ pairKey });

  return { relationship: relationship(RELATIONSHIP_STATUSES.NONE) };
}

async function blockUser(viewerId, targetUserId) {
  const viewer = toObjectId(viewerId);
  const targetId = toObjectId(targetUserId);
  if (!viewer) throw createError('Authentication required', 401);
  if (!targetId) throw createError('Invalid player', 400);
  if (String(viewer) === String(targetId)) {
    throw createError('You cannot block yourself', 400);
  }

  const targetExists = await User.exists({ _id: targetId });
  if (!targetExists) throw createError('Player not found', 404);

  try {
    await Block.updateOne(
      { blocker: viewer, blocked: targetId },
      { $setOnInsert: { blocker: viewer, blocked: targetId } },
      { upsert: true },
    );
  } catch (error) {
    if (!error || error.code !== 11000) throw error;
  }

  const pairKey = getPairKey(viewer, targetId);
  // A block must not merely hide the thread: the next accepted friendship is
  // required to start from an empty conversation with a new id. The marker is
  // harmless when no conversation exists yet.
  await chatResetService.markConversationForReset(viewer, targetId);
  await Promise.all([
    FriendRequest.deleteMany({ pairKey }),
    Friendship.deleteOne({ pairKey }),
  ]);

  const blockedMe = Boolean(await Block.exists({
    blocker: targetId,
    blocked: viewer,
  }));

  return {
    relationship: relationship(RELATIONSHIP_STATUSES.BLOCKED, {
      blockedByMe: true,
      blockedMe,
    }),
  };
}

async function blockRequestSender(viewerId, requestId) {
  const viewer = toObjectId(viewerId);
  const id = toObjectId(requestId);
  if (!viewer || !id) throw createError('Friend request not found', 404);

  const request = await FriendRequest.findById(id).lean();
  if (!request) throw createError('Friend request not found', 404);
  if (String(request.to) !== String(viewer)) {
    throw createError('Not allowed to block this friend request', 403);
  }

  const result = await blockUser(viewer, request.from);
  return { ...result, userId: String(request.from) };
}

async function unblockUser(viewerId, targetUserId) {
  const viewer = toObjectId(viewerId);
  const targetId = toObjectId(targetUserId);
  if (!viewer) throw createError('Authentication required', 401);
  if (!targetId) throw createError('Invalid player', 400);
  if (String(viewer) === String(targetId)) {
    throw createError('You cannot unblock yourself', 400);
  }

  const targetExists = await User.exists({ _id: targetId });
  if (!targetExists) throw createError('Player not found', 404);

  // The delete is scoped to the authenticated blocker. A player who did not
  // create the block (including the blocked side of it) cannot remove it.
  const result = await Block.deleteOne({ blocker: viewer, blocked: targetId });
  if (!result.deletedCount) {
    throw createError('Block not found', 404);
  }

  const blockedMe = Boolean(await Block.exists({
    blocker: targetId,
    blocked: viewer,
  }));

  return {
    relationship: relationship(blockedMe ? RELATIONSHIP_STATUSES.BLOCKED : RELATIONSHIP_STATUSES.NONE, {
      blockedByMe: false,
      blockedMe,
    }),
  };
}

async function searchPlayers(viewerId, rawQuery) {
  const viewer = toObjectId(viewerId);
  if (!viewer) throw createError('Authentication required', 401);

  const query = typeof rawQuery === 'string' ? rawQuery.trim() : '';
  if (query.length < 2) return { players: [] };

  const blocked = await Block.find({
    $or: [
      { blocker: viewer },
      { blocked: viewer },
    ],
  }).select('blocker blocked').lean();
  const blockedIds = [...new Set(blocked.flatMap((row) => [
    String(row.blocker),
    String(row.blocked),
  ]).filter((id) => id !== String(viewer)))];

  const usernamePattern = new RegExp(escapeRegex(query), 'i');
  const playerIdPattern = new RegExp(`^${escapeRegex(query.toUpperCase())}`, 'i');

  const users = await User.find({
    _id: { $ne: viewer, $nin: blockedIds },
    status: ACCOUNT_STATUSES.ACTIVE,
    role: USER_ROLES.USER,
    username: { $type: 'string', $ne: '' },
    $and: [
      {
        $or: [
          { usernameNormalized: usernamePattern },
          { playerId: playerIdPattern },
        ],
      },
      {
        $or: [
          { 'preferences.profileVisibility': { $exists: false } },
          { 'preferences.profileVisibility': PROFILE_VISIBILITY.PUBLIC },
        ],
      },
    ],
  })
    .select(PLAYER_FIELDS)
    .sort({ username: 1 })
    .limit(SEARCH_LIMIT)
    .lean();

  const ids = users.map((user) => String(user._id));
  const relationships = await getRelationshipMap(viewer, ids);
  // Search reaches any public player, but presence is shared with accepted
  // friends only: everyone else is reported as not online.
  const friendIds = ids.filter((id) => (
    relationships.get(id)?.status === RELATIONSHIP_STATUSES.FRIENDS
  ));
  const onlineIds = await listOnlineUserIds(friendIds);

  const players = users
    .map((user) => {
      const summary = getPlayerSummary(user, onlineIds);
      if (!summary) return null;
      return {
        ...summary,
        relationship: relationships.get(summary.id)
          || relationship(RELATIONSHIP_STATUSES.NONE),
      };
    })
    .filter(Boolean);

  return { players };
}

module.exports = {
  RELATIONSHIP_STATUSES,
  areFriends,
  isBlocked,
  getRelationship,
  listFriends,
  listBlockedUsers,
  listRequests,
  getRequestSummary,
  sendRequest,
  acceptRequest,
  rejectRequest,
  cancelRequest,
  removeFriend,
  blockUser,
  blockRequestSender,
  unblockUser,
  searchPlayers,
};
