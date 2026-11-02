const { after, before, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { once } = require('node:events');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { io: createSocket } = require('socket.io-client');

let mongoServer;
let mongoose;
let User;
let USER_ROLES;
let ACCOUNT_STATUSES;
let PROFILE_VISIBILITY;
let Session;
let FriendRequest;
let Friendship;
let Block;
let RateLimitBucket;
let Conversation;
let Message;
let ClearChatRequest;
let createApp;
let connectDatabase;
let disconnectDatabase;
let signAccessToken;
let normalizeUsername;
let attachChatSocket;
let closeChatSocket;
let revalidateConnectedSockets;
let server;
let baseUrl;
let sockets;

before(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = mongoServer.getUri('arcadia_chat_test');
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  process.env.FRONTEND_URL = 'http://localhost:5173';
  process.env.CORS_ORIGIN = 'http://localhost:5173';
  process.env.EMAIL_PROVIDER = 'smtp';
  process.env.EMAIL_FROM = 'test@example.com';
  process.env.SMTP_HOST = 'smtp.test.local';
  process.env.SMTP_PORT = '587';
  process.env.SMTP_USER = 'test-user';
  process.env.SMTP_PASSWORD = 'test-password';

  mongoose = require('mongoose');
  ({ User, USER_ROLES, ACCOUNT_STATUSES } = require('../models/User'));
  ({ PROFILE_VISIBILITY } = require('../utils/preferences'));
  ({ Session } = require('../models/Session'));
  ({ FriendRequest } = require('../models/FriendRequest'));
  ({ Friendship } = require('../models/Friendship'));
  ({ Block } = require('../models/Block'));
  ({ RateLimitBucket } = require('../models/RateLimitBucket'));
  ({ Conversation } = require('../models/Conversation'));
  ({ Message } = require('../models/Message'));
  ({ ClearChatRequest } = require('../models/ClearChatRequest'));
  ({ signAccessToken } = require('../utils/jwt'));
  ({ normalizeUsername } = require('../utils/username'));
  ({ connectDatabase, disconnectDatabase } = require('../config/database'));
  ({
    attachChatSocket,
    closeChatSocket,
    revalidateConnectedSockets,
  } = require('../realtime/chatSocket'));
  createApp = require('../app');

  await connectDatabase();
  await Promise.all([
    User.syncIndexes(),
    Session.syncIndexes(),
    FriendRequest.syncIndexes(),
    Friendship.syncIndexes(),
    Block.syncIndexes(),
    RateLimitBucket.syncIndexes(),
    Conversation.syncIndexes(),
    Message.syncIndexes(),
    ClearChatRequest.syncIndexes(),
  ]);

  server = createApp().listen(0);
  attachChatSocket(server);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  for (const socket of sockets || []) {
    socket.removeAllListeners();
    socket.disconnect();
  }
  if (closeChatSocket) closeChatSocket();
  if (server && server.listening) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  if (disconnectDatabase) await disconnectDatabase();
  if (mongoServer) await mongoServer.stop();
});

beforeEach(async () => {
  sockets = [];
  await Promise.all([
    RateLimitBucket.deleteMany({}),
    Session.deleteMany({}),
    FriendRequest.deleteMany({}),
    Friendship.deleteMany({}),
    Block.deleteMany({}),
    Conversation.deleteMany({}),
    Message.deleteMany({}),
    ClearChatRequest.deleteMany({}),
    User.deleteMany({}),
  ]);
});

async function createPlayer(username, options = {}) {
  const {
    role = USER_ROLES.USER,
    status = ACCOUNT_STATUSES.ACTIVE,
    profileVisibility = PROFILE_VISIBILITY.PUBLIC,
    email = `${username.toLowerCase().replace(/[^a-z0-9]/g, '') || 'player'}@example.com`,
  } = options;

  return User.create({
    email,
    name: username,
    username,
    usernameNormalized: normalizeUsername(username),
    role,
    status,
    preferences: { profileVisibility },
    totalXp: 0,
  });
}

function tokenFor(user) {
  return signAccessToken(user);
}

async function requestJson(path, options = {}) {
  const {
    token,
    method = 'GET',
    body,
  } = options;
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) {
    headers['x-arcadia-request'] = '1';
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsedBody = null;
  if (text) {
    try {
      parsedBody = JSON.parse(text);
    } catch {
      parsedBody = text;
    }
  }
  return { status: response.status, body: parsedBody, headers: response.headers };
}

async function makeFriends(first, second) {
  const sent = await requestJson('/api/v1/friends/requests', {
    token: tokenFor(first),
    method: 'POST',
    body: { userId: String(second._id) },
  });
  assert.equal(sent.status, 201);
  const accepted = await requestJson(
    `/api/v1/friends/requests/${sent.body.relationship.requestId}/accept`,
    { token: tokenFor(second), method: 'POST' },
  );
  assert.equal(accepted.status, 200);
}

async function sendMessage(sender, receiver, text, clientMessageId = crypto.randomUUID()) {
  return requestJson(`/api/v1/chat/conversations/${receiver._id}/messages`, {
    token: tokenFor(sender),
    method: 'POST',
    body: { text, clientMessageId },
  });
}

function connectSocketFor(user, beforeConnect = null) {
  return new Promise((resolve, reject) => {
    const socket = createSocket(baseUrl, {
      transports: ['websocket'],
      auth: { token: tokenFor(user) },
      forceNew: true,
      reconnection: false,
      autoConnect: false,
    });
    sockets.push(socket);
    if (beforeConnect) beforeConnect(socket);
    const timer = setTimeout(() => reject(new Error('Socket connect timed out')), 3000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.connect();
  });
}

function waitForEvent(socket, event, predicate = () => true, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeout);
    const handler = (payload) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertNoPrivateFields(player) {
  for (const field of ['email', 'passwordHash', 'role', 'status', 'preferences', 'google', 'usernameNormalized']) {
    assert.equal(Object.prototype.hasOwnProperty.call(player, field), false, `${field} must not leak`);
  }
}

test('messages persist, are idempotent, and enforce friendship, blocks and membership', async () => {
  const rook = await createPlayer('ArcadeDevRook');
  const knight = await createPlayer('ArcadeDevKnight');
  const oracle = await createPlayer('ArcadeDevOracle');
  await makeFriends(rook, knight);

  const notFriend = await sendMessage(rook, oracle, 'Hello?');
  assert.equal(notFriend.status, 403);

  const unauthenticated = await requestJson(
    `/api/v1/chat/conversations/${knight._id}/messages`,
    {
      method: 'POST',
      body: { text: 'No token', clientMessageId: crypto.randomUUID() },
    },
  );
  assert.equal(unauthenticated.status, 401);

  const emptyMessage = await sendMessage(rook, knight, '   ');
  assert.equal(emptyMessage.status, 400);

  const tooLong = await sendMessage(rook, knight, 'x'.repeat(2001));
  assert.equal(tooLong.status, 400);
  assert.equal(await Message.countDocuments({}), 0);

  const clientMessageId = crypto.randomUUID();
  const sent = await sendMessage(rook, knight, 'Hello Knight', clientMessageId);
  assert.equal(sent.status, 201);
  assert.equal(sent.body.message.text, 'Hello Knight');
  assert.equal(sent.body.message.status, 'SENT');
  assert.equal(sent.body.message.senderId, String(rook._id));
  assert.equal(sent.body.message.receiverId, String(knight._id));
  assert.ok(Date.parse(sent.body.message.sentAt));
  assert.equal(sent.body.message.deliveredAt, null);
  assert.equal(sent.body.message.readAt, null);
  assert.equal(Object.prototype.hasOwnProperty.call(sent.body.message, 'clientMessageId'), false);

  const duplicate = await sendMessage(rook, knight, 'Hello Knight', clientMessageId);
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.message.id, sent.body.message.id);
  assert.equal(await Message.countDocuments({}), 1);
  assert.equal(await Conversation.countDocuments({}), 1);

  const knightConversations = await requestJson('/api/v1/chat/conversations', {
    token: tokenFor(knight),
  });
  assert.equal(knightConversations.status, 200);
  assert.equal(knightConversations.body.conversations.length, 1);
  const conversation = knightConversations.body.conversations[0];
  assert.equal(conversation.friend.username, 'ArcadeDevRook');
  assert.equal(conversation.unreadCount, 1);
  assert.equal(conversation.lastMessage, 'Hello Knight');
  assert.equal(conversation.lastMessageFromMe, false);
  assertNoPrivateFields(conversation.friend);

  const knightSummary = await requestJson('/api/v1/friends/summary', {
    token: tokenFor(knight),
  });
  assert.equal(knightSummary.status, 200);
  assert.equal(knightSummary.body.unreadMessageCount, 1);

  const history = await requestJson(`/api/v1/chat/conversations/${rook._id}/messages`, {
    token: tokenFor(knight),
  });
  assert.equal(history.status, 200);
  assert.equal(history.body.messages.length, 1);
  assert.equal(history.body.messages[0].status, 'SENT');
  assert.equal(history.body.messages[0].deliveredAt, null);

  const read = await requestJson(`/api/v1/chat/conversations/${rook._id}/read`, {
    token: tokenFor(knight),
    method: 'POST',
  });
  assert.equal(read.status, 200);
  assert.equal(read.body.messageIds.length, 1);

  const stored = await Message.findOne({});
  assert.equal(stored.status, 'READ');
  assert.ok(stored.sentAt instanceof Date);
  assert.ok(stored.deliveredAt instanceof Date);
  assert.ok(stored.readAt instanceof Date);

  const rookSummary = await requestJson('/api/v1/friends/summary', {
    token: tokenFor(rook),
  });
  assert.equal(rookSummary.body.unreadMessageCount, 0);

  const knightSummaryAfterRead = await requestJson('/api/v1/friends/summary', {
    token: tokenFor(knight),
  });
  assert.equal(knightSummaryAfterRead.body.unreadMessageCount, 0);

  const outsiderHistory = await requestJson(`/api/v1/chat/conversations/${rook._id}/messages`, {
    token: tokenFor(oracle),
  });
  assert.equal(outsiderHistory.status, 403);

  const blocked = await requestJson('/api/v1/friends/blocks', {
    token: tokenFor(knight),
    method: 'POST',
    body: { userId: String(rook._id) },
  });
  assert.equal(blocked.status, 200);

  const afterBlock = await sendMessage(rook, knight, 'Can you see this?');
  assert.equal(afterBlock.status, 403);
});

test('socket delivery, read receipts, typing and offline history work end to end', async () => {
  const rook = await createPlayer('ArcadeDevRook');
  const knight = await createPlayer('ArcadeDevKnight');
  const oracle = await createPlayer('ArcadeDevOracle');
  await makeFriends(rook, knight);

  const rookSocket = await connectSocketFor(rook);
  const knightSocket = await connectSocketFor(knight);
  const oracleSocket = await connectSocketFor(oracle);

  const rejectedSocket = createSocket(baseUrl, {
    transports: ['websocket'],
    auth: { token: 'not-a-real-token' },
    forceNew: true,
    reconnection: false,
  });
  sockets.push(rejectedSocket);
  const rejected = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Rejected socket timed out')), 3000);
    rejectedSocket.once('connect', () => {
      clearTimeout(timer);
      reject(new Error('An unauthenticated socket connected'));
    });
    rejectedSocket.once('connect_error', (error) => {
      clearTimeout(timer);
      resolve(error);
    });
  });
  assert.match(rejected.message, /Invalid authentication token/);

  const typing = waitForEvent(knightSocket, 'chat:typing', (payload) => (
    payload.friendId === String(rook._id) && payload.typing === true
  ));
  rookSocket.emit('chat:typing', { friendId: String(knight._id), typing: true });
  assert.equal((await typing).typing, true);

  const stoppedTyping = waitForEvent(knightSocket, 'chat:typing', (payload) => (
    payload.friendId === String(rook._id) && payload.typing === false
  ));
  rookSocket.emit('chat:typing', { friendId: String(knight._id), typing: false });
  assert.equal((await stoppedTyping).typing, false);

  const forbiddenTyping = waitForEvent(oracleSocket, 'chat:error');
  oracleSocket.emit('chat:typing', { friendId: String(rook._id), typing: true });
  assert.equal((await forbiddenTyping).event, 'chat:typing');

  const liveMessage = waitForEvent(knightSocket, 'chat:message', (payload) => (
    payload.message.text === 'Live hello'
  ));
  const liveClientId = crypto.randomUUID();
  const sent = await sendMessage(rook, knight, 'Live hello', liveClientId);
  assert.equal(sent.status, 201);
  const received = await liveMessage;
  assert.equal(received.message.id, sent.body.message.id);

  // The recipient socket is connected, but presence alone must not advance
  // the persisted state. Only the device acknowledgement can do that.
  const connectedButUnacknowledged = await Message.findById(sent.body.message.id).lean();
  assert.equal(connectedButUnacknowledged.status, 'SENT');
  assert.equal(connectedButUnacknowledged.deliveredAt, null);

  const deliveredStatus = waitForEvent(rookSocket, 'chat:message-status', (payload) => (
    payload.status === 'DELIVERED'
    && payload.messageIds.includes(sent.body.message.id)
  ));
  knightSocket.emit('chat:delivered', { messageIds: [sent.body.message.id] });
  const delivered = await deliveredStatus;
  assert.ok(Date.parse(delivered.deliveredAt));

  const deliveredStored = await Message.findById(sent.body.message.id).lean();
  assert.equal(deliveredStored.status, 'DELIVERED');
  assert.ok(deliveredStored.deliveredAt instanceof Date);
  assert.equal(deliveredStored.readAt, null);

  // Duplicate acknowledgements are idempotent and cannot rewrite timestamps.
  const deliveredAt = deliveredStored.deliveredAt.toISOString();
  knightSocket.emit('chat:delivered', { messageIds: [sent.body.message.id] });
  await new Promise((resolve) => setTimeout(resolve, 80));
  const afterDuplicateAck = await Message.findById(sent.body.message.id).lean();
  assert.equal(afterDuplicateAck.status, 'DELIVERED');
  assert.equal(afterDuplicateAck.deliveredAt.toISOString(), deliveredAt);

  const knightDisconnected = once(knightSocket, 'disconnect');
  knightSocket.disconnect();
  await knightDisconnected;
  await new Promise((resolve) => setTimeout(resolve, 80));

  const offline = await sendMessage(rook, knight, 'While you were away');
  assert.equal(offline.status, 201);
  assert.equal((await Message.findById(offline.body.message.id).lean()).status, 'SENT');

  let pendingMessage;
  const knightReconnected = await connectSocketFor(knight, (socket) => {
    pendingMessage = waitForEvent(socket, 'chat:message', (payload) => (
      payload.message.id === offline.body.message.id
    ));
  });
  const pending = await pendingMessage;
  assert.equal(pending.message.status, 'SENT');
  assert.equal((await Message.findById(offline.body.message.id).lean()).status, 'SENT');

  const offlineDeliveredStatus = waitForEvent(rookSocket, 'chat:message-status', (payload) => (
    payload.status === 'DELIVERED'
    && payload.messageIds.includes(offline.body.message.id)
  ));
  knightReconnected.emit('chat:delivered', { messageIds: [offline.body.message.id] });
  await offlineDeliveredStatus;

  const offlineHistory = await requestJson(`/api/v1/chat/conversations/${rook._id}/messages`, {
    token: tokenFor(knight),
  });
  assert.equal(offlineHistory.status, 200);
  assert.equal(offlineHistory.body.messages.length, 2);
  assert.equal(offlineHistory.body.messages.at(-1).text, 'While you were away');
  assert.equal(offlineHistory.body.messages.at(-1).status, 'DELIVERED');

  const readEvent = waitForEvent(rookSocket, 'chat:read', (payload) => (
    payload.conversationWith === String(knight._id)
    && payload.status === 'READ'
    && payload.messageIds.length === 2
  ));
  const read = await requestJson(`/api/v1/chat/conversations/${rook._id}/read`, {
    token: tokenFor(knight),
    method: 'POST',
  });
  assert.equal(read.status, 200);
  assert.equal(read.body.messageIds.length, 2);
  const readPayload = await readEvent;
  assert.ok(Date.parse(readPayload.readAt));

  const readStored = await Message.find({ status: 'READ' }).lean();
  assert.equal(readStored.length, 2);
  assert.ok(readStored.every((message) => message.readAt instanceof Date));
  assert.ok(readStored.every((message) => message.deliveredAt instanceof Date));
  const readAt = readStored[0].readAt.toISOString();

  // A second read call is a no-op and must not emit or rewrite receipts.
  const duplicateRead = await requestJson(`/api/v1/chat/conversations/${rook._id}/read`, {
    token: tokenFor(knight),
    method: 'POST',
  });
  assert.equal(duplicateRead.status, 200);
  assert.equal(duplicateRead.body.messageIds.length, 0);
  const afterDuplicateRead = await Message.find({ status: 'READ' }).lean();
  assert.ok(afterDuplicateRead.every((message) => message.readAt.toISOString() === readAt));

  const reconnectDuplicate = await sendMessage(rook, knight, 'Live hello', liveClientId);
  assert.equal(reconnectDuplicate.status, 200);
  assert.equal(reconnectDuplicate.body.message.id, sent.body.message.id);
  assert.equal(await Message.countDocuments({ text: 'Live hello' }), 1);

  assert.ok(knightReconnected.connected);
});

test('delivery acknowledgements are recipient-only, per message and monotonic', async () => {
  const rook = await createPlayer('ArcadeDevRook');
  const knight = await createPlayer('ArcadeDevKnight');
  const oracle = await createPlayer('ArcadeDevOracle');
  await makeFriends(rook, knight);
  await makeFriends(rook, oracle);

  const rookSocket = await connectSocketFor(rook);
  const knightSocket = await connectSocketFor(knight);
  const oracleSocket = await connectSocketFor(oracle);

  const first = await sendMessage(rook, knight, 'First independent message');
  const second = await sendMessage(rook, knight, 'Second independent message');
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);

  // Oracle is a friend of the sender but not the persisted recipient. A
  // guessed message id must never acknowledge somebody else's message.
  oracleSocket.emit('chat:delivered', {
    messageIds: [first.body.message.id, second.body.message.id],
  });
  await delay(100);
  assert.equal((await Message.findById(first.body.message.id).lean()).status, 'SENT');
  assert.equal((await Message.findById(second.body.message.id).lean()).status, 'SENT');

  // The sender cannot acknowledge its own outgoing message either.
  rookSocket.emit('chat:delivered', { messageIds: [first.body.message.id] });
  await delay(100);
  assert.equal((await Message.findById(first.body.message.id).lean()).status, 'SENT');

  const firstDelivered = waitForEvent(rookSocket, 'chat:message-status', (payload) => (
    payload.status === 'DELIVERED'
    && payload.messageIds.length === 1
    && payload.messageIds[0] === first.body.message.id
  ));
  knightSocket.emit('chat:delivered', { messageIds: [first.body.message.id] });
  await firstDelivered;

  const firstStored = await Message.findById(first.body.message.id).lean();
  const secondStored = await Message.findById(second.body.message.id).lean();
  assert.equal(firstStored.status, 'DELIVERED');
  assert.equal(secondStored.status, 'SENT', 'each message has an independent status');

  const firstDeliveredAt = firstStored.deliveredAt.toISOString();
  knightSocket.emit('chat:delivered', { messageIds: [first.body.message.id] });
  await delay(80);
  const firstAfterDuplicate = await Message.findById(first.body.message.id).lean();
  assert.equal(firstAfterDuplicate.deliveredAt.toISOString(), firstDeliveredAt);

  const secondDelivered = waitForEvent(rookSocket, 'chat:message-status', (payload) => (
    payload.status === 'DELIVERED'
    && payload.messageIds.includes(second.body.message.id)
  ));
  knightSocket.emit('chat:delivered', { messageIds: [second.body.message.id] });
  await secondDelivered;
  assert.equal((await Message.findById(second.body.message.id).lean()).status, 'DELIVERED');

  const readEvent = waitForEvent(rookSocket, 'chat:read', (payload) => (
    payload.conversationWith === String(knight._id)
    && payload.status === 'READ'
    && payload.messageIds.length === 2
  ));
  const read = await requestJson(`/api/v1/chat/conversations/${rook._id}/read`, {
    token: tokenFor(knight),
    method: 'POST',
  });
  assert.equal(read.status, 200);
  assert.equal(read.body.messageIds.length, 2);
  await readEvent;

  const readStored = await Message.find({}).lean();
  assert.ok(readStored.every((message) => (
    message.status === 'READ'
    && message.deliveredAt instanceof Date
    && message.readAt instanceof Date
  )));

  // A late delivery acknowledgement cannot move a READ message backwards.
  knightSocket.emit('chat:delivered', {
    messageIds: [first.body.message.id, second.body.message.id],
  });
  await delay(100);
  const afterLateAck = await Message.find({}).lean();
  assert.ok(afterLateAck.every((message) => message.status === 'READ'));
});

test('history pagination is chronological and unread counts are independent per conversation', async () => {
  const rook = await createPlayer('ArcadeDevRook');
  const knight = await createPlayer('ArcadeDevKnight');
  const oracle = await createPlayer('ArcadeDevOracle');
  await makeFriends(rook, knight);
  await makeFriends(rook, oracle);

  for (let index = 1; index <= 35; index += 1) {
    const sent = await sendMessage(rook, knight, `Message ${index}`);
    assert.equal(sent.status, 201);
  }

  const latest = await requestJson(`/api/v1/chat/conversations/${rook._id}/messages?limit=30`, {
    token: tokenFor(knight),
  });
  assert.equal(latest.status, 200);
  assert.equal(latest.body.messages.length, 30);
  assert.equal(latest.body.hasMore, true);
  assert.ok(latest.body.nextCursor);
  assert.equal(latest.body.messages.at(-1).text, 'Message 35');
  assert.equal(latest.body.messages[0].text, 'Message 6');

  const older = await requestJson(
    `/api/v1/chat/conversations/${rook._id}/messages?limit=30&before=${latest.body.nextCursor}`,
    { token: tokenFor(knight) },
  );
  assert.equal(older.status, 200);
  assert.equal(older.body.messages.length, 5);
  assert.equal(older.body.hasMore, false);
  assert.equal(older.body.nextCursor, null);
  assert.equal(older.body.messages[0].text, 'Message 1');
  assert.equal(older.body.messages.at(-1).text, 'Message 5');

  await sendMessage(knight, rook, 'Knight unread 1');
  await sendMessage(knight, rook, 'Knight unread 2');
  await sendMessage(oracle, rook, 'Oracle unread 1');

  const conversations = await requestJson('/api/v1/chat/conversations', {
    token: tokenFor(rook),
  });
  assert.equal(conversations.status, 200);
  const byFriend = new Map(conversations.body.conversations.map((conversation) => [
    conversation.friend.username,
    conversation,
  ]));
  assert.equal(byFriend.get('ArcadeDevKnight').unreadCount, 2);
  assert.equal(byFriend.get('ArcadeDevOracle').unreadCount, 1);

  const summary = await requestJson('/api/v1/friends/summary', { token: tokenFor(rook) });
  assert.equal(summary.body.unreadMessageCount, 3);

  const readKnight = await requestJson(`/api/v1/chat/conversations/${knight._id}/read`, {
    token: tokenFor(rook),
    method: 'POST',
  });
  assert.equal(readKnight.status, 200);
  assert.equal(readKnight.body.messageIds.length, 2);

  const summaryAfterOne = await requestJson('/api/v1/friends/summary', {
    token: tokenFor(rook),
  });
  assert.equal(summaryAfterOne.body.unreadMessageCount, 1);
});

async function clearChat(user, friend, scope) {
  return requestJson(`/api/v1/chat/conversations/${friend._id}/clear`, {
    token: tokenFor(user),
    method: 'POST',
    body: { scope },
  });
}

async function listMessagesFor(user, friend, query = '') {
  return requestJson(`/api/v1/chat/conversations/${friend._id}/messages${query}`, {
    token: tokenFor(user),
  });
}

async function getClearState(user, friend) {
  return requestJson(`/api/v1/chat/conversations/${friend._id}/clear`, {
    token: tokenFor(user),
  });
}

async function actOnClearRequest(user, requestId, action) {
  return requestJson(
    action === 'cancel'
      ? `/api/v1/chat/clear-requests/${requestId}`
      : `/api/v1/chat/clear-requests/${requestId}/${action}`,
    { token: tokenFor(user), method: action === 'cancel' ? 'DELETE' : 'POST' },
  );
}

async function conversationWith(user, friend) {
  const response = await requestJson('/api/v1/chat/conversations', { token: tokenFor(user) });
  assert.equal(response.status, 200);
  return response.body.conversations.find((row) => row.friend.id === String(friend._id)) || null;
}

async function friendsSummary(user) {
  const response = await requestJson('/api/v1/friends/summary', { token: tokenFor(user) });
  assert.equal(response.status, 200);
  return response.body;
}

test('clear for me hides history only for the clearing user and keeps every message stored', async () => {
  const rook = await createPlayer('ArcadeDevRook');
  const knight = await createPlayer('ArcadeDevKnight');
  const oracle = await createPlayer('ArcadeDevOracle');
  await makeFriends(rook, knight);

  const first = await sendMessage(rook, knight, 'First');
  await sendMessage(knight, rook, 'Unread for rook');
  await sendMessage(rook, knight, 'Third');
  assert.equal(first.status, 201);

  const rookOtherTab = await connectSocketFor(rook);
  const knightSocket = await connectSocketFor(knight);
  let knightSawClear = false;
  knightSocket.on('chat:cleared', () => { knightSawClear = true; });
  const clearedEvent = waitForEvent(rookOtherTab, 'chat:cleared');

  assert.equal((await clearChat(oracle, knight, 'me')).status, 403);
  assert.equal((await clearChat(rook, knight, 'everything')).status, 400);
  const unauthenticated = await requestJson(`/api/v1/chat/conversations/${knight._id}/clear`, {
    method: 'POST',
    body: { scope: 'me' },
  });
  assert.equal(unauthenticated.status, 401);

  const cleared = await clearChat(rook, knight, 'me');
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.scope, 'me');
  assert.ok(cleared.body.clearedAt);

  const event = await clearedEvent;
  assert.equal(event.scope, 'me');
  assert.equal(event.conversationWith, String(knight._id));

  // Rook's side is empty; Knight's history and the stored rows are untouched.
  const rookView = await listMessagesFor(rook, knight);
  assert.equal(rookView.status, 200);
  assert.deepEqual(rookView.body.messages, []);
  assert.equal(rookView.body.clearedAt, cleared.body.clearedAt);
  const knightView = await listMessagesFor(knight, rook);
  assert.deepEqual(
    knightView.body.messages.map((row) => row.text),
    ['First', 'Unread for rook', 'Third'],
  );
  assert.equal(await Message.countDocuments({}), 3);

  // A cleared message can no longer anchor pagination for the clearing user.
  const staleCursor = await listMessagesFor(rook, knight, `?before=${first.body.message.id}`);
  assert.equal(staleCursor.status, 400);

  const rookConversation = await conversationWith(rook, knight);
  assert.equal(rookConversation.lastMessage, null);
  assert.equal(rookConversation.unreadCount, 0);
  const knightConversation = await conversationWith(knight, rook);
  assert.equal(knightConversation.lastMessage, 'Third');
  assert.equal((await friendsSummary(rook)).unreadMessageCount, 0);

  // Messages after the cutoff appear normally for both participants.
  await delay(5);
  await sendMessage(knight, rook, 'After the clear');
  const afterView = await listMessagesFor(rook, knight);
  assert.deepEqual(afterView.body.messages.map((row) => row.text), ['After the clear']);
  assert.equal((await conversationWith(rook, knight)).unreadCount, 1);
  assert.equal((await listMessagesFor(knight, rook)).body.messages.length, 4);

  // Reading after a clear only acknowledges what the reader can see: the
  // pre-clear message is not reported to Knight as read.
  const read = await requestJson(`/api/v1/chat/conversations/${knight._id}/read`, {
    token: tokenFor(rook),
    method: 'POST',
  });
  assert.equal(read.body.messageIds.length, 1);
  const hiddenUnread = await Message.findOne({ text: 'Unread for rook' }).lean();
  assert.equal(hiddenUnread.readAt, null);

  await delay(50);
  assert.equal(knightSawClear, false, 'clearing my side must not notify the friend');
});

test('a both-sides clear needs the recipient to accept and then deletes permanently', async () => {
  const rook = await createPlayer('ArcadeDevRook');
  const knight = await createPlayer('ArcadeDevKnight');
  const oracle = await createPlayer('ArcadeDevOracle');
  await makeFriends(rook, knight);
  await makeFriends(rook, oracle);

  await sendMessage(rook, knight, 'One');
  await sendMessage(knight, rook, 'Two');
  await sendMessage(rook, knight, 'Three');
  await sendMessage(rook, oracle, 'Unrelated conversation');
  // A one-sided cutoff is reset by a later mutual clear.
  await clearChat(knight, rook, 'me');

  const rookSocket = await connectSocketFor(rook);
  const knightSocket = await connectSocketFor(knight);
  const incoming = waitForEvent(knightSocket, 'chat:clear-request');

  const created = await clearChat(rook, knight, 'both');
  assert.equal(created.status, 201);
  assert.equal(created.body.request.status, 'pending');
  assert.equal(created.body.request.requesterId, String(rook._id));
  assert.equal(created.body.request.recipientId, String(knight._id));
  assert.equal(created.body.request.requesterUsername, 'ArcadeDevRook');
  const requestId = created.body.request.id;
  assert.equal((await incoming).request.id, requestId);

  // Nothing is deleted or hidden while the request is pending.
  assert.equal(await Message.countDocuments({}), 4);
  assert.equal((await listMessagesFor(rook, knight)).body.messages.length, 3);

  assert.equal((await clearChat(rook, knight, 'both')).status, 409);
  const reverse = await clearChat(knight, rook, 'both');
  assert.equal(reverse.status, 409);
  assert.match(reverse.body.error, /already asked/i);
  assert.equal(await ClearChatRequest.countDocuments({ status: 'pending' }), 1);

  // The recipient's dot is persisted and tied to the requester; every fresh
  // read (refresh, reconnect, next login) finds it again.
  assert.equal((await conversationWith(knight, rook)).clearRequest.id, requestId);
  assert.equal((await friendsSummary(knight)).incomingClearRequestCount, 1);
  assert.equal((await friendsSummary(rook)).incomingClearRequestCount, 0);
  assert.equal((await getClearState(knight, rook)).body.request.id, requestId);

  // Only the recipient may answer; an outsider cannot even see the request.
  assert.equal((await actOnClearRequest(rook, requestId, 'accept')).status, 403);
  for (const action of ['accept', 'decline', 'acknowledge', 'cancel']) {
    const outsider = await actOnClearRequest(oracle, requestId, action);
    assert.equal(outsider.status, 404, `outsider ${action}`);
  }
  assert.equal((await getClearState(oracle, knight)).status, 403);
  assert.equal((await actOnClearRequest(knight, 'not-an-id', 'accept')).status, 404);
  assert.equal(await Message.countDocuments({}), 4);

  const rookCleared = waitForEvent(rookSocket, 'chat:cleared', (event) => event.scope === 'both');
  const knightCleared = waitForEvent(knightSocket, 'chat:cleared', (event) => event.scope === 'both');
  const rookAccepted = waitForEvent(
    rookSocket,
    'chat:clear-request',
    (event) => event.request.status === 'accepted',
  );

  const accepted = await actOnClearRequest(knight, requestId, 'accept');
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.request.status, 'accepted');
  assert.equal(accepted.body.deletedCount, 3);
  assert.equal((await rookCleared).conversationWith, String(knight._id));
  assert.equal((await knightCleared).conversationWith, String(rook._id));
  await rookAccepted;

  // Permanently gone from MongoDB; the unrelated conversation is untouched.
  const conversation = await Conversation.findOne({ _id: accepted.body.conversationId }).lean();
  assert.equal(await Message.countDocuments({ conversationId: conversation._id }), 0);
  assert.equal(await Message.countDocuments({}), 1);
  assert.equal(conversation.lastMessage, '');
  assert.equal(conversation.lastMessageAt, null);
  assert.deepEqual(conversation.clearedAt, {});
  assert.equal(conversation.clearLockUntil, null);
  assert.equal(await Friendship.countDocuments({}), 2);

  assert.deepEqual((await listMessagesFor(rook, knight)).body.messages, []);
  assert.deepEqual((await listMessagesFor(knight, rook)).body.messages, []);
  assert.equal((await conversationWith(knight, rook)).clearRequest, null);
  assert.equal((await friendsSummary(knight)).incomingClearRequestCount, 0);
  assert.equal((await friendsSummary(knight)).unreadMessageCount, 0);
  assert.equal((await actOnClearRequest(knight, requestId, 'accept')).status, 409);

  // The requester sees the outcome until dismissing it.
  assert.equal((await getClearState(rook, knight)).body.outcome.status, 'accepted');
  assert.equal((await actOnClearRequest(rook, requestId, 'acknowledge')).status, 200);
  assert.equal((await getClearState(rook, knight)).body.outcome, null);

  // The conversation continues as a fresh one.
  assert.equal((await sendMessage(knight, rook, 'Fresh start')).status, 201);
  assert.deepEqual(
    (await listMessagesFor(rook, knight)).body.messages.map((row) => row.text),
    ['Fresh start'],
  );
  assert.equal((await conversationWith(rook, knight)).lastMessage, 'Fresh start');
});

test('declining keeps history, an offline request persists, and the requester can cancel', async () => {
  const rook = await createPlayer('ArcadeDevRook');
  const knight = await createPlayer('ArcadeDevKnight');
  await makeFriends(rook, knight);
  await sendMessage(rook, knight, 'Keep me');
  await sendMessage(knight, rook, 'Keep me too');

  // Knight has no socket (offline). The request stays pending and is found on
  // the next authenticated read; nothing is deleted while waiting.
  const created = await clearChat(rook, knight, 'both');
  assert.equal(created.status, 201);
  await delay(30);
  assert.equal((await getClearState(knight, rook)).body.request.status, 'pending');
  assert.equal(await Message.countDocuments({}), 2);

  const rookSocket = await connectSocketFor(rook);
  const declinedEvent = waitForEvent(
    rookSocket,
    'chat:clear-request',
    (event) => event.request.status === 'declined',
  );
  const declined = await actOnClearRequest(knight, created.body.request.id, 'decline');
  assert.equal(declined.status, 200);
  assert.equal(declined.body.request.status, 'declined');
  assert.ok(declined.body.request.respondedAt);
  await declinedEvent;

  assert.equal(await Message.countDocuments({}), 2);
  assert.equal((await listMessagesFor(rook, knight)).body.messages.length, 2);
  assert.equal((await listMessagesFor(knight, rook)).body.messages.length, 2);
  assert.equal((await friendsSummary(knight)).incomingClearRequestCount, 0);
  const rookOutcome = await getClearState(rook, knight);
  assert.equal(rookOutcome.body.outcome.status, 'declined');
  assert.equal(rookOutcome.body.request, null);
  assert.equal((await actOnClearRequest(knight, created.body.request.id, 'decline')).status, 409);
  assert.equal((await sendMessage(knight, rook, 'Still chatting')).status, 201);

  // A new request supersedes the old outcome; the requester then cancels it.
  const second = await clearChat(rook, knight, 'both');
  assert.equal(second.status, 201);
  assert.equal((await getClearState(rook, knight)).body.outcome, null);
  assert.equal((await friendsSummary(knight)).incomingClearRequestCount, 1);

  assert.equal((await actOnClearRequest(knight, second.body.request.id, 'cancel')).status, 403);
  const cancelled = await actOnClearRequest(rook, second.body.request.id, 'cancel');
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.request.status, 'cancelled');
  assert.equal((await friendsSummary(knight)).incomingClearRequestCount, 0);
  assert.equal((await conversationWith(knight, rook)).clearRequest, null);
  assert.equal((await actOnClearRequest(knight, second.body.request.id, 'accept')).status, 409);
  assert.equal(await Message.countDocuments({}), 3);
});

test('a both-sides request needs a conversation, and sends wait for a clear in progress', async () => {
  const rook = await createPlayer('ArcadeDevRook');
  const knight = await createPlayer('ArcadeDevKnight');
  await makeFriends(rook, knight);

  assert.equal((await clearChat(rook, knight, 'both')).status, 400);

  await sendMessage(rook, knight, 'Hello');
  const conversation = await Conversation.findOne({}).lean();
  await Conversation.updateOne(
    { _id: conversation._id },
    { $set: { clearLockUntil: new Date(Date.now() + 10_000) } },
  );
  assert.equal((await sendMessage(knight, rook, 'During the clear')).status, 409);
  assert.equal(await Message.countDocuments({}), 1);

  // An expired lease (a crashed clear) never blocks sending.
  await Conversation.updateOne(
    { _id: conversation._id },
    { $set: { clearLockUntil: new Date(Date.now() - 1000) } },
  );
  assert.equal((await sendMessage(knight, rook, 'After the lease')).status, 201);
});

test('removing a friend keeps history but stops chat; blocking stops requests and chat both ways', async () => {
  const rook = await createPlayer('ArcadeDevRook');
  const knight = await createPlayer('ArcadeDevKnight');
  const oracle = await createPlayer('ArcadeDevOracle');
  await makeFriends(rook, knight);
  await sendMessage(rook, knight, 'Before removal');
  await sendMessage(knight, rook, 'Reply before removal');
  assert.equal((await clearChat(knight, rook, 'both')).status, 201);

  const knightSocket = await connectSocketFor(knight);
  const ended = waitForEvent(knightSocket, 'friends:changed');
  const cancelledClear = waitForEvent(
    knightSocket,
    'chat:clear-request',
    (event) => event.request.status === 'cancelled',
  );

  const removeFriend = (viewer, target) => requestJson(`/api/v1/friends/${target._id}`, {
    token: viewer ? tokenFor(viewer) : undefined,
    method: 'DELETE',
  });
  assert.equal((await removeFriend(null, knight)).status, 401);
  assert.equal((await removeFriend(rook, rook)).status, 400);
  assert.equal((await removeFriend(rook, oracle)).status, 404);

  const removed = await removeFriend(rook, knight);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.relationship.status, 'NONE');
  assert.deepEqual(await ended, { reason: 'removed', userId: String(rook._id) });
  await cancelledClear;
  assert.equal((await removeFriend(rook, knight)).status, 404);

  // Both sides see the friendship gone; the history stays stored.
  assert.equal(await Friendship.countDocuments({}), 0);
  for (const [viewer, other] of [[rook, knight], [knight, rook]]) {
    const friends = await requestJson('/api/v1/friends', { token: tokenFor(viewer) });
    assert.deepEqual(friends.body.friends, []);
    const status = await requestJson(`/api/v1/friends/status/${other._id}`, { token: tokenFor(viewer) });
    assert.equal(status.body.relationship.status, 'NONE');
    assert.equal((await sendMessage(viewer, other, 'No longer allowed')).status, 403);
    assert.equal((await listMessagesFor(viewer, other)).status, 403);
  }
  assert.equal(await Message.countDocuments({}), 2);
  assert.equal(await ClearChatRequest.countDocuments({ status: 'pending' }), 0);

  // Re-friending shows the retained history again.
  await makeFriends(knight, rook);
  assert.equal((await listMessagesFor(rook, knight)).body.messages.length, 2);

  // Blocking a friend ends the friendship and closes every channel both ways.
  const rookSocket = await connectSocketFor(rook);
  const blockedEvent = waitForEvent(
    knightSocket,
    'friends:changed',
    (event) => event.reason === 'blocked',
  );
  const block = (viewer, target) => requestJson('/api/v1/friends/blocks', {
    token: tokenFor(viewer),
    method: 'POST',
    body: { userId: String(target._id) },
  });
  const blocked = await block(rook, knight);
  assert.equal(blocked.status, 200);
  assert.equal(blocked.body.relationship.status, 'BLOCKED');
  assert.equal(blocked.body.relationship.blockedByMe, true);
  await blockedEvent;
  assert.equal(await Friendship.countDocuments({}), 0);
  assert.equal((await block(rook, rook)).status, 400);
  assert.equal((await block(rook, knight)).status, 200);
  assert.equal(await Block.countDocuments({}), 1);

  for (const [from, to] of [[rook, knight], [knight, rook]]) {
    const friendRequest = await requestJson('/api/v1/friends/requests', {
      token: tokenFor(from),
      method: 'POST',
      body: { userId: String(to._id) },
    });
    assert.equal(friendRequest.status, 403, 'friend requests are refused both ways');
    assert.equal((await sendMessage(from, to, 'Blocked message')).status, 403);
  }
  const knightStatus = await requestJson(`/api/v1/friends/status/${rook._id}`, { token: tokenFor(knight) });
  assert.equal(knightStatus.body.relationship.status, 'BLOCKED');
  assert.equal(knightStatus.body.relationship.blockedMe, true);

  // The realtime channel is closed too.
  const typingError = waitForEvent(knightSocket, 'chat:error', (event) => event.event === 'chat:typing');
  let rookSawTyping = false;
  rookSocket.on('chat:typing', () => { rookSawTyping = true; });
  knightSocket.emit('chat:typing', { friendId: String(rook._id), typing: true });
  await typingError;
  await delay(50);
  assert.equal(rookSawTyping, false);
  assert.equal(await Message.countDocuments({}), 2);
});

test('live sockets are cut when their session is revoked, suspended or expired', async () => {
  const rook = await createPlayer('ArcadeDevRook');
  const knight = await createPlayer('ArcadeDevKnight');
  const oracle = await createPlayer('ArcadeDevOracle');
  await makeFriends(rook, knight);

  const rookSocket = await connectSocketFor(rook);
  const knightSocket = await connectSocketFor(knight);
  const oracleSocket = await connectSocketFor(oracle);

  // A valid session survives the sweep. (Sockets left over from earlier tests
  // belong to deleted accounts, so the sweep rightly cuts those.)
  await revalidateConnectedSockets();
  await delay(80);
  for (const socket of [rookSocket, knightSocket, oracleSocket]) {
    assert.equal(socket.connected, true, 'a valid session stays connected');
  }

  // Password change / logout-all bump tokenVersion: the open tab is cut and
  // stops receiving private chat.
  const knightCut = waitForEvent(knightSocket, 'disconnect');
  let knightGotMessage = false;
  knightSocket.on('chat:message', () => { knightGotMessage = true; });
  await User.updateOne({ _id: knight._id }, { $inc: { tokenVersion: 1 } });
  assert.equal(await revalidateConnectedSockets(), 1, 'only the revoked tab is cut');
  assert.equal(await knightCut, 'io server disconnect');
  assert.equal(rookSocket.connected, true, 'other accounts are untouched');

  const freshKnight = await User.findById(knight._id);
  assert.equal((await sendMessage(rook, freshKnight, 'after revocation')).status, 201);
  await delay(80);
  assert.equal(knightGotMessage, false, 'the revoked tab received nothing');

  // The revoked token cannot reconnect either.
  await assert.rejects(connectSocketFor(knight), 'the old token is refused at the handshake');
  const reconnected = await connectSocketFor(freshKnight);
  assert.equal(reconnected.connected, true, 'the current token reconnects normally');

  // Suspension cuts every tab of that account.
  const rookCut = waitForEvent(rookSocket, 'disconnect');
  await User.updateOne({ _id: rook._id }, { $set: { status: ACCOUNT_STATUSES.SUSPENDED } });
  await revalidateConnectedSockets();
  assert.equal(await rookCut, 'io server disconnect');

  // A connection does not outlive its 15-minute access token.
  const oracleCut = waitForEvent(oracleSocket, 'disconnect');
  await revalidateConnectedSockets(Date.now() + 16 * 60 * 1000);
  assert.equal(await oracleCut, 'io server disconnect');
});

test('blocking removes a pending friend request between the pair', async () => {
  const rook = await createPlayer('ArcadeDevRook');
  const knight = await createPlayer('ArcadeDevKnight');
  const sent = await requestJson('/api/v1/friends/requests', {
    token: tokenFor(knight),
    method: 'POST',
    body: { userId: String(rook._id) },
  });
  assert.equal(sent.status, 201);

  const blocked = await requestJson('/api/v1/friends/blocks', {
    token: tokenFor(rook),
    method: 'POST',
    body: { userId: String(knight._id) },
  });
  assert.equal(blocked.status, 200);
  assert.equal(await FriendRequest.countDocuments({}), 0);
  const accept = await requestJson(
    `/api/v1/friends/requests/${sent.body.relationship.requestId}/accept`,
    { token: tokenFor(rook), method: 'POST' },
  );
  assert.equal(accept.status, 404);
});
