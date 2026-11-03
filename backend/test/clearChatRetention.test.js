const { after, before, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;
let mongoose;
let Conversation;
let Message;
let ClearChatRequest;
let cleanupCompletedClearChatRequests;
let CLEAR_CHAT_REQUEST_RETENTION_DAYS;

before(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = mongoServer.getUri('arcadia_clear_retention_test');
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');

  mongoose = require('mongoose');
  ({ Conversation } = require('../models/Conversation'));
  ({ Message } = require('../models/Message'));
  ({ ClearChatRequest, CLEAR_CHAT_REQUEST_RETENTION_DAYS } = require('../models/ClearChatRequest'));
  ({ cleanupCompletedClearChatRequests } = require('../services/clearChatRetentionService'));

  await mongoose.connect(process.env.MONGODB_URI);
  await Promise.all([
    Conversation.syncIndexes(),
    Message.syncIndexes(),
    ClearChatRequest.syncIndexes(),
  ]);
});

after(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

beforeEach(async () => {
  await Promise.all([
    Conversation.deleteMany({}),
    Message.deleteMany({}),
    ClearChatRequest.deleteMany({}),
  ]);
});

function daysAgo(days) {
  return new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
}

async function createConversationPair() {
  const first = new mongoose.Types.ObjectId();
  const second = new mongoose.Types.ObjectId();
  const conversation = await Conversation.create({
    participants: [first, second],
    participantKey: [String(first), String(second)].sort().join(':'),
    lastMessage: 'still here',
    lastMessageAt: new Date(),
  });
  const message = await Message.create({
    conversationId: conversation._id,
    senderId: first,
    receiverId: second,
    text: 'retention must not touch messages',
  });
  return { first, second, conversation, message };
}

test('TTL index expires completed requests after 90 days and excludes pending rows', async () => {
  assert.equal(CLEAR_CHAT_REQUEST_RETENTION_DAYS, 90);
  const indexes = await ClearChatRequest.collection.indexes();
  const ttl = indexes.find((index) => index.name === 'completed_clear_requests_expire');

  assert.ok(ttl, 'the completed-request TTL index exists');
  assert.equal(ttl.key.respondedAt, 1);
  assert.equal(ttl.expireAfterSeconds, 90 * 24 * 60 * 60);
  assert.deepEqual(
    ttl.partialFilterExpression.status.$in.sort(),
    ['accepted', 'cancelled', 'declined'],
  );
  assert.equal(ttl.partialFilterExpression.respondedAt.$type, 'date');
});

test('cleanup removes old accepted and declined requests, keeps pending and recent rows', async () => {
  const { first, second, conversation, message } = await createConversationPair();

  const oldAccepted = await ClearChatRequest.create({
    conversationId: conversation._id,
    requesterId: first,
    recipientId: second,
    status: 'accepted',
    respondedAt: daysAgo(91),
  });
  const oldDeclined = await ClearChatRequest.create({
    conversationId: new mongoose.Types.ObjectId(),
    requesterId: second,
    recipientId: first,
    status: 'declined',
    respondedAt: daysAgo(120),
  });
  const oldCancelled = await ClearChatRequest.create({
    conversationId: new mongoose.Types.ObjectId(),
    requesterId: first,
    recipientId: second,
    status: 'cancelled',
    respondedAt: daysAgo(200),
  });
  const pending = await ClearChatRequest.create({
    conversationId: new mongoose.Types.ObjectId(),
    requesterId: first,
    recipientId: second,
    status: 'pending',
    respondedAt: null,
  });
  // Even an old pending request must survive: age alone is not an outcome.
  await ClearChatRequest.collection.updateOne(
    { _id: pending._id },
    { $set: { createdAt: daysAgo(365), respondedAt: null } },
  );
  const recentAccepted = await ClearChatRequest.create({
    conversationId: new mongoose.Types.ObjectId(),
    requesterId: second,
    recipientId: first,
    status: 'accepted',
    respondedAt: daysAgo(89),
  });

  const result = await cleanupCompletedClearChatRequests();
  assert.equal(result.deletedCount, 3);
  assert.equal(await ClearChatRequest.exists({ _id: oldAccepted._id }), null);
  assert.equal(await ClearChatRequest.exists({ _id: oldDeclined._id }), null);
  assert.equal(await ClearChatRequest.exists({ _id: oldCancelled._id }), null);
  assert.ok(await ClearChatRequest.exists({ _id: pending._id }), 'pending survives');
  assert.ok(await ClearChatRequest.exists({ _id: recentAccepted._id }), 'recent completed survives');

  assert.ok(await Conversation.exists({ _id: conversation._id }), 'conversation is untouched');
  assert.ok(await Message.exists({ _id: message._id }), 'message is untouched');

  const secondRun = await cleanupCompletedClearChatRequests();
  assert.equal(secondRun.deletedCount, 0, 'cleanup is idempotent');
});
