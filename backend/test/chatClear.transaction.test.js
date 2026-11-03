const { after, before, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

/*
 * The mutual clear runs inside a MongoDB transaction on replica sets (Atlas
 * in production). The main chat suite uses a standalone server, so this file
 * exercises the transactional path and the races it must survive.
 */

let replSet;
let mongoose;
let User;
let Friendship;
let Conversation;
let Message;
let ClearChatRequest;
let chatService;
let getPairKey;
let getOrderedPair;

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');

  mongoose = require('mongoose');
  ({ User } = require('../models/User'));
  ({ Friendship } = require('../models/Friendship'));
  ({ Conversation } = require('../models/Conversation'));
  ({ Message } = require('../models/Message'));
  ({ ClearChatRequest } = require('../models/ClearChatRequest'));
  chatService = require('../services/chatService');
  ({ getPairKey, getOrderedPair } = require('../utils/friendship'));

  await mongoose.connect(replSet.getUri('arcadia_chat_clear_tx'));
  await Promise.all([
    User.syncIndexes(),
    Friendship.syncIndexes(),
    Conversation.syncIndexes(),
    Message.syncIndexes(),
    ClearChatRequest.syncIndexes(),
  ]);
});

after(async () => {
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
});

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Friendship.deleteMany({}),
    Conversation.deleteMany({}),
    Message.deleteMany({}),
    ClearChatRequest.deleteMany({}),
  ]);
});

async function createFriends() {
  const make = (username) => User.create({
    email: `${username.toLowerCase()}@example.com`,
    name: username,
    username,
    usernameNormalized: username.toLowerCase(),
    totalXp: 0,
  });
  const rook = await make('ArcadeDevRook');
  const knight = await make('ArcadeDevKnight');
  await Friendship.create({
    ...getOrderedPair(rook._id, knight._id),
    pairKey: getPairKey(rook._id, knight._id),
  });
  return { rook: String(rook._id), knight: String(knight._id) };
}

test('accept deletes every message inside a transaction and releases the lock', async () => {
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  assert.ok(hello.setName, 'this suite must run against a replica set');
  const { rook, knight } = await createFriends();
  for (let index = 0; index < 5; index += 1) {
    await chatService.sendMessage(index % 2 ? knight : rook, index % 2 ? rook : knight, `m${index}`, null);
  }
  const { request } = await chatService.createClearRequest(rook, knight);

  const result = await chatService.acceptClearRequest(knight, request.id);
  assert.equal(result.deletedCount, 5);
  assert.equal(await Message.countDocuments({}), 0);
  const conversation = await Conversation.findById(result.conversationId).lean();
  assert.equal(conversation.lastMessage, '');
  assert.equal(conversation.clearLockUntil, null);
  assert.equal((await ClearChatRequest.findById(request.id).lean()).status, 'accepted');

  const fresh = await chatService.sendMessage(knight, rook, 'fresh', null);
  assert.equal(fresh.duplicate, false);
  const page = await chatService.listMessages(rook, knight);
  assert.deepEqual(page.messages.map((row) => row.text), ['fresh']);
});

test('a concurrent accept and cancel resolve to exactly one outcome', async () => {
  const { rook, knight } = await createFriends();
  await chatService.sendMessage(rook, knight, 'keep or delete', null);
  const { request } = await chatService.createClearRequest(rook, knight);

  const [accept, cancel] = await Promise.allSettled([
    chatService.acceptClearRequest(knight, request.id),
    chatService.cancelClearRequest(rook, request.id),
  ]);
  const fulfilled = [accept, cancel].filter((row) => row.status === 'fulfilled');
  assert.equal(fulfilled.length, 1, 'exactly one transition wins');
  const rejected = [accept, cancel].find((row) => row.status === 'rejected');
  assert.equal(rejected.reason.statusCode, 409);

  const stored = await ClearChatRequest.findById(request.id).lean();
  // Messages are deleted if and only if the accept won.
  assert.equal(await Message.countDocuments({}), stored.status === 'accepted' ? 0 : 1);
  assert.equal((await Conversation.findOne({}).lean()).clearLockUntil, null);
});

test('simultaneous requests from both participants leave a single pending request', async () => {
  const { rook, knight } = await createFriends();
  await chatService.sendMessage(rook, knight, 'hello', null);

  const results = await Promise.allSettled([
    chatService.createClearRequest(rook, knight),
    chatService.createClearRequest(knight, rook),
    chatService.createClearRequest(rook, knight),
  ]);
  assert.equal(results.filter((row) => row.status === 'fulfilled').length, 1);
  for (const row of results.filter((item) => item.status === 'rejected')) {
    assert.equal(row.reason.statusCode, 409);
  }
  assert.equal(await ClearChatRequest.countDocuments({ status: 'pending' }), 1);
});

test('sends racing a mutual clear are either deleted with it or kept after it, never half-included', async () => {
  const { rook, knight } = await createFriends();
  for (let index = 0; index < 5; index += 1) {
    await chatService.sendMessage(rook, knight, `before-${index}`, null);
  }
  const { request } = await chatService.createClearRequest(rook, knight);

  const sends = Array.from({ length: 30 }, (_, index) => (
    chatService.sendMessage(index % 2 ? knight : rook, index % 2 ? rook : knight, `race-${index}`, `race-client-${index}`)
  ));
  const [acceptResult, ...sendResults] = await Promise.allSettled([
    chatService.acceptClearRequest(knight, request.id),
    ...sends,
  ]);
  assert.equal(acceptResult.status, 'fulfilled', 'the clear itself succeeds');

  const accepted = await ClearChatRequest.findById(request.id).lean();
  const survivors = await Message.find({}).lean();

  // Nothing from before the acceptance survives: every survivor was written
  // after the clear had finished.
  assert.equal(survivors.filter((row) => row.text.startsWith('before-')).length, 0);
  for (const row of survivors) {
    assert.ok(row.createdAt > accepted.respondedAt, `${row.text} was written after the clear`);
  }

  // A refused send never left a row behind.
  sendResults.forEach((result, index) => {
    if (result.status === 'rejected') {
      assert.equal(result.reason.statusCode, 409, 'a racing send is refused with 409, not a crash');
      assert.equal(survivors.some((row) => row.clientMessageId === `race-client-${index}`), false);
    }
  });

  // The preview describes exactly what remains, and the lock is released.
  const conversation = await Conversation.findOne({}).lean();
  const newest = [...survivors].sort((a, b) => b.createdAt - a.createdAt)[0];
  assert.equal(conversation.lastMessage, newest ? newest.text : '');
  assert.equal(conversation.clearLockUntil, null);
});

test('a burst of simultaneous sends in one conversation all succeed', async () => {
  const { rook, knight } = await createFriends();
  const results = await Promise.allSettled(Array.from({ length: 25 }, (_, index) => (
    chatService.sendMessage(index % 2 ? knight : rook, index % 2 ? rook : knight, `burst-${index}`, `burst-client-${index}`)
  )));
  assert.deepEqual(
    results.filter((row) => row.status === 'rejected').map((row) => row.reason.message),
    [],
    'transaction write conflicts are retried, never surfaced',
  );
  assert.equal(await Message.countDocuments({}), 25);
  const newest = await Message.findOne({}).sort({ createdAt: -1, _id: -1 }).lean();
  const conversation = await Conversation.findOne({}).lean();
  assert.equal(conversation.lastMessageAt.getTime(), newest.createdAt.getTime(), 'the preview is the newest message');
});

test('a second accept while the first holds the lock is refused without deleting twice', async () => {
  const { rook, knight } = await createFriends();
  await chatService.sendMessage(rook, knight, 'one', null);
  const { request } = await chatService.createClearRequest(rook, knight);

  const results = await Promise.allSettled([
    chatService.acceptClearRequest(knight, request.id),
    chatService.acceptClearRequest(knight, request.id),
  ]);
  assert.equal(results.filter((row) => row.status === 'fulfilled').length, 1);
  assert.equal(results.find((row) => row.status === 'rejected').reason.statusCode, 409);
  assert.equal(await Message.countDocuments({}), 0);
});
