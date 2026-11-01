const { after, before, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { once } = require('node:events');
const { MongoMemoryServer } = require('mongodb-memory-server');

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
let createApp;
let connectDatabase;
let disconnectDatabase;
let signAccessToken;
let normalizeUsername;
let server;
let baseUrl;

before(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = mongoServer.getUri('arcadia_friends_test');
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
  ({ signAccessToken } = require('../utils/jwt'));
  ({ normalizeUsername } = require('../utils/username'));
  ({ connectDatabase, disconnectDatabase } = require('../config/database'));
  createApp = require('../app');

  await connectDatabase();
  await Promise.all([
    User.syncIndexes(),
    Session.syncIndexes(),
    FriendRequest.syncIndexes(),
    Friendship.syncIndexes(),
    Block.syncIndexes(),
    RateLimitBucket.syncIndexes(),
  ]);

  server = createApp().listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  if (disconnectDatabase) await disconnectDatabase();
  if (mongoServer) await mongoServer.stop();
});

beforeEach(async () => {
  await Promise.all([
    RateLimitBucket.deleteMany({}),
    Session.deleteMany({}),
    FriendRequest.deleteMany({}),
    Friendship.deleteMany({}),
    Block.deleteMany({}),
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

function assertNoPrivateFields(player) {
  for (const field of ['email', 'passwordHash', 'role', 'status', 'preferences', 'google', 'usernameNormalized']) {
    assert.equal(Object.prototype.hasOwnProperty.call(player, field), false, `${field} must not leak`);
  }
}

async function sendRequest(token, userId) {
  return requestJson('/api/v1/friends/requests', {
    token,
    method: 'POST',
    body: { userId },
  });
}

async function acceptRequest(token, requestId) {
  return requestJson(`/api/v1/friends/requests/${requestId}/accept`, {
    token,
    method: 'POST',
  });
}

async function makeFriends(first, second) {
  const sent = await sendRequest(tokenFor(first), String(second._id));
  assert.equal(sent.status, 201);
  const accepted = await acceptRequest(tokenFor(second), sent.body.relationship.requestId);
  assert.equal(accepted.status, 200);
  return accepted.body;
}

async function createSessionFor(user, overrides = {}) {
  return Session.create({
    userId: user._id,
    refreshTokenHash: crypto.randomUUID(),
    familyId: crypto.randomUUID(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    lastUsedAt: new Date(),
    revokedAt: null,
    ...overrides,
  });
}

test('friend requests, duplicate prevention, accept and list surfaces', async () => {
  const rook = await createPlayer('ArcadeDevRook');
  const knight = await createPlayer('ArcadeDevKnight');
  const oracle = await createPlayer('ArcadeDevOracle');

  const sent = await sendRequest(tokenFor(rook), String(knight._id));
  assert.equal(sent.status, 201);
  assert.equal(sent.body.relationship.status, 'OUTGOING_PENDING');
  assert.ok(sent.body.relationship.requestId);

  const statusAfterSend = await requestJson(
    `/api/v1/friends/status/${knight._id}`,
    { token: tokenFor(rook) },
  );
  assert.equal(statusAfterSend.status, 200);
  assert.equal(statusAfterSend.body.relationship.status, 'OUTGOING_PENDING');

  const duplicate = await sendRequest(tokenFor(rook), String(knight._id));
  assert.equal(duplicate.status, 409);
  assert.match(duplicate.body.error, /already sent/i);

  const reverse = await sendRequest(tokenFor(knight), String(rook._id));
  assert.equal(reverse.status, 409);
  assert.match(reverse.body.error, /already sent/i);

  const self = await sendRequest(tokenFor(rook), String(rook._id));
  assert.equal(self.status, 400);

  const knightSummary = await requestJson('/api/v1/friends/summary', { token: tokenFor(knight) });
  assert.equal(knightSummary.status, 200);
  assert.equal(knightSummary.body.incomingCount, 1);

  const knightRequests = await requestJson('/api/v1/friends/requests', { token: tokenFor(knight) });
  assert.equal(knightRequests.status, 200);
  assert.equal(knightRequests.body.incoming.length, 1);
  assert.equal(knightRequests.body.incoming[0].user.id, String(rook._id));
  assert.equal(knightRequests.body.incoming[0].user.username, 'ArcadeDevRook');
  assertNoPrivateFields(knightRequests.body.incoming[0].user);

  const rookRequests = await requestJson('/api/v1/friends/requests', { token: tokenFor(rook) });
  assert.equal(rookRequests.body.outgoing.length, 1);
  assert.equal(rookRequests.body.outgoing[0].user.id, String(knight._id));

  const searchByUsername = await requestJson('/api/v1/friends/search?q=Knight', {
    token: tokenFor(rook),
  });
  assert.equal(searchByUsername.status, 200);
  assert.equal(searchByUsername.body.players.length, 1);
  assert.equal(searchByUsername.body.players[0].id, String(knight._id));
  assert.equal(searchByUsername.body.players[0].relationship.status, 'OUTGOING_PENDING');
  assertNoPrivateFields(searchByUsername.body.players[0]);

  const searchByPlayerId = await requestJson(
    `/api/v1/friends/search?q=${encodeURIComponent(knight.playerId.slice(0, 8))}`,
    { token: tokenFor(rook) },
  );
  assert.equal(searchByPlayerId.status, 200);
  assert.ok(searchByPlayerId.body.players.some((player) => player.id === String(knight._id)));

  const wrongRecipient = await acceptRequest(
    tokenFor(oracle),
    sent.body.relationship.requestId,
  );
  assert.equal(wrongRecipient.status, 403);

  const accepted = await acceptRequest(
    tokenFor(knight),
    sent.body.relationship.requestId,
  );
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.relationship.status, 'FRIENDS');
  assert.equal(accepted.body.friend.id, String(rook._id));
  assertNoPrivateFields(accepted.body.friend);

  const statusAfterAccept = await requestJson(
    `/api/v1/friends/status/${knight._id}`,
    { token: tokenFor(rook) },
  );
  assert.equal(statusAfterAccept.body.relationship.status, 'FRIENDS');
  assert.ok(statusAfterAccept.body.relationship.friendSince);

  const rookFriends = await requestJson('/api/v1/friends', { token: tokenFor(rook) });
  const knightFriends = await requestJson('/api/v1/friends', { token: tokenFor(knight) });
  assert.equal(rookFriends.body.friends.length, 1);
  assert.equal(knightFriends.body.friends.length, 1);
  assert.equal(rookFriends.body.friends[0].username, 'ArcadeDevKnight');
  assert.equal(knightFriends.body.friends[0].username, 'ArcadeDevRook');
  assertNoPrivateFields(rookFriends.body.friends[0]);

  const afterAccept = await requestJson('/api/v1/friends/summary', { token: tokenFor(knight) });
  assert.equal(afterAccept.body.incomingCount, 0);
  const clearedRequests = await requestJson('/api/v1/friends/requests', { token: tokenFor(knight) });
  assert.equal(clearedRequests.body.incoming.length, 0);
  assert.equal(clearedRequests.body.outgoing.length, 0);

  const alreadyFriends = await sendRequest(tokenFor(rook), String(knight._id));
  assert.equal(alreadyFriends.status, 409);
  assert.match(alreadyFriends.body.error, /already friends/i);
});

test('reject and cancel remove the pending request without creating a friendship', async () => {
  const rook = await createPlayer('ArcadeDevRook');
  const knight = await createPlayer('ArcadeDevKnight');
  const oracle = await createPlayer('ArcadeDevOracle');

  const sent = await sendRequest(tokenFor(rook), String(knight._id));
  const rejected = await requestJson(
    `/api/v1/friends/requests/${sent.body.relationship.requestId}/reject`,
    { token: tokenFor(knight), method: 'POST' },
  );
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.relationship.status, 'NONE');
  assert.equal(await Friendship.countDocuments({}), 0);
  assert.equal(await FriendRequest.countDocuments({}), 0);

  const sentAgain = await sendRequest(tokenFor(rook), String(knight._id));
  assert.equal(sentAgain.status, 201);

  const wrongSenderCancel = await requestJson(
    `/api/v1/friends/requests/${sentAgain.body.relationship.requestId}`,
    { token: tokenFor(oracle), method: 'DELETE' },
  );
  assert.equal(wrongSenderCancel.status, 403);

  const cancelled = await requestJson(
    `/api/v1/friends/requests/${sentAgain.body.relationship.requestId}`,
    { token: tokenFor(rook), method: 'DELETE' },
  );
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.relationship.status, 'NONE');
  assert.equal(await FriendRequest.countDocuments({}), 0);

  const sentToOracle = await sendRequest(tokenFor(rook), String(oracle._id));
  const wrongRecipientReject = await requestJson(
    `/api/v1/friends/requests/${sentToOracle.body.relationship.requestId}/reject`,
    { token: tokenFor(knight), method: 'POST' },
  );
  assert.equal(wrongRecipientReject.status, 403);
});

test('blocking removes requests and friendships, hides search, and denies profiles', async () => {
  const rook = await createPlayer('ArcadeDevRook');
  const knight = await createPlayer('ArcadeDevKnight');

  const sent = await sendRequest(tokenFor(rook), String(knight._id));
  const blocked = await requestJson(
    `/api/v1/friends/requests/${sent.body.relationship.requestId}/block`,
    { token: tokenFor(knight), method: 'POST' },
  );
  assert.equal(blocked.status, 200);
  assert.equal(blocked.body.relationship.status, 'BLOCKED');
  assert.equal(blocked.body.relationship.blockedByMe, true);
  assert.equal(await FriendRequest.countDocuments({}), 0);
  assert.equal(await Block.countDocuments({ blocker: knight._id, blocked: rook._id }), 1);

  const statusAfterBlock = await requestJson(
    `/api/v1/friends/status/${knight._id}`,
    { token: tokenFor(rook) },
  );
  assert.equal(statusAfterBlock.body.relationship.status, 'BLOCKED');
  assert.equal(statusAfterBlock.body.relationship.blockedMe, true);
  assert.equal(statusAfterBlock.body.relationship.blockedByMe, false);

  const blockedSend = await sendRequest(tokenFor(rook), String(knight._id));
  assert.equal(blockedSend.status, 403);
  const reverseSend = await sendRequest(tokenFor(knight), String(rook._id));
  assert.equal(reverseSend.status, 403);

  const rookSearch = await requestJson('/api/v1/friends/search?q=Knight', {
    token: tokenFor(rook),
  });
  assert.equal(rookSearch.body.players.length, 0);
  const knightSearch = await requestJson('/api/v1/friends/search?q=Rook', {
    token: tokenFor(knight),
  });
  assert.equal(knightSearch.body.players.length, 0);

  const profile = await requestJson(
    `/api/v1/players/profile?playerId=${encodeURIComponent(String(knight._id))}`,
    { token: tokenFor(rook) },
  );
  assert.equal(profile.status, 403);

  const unblocked = await requestJson(`/api/v1/friends/blocks/${rook._id}`, {
    token: tokenFor(knight),
    method: 'DELETE',
  });
  assert.equal(unblocked.status, 200);
  assert.equal(unblocked.body.relationship.status, 'NONE');

  const sendAfterUnblock = await sendRequest(tokenFor(rook), String(knight._id));
  assert.equal(sendAfterUnblock.status, 201);

  // Accept, then block directly. A block is not just a request action: it must
  // remove an existing friendship from both lists.
  const accepted = await acceptRequest(
    tokenFor(knight),
    sendAfterUnblock.body.relationship.requestId,
  );
  assert.equal(accepted.status, 200);
  const directBlock = await requestJson('/api/v1/friends/blocks', {
    token: tokenFor(knight),
    method: 'POST',
    body: { userId: String(rook._id) },
  });
  assert.equal(directBlock.status, 200);

  // Both directions can be blocked independently. The relationship must report
  // both flags, and clearing one direction must not clear the other.
  const reverseBlock = await requestJson('/api/v1/friends/blocks', {
    token: tokenFor(rook),
    method: 'POST',
    body: { userId: String(knight._id) },
  });
  assert.equal(reverseBlock.status, 200);
  const mutualStatus = await requestJson(
    `/api/v1/friends/status/${knight._id}`,
    { token: tokenFor(rook) },
  );
  assert.equal(mutualStatus.body.relationship.status, 'BLOCKED');
  assert.equal(mutualStatus.body.relationship.blockedByMe, true);
  assert.equal(mutualStatus.body.relationship.blockedMe, true);

  const oneWayUnblock = await requestJson(`/api/v1/friends/blocks/${knight._id}`, {
    token: tokenFor(rook),
    method: 'DELETE',
  });
  assert.equal(oneWayUnblock.status, 200);
  assert.equal(oneWayUnblock.body.relationship.status, 'BLOCKED');
  assert.equal(oneWayUnblock.body.relationship.blockedByMe, false);
  assert.equal(oneWayUnblock.body.relationship.blockedMe, true);

  const rookFriends = await requestJson('/api/v1/friends', { token: tokenFor(rook) });
  const knightFriends = await requestJson('/api/v1/friends', { token: tokenFor(knight) });
  assert.equal(rookFriends.body.friends.length, 0);
  assert.equal(knightFriends.body.friends.length, 0);
});

test('deleting an account removes its friend graph without touching unrelated rows', async () => {
  const rook = await createPlayer('ArcadeDevRook');
  const knight = await createPlayer('ArcadeDevKnight');
  const oracle = await createPlayer('ArcadeDevOracle');

  await makeFriends(rook, knight);
  const pending = await sendRequest(tokenFor(rook), String(oracle._id));
  assert.equal(pending.status, 201);

  // This block does not involve the account being deleted, so it must survive.
  const unrelatedBlock = await requestJson('/api/v1/friends/blocks', {
    token: tokenFor(knight),
    method: 'POST',
    body: { userId: String(oracle._id) },
  });
  assert.equal(unrelatedBlock.status, 200);

  const deleted = await requestJson('/api/v1/account', {
    token: tokenFor(rook),
    method: 'DELETE',
    body: { confirmation: 'DELETE' },
  });
  assert.equal(deleted.status, 200);
  assert.equal(await User.countDocuments({ _id: rook._id }), 0);
  assert.equal(await FriendRequest.countDocuments({
    $or: [{ from: rook._id }, { to: rook._id }],
  }), 0);
  assert.equal(await Friendship.countDocuments({
    $or: [{ userA: rook._id }, { userB: rook._id }],
  }), 0);
  assert.equal(await Block.countDocuments({
    $or: [{ blocker: rook._id }, { blocked: rook._id }],
  }), 0);
  assert.equal(await Block.countDocuments({
    blocker: knight._id,
    blocked: oracle._id,
  }), 1);
});

test('search respects privacy and account eligibility, and Friends profiles require friendship', async () => {
  const rook = await createPlayer('ArcadeDevRook');
  const publicPlayer = await createPlayer('SearchPublic');
  const friendsOnly = await createPlayer('SearchFriendsOnly', {
    profileVisibility: PROFILE_VISIBILITY.FRIENDS,
  });
  const noOne = await createPlayer('SearchNoOne', {
    profileVisibility: PROFILE_VISIBILITY.NO_ONE,
  });
  const admin = await createPlayer('SearchAdmin', { role: USER_ROLES.ADMIN });
  const suspended = await createPlayer('SearchSuspended', {
    status: ACCOUNT_STATUSES.SUSPENDED,
  });

  const search = await requestJson('/api/v1/friends/search?q=Search', {
    token: tokenFor(rook),
  });
  assert.equal(search.status, 200);
  assert.deepEqual(search.body.players.map((player) => player.username), ['SearchPublic']);

  const selfSearch = await requestJson('/api/v1/friends/search?q=Rook', {
    token: tokenFor(rook),
  });
  assert.equal(selfSearch.body.players.length, 0);

  const shortSearch = await requestJson('/api/v1/friends/search?q=S', {
    token: tokenFor(rook),
  });
  assert.equal(shortSearch.body.players.length, 0);

  const byId = await requestJson(
    `/api/v1/friends/search?q=${encodeURIComponent(publicPlayer.playerId)}`,
    { token: tokenFor(rook) },
  );
  assert.equal(byId.body.players.length, 1);
  assert.equal(byId.body.players[0].id, String(publicPlayer._id));

  const friendsOnlyProfile = await requestJson(
    `/api/v1/players/profile?playerId=${encodeURIComponent(String(friendsOnly._id))}`,
    { token: tokenFor(rook) },
  );
  assert.equal(friendsOnlyProfile.status, 403);

  await makeFriends(rook, friendsOnly);

  const friendProfile = await requestJson(
    `/api/v1/players/profile?playerId=${encodeURIComponent(String(friendsOnly._id))}`,
    { token: tokenFor(rook) },
  );
  assert.equal(friendProfile.status, 200);
  assert.equal(friendProfile.body.profile.id, String(friendsOnly._id));

  const noOneSend = await sendRequest(tokenFor(rook), String(noOne._id));
  assert.equal(noOneSend.status, 403);

  const noOneProfile = await requestJson(
    `/api/v1/players/profile?playerId=${encodeURIComponent(String(noOne._id))}`,
    { token: tokenFor(rook) },
  );
  assert.equal(noOneProfile.status, 403);

  assert.ok(admin);
  assert.ok(suspended);
});

test('presence is verified from recent authenticated sessions and clears on expiry/revocation', async () => {
  const rook = await createPlayer('ArcadeDevRook');
  const knight = await createPlayer('ArcadeDevKnight');
  await makeFriends(rook, knight);

  const session = await createSessionFor(rook);
  const heartbeat = await requestJson('/api/v1/friends/presence/heartbeat', {
    token: tokenFor(rook),
    method: 'POST',
  });
  assert.equal(heartbeat.status, 200);
  assert.equal(heartbeat.body.online, true);

  const onlineList = await requestJson('/api/v1/friends', { token: tokenFor(knight) });
  assert.equal(onlineList.body.friends.length, 1);
  assert.equal(onlineList.body.friends[0].id, String(rook._id));
  assert.equal(onlineList.body.friends[0].online, true);

  await Session.updateOne(
    { _id: session._id },
    { $set: { lastUsedAt: new Date(Date.now() - 5 * 60 * 1000) } },
  );
  const staleList = await requestJson('/api/v1/friends', { token: tokenFor(knight) });
  assert.equal(staleList.body.friends[0].online, false);

  await Session.updateOne(
    { _id: session._id },
    { $set: { lastUsedAt: new Date(), revokedAt: new Date() } },
  );
  const revokedList = await requestJson('/api/v1/friends', { token: tokenFor(knight) });
  assert.equal(revokedList.body.friends[0].online, false);

  await Session.updateOne(
    { _id: session._id },
    {
      $set: {
        lastUsedAt: new Date(),
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      },
    },
  );
  const expiredList = await requestJson('/api/v1/friends', { token: tokenFor(knight) });
  assert.equal(expiredList.body.friends[0].online, false);

  const unauthenticated = await requestJson('/api/v1/friends/presence/heartbeat', {
    method: 'POST',
  });
  assert.equal(unauthenticated.status, 401);
});
