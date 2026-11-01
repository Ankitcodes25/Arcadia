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
let createApp;
let connectDatabase;
let disconnectDatabase;
let signAccessToken;
let normalizeUsername;
let attachChatSocket;
let closeChatSocket;
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
  ({ signAccessToken } = require('../utils/jwt'));
  ({ normalizeUsername } = require('../utils/username'));
  ({ connectDatabase, disconnectDatabase } = require('../config/database'));
  ({ attachChatSocket, closeChatSocket } = require('../realtime/chatSocket'));
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
