const mongoose = require('mongoose');
const { Conversation } = require('../models/Conversation');
const { Message, MESSAGE_STATUSES, MAX_MESSAGE_LENGTH } = require('../models/Message');
const {
  ClearChatRequest,
  CLEAR_CHAT_REQUEST_STATUSES,
} = require('../models/ClearChatRequest');
const { User } = require('../models/User');
const friendshipService = require('./friendshipService');
const { getPairKey, getOrderedPair, toObjectId } = require('../utils/friendship');

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 50;
const MAX_PENDING_MESSAGES = 200;
const MAX_DELIVERY_ACK_IDS = 200;
const CLIENT_MESSAGE_ID_PATTERN = /^[A-Za-z0-9:_-]{8,100}$/;
// Long enough for a deleteMany on a large conversation, short enough that a
// crashed request cannot block sending for more than a moment.
const CLEAR_LOCK_MS = 30 * 1000;
const CLEAR_SCOPES = Object.freeze({ ME: 'me', BOTH: 'both' });

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

function serializeMessage(message) {
  return {
    id: String(message._id),
    conversationId: String(message.conversationId),
    senderId: String(message.senderId),
    receiverId: String(message.receiverId),
    text: message.text,
    status: message.status,
    sentAt: toIso(message.sentAt || message.createdAt),
    deliveredAt: toIso(message.deliveredAt),
    readAt: toIso(message.readAt),
    createdAt: toIso(message.createdAt),
  };
}

function normalizeText(value) {
  if (typeof value !== 'string') {
    throw createError('Message text is required', 400);
  }

  const text = value.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trim();
  if (!text) throw createError('Message cannot be empty', 400);
  if (text.length > MAX_MESSAGE_LENGTH) {
    throw createError(`Messages cannot exceed ${MAX_MESSAGE_LENGTH} characters`, 400);
  }

  return text;
}

function normalizeClientMessageId(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw createError('Invalid message identifier', 400);
  }

  const id = value.trim();
  if (!CLIENT_MESSAGE_ID_PATTERN.test(id)) {
    throw createError('Invalid message identifier', 400);
  }

  return id;
}

function normalizeLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.min(MAX_PAGE_SIZE, parsed));
}

/**
 * The viewer's own "clear my side" cutoff, or null. Lean reads return the
 * Map field as a plain object; hydrated documents return a Map.
 */
function getClearedAt(conversation, userId) {
  const cleared = conversation && conversation.clearedAt;
  if (!cleared) return null;
  const value = cleared instanceof Map
    ? cleared.get(String(userId))
    : cleared[String(userId)];
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

/** Restricts a message query to rows the viewer has not cleared. */
function visibleSince(query, clearedAt) {
  return clearedAt ? { ...query, createdAt: { $gt: clearedAt } } : query;
}

function isClearLocked(conversation, now = new Date()) {
  return Boolean(
    conversation
    && conversation.clearLockUntil instanceof Date
    && conversation.clearLockUntil > now,
  );
}

function serializeClearRequest(request, requesterUsername) {
  return {
    id: String(request._id),
    conversationId: String(request.conversationId),
    requesterId: String(request.requesterId),
    recipientId: String(request.recipientId),
    requesterUsername: requesterUsername || 'Player',
    status: request.status,
    createdAt: toIso(request.createdAt),
    respondedAt: toIso(request.respondedAt),
  };
}

async function loadRequesterUsernames(requests) {
  const ids = [...new Set(requests.map((request) => String(request.requesterId)))];
  if (!ids.length) return new Map();
  const users = await User.find({ _id: { $in: ids } }).select('_id username').lean();
  return new Map(users.map((user) => [String(user._id), user.username]));
}

async function serializeClearRequests(requests) {
  const usernames = await loadRequesterUsernames(requests);
  return requests.map((request) => serializeClearRequest(
    request,
    usernames.get(String(request.requesterId)),
  ));
}

async function assertCanChat(viewerId, friendId) {
  if (!toObjectId(viewerId)) throw createError('Authentication required', 401);
  if (!toObjectId(friendId)) throw createError('Player not found', 404);
  if (String(viewerId) === String(friendId)) {
    throw createError('You cannot message yourself', 400);
  }

  const relationship = await friendshipService.getRelationship(viewerId, friendId);
  if (relationship.status !== friendshipService.RELATIONSHIP_STATUSES.FRIENDS) {
    throw createError('Only accepted friends can message each other', 403);
  }

  return relationship;
}

async function findConversation(firstId, secondId) {
  const first = toObjectId(firstId);
  const second = toObjectId(secondId);
  if (!first || !second) return null;

  return Conversation.findOne({
    participantKey: getPairKey(first, second),
    participants: { $all: [first, second] },
  }).lean();
}

async function getOrCreateConversation(firstId, secondId) {
  const first = toObjectId(firstId);
  const second = toObjectId(secondId);
  if (!first || !second) throw createError('Player not found', 404);

  const { userA, userB } = getOrderedPair(first, second);
  const participantKey = getPairKey(first, second);
  const participants = [new mongoose.Types.ObjectId(userA), new mongoose.Types.ObjectId(userB)];

  try {
    return await Conversation.findOneAndUpdate(
      { participantKey },
      {
        $setOnInsert: {
          participantKey,
          participants,
          lastMessage: '',
          lastMessageAt: null,
          lastMessageSenderId: null,
        },
      },
      {
        upsert: true,
        returnDocument: 'after',
        setDefaultsOnInsert: true,
      },
    ).lean();
  } catch (error) {
    if (error && error.code === 11000) {
      return Conversation.findOne({ participantKey }).lean();
    }
    throw error;
  }
}

async function getUnreadCountsByConversation(userId, conversations) {
  const viewer = toObjectId(userId);
  const rows = Array.isArray(conversations) ? conversations : [];
  if (!viewer || !rows.length) return new Map();

  // Messages the viewer cleared from their own side are not unread for them,
  // even if they were never opened.
  const scopes = rows.map((conversation) => visibleSince(
    { conversationId: conversation._id },
    getClearedAt(conversation, viewer),
  ));

  const counts = await Message.aggregate([
    {
      $match: {
        receiverId: viewer,
        readAt: null,
        $or: scopes,
      },
    },
    { $group: { _id: '$conversationId', count: { $sum: 1 } } },
  ]);

  return new Map(counts.map((row) => [String(row._id), row.count]));
}

async function getPendingClearRequestsByConversation(conversationIds) {
  if (!conversationIds.length) return new Map();
  const requests = await ClearChatRequest.find({
    conversationId: { $in: conversationIds },
    status: CLEAR_CHAT_REQUEST_STATUSES.PENDING,
  }).lean();
  const serialized = await serializeClearRequests(requests);
  return new Map(serialized.map((request) => [request.conversationId, request]));
}

async function listConversations(userId) {
  const viewer = toObjectId(userId);
  if (!viewer) throw createError('Authentication required', 401);

  const [friends, conversations] = await Promise.all([
    friendshipService.listFriends(userId),
    Conversation.find({ participants: viewer })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .lean(),
  ]);

  if (!conversations.length) return { conversations: [] };

  const friendsById = new Map(friends.map((friend) => [friend.id, friend]));
  const visible = conversations
    .map((conversation) => {
      const friendId = conversation.participants
        .map((participant) => String(participant))
        .find((participantId) => participantId !== String(viewer));
      const friend = friendId ? friendsById.get(friendId) : null;
      return friend ? { conversation, friend } : null;
    })
    .filter(Boolean);

  if (!visible.length) return { conversations: [] };

  const [unreadByConversation, clearRequestByConversation] = await Promise.all([
    getUnreadCountsByConversation(
      userId,
      visible.map(({ conversation }) => conversation),
    ),
    getPendingClearRequestsByConversation(
      visible.map(({ conversation }) => conversation._id),
    ),
  ]);

  const rows = visible.map(({ conversation, friend }) => {
    const clearedAt = getClearedAt(conversation, viewer);
    // A preview the viewer cleared from their side must not leak back into
    // the Friends list.
    const previewHidden = Boolean(
      clearedAt
      && conversation.lastMessageAt
      && conversation.lastMessageAt <= clearedAt,
    );
    return {
      id: String(conversation._id),
      friend,
      lastMessage: previewHidden ? null : conversation.lastMessage || null,
      lastMessageAt: previewHidden ? null : toIso(conversation.lastMessageAt),
      lastMessageFromMe: !previewHidden && conversation.lastMessageSenderId
        ? String(conversation.lastMessageSenderId) === String(viewer)
        : false,
      unreadCount: unreadByConversation.get(String(conversation._id)) || 0,
      clearRequest: clearRequestByConversation.get(String(conversation._id)) || null,
    };
  });

  rows.sort((left, right) => {
    const leftTime = left.lastMessageAt ? Date.parse(left.lastMessageAt) : 0;
    const rightTime = right.lastMessageAt ? Date.parse(right.lastMessageAt) : 0;
    if (leftTime !== rightTime) return rightTime - leftTime;
    return left.friend.username.localeCompare(right.friend.username, 'en', { sensitivity: 'base' });
  });

  return { conversations: rows };
}

async function getUnreadSummary(userId) {
  const { conversations } = await listConversations(userId);
  return {
    unreadMessageCount: conversations.reduce((total, conversation) => (
      total + conversation.unreadCount
    ), 0),
    incomingClearRequestCount: conversations.filter((conversation) => (
      conversation.clearRequest
      && conversation.clearRequest.recipientId === String(userId)
    )).length,
  };
}

async function listMessages(userId, friendId, options = {}) {
  const viewer = toObjectId(userId);
  if (!viewer) throw createError('Authentication required', 401);

  await assertCanChat(viewer, friendId);
  const conversation = await findConversation(viewer, friendId);
  if (!conversation) {
    return {
      conversationId: null,
      messages: [],
      hasMessages: false,
      hasMore: false,
      nextCursor: null,
      clearedAt: null,
    };
  }

  const limit = normalizeLimit(options.limit);
  const clearedAt = getClearedAt(conversation, viewer);
  const query = visibleSince({ conversationId: conversation._id }, clearedAt);

  if (options.before !== undefined && options.before !== null && options.before !== '') {
    const beforeId = toObjectId(options.before);
    if (!beforeId) throw createError('Invalid message cursor', 400);

    // A cursor must itself be visible: a message cleared from this viewer's
    // side, or deleted by a mutual clear, can never anchor a page.
    const cursor = await Message.findOne(visibleSince({
      _id: beforeId,
      conversationId: conversation._id,
    }, clearedAt)).select('_id createdAt').lean();
    if (!cursor) throw createError('Invalid message cursor', 400);

    query.$or = [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $lt: cursor._id } },
    ];
  }

  const rows = await Message.find(query)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean();

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();

  // Reading history does not imply delivery. The recipient device confirms
  // that it received each message through the authenticated socket, and only
  // that acknowledgement may advance the persisted status.
  return {
    conversationId: String(conversation._id),
    messages: page.map(serializeMessage),
    // Server truth for the Clear Chat menu: a viewer's one-sided cutoff hides
    // rows without deleting them, while a both-sides clear leaves none.
    hasMessages: page.length > 0
      || Boolean(await Message.exists({ conversationId: conversation._id })),
    hasMore,
    nextCursor: hasMore ? String(page[0]._id) : null,
    clearedAt: toIso(clearedAt),
  };
}

async function listPendingMessages(userId, limit = MAX_PENDING_MESSAGES) {
  const viewer = toObjectId(userId);
  if (!viewer) throw createError('Authentication required', 401);

  // Only current friends can have pending chat delivered. This keeps a block
  // or an ended friendship from replaying old private messages on reconnect.
  const friends = await friendshipService.listFriends(userId);
  const friendIds = friends.map((friend) => toObjectId(friend.id)).filter(Boolean);
  if (!friendIds.length) return [];

  const parsedLimit = Number.parseInt(limit, 10);
  const pageSize = Number.isInteger(parsedLimit)
    ? Math.max(1, Math.min(MAX_PENDING_MESSAGES, parsedLimit))
    : MAX_PENDING_MESSAGES;

  const rows = await Message.find({
    receiverId: viewer,
    senderId: { $in: friendIds },
    status: MESSAGE_STATUSES.SENT,
  })
    .sort({ createdAt: 1, _id: 1 })
    .limit(pageSize)
    .lean();

  if (!rows.length) return [];

  // Confirm the recipient is still a participant in every conversation. A
  // receiver-scoped message should always satisfy this, but the explicit check
  // keeps delivery authorization tied to conversation membership.
  const conversationIds = [...new Set(rows.map((row) => String(row.conversationId)))];
  const conversations = await Conversation.find({
    _id: { $in: conversationIds },
    participants: viewer,
  }).select('_id participants clearedAt').lean();
  const allowedParticipants = new Map(conversations.map((row) => [
    String(row._id),
    new Set(row.participants.map((participant) => String(participant))),
  ]));
  const clearedAtByConversation = new Map(conversations.map((row) => [
    String(row._id),
    getClearedAt(row, viewer),
  ]));

  return rows
    .filter((row) => {
      const participants = allowedParticipants.get(String(row.conversationId));
      if (!participants || !participants.has(String(row.senderId))) return false;
      // Never replay a message the recipient already cleared from their side.
      const clearedAt = clearedAtByConversation.get(String(row.conversationId));
      return !clearedAt || row.createdAt > clearedAt;
    })
    .map(serializeMessage);
}

async function sendMessage(senderId, receiverId, rawText, rawClientMessageId) {
  const sender = toObjectId(senderId);
  const receiver = toObjectId(receiverId);
  if (!sender) throw createError('Authentication required', 401);
  if (!receiver) throw createError('Player not found', 404);

  await assertCanChat(sender, receiver);
  const text = normalizeText(rawText);
  const clientMessageId = normalizeClientMessageId(rawClientMessageId);

  if (clientMessageId) {
    const existing = await Message.findOne({ senderId: sender, clientMessageId }).lean();
    if (existing) {
      if (String(existing.receiverId) !== String(receiver) || existing.text !== text) {
        throw createError('Message already submitted', 409);
      }
      return { message: serializeMessage(existing), duplicate: true };
    }
  }

  const conversation = await getOrCreateConversation(sender, receiver);
  if (!conversation) throw createError('Conversation unavailable', 503);
  if (isClearLocked(conversation)) {
    throw createError('This chat is being cleared. Try sending again in a moment.', 409);
  }

  const lockInactive = () => ({
    $or: [
      { clearLockUntil: null },
      { clearLockUntil: { $lte: new Date() } },
    ],
  });

  const writeMessage = async (session) => {
    const options = session ? { session } : {};

    if (session) {
      // Claim the conversation row inside the transaction. A mutual clear
      // takes its lock with a write to this same row, so MongoDB serialises
      // the two: either this send commits first and the clear deletes it with
      // the rest, or the lock is already held and the send is refused. No
      // message can slip in between the lock and the delete.
      const claimed = await Conversation.updateOne(
        { _id: conversation._id, ...lockInactive() },
        { $set: { updatedAt: new Date() } },
        { ...options, timestamps: false },
      );
      if (!claimed.matchedCount) {
        throw createError('This chat is being cleared. Try sending again in a moment.', 409);
      }
    }

    const [created] = await Message.create([{
      conversationId: conversation._id,
      senderId: sender,
      receiverId: receiver,
      text,
      clientMessageId,
      status: MESSAGE_STATUSES.SENT,
      sentAt: new Date(),
    }], options);

    // The preview is skipped while a mutual clear holds the lock; the clear
    // recomputes the preview from whatever survives before releasing it.
    await Conversation.updateOne(
      {
        _id: conversation._id,
        $and: [
          {
            $or: [
              { lastMessageAt: null },
              { lastMessageAt: { $lte: created.createdAt } },
            ],
          },
          lockInactive(),
        ],
      },
      {
        $set: {
          lastMessage: text,
          lastMessageAt: created.createdAt,
          lastMessageSenderId: sender,
        },
      },
      options,
    );

    return created;
  };

  let message;
  try {
    message = await runInTransactionIfSupported(writeMessage);
  } catch (error) {
    // The unique idempotency index is the final guard against two concurrent
    // retries creating duplicate rows.
    if (error && error.code === 11000 && clientMessageId) {
      const existing = await Message.findOne({ senderId: sender, clientMessageId }).lean();
      if (existing && String(existing.receiverId) === String(receiver) && existing.text === text) {
        return { message: serializeMessage(existing), duplicate: true };
      }
      if (existing) {
        throw createError('Message already submitted', 409);
      }
    }
    throw error;
  }

  return { message: serializeMessage(message), duplicate: false };
}

async function markMessagesDelivered(messageIds, receiverId) {
  const receiver = toObjectId(receiverId);
  const ids = [...new Set(
    (Array.isArray(messageIds) ? messageIds : [])
      .map(toObjectId)
      .filter(Boolean)
      .map(String),
  )].slice(0, MAX_DELIVERY_ACK_IDS);
  if (!receiver || !ids.length) return [];

  const candidates = await Message.find({
    _id: { $in: ids },
    receiverId: receiver,
  })
    .select('_id conversationId senderId status')
    .lean();
  if (!candidates.length) return [];

  // The recipient identity is taken from the authenticated socket, never from
  // the acknowledgement payload. Membership is checked against the persisted
  // conversation before any status can move.
  const conversationIds = [...new Set(candidates.map((row) => String(row.conversationId)))];
  const conversations = await Conversation.find({
    _id: { $in: conversationIds },
    participants: receiver,
  }).select('_id participants').lean();
  const allowedParticipants = new Map(conversations.map((row) => [
    String(row._id),
    new Set(row.participants.map((participant) => String(participant))),
  ]));

  const eligibleIds = candidates
    .filter((row) => {
      if (row.status !== MESSAGE_STATUSES.SENT) return false;
      const participants = allowedParticipants.get(String(row.conversationId));
      return Boolean(participants && participants.has(String(row.senderId)));
    })
    .map((row) => row._id);
  if (!eligibleIds.length) return [];

  const deliveredAt = new Date();
  const result = await Message.updateMany(
    {
      _id: { $in: eligibleIds },
      receiverId: receiver,
      status: MESSAGE_STATUSES.SENT,
    },
    {
      $set: {
        status: MESSAGE_STATUSES.DELIVERED,
        deliveredAt,
      },
    },
  );

  // A duplicate or concurrent acknowledgement is a no-op: only rows that this
  // exact update advanced are returned to the realtime layer. This also keeps
  // an older DELIVERED event from being emitted after a READ transition.
  if (!result.modifiedCount) return [];

  const updated = await Message.find({
    _id: { $in: eligibleIds },
    receiverId: receiver,
    status: MESSAGE_STATUSES.DELIVERED,
    deliveredAt,
  })
    .select('_id conversationId senderId deliveredAt')
    .lean();

  return updated.map((row) => ({
    messageId: String(row._id),
    conversationId: String(row.conversationId),
    senderId: String(row.senderId),
    deliveredAt: toIso(row.deliveredAt),
  }));
}

async function markConversationRead(userId, friendId) {
  const viewer = toObjectId(userId);
  if (!viewer) throw createError('Authentication required', 401);

  await assertCanChat(viewer, friendId);
  const conversation = await findConversation(viewer, friendId);
  if (!conversation) {
    return {
      conversationId: null,
      readAt: null,
      messageIds: [],
      senderId: String(friendId),
    };
  }

  // Only messages the reader can actually see are marked read; cleared rows
  // keep their state so the sender is not told they were read.
  const unread = await Message.find(visibleSince({
    conversationId: conversation._id,
    receiverId: viewer,
    readAt: null,
  }, getClearedAt(conversation, viewer))).select('_id').lean();

  if (!unread.length) {
    return {
      conversationId: String(conversation._id),
      readAt: null,
      messageIds: [],
      senderId: String(friendId),
    };
  }

  const readAt = new Date();
  const messageIds = unread.map((message) => message._id);

  // Opening the conversation proves the recipient received the message even
  // if the delivery acknowledgement raced with this request. Fill a missing
  // delivery timestamp first, then move to READ; neither update can overwrite
  // a newer state because both filters require an unread row.
  await Message.updateMany(
    {
      _id: { $in: messageIds },
      receiverId: viewer,
      readAt: null,
      deliveredAt: null,
    },
    { $set: { deliveredAt: readAt } },
  );

  const result = await Message.updateMany(
    { _id: { $in: messageIds }, receiverId: viewer, readAt: null },
    { $set: { status: MESSAGE_STATUSES.READ, readAt } },
  );
  if (!result.modifiedCount) {
    return {
      conversationId: String(conversation._id),
      readAt: null,
      messageIds: [],
      senderId: String(friendId),
    };
  }

  // Duplicate read calls are idempotent. Only messages stamped by this exact
  // call are acknowledged, so an older READ event cannot overwrite a newer
  // timestamp in the sender's open conversation.
  const updated = await Message.find({
    _id: { $in: messageIds },
    receiverId: viewer,
    readAt,
  }).select('_id').lean();

  return {
    conversationId: String(conversation._id),
    readAt: readAt.toISOString(),
    messageIds: updated.map((message) => String(message._id)),
    senderId: String(friendId),
  };
}

/* ---------------- Clear chat ---------------- */

let transactionsSupported = null;

/**
 * Transactions need a replica set (Atlas, or any `rs` deployment) or a
 * sharded cluster. The topology is read once from the server's `hello`
 * reply rather than inferred from a failed write.
 */
async function deploymentSupportsTransactions() {
  if (transactionsSupported === null) {
    const admin = mongoose.connection.db.admin();
    const hello = await admin.command({ hello: 1 })
      .catch(() => admin.command({ isMaster: 1 }));
    transactionsSupported = Boolean(hello.setName) || hello.msg === 'isdbgrid';
  }
  return transactionsSupported;
}

/**
 * Runs `work` inside a MongoDB transaction where the deployment supports one.
 * On a standalone server (local development, the test suite) the same work
 * runs without a session and relies on its own compensation.
 */
async function runInTransactionIfSupported(work) {
  if (!(await deploymentSupportsTransactions())) return work(null);

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

function clearRequestNotFound() {
  return createError('Clear Chat Request not found', 404);
}

/**
 * Loads a request the viewer participates in. An outsider gets the same 404
 * as a missing id, so request ids cannot be probed.
 */
async function findParticipantClearRequest(viewer, requestId) {
  const id = toObjectId(requestId);
  if (!id) throw clearRequestNotFound();
  const request = await ClearChatRequest.findById(id).lean();
  if (!request) throw clearRequestNotFound();
  const isParticipant = String(request.requesterId) === String(viewer)
    || String(request.recipientId) === String(viewer);
  if (!isParticipant) throw clearRequestNotFound();
  return request;
}

function assertPending(request) {
  if (request.status !== CLEAR_CHAT_REQUEST_STATUSES.PENDING) {
    throw createError(`This Clear Chat Request was already ${request.status}`, 409);
  }
}

async function getClearState(userId, friendId) {
  const viewer = toObjectId(userId);
  if (!viewer) throw createError('Authentication required', 401);

  await assertCanChat(viewer, friendId);
  const conversation = await findConversation(viewer, friendId);
  if (!conversation) return { request: null, outcome: null };

  const [pending, outcome] = await Promise.all([
    ClearChatRequest.findOne({
      conversationId: conversation._id,
      status: CLEAR_CHAT_REQUEST_STATUSES.PENDING,
    }).lean(),
    // The requester's latest answered request stays visible until they
    // dismiss it, so a decline made while they were offline is not lost.
    ClearChatRequest.findOne({
      conversationId: conversation._id,
      requesterId: viewer,
      status: {
        $in: [CLEAR_CHAT_REQUEST_STATUSES.ACCEPTED, CLEAR_CHAT_REQUEST_STATUSES.DECLINED],
      },
      requesterAcknowledgedAt: null,
    }).sort({ respondedAt: -1, _id: -1 }).lean(),
  ]);

  const rows = await serializeClearRequests([pending, outcome].filter(Boolean));
  const byId = new Map(rows.map((row) => [row.id, row]));
  return {
    request: pending ? byId.get(String(pending._id)) : null,
    outcome: outcome ? byId.get(String(outcome._id)) : null,
  };
}

async function clearForMe(userId, friendId) {
  const viewer = toObjectId(userId);
  if (!viewer) throw createError('Authentication required', 401);

  await assertCanChat(viewer, friendId);
  const conversation = await findConversation(viewer, friendId);
  const clearedAt = new Date();
  if (conversation) {
    // Only the viewer's own key is written. The friend's cutoff and every
    // message document are left exactly as they were.
    await Conversation.updateOne(
      { _id: conversation._id, participants: viewer },
      { $set: { [`clearedAt.${String(viewer)}`]: clearedAt } },
    );
  }

  return {
    scope: CLEAR_SCOPES.ME,
    conversationId: conversation ? String(conversation._id) : null,
    clearedAt: clearedAt.toISOString(),
  };
}

async function createClearRequest(userId, friendId) {
  const viewer = toObjectId(userId);
  if (!viewer) throw createError('Authentication required', 401);

  await assertCanChat(viewer, friendId);
  const conversation = await findConversation(viewer, friendId);
  if (!conversation) {
    throw createError('There are no messages to clear yet', 400);
  }
  // A conversation shell can outlive its messages, for example after a
  // both-sides clear or a fresh re-friend conversation. The UI disables the
  // action, but the API must refuse it independently.
  if (!(await Message.exists({ conversationId: conversation._id }))) {
    throw createError('There are no messages to clear yet', 400);
  }

  const duplicateError = async () => {
    const pending = await ClearChatRequest.findOne({
      conversationId: conversation._id,
      status: CLEAR_CHAT_REQUEST_STATUSES.PENDING,
    }).select('requesterId').lean();
    return createError(
      pending && String(pending.requesterId) !== String(viewer)
        ? 'Your friend already asked to clear this chat. Respond to their request instead.'
        : 'You already sent a Clear Chat Request for this chat',
      409,
    );
  };

  if (await ClearChatRequest.exists({
    conversationId: conversation._id,
    status: CLEAR_CHAT_REQUEST_STATUSES.PENDING,
  })) {
    throw await duplicateError();
  }

  let request;
  try {
    request = await ClearChatRequest.create({
      conversationId: conversation._id,
      requesterId: viewer,
      recipientId: toObjectId(friendId),
      status: CLEAR_CHAT_REQUEST_STATUSES.PENDING,
    });
  } catch (error) {
    // The partial unique index is the final guard against two concurrent
    // sends from either participant.
    if (error && error.code === 11000) throw await duplicateError();
    throw error;
  }

  // A fresh request supersedes any earlier answered one still on screen.
  await ClearChatRequest.updateMany(
    {
      conversationId: conversation._id,
      requesterId: viewer,
      _id: { $ne: request._id },
      requesterAcknowledgedAt: null,
    },
    { $set: { requesterAcknowledgedAt: new Date() } },
  );

  const [serialized] = await serializeClearRequests([request.toObject()]);
  return { request: serialized };
}

async function transitionClearRequest(request, filter, nextStatus) {
  const updated = await ClearChatRequest.findOneAndUpdate(
    { _id: request._id, status: CLEAR_CHAT_REQUEST_STATUSES.PENDING, ...filter },
    { $set: { status: nextStatus, respondedAt: new Date() } },
    { returnDocument: 'after' },
  ).lean();
  // A concurrent accept, decline or cancel won the race.
  if (!updated) throw createError('This Clear Chat Request is no longer pending', 409);
  const [serialized] = await serializeClearRequests([updated]);
  return serialized;
}

async function declineClearRequest(userId, requestId) {
  const viewer = toObjectId(userId);
  if (!viewer) throw createError('Authentication required', 401);

  const request = await findParticipantClearRequest(viewer, requestId);
  if (String(request.recipientId) !== String(viewer)) {
    throw createError('Only the other participant can respond to this request', 403);
  }
  assertPending(request);

  const updated = await transitionClearRequest(
    request,
    { recipientId: viewer },
    CLEAR_CHAT_REQUEST_STATUSES.DECLINED,
  );
  return { request: updated };
}

async function cancelClearRequest(userId, requestId) {
  const viewer = toObjectId(userId);
  if (!viewer) throw createError('Authentication required', 401);

  const request = await findParticipantClearRequest(viewer, requestId);
  if (String(request.requesterId) !== String(viewer)) {
    throw createError('Only the requester can cancel this request', 403);
  }
  assertPending(request);

  const updated = await transitionClearRequest(
    request,
    { requesterId: viewer },
    CLEAR_CHAT_REQUEST_STATUSES.CANCELLED,
  );
  return { request: updated };
}

async function acknowledgeClearRequest(userId, requestId) {
  const viewer = toObjectId(userId);
  if (!viewer) throw createError('Authentication required', 401);

  const request = await findParticipantClearRequest(viewer, requestId);
  if (String(request.requesterId) !== String(viewer)) {
    throw createError('Only the requester can dismiss this outcome', 403);
  }
  if (request.status === CLEAR_CHAT_REQUEST_STATUSES.PENDING) {
    throw createError('This Clear Chat Request is still pending', 409);
  }

  await ClearChatRequest.updateOne(
    { _id: request._id, requesterId: viewer, requesterAcknowledgedAt: null },
    { $set: { requesterAcknowledgedAt: new Date() } },
  );
  return { acknowledged: true };
}

async function refreshConversationPreview(conversationId) {
  const latest = await Message.findOne({ conversationId })
    .sort({ createdAt: -1, _id: -1 })
    .select('text createdAt senderId')
    .lean();
  await Conversation.updateOne(
    { _id: conversationId },
    {
      $set: {
        lastMessage: latest ? latest.text : '',
        lastMessageAt: latest ? latest.createdAt : null,
        lastMessageSenderId: latest ? latest.senderId : null,
      },
    },
  );
}

async function acceptClearRequest(userId, requestId) {
  const viewer = toObjectId(userId);
  if (!viewer) throw createError('Authentication required', 401);

  const request = await findParticipantClearRequest(viewer, requestId);
  if (String(request.recipientId) !== String(viewer)) {
    throw createError('Only the other participant can respond to this request', 403);
  }
  assertPending(request);

  // Revalidate the relationship and membership at the moment of deletion, not
  // only when the request was created.
  await assertCanChat(viewer, request.requesterId);
  const conversation = await Conversation.findOne({
    _id: request.conversationId,
    participants: { $all: [request.requesterId, request.recipientId] },
  }).select('_id').lean();
  if (!conversation) throw clearRequestNotFound();

  // Take the conversation lease first. New sends are refused while it is
  // held, so a message cannot be half-included in the deletion below.
  const now = new Date();
  const lockUntil = new Date(now.getTime() + CLEAR_LOCK_MS);
  const locked = await Conversation.findOneAndUpdate(
    {
      _id: conversation._id,
      $or: [{ clearLockUntil: null }, { clearLockUntil: { $lte: now } }],
    },
    { $set: { clearLockUntil: lockUntil } },
    { returnDocument: 'after' },
  ).select('_id').lean();
  if (!locked) {
    throw createError('This chat is already being cleared. Try again in a moment.', 409);
  }

  try {
    const result = await runInTransactionIfSupported(async (session) => {
      const options = session ? { session } : {};
      const accepted = await ClearChatRequest.findOneAndUpdate(
        {
          _id: request._id,
          recipientId: viewer,
          status: CLEAR_CHAT_REQUEST_STATUSES.PENDING,
        },
        {
          $set: {
            status: CLEAR_CHAT_REQUEST_STATUSES.ACCEPTED,
            respondedAt: new Date(),
          },
        },
        { ...options, returnDocument: 'after' },
      ).lean();
      if (!accepted) throw createError('This Clear Chat Request is no longer pending', 409);

      try {
        const deletion = await Message.deleteMany(
          { conversationId: conversation._id },
          options,
        );
        // Previews, unread counts (derived from messages) and both
        // participants' one-sided cutoffs all start fresh.
        await Conversation.updateOne(
          { _id: conversation._id },
          {
            $set: {
              lastMessage: '',
              lastMessageAt: null,
              lastMessageSenderId: null,
              clearedAt: {},
            },
          },
          options,
        );
        return { accepted, deletedCount: deletion.deletedCount || 0 };
      } catch (error) {
        // Without a transaction, put the request back so the recipient can
        // retry instead of being left with an "accepted" request and intact
        // messages.
        if (!session) {
          await ClearChatRequest.updateOne(
            { _id: request._id, status: CLEAR_CHAT_REQUEST_STATUSES.ACCEPTED },
            { $set: { status: CLEAR_CHAT_REQUEST_STATUSES.PENDING, respondedAt: null } },
          );
        }
        throw error;
      }
    });

    // A send that slipped in just before the lease was taken may have
    // survived the delete; the preview must describe what actually remains.
    await refreshConversationPreview(conversation._id);

    const [serialized] = await serializeClearRequests([result.accepted]);
    return {
      request: serialized,
      conversationId: String(conversation._id),
      deletedCount: result.deletedCount,
    };
  } finally {
    await Conversation.updateOne(
      { _id: conversation._id, clearLockUntil: lockUntil },
      { $set: { clearLockUntil: null } },
    );
  }
}

/**
 * Cancels any pending clear request between two accounts. Used when the
 * friendship ends: a request nobody can answer from the Friends list must not
 * leave a notification dot behind.
 */
async function cancelPendingClearRequestsBetween(firstId, secondId) {
  const conversation = await findConversation(firstId, secondId);
  if (!conversation) return [];
  const pending = await ClearChatRequest.find({
    conversationId: conversation._id,
    status: CLEAR_CHAT_REQUEST_STATUSES.PENDING,
  }).lean();
  if (!pending.length) return [];
  const respondedAt = new Date();
  await ClearChatRequest.updateMany(
    { _id: { $in: pending.map((row) => row._id) }, status: CLEAR_CHAT_REQUEST_STATUSES.PENDING },
    { $set: { status: CLEAR_CHAT_REQUEST_STATUSES.CANCELLED, respondedAt } },
  );
  return serializeClearRequests(pending.map((row) => ({
    ...row,
    status: CLEAR_CHAT_REQUEST_STATUSES.CANCELLED,
    respondedAt,
  })));
}

module.exports = {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_PENDING_MESSAGES,
  MAX_DELIVERY_ACK_IDS,
  MESSAGE_STATUSES,
  MAX_MESSAGE_LENGTH,
  serializeMessage,
  assertCanChat,
  listConversations,
  getUnreadSummary,
  listMessages,
  listPendingMessages,
  sendMessage,
  markMessagesDelivered,
  markConversationRead,
  CLEAR_SCOPES,
  CLEAR_LOCK_MS,
  getClearState,
  clearForMe,
  createClearRequest,
  acceptClearRequest,
  declineClearRequest,
  cancelClearRequest,
  acknowledgeClearRequest,
  cancelPendingClearRequestsBetween,
};
