const { Server } = require('socket.io');
const corsOptions = require('../config/cors');
const { isAllowedOrigin } = require('../config/cors');
const { User, USER_ROLES, ACCOUNT_STATUSES } = require('../models/User');
const { verifyAccessToken, ACCESS_TOKEN_TYPE } = require('../utils/jwt');
const chatService = require('../services/chatService');

const TYPING_BUDGET_WINDOW_MS = 10 * 1000;
const TYPING_BUDGET_MAX = 24;
const DELIVERY_BUDGET_WINDOW_MS = 10 * 1000;
const DELIVERY_BUDGET_MAX = 300;
const MAX_DELIVERY_ACK_IDS = 200;
const PENDING_BATCH_SIZE = 200;
const SESSION_RECHECK_MS = 15 * 1000;

let io = null;
let sessionRecheckTimer = null;

function userRoom(userId) {
  return `user:${String(userId)}`;
}

function emitToUser(userId, event, payload) {
  if (!io || !userId) return;
  io.to(userRoom(userId)).emit(event, payload);
}

function getSocketToken(socket) {
  const authToken = socket.handshake.auth && socket.handshake.auth.token;
  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken.trim();
  }

  const authorization = socket.handshake.headers && socket.handshake.headers.authorization;
  if (typeof authorization === 'string') {
    const parts = authorization.trim().split(/\s+/);
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      return parts[1];
    }
  }

  return null;
}

async function authenticateSocket(socket, next) {
  try {
    const token = getSocketToken(socket);
    if (!token) return next(new Error('Authentication required'));

    const payload = verifyAccessToken(token);
    if (payload.type !== ACCESS_TOKEN_TYPE) {
      return next(new Error('Invalid authentication token'));
    }

    const user = await User.findById(payload.sub)
      .select('_id role status tokenVersion')
      .lean();

    if (
      !user
      || user.role !== USER_ROLES.USER
      || user.status !== ACCOUNT_STATUSES.ACTIVE
      || !Number.isSafeInteger(user.tokenVersion)
      || user.tokenVersion !== payload.tokenVersion
    ) {
      return next(new Error('Invalid authentication token'));
    }

    socket.data.userId = String(user._id);
    // Kept so a live connection can be re-checked: the handshake is not a
    // licence to stay connected after the session behind it ends.
    socket.data.tokenVersion = user.tokenVersion;
    socket.data.tokenExpiresAt = payload.exp * 1000;
    return next();
  } catch {
    return next(new Error('Invalid authentication token'));
  }
}

function consumeBudget(socket, bucket, windowMs, max) {
  const now = Date.now();
  const startedAtKey = `${bucket}WindowStartedAt`;
  const countKey = `${bucket}Count`;
  if (!socket.data[startedAtKey] || now - socket.data[startedAtKey] > windowMs) {
    socket.data[startedAtKey] = now;
    socket.data[countKey] = 0;
  }

  socket.data[countKey] = (socket.data[countKey] || 0) + 1;
  return socket.data[countKey] <= max;
}

function consumeTypingBudget(socket) {
  return consumeBudget(socket, 'typing', TYPING_BUDGET_WINDOW_MS, TYPING_BUDGET_MAX);
}

function consumeDeliveryBudget(socket) {
  return consumeBudget(socket, 'delivery', DELIVERY_BUDGET_WINDOW_MS, DELIVERY_BUDGET_MAX);
}

async function sendPendingMessages(socket) {
  if (!io || !socket.connected || !socket.data.userId || socket.data.pendingDeliveryInFlight) {
    return;
  }

  socket.data.pendingDeliveryInFlight = true;
  try {
    const messages = await chatService.listPendingMessages(
      socket.data.userId,
      PENDING_BATCH_SIZE,
    );
    for (const message of messages) {
      if (!socket.connected) break;
      socket.emit('chat:message', { message });
    }
  } catch {
    // Pending delivery is best-effort. The persisted message remains SENT and
    // a later reconnect or history read can retry the acknowledgement path.
  } finally {
    socket.data.pendingDeliveryInFlight = false;
  }
}

function emitDeliveryReceipt(updatedMessages, receiverId) {
  if (!updatedMessages || !updatedMessages.length) return;

  const bySender = new Map();
  for (const row of updatedMessages) {
    const senderId = String(row.senderId);
    const entry = bySender.get(senderId) || {
      messageIds: [],
      deliveredAt: row.deliveredAt,
    };
    entry.messageIds.push(String(row.messageId));
    if (!entry.deliveredAt) entry.deliveredAt = row.deliveredAt;
    bySender.set(senderId, entry);
  }

  for (const [senderId, entry] of bySender) {
    emitToUser(senderId, 'chat:message-status', {
      conversationWith: String(receiverId),
      messageIds: entry.messageIds,
      status: 'DELIVERED',
      deliveredAt: entry.deliveredAt,
    });
  }
}

function registerConnection(socket) {
  const userId = socket.data.userId;
  socket.join(userRoom(userId));

  // A newly authenticated device receives any messages that were persisted
  // while it was offline. The device must acknowledge them; connecting alone
  // never advances a message to DELIVERED.
  void sendPendingMessages(socket);

  socket.on('chat:typing', async (payload) => {
    if (!consumeTypingBudget(socket)) return;

    const friendId = payload && typeof payload.friendId === 'string'
      ? payload.friendId
      : null;
    const typing = Boolean(payload && payload.typing);
    if (!friendId) return;

    try {
      // Every socket conversation event is authorized server-side; the client
      // cannot claim a relationship or a sender identity.
      await chatService.assertCanChat(userId, friendId);
      emitToUser(friendId, 'chat:typing', {
        friendId: userId,
        typing,
      });
    } catch {
      socket.emit('chat:error', {
        event: 'chat:typing',
        error: 'Typing status is unavailable for this player',
      });
    }
  });

  socket.on('chat:delivered', async (payload) => {
    if (!consumeDeliveryBudget(socket)) return;

    const rawIds = payload && Array.isArray(payload.messageIds)
      ? payload.messageIds
      : null;
    if (!rawIds || rawIds.length < 1 || rawIds.length > MAX_DELIVERY_ACK_IDS) {
      socket.emit('chat:error', {
        event: 'chat:delivered',
        error: 'Invalid delivery acknowledgement',
      });
      return;
    }

    const messageIds = [...new Set(
      rawIds.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim()),
    )].slice(0, MAX_DELIVERY_ACK_IDS);
    if (!messageIds.length) {
      socket.emit('chat:error', {
        event: 'chat:delivered',
        error: 'Invalid delivery acknowledgement',
      });
      return;
    }

    try {
      // The service takes the recipient identity from the authenticated socket
      // and scopes every update to messages addressed to that user. A sender or
      // outsider can never acknowledge somebody else's message.
      const updated = await chatService.markMessagesDelivered(messageIds, userId);
      emitDeliveryReceipt(updated, userId);

      // The acknowledgement may have completed one pending batch. Send the
      // next batch so a long offline queue drains without a page refresh.
      void sendPendingMessages(socket);
    } catch {
      socket.emit('chat:error', {
        event: 'chat:delivered',
        error: 'Delivery acknowledgement could not be saved',
      });
    }
  });
}

async function deliverMessage(message) {
  if (!io || !message || !message.id) return;

  const senderId = String(message.senderId);
  const receiverId = String(message.receiverId);

  // The receiver's other tabs and the sender's other tabs both stay in sync.
  // No delivery state is written here: the recipient device must acknowledge
  // receipt, and its acknowledgement is the only path to DELIVERED.
  emitToUser(receiverId, 'chat:message', { message });
  emitToUser(senderId, 'chat:message', { message });

  emitToUser(receiverId, 'chat:changed', { reason: 'message' });
  emitToUser(senderId, 'chat:changed', { reason: 'message' });
}

function emitReadReceipt(receipt) {
  if (!receipt || !receipt.messageIds || !receipt.messageIds.length) return;

  const payload = {
    conversationWith: String(receipt.readerId),
    messageIds: receipt.messageIds,
    status: 'READ',
    readAt: receipt.readAt,
  };

  emitToUser(receipt.senderId, 'chat:read', payload);
  emitToUser(receipt.senderId, 'chat:message-status', payload);
  emitToUser(receipt.senderId, 'chat:changed', { reason: 'read' });
  emitToUser(receipt.readerId, 'chat:changed', { reason: 'read' });
}

/**
 * A clear-chat request changed state (created, accepted, declined or
 * cancelled). Both participants' sessions receive the persisted row; the
 * `chat:changed` nudge makes Friends-list and navbar dots re-read the
 * database instead of trusting the event.
 */
function emitClearRequestUpdate(request) {
  if (!request || !request.id) return;
  for (const userId of [request.requesterId, request.recipientId]) {
    emitToUser(userId, 'chat:clear-request', { request });
    emitToUser(userId, 'chat:changed', { reason: 'clear-request' });
  }
}

/**
 * History was cleared. `me` reaches only the clearing user's other tabs;
 * `both` reaches both participants, each told which friend the cleared
 * conversation is with.
 */
function emitChatCleared({ scope, userId, friendId, clearedAt = null }) {
  if (!userId || !friendId) return;
  emitToUser(userId, 'chat:cleared', { scope, conversationWith: String(friendId), clearedAt });
  emitToUser(userId, 'chat:changed', { reason: 'cleared' });
  if (scope === 'both') {
    emitToUser(friendId, 'chat:cleared', { scope, conversationWith: String(userId), clearedAt });
    emitToUser(friendId, 'chat:changed', { reason: 'cleared' });
  }
}

/**
 * A relationship changed (friendship ended, block created or block removed).
 * Each side learns which player the change concerns so an open chat, profile or
 * Friends/Blocked list can update at once.
 */
function emitFriendshipChanged({ reason, userId, otherUserId }) {
  if (!userId || !otherUserId) return;
  emitToUser(userId, 'friends:changed', { reason, userId: String(otherUserId) });
  emitToUser(otherUserId, 'friends:changed', { reason, userId: String(userId) });
  emitToUser(userId, 'chat:changed', { reason: 'friendship' });
  emitToUser(otherUserId, 'chat:changed', { reason: 'friendship' });
}

/**
 * Re-checks every live connection against the database and its own token.
 *
 * A socket is only authenticated at handshake, so without this a tab that was
 * connected before a password change, logout-all, suspension, role change or
 * deletion (all of which bump tokenVersion or status) would keep receiving
 * private chat events, and a connection would outlive its 15-minute token.
 * One batched query covers every connected account. The client reconnects
 * with its current token, so a still-valid session recovers on its own and a
 * revoked one is refused at the handshake.
 */
async function revalidateConnectedSockets(now = Date.now()) {
  if (!io) return 0;
  const sockets = [...io.of('/').sockets.values()];
  if (!sockets.length) return 0;

  const userIds = [...new Set(sockets.map((socket) => socket.data.userId).filter(Boolean))];
  const users = await User.find({ _id: { $in: userIds } })
    .select('_id role status tokenVersion')
    .lean();
  const usersById = new Map(users.map((user) => [String(user._id), user]));

  let disconnected = 0;
  for (const socket of sockets) {
    const user = usersById.get(socket.data.userId);
    const valid = Boolean(user)
      && user.role === USER_ROLES.USER
      && user.status === ACCOUNT_STATUSES.ACTIVE
      && user.tokenVersion === socket.data.tokenVersion
      && Number.isFinite(socket.data.tokenExpiresAt)
      && socket.data.tokenExpiresAt > now;
    if (!valid) {
      socket.disconnect(true);
      disconnected += 1;
    }
  }
  return disconnected;
}

function attachChatSocket(httpServer) {
  closeChatSocket();

  io = new Server(httpServer, {
    serveClient: false,
    maxHttpBufferSize: 32 * 1024,
    cors: corsOptions,
    allowRequest(request, callback) {
      const origin = request.headers && request.headers.origin;
      if (origin && !isAllowedOrigin(origin)) {
        callback('Origin not allowed', false);
        return;
      }
      callback(null, true);
    },
  });

  io.use(authenticateSocket);
  io.on('connection', registerConnection);

  sessionRecheckTimer = setInterval(() => {
    revalidateConnectedSockets().catch(() => {
      // A transient database error skips one sweep; the next one retries.
    });
  }, SESSION_RECHECK_MS);
  sessionRecheckTimer.unref();
  return io;
}

function closeChatSocket() {
  if (sessionRecheckTimer) {
    clearInterval(sessionRecheckTimer);
    sessionRecheckTimer = null;
  }
  const current = io;
  io = null;
  if (!current) return;
  try {
    current.disconnectSockets(true);
  } catch {
    // Already closed.
  }
  current.close();
}

module.exports = {
  SESSION_RECHECK_MS,
  attachChatSocket,
  closeChatSocket,
  revalidateConnectedSockets,
  deliverMessage,
  emitReadReceipt,
  emitClearRequestUpdate,
  emitChatCleared,
  emitFriendshipChanged,
};
