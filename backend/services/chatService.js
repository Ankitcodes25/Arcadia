const mongoose = require('mongoose');
const { Conversation } = require('../models/Conversation');
const { Message, MESSAGE_STATUSES, MAX_MESSAGE_LENGTH } = require('../models/Message');
const friendshipService = require('./friendshipService');
const { getPairKey, getOrderedPair, toObjectId } = require('../utils/friendship');

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 50;
const MAX_PENDING_MESSAGES = 200;
const MAX_DELIVERY_ACK_IDS = 200;
const CLIENT_MESSAGE_ID_PATTERN = /^[A-Za-z0-9:_-]{8,100}$/;

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

async function getUnreadCountsByConversation(userId, conversationIds) {
  const viewer = toObjectId(userId);
  const ids = (Array.isArray(conversationIds) ? conversationIds : [])
    .map(toObjectId)
    .filter(Boolean);
  if (!viewer || !ids.length) return new Map();

  const rows = await Message.aggregate([
    {
      $match: {
        conversationId: { $in: ids },
        receiverId: viewer,
        readAt: null,
      },
    },
    { $group: { _id: '$conversationId', count: { $sum: 1 } } },
  ]);

  return new Map(rows.map((row) => [String(row._id), row.count]));
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

  const unreadByConversation = await getUnreadCountsByConversation(
    userId,
    visible.map(({ conversation }) => conversation._id),
  );

  const rows = visible.map(({ conversation, friend }) => ({
    id: String(conversation._id),
    friend,
    lastMessage: conversation.lastMessage || null,
    lastMessageAt: toIso(conversation.lastMessageAt),
    lastMessageFromMe: conversation.lastMessageSenderId
      ? String(conversation.lastMessageSenderId) === String(viewer)
      : false,
    unreadCount: unreadByConversation.get(String(conversation._id)) || 0,
  }));

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
  };
}

async function listMessages(userId, friendId, options = {}) {
  const viewer = toObjectId(userId);
  if (!viewer) throw createError('Authentication required', 401);

  await assertCanChat(viewer, friendId);
  const conversation = await findConversation(viewer, friendId);
  if (!conversation) {
    return {
      messages: [],
      hasMore: false,
      nextCursor: null,
    };
  }

  const limit = normalizeLimit(options.limit);
  const query = { conversationId: conversation._id };

  if (options.before !== undefined && options.before !== null && options.before !== '') {
    const beforeId = toObjectId(options.before);
    if (!beforeId) throw createError('Invalid message cursor', 400);

    const cursor = await Message.findOne({
      _id: beforeId,
      conversationId: conversation._id,
    }).select('_id createdAt').lean();
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
    messages: page.map(serializeMessage),
    hasMore,
    nextCursor: hasMore ? String(page[0]._id) : null,
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
  }).select('_id participants').lean();
  const allowedParticipants = new Map(conversations.map((row) => [
    String(row._id),
    new Set(row.participants.map((participant) => String(participant))),
  ]));

  return rows
    .filter((row) => {
      const participants = allowedParticipants.get(String(row.conversationId));
      return Boolean(participants && participants.has(String(row.senderId)));
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

  let message;
  try {
    message = await Message.create({
      conversationId: conversation._id,
      senderId: sender,
      receiverId: receiver,
      text,
      clientMessageId,
      status: MESSAGE_STATUSES.SENT,
      sentAt: new Date(),
    });
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

  await Conversation.updateOne(
    {
      _id: conversation._id,
      $or: [
        { lastMessageAt: null },
        { lastMessageAt: { $lte: message.createdAt } },
      ],
    },
    {
      $set: {
        lastMessage: text,
        lastMessageAt: message.createdAt,
        lastMessageSenderId: sender,
      },
    },
  );

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

  const unread = await Message.find({
    conversationId: conversation._id,
    receiverId: viewer,
    readAt: null,
  }).select('_id').lean();

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
};
