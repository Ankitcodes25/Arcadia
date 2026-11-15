const { randomUUID } = require('crypto');
const { User } = require('../models/User');
const friendshipService = require('../services/friendshipService');
const { listOnlineUserIds } = require('../services/presenceService');
const { toSafeUser } = require('../utils/safeUser');

/*
 * Temporary Ludo lobbies.
 *
 * This module deliberately owns no database model and writes nothing. A lobby,
 * its invitations and its chat messages exist only in the Maps below and are
 * destroyed when the host leaves, the last participant disconnects, or the
 * server shuts down. That keeps the pre-game experience completely separate
 * from match history, XP and every persisted chat system.
 */

const LUDO_GAME_NAME = 'Ludo';
const LUDO_COLOURS = Object.freeze(['RED', 'GREEN', 'YELLOW', 'BLUE']);
const LUDO_PLAYER_COUNTS = Object.freeze([2, 3, 4]);
const INVITATION_TTL_MS = 60 * 1000;
const LOBBY_CHAT_MAX_LENGTH = 180;

const lobbies = new Map();
const invitations = new Map();
const invitationTimers = new Map();
const userLobby = new Map();

function isLudoColour(value) {
  return typeof value === 'string' && LUDO_COLOURS.includes(value);
}

function parsePlayerCount(value) {
  const count = Number(value);
  return LUDO_PLAYER_COUNTS.includes(count) ? count : null;
}

function createLobbyError(message) {
  const error = new Error(message);
  error.expose = true;
  return error;
}

function createSeat(colour) {
  return {
    colour,
    type: 'EMPTY',
    playerId: null,
    displayName: null,
    isHost: false,
    avatar: null,
    avatarUrl: null,
  };
}

function occupiedSeatCount(lobby) {
  return lobby.seats.filter((seat) => seat.type !== 'EMPTY').length;
}

function reservedSeatCount(lobby) {
  return lobby.pendingInviteeIds.size;
}

function findSeatByColour(lobby, colour) {
  return lobby.seats.find((seat) => seat.colour === colour) || null;
}

function findPendingInviteForColour(lobby, colour) {
  for (const invite of lobby.pendingInvites.values()) {
    if (invite.colour === colour) return invite;
  }
  return null;
}

function assertSeatIsFree(lobby, colour) {
  const seat = findSeatByColour(lobby, colour);
  if (!seat || seat.type !== 'EMPTY') {
    throw createLobbyError('That seat is already taken.');
  }
  if (findPendingInviteForColour(lobby, colour)) {
    throw createLobbyError('That seat is already reserved by an invitation.');
  }
  return seat;
}

function findSeatByUser(lobby, userId) {
  return lobby.seats.find(
    (seat) => seat.type === 'HUMAN' && seat.playerId === userId,
  ) || null;
}

function serializeLobby(lobby) {
  return {
    id: lobby.id,
    gameName: LUDO_GAME_NAME,
    hostId: lobby.hostId,
    playerCount: lobby.playerCount,
    arcadionPower: lobby.arcadionPower,
    seats: lobby.seats.map((seat) => ({
      colour: seat.colour,
      type: seat.type,
      ...(seat.playerId ? { playerId: seat.playerId } : {}),
      ...(seat.displayName ? { displayName: seat.displayName } : {}),
      ...(seat.isHost ? { isHost: true } : {}),
      ...(seat.avatar ? { avatar: seat.avatar } : {}),
      ...(seat.avatarUrl ? { avatarUrl: seat.avatarUrl } : {}),
    })),
    pendingInviteeIds: [...lobby.pendingInviteeIds],
    pendingInvites: [...lobby.pendingInvites.values()].map((invite) => ({
      inviteeId: invite.inviteeId,
      displayName: invite.displayName,
      colour: invite.colour,
    })),
  };
}

function emitLobbyState(lobby, emitToUser) {
  if (!lobby) return;
  const payload = { lobby: serializeLobby(lobby) };
  for (const userId of lobby.socketsByUser.keys()) {
    emitToUser(userId, 'ludo:lobby-state', payload);
  }
}

function emitToLobby(lobby, event, payload, emitToUser, excludeUserId = null) {
  if (!lobby) return;
  for (const userId of lobby.socketsByUser.keys()) {
    if (userId === excludeUserId) continue;
    emitToUser(userId, event, payload);
  }
}

function addSocket(lobby, userId, socketId) {
  const sockets = lobby.socketsByUser.get(userId) || new Set();
  sockets.add(socketId);
  lobby.socketsByUser.set(userId, sockets);
}

function removeSocket(lobby, userId, socketId) {
  const sockets = lobby.socketsByUser.get(userId);
  if (!sockets) return false;
  sockets.delete(socketId);
  if (sockets.size) return false;
  lobby.socketsByUser.delete(userId);
  return true;
}

function getLobbyForMember(userId, lobbyId) {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) throw createLobbyError('This lobby is no longer available.');
  if (!findSeatByUser(lobby, userId)) {
    throw createLobbyError('You are not part of this lobby.');
  }
  return lobby;
}

function getHostLobby(userId, lobbyId) {
  const lobby = getLobbyForMember(userId, lobbyId);
  if (lobby.hostId !== userId) {
    throw createLobbyError('Only the host can change this lobby.');
  }
  return lobby;
}

async function getUserSummary(userId) {
  const user = await User.findById(userId)
    .select('_id username displayName avatar google')
    .lean();
  if (!user) return null;

  const safe = toSafeUser(user);
  if (!safe || !safe.id) return null;

  return {
    id: safe.id,
    username: safe.username || 'Player',
    displayName: safe.displayName || safe.username || 'Player',
    avatar: safe.avatar,
    avatarUrl: safe.googleAvatarUrl || null,
  };
}

function clearInvitationTimer(inviteId) {
  const timer = invitationTimers.get(inviteId);
  if (timer) clearTimeout(timer);
  invitationTimers.delete(inviteId);
}

function removeInvitation(inviteId) {
  const invitation = invitations.get(inviteId);
  if (!invitation) return null;
  invitations.delete(inviteId);
  clearInvitationTimer(inviteId);

  const lobby = lobbies.get(invitation.lobbyId);
  if (lobby) {
    lobby.pendingInviteeIds.delete(invitation.inviteeId);
    lobby.pendingInvites.delete(invitation.inviteeId);
  }
  return invitation;
}

function expireInvitation(inviteId, emitToUser) {
  const invitation = removeInvitation(inviteId);
  if (!invitation) return;

  emitToUser(invitation.inviteeId, 'ludo:invitation-expired', { inviteId });

  const lobby = lobbies.get(invitation.lobbyId);
  if (lobby) emitLobbyState(lobby, emitToUser);
}

function scheduleInvitationExpiry(inviteId, emitToUser) {
  const timer = setTimeout(() => expireInvitation(inviteId, emitToUser), INVITATION_TTL_MS);
  if (typeof timer.unref === 'function') timer.unref();
  invitationTimers.set(inviteId, timer);
}

function closeLobby(lobby, reason, emitToUser) {
  if (!lobby || lobbies.get(lobby.id) !== lobby) return;

  // Delete first so a concurrent invitation response sees a closed lobby.
  lobbies.delete(lobby.id);

  for (const invitation of [...invitations.values()]) {
    if (invitation.lobbyId !== lobby.id) continue;
    removeInvitation(invitation.id);
    emitToUser(invitation.inviteeId, 'ludo:invitation-expired', {
      inviteId: invitation.id,
    });
  }

  for (const seat of lobby.seats) {
    if (seat.type === 'HUMAN' && seat.playerId) userLobby.delete(seat.playerId);
  }

  emitToLobby(lobby, 'ludo:lobby-closed', { lobbyId: lobby.id, reason }, emitToUser);
  lobby.socketsByUser.clear();
}

function removeGuest(lobby, userId, emitToUser, reason = 'LOBBY_CLOSED') {
  const seat = findSeatByUser(lobby, userId);
  if (!seat) return;

  seat.type = 'EMPTY';
  seat.playerId = null;
  seat.displayName = null;
  seat.isHost = false;
  seat.avatar = null;
  seat.avatarUrl = null;

  lobby.socketsByUser.delete(userId);
  userLobby.delete(userId);

  emitToUser(userId, 'ludo:lobby-closed', {
    lobbyId: lobby.id,
    reason,
  });
  emitLobbyState(lobby, emitToUser);
}

function findActiveInvitationForInvitee(inviteeId) {
  for (const invitation of invitations.values()) {
    if (invitation.inviteeId === inviteeId) return invitation;
  }
  return null;
}

async function handleCreateLobby(socket, payload, emitToUser) {
  const userId = socket.data.userId;
  const playerCount = parsePlayerCount(payload && payload.playerCount);
  const colour = payload && payload.colour;

  if (!playerCount || !isLudoColour(colour)) {
    throw createLobbyError('Choose a valid Ludo lobby configuration.');
  }

  const summary = await getUserSummary(userId);
  if (!summary) throw createLobbyError('Your player profile is unavailable.');

  // Creation is idempotent per host: a reconnect or StrictMode remount asks
  // again, and receives the same live lobby instead of a duplicate.
  const existingId = userLobby.get(userId);
  const existing = existingId ? lobbies.get(existingId) : null;
  if (existing) {
    addSocket(existing, userId, socket.id);
    emitToUser(userId, 'ludo:lobby-state', { lobby: serializeLobby(existing) });
    return;
  }
  if (existingId) userLobby.delete(userId);

  const lobby = {
    id: randomUUID(),
    gameName: LUDO_GAME_NAME,
    hostId: userId,
    playerCount,
    arcadionPower: 'MEDIUM',
    seats: LUDO_COLOURS.map(createSeat),
    pendingInviteeIds: new Set(),
    pendingInvites: new Map(),
    socketsByUser: new Map(),
    createdAt: Date.now(),
  };

  const hostSeat = findSeatByColour(lobby, colour);
  hostSeat.type = 'HUMAN';
  hostSeat.playerId = userId;
  hostSeat.displayName = summary.displayName;
  hostSeat.isHost = true;
  hostSeat.avatar = summary.avatar;
  hostSeat.avatarUrl = summary.avatarUrl;

  lobbies.set(lobby.id, lobby);
  userLobby.set(userId, lobby.id);
  addSocket(lobby, userId, socket.id);

  emitToUser(userId, 'ludo:lobby-state', { lobby: serializeLobby(lobby) });
}

async function handleInvite(socket, payload, emitToUser) {
  const userId = socket.data.userId;
  const lobbyId = payload && payload.lobbyId;
  const friendId = payload && payload.friendId;
  const requestedColour = payload && payload.colour;

  if (typeof friendId !== 'string' || !friendId || friendId === userId) {
    throw createLobbyError('Choose a friend to invite.');
  }
  if (requestedColour !== undefined && !isLudoColour(requestedColour)) {
    throw createLobbyError('Choose a valid seat for this invitation.');
  }

  const lobby = getHostLobby(userId, lobbyId);
  if (occupiedSeatCount(lobby) + reservedSeatCount(lobby) >= lobby.playerCount) {
    throw createLobbyError('This lobby is already full.');
  }
  if (lobby.pendingInviteeIds.has(friendId)) {
    throw createLobbyError('That friend already has a pending invitation.');
  }
  if (userLobby.has(friendId)) {
    throw createLobbyError('That player is already in a lobby.');
  }
  if (findActiveInvitationForInvitee(friendId)) {
    throw createLobbyError('That player already has a pending invitation.');
  }

  // A seat-targeted invitation reserves that exact colour. Older clients that
  // do not supply a colour still get a deterministic free seat.
  let colour = requestedColour;
  if (!colour) {
    const freeSeat = lobby.seats.find(
      (seat) => seat.type === 'EMPTY' && !findPendingInviteForColour(lobby, seat.colour),
    );
    if (!freeSeat) throw createLobbyError('This lobby has no open seat.');
    colour = freeSeat.colour;
  }
  assertSeatIsFree(lobby, colour);

  const [friends, onlineIds] = await Promise.all([
    friendshipService.areFriends(userId, friendId),
    listOnlineUserIds([friendId]),
  ]);
  if (!friends) throw createLobbyError('You can only invite Arcadia friends.');
  if (!onlineIds.has(friendId)) throw createLobbyError('That friend is offline.');

  const [hostSummary, inviteeSummary] = await Promise.all([
    getUserSummary(userId),
    getUserSummary(friendId),
  ]);
  if (!hostSummary || !inviteeSummary) {
    throw createLobbyError('That player is unavailable right now.');
  }

  const inviteId = randomUUID();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();

  const invitation = {
    id: inviteId,
    lobbyId: lobby.id,
    inviterId: userId,
    inviteeId: friendId,
    inviteeName: inviteeSummary.displayName,
    colour,
    expiresAt,
  };

  invitations.set(inviteId, invitation);
  lobby.pendingInviteeIds.add(friendId);
  lobby.pendingInvites.set(friendId, {
    inviteeId: friendId,
    displayName: inviteeSummary.displayName,
    colour,
  });
  scheduleInvitationExpiry(inviteId, emitToUser);

  emitToUser(friendId, 'ludo:invitation', {
    invitation: {
      id: inviteId,
      lobbyId: lobby.id,
      gameName: LUDO_GAME_NAME,
      inviter: {
        id: hostSummary.id,
        displayName: hostSummary.displayName,
        avatar: hostSummary.avatar,
        avatarUrl: hostSummary.avatarUrl,
      },
      expiresAt,
    },
  });

  emitToUser(userId, 'ludo:invitation-sent', {
    invitation: {
      id: inviteId,
      lobbyId: lobby.id,
      inviteeId: friendId,
      inviteeName: inviteeSummary.displayName,
      colour,
      expiresAt,
    },
  });

  emitLobbyState(lobby, emitToUser);
}

async function handleInvitationResponse(socket, payload, emitToUser) {
  const userId = socket.data.userId;
  const inviteId = payload && payload.inviteId;
  const accept = Boolean(payload && payload.accept);

  const invitation = typeof inviteId === 'string' ? invitations.get(inviteId) : null;
  if (!invitation || invitation.inviteeId !== userId) {
    throw createLobbyError('This invitation is no longer available.');
  }

  if (Date.parse(invitation.expiresAt) <= Date.now()) {
    expireInvitation(invitation.id, emitToUser);
    throw createLobbyError('This invitation has expired.');
  }

  const lobby = lobbies.get(invitation.lobbyId);
  if (!lobby) {
    removeInvitation(invitation.id);
    throw createLobbyError('This lobby is no longer available.');
  }

  if (!accept) {
    removeInvitation(invitation.id);
    emitToUser(lobby.hostId, 'ludo:invitation-declined', {
      inviteeId: userId,
      inviteeName: invitation.inviteeName,
    });
    emitLobbyState(lobby, emitToUser);
    return;
  }

  if (userLobby.has(userId)) {
    removeInvitation(invitation.id);
    throw createLobbyError('You are already in a lobby.');
  }

  const seat = findSeatByColour(lobby, invitation.colour);
  if (!seat || seat.type !== 'EMPTY') {
    removeInvitation(invitation.id);
    emitLobbyState(lobby, emitToUser);
    throw createLobbyError('That seat is no longer available.');
  }
  if (occupiedSeatCount(lobby) >= lobby.playerCount) {
    removeInvitation(invitation.id);
    emitLobbyState(lobby, emitToUser);
    throw createLobbyError('This lobby filled up before you could join.');
  }

  const summary = await getUserSummary(userId);
  if (!summary) throw createLobbyError('Your player profile is unavailable.');

  // Re-check after the async profile read so a capacity race cannot overfill
  // and the invited colour has not been taken in the meantime.
  if (occupiedSeatCount(lobby) >= lobby.playerCount || seat.type !== 'EMPTY') {
    removeInvitation(invitation.id);
    emitLobbyState(lobby, emitToUser);
    throw createLobbyError('This lobby filled up before you could join.');
  }

  removeInvitation(invitation.id);

  seat.type = 'HUMAN';
  seat.playerId = userId;
  seat.displayName = summary.displayName;
  seat.isHost = false;
  seat.avatar = summary.avatar;
  seat.avatarUrl = summary.avatarUrl;

  userLobby.set(userId, lobby.id);
  addSocket(lobby, userId, socket.id);

  emitToUser(userId, 'ludo:lobby-joined', { lobby: serializeLobby(lobby) });
  emitToLobby(lobby, 'ludo:player-joined', {
    lobbyId: lobby.id,
    playerName: summary.displayName,
  }, emitToUser);
  emitLobbyState(lobby, emitToUser);
}

function handleConfig(socket, payload, emitToUser) {
  const userId = socket.data.userId;
  const lobby = getHostLobby(userId, payload && payload.lobbyId);
  const playerCount = parsePlayerCount(payload && payload.playerCount);

  if (!playerCount) {
    throw createLobbyError('Choose a valid Ludo lobby configuration.');
  }
  if (playerCount < occupiedSeatCount(lobby) + reservedSeatCount(lobby)) {
    throw createLobbyError('Remove players or pending invitations before lowering the match size.');
  }

  lobby.playerCount = playerCount;
  lobby.arcadionPower = 'MEDIUM';
  emitLobbyState(lobby, emitToUser);
}

function handleBot(socket, payload, emitToUser) {
  const userId = socket.data.userId;
  const lobby = getHostLobby(userId, payload && payload.lobbyId);
  const colour = payload && payload.colour;
  const enabled = Boolean(payload && payload.enabled);

  if (!isLudoColour(colour)) throw createLobbyError('Choose a valid seat.');
  const seat = findSeatByColour(lobby, colour);
  if (!seat) throw createLobbyError('Choose a valid seat.');

  if (enabled) {
    if (seat.type !== 'EMPTY') {
      throw createLobbyError('That seat is already taken.');
    }
    if (findPendingInviteForColour(lobby, colour)) {
      throw createLobbyError('That seat is already reserved by an invitation.');
    }
    if (occupiedSeatCount(lobby) + reservedSeatCount(lobby) >= lobby.playerCount) {
      throw createLobbyError('There is no free seat for another Arcadion bot.');
    }
    seat.type = 'ARCADION';
    seat.playerId = null;
    seat.displayName = 'Arcadion';
    seat.isHost = false;
    seat.avatar = null;
    seat.avatarUrl = null;
  } else {
    if (seat.type !== 'ARCADION') {
      throw createLobbyError('That seat does not hold an Arcadion bot.');
    }
    seat.type = 'EMPTY';
    seat.playerId = null;
    seat.displayName = null;
    seat.isHost = false;
    seat.avatar = null;
    seat.avatarUrl = null;
  }

  emitLobbyState(lobby, emitToUser);
}

function handleColour(socket, payload, emitToUser) {
  const userId = socket.data.userId;
  const lobby = getLobbyForMember(userId, payload && payload.lobbyId);
  const colour = payload && payload.colour;

  if (!isLudoColour(colour)) throw createLobbyError('Choose a valid colour.');

  const current = findSeatByUser(lobby, userId);
  const target = findSeatByColour(lobby, colour);
  if (!current || !target) throw createLobbyError('Choose a valid colour.');
  if (target === current) return;
  if (target.type !== 'EMPTY') {
    throw createLobbyError('That colour is already taken.');
  }
  if (findPendingInviteForColour(lobby, colour)) {
    throw createLobbyError('That colour is reserved by an invitation.');
  }

  const identity = {
    playerId: current.playerId,
    displayName: current.displayName,
    isHost: current.isHost,
    avatar: current.avatar,
    avatarUrl: current.avatarUrl,
  };

  current.type = 'EMPTY';
  current.playerId = null;
  current.displayName = null;
  current.isHost = false;
  current.avatar = null;
  current.avatarUrl = null;

  target.type = 'HUMAN';
  target.playerId = identity.playerId;
  target.displayName = identity.displayName;
  target.isHost = identity.isHost;
  target.avatar = identity.avatar;
  target.avatarUrl = identity.avatarUrl;

  emitLobbyState(lobby, emitToUser);
}

function handleChat(socket, payload, emitToUser) {
  const userId = socket.data.userId;
  const lobby = getLobbyForMember(userId, payload && payload.lobbyId);
  const seat = findSeatByUser(lobby, userId);
  const text = typeof (payload && payload.text) === 'string'
    ? payload.text.trim().slice(0, LOBBY_CHAT_MAX_LENGTH)
    : '';

  if (!text) throw createLobbyError('Write a message before sending.');
  if (!seat) throw createLobbyError('You are not part of this lobby.');

  const message = {
    id: randomUUID(),
    lobbyId: lobby.id,
    senderId: userId,
    senderName: seat.displayName || 'Player',
    colour: seat.colour,
    text,
    createdAt: new Date().toISOString(),
  };

  // One emission per participant room. The client also de-duplicates by id, so
  // multiple tabs never render the same bubble twice.
  for (const memberId of lobby.socketsByUser.keys()) {
    emitToUser(memberId, 'ludo:lobby-chat', { message });
  }
}

function handleLeave(socket, payload, emitToUser) {
  const userId = socket.data.userId;
  const lobbyId = payload && payload.lobbyId;
  const lobby = typeof lobbyId === 'string' ? lobbies.get(lobbyId) : null;
  if (!lobby) return;

  if (lobby.hostId === userId) {
    closeLobby(lobby, 'HOST_LEFT', emitToUser);
    return;
  }

  removeGuest(lobby, userId, emitToUser);
}

function handleRemovePlayer(socket, payload, emitToUser) {
  const userId = socket.data.userId;
  const lobby = getHostLobby(userId, payload && payload.lobbyId);
  const playerId = payload && payload.playerId;
  if (typeof playerId !== 'string' || playerId === userId || !findSeatByUser(lobby, playerId)) {
    throw createLobbyError('Choose a player to remove from this lobby.');
  }

  removeGuest(lobby, playerId, emitToUser, 'REMOVED');
}

function handleDisconnect(socket, emitToUser) {
  const userId = socket.data.userId;
  if (!userId) return;

  const lobbyId = userLobby.get(userId);
  if (!lobbyId) return;

  const lobby = lobbies.get(lobbyId);
  if (!lobby) {
    userLobby.delete(userId);
    return;
  }

  const hasNoMoreSockets = removeSocket(lobby, userId, socket.id);
  if (!hasNoMoreSockets) return;

  if (lobby.hostId === userId) {
    closeLobby(lobby, 'HOST_LEFT', emitToUser);
    return;
  }

  removeGuest(lobby, userId, emitToUser);
}

function emitError(socket, event, message) {
  socket.emit('ludo:error', { event, message });
}

function registerLudoHandlers(socket, { emitToUser }) {
  const handlers = {
    'ludo:lobby-create': handleCreateLobby,
    'ludo:invite': handleInvite,
    'ludo:invitation-response': handleInvitationResponse,
    'ludo:lobby-config': handleConfig,
    'ludo:lobby-bot': handleBot,
    'ludo:lobby-colour': handleColour,
    'ludo:lobby-chat': handleChat,
    'ludo:lobby-leave': handleLeave,
    'ludo:lobby-remove-player': handleRemovePlayer,
  };

  for (const [event, handler] of Object.entries(handlers)) {
    socket.on(event, (payload) => {
      Promise.resolve()
        .then(() => handler(socket, payload, emitToUser))
        .catch((error) => {
          emitError(
            socket,
            event,
            error && error.expose ? error.message : 'The lobby request could not be completed.',
          );
        });
    });
  }

  socket.on('disconnect', () => handleDisconnect(socket, emitToUser));
}

function resetLudoLobbies() {
  for (const timer of invitationTimers.values()) clearTimeout(timer);
  invitationTimers.clear();
  invitations.clear();
  userLobby.clear();
  lobbies.clear();
}

module.exports = {
  LUDO_COLOURS,
  LUDO_PLAYER_COUNTS,
  INVITATION_TTL_MS,
  LOBBY_CHAT_MAX_LENGTH,
  registerLudoHandlers,
  resetLudoLobbies,
};
