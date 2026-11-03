const friendshipService = require('../services/friendshipService');
const chatService = require('../services/chatService');
const presenceService = require('../services/presenceService');
const chatRealtime = require('../realtime/chatSocket');

function preventResponseCaching(res) {
  res.set('Cache-Control', 'no-store');
}

/**
 * Best-effort realtime notification. The database row is already committed, so
 * a transport failure must never turn a successful relationship change into an
 * error response.
 */
function notifyRelationshipChanged(reason, userId, otherUserId) {
  try {
    chatRealtime.emitFriendshipChanged({ reason, userId, otherUserId });
  } catch {
    // Best-effort delivery only. Every surface re-reads the database.
  }
}

/**
 * Follow-up work after a friendship ended. The relationship change is already
 * committed, so neither step may fail the request: a pending clear-chat
 * request is cancelled so it cannot leave an unanswerable dot, and both
 * players' open sessions are told to refresh.
 */
async function afterFriendshipEnded(reason, userId, otherUserId) {
  try {
    const cancelled = await chatService.cancelPendingClearRequestsBetween(userId, otherUserId);
    for (const request of cancelled) chatRealtime.emitClearRequestUpdate(request);
  } catch {
    // The request stays pending; it is hidden because the pair are no longer
    // friends, and it is revalidated before any deletion.
  }
  notifyRelationshipChanged(reason, userId, otherUserId);
}

async function listFriends(req, res, next) {
  preventResponseCaching(res);
  try {
    const friends = await friendshipService.listFriends(req.user.id);
    return res.json({ friends });
  } catch (error) {
    return next(error);
  }
}

async function listBlockedUsers(req, res, next) {
  preventResponseCaching(res);
  try {
    const blocked = await friendshipService.listBlockedUsers(req.user.id);
    return res.json({ blocked });
  } catch (error) {
    return next(error);
  }
}

async function listRequests(req, res, next) {
  preventResponseCaching(res);
  try {
    const result = await friendshipService.listRequests(req.user.id);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

async function getSummary(req, res, next) {
  preventResponseCaching(res);
  try {
    // The navbar has one notification surface, so the existing Friends summary
    // carries both actionable friend requests and persisted unread messages.
    const [result, chatSummary] = await Promise.all([
      friendshipService.getRequestSummary(req.user.id),
      // Chat is additive to the existing Friends surface. A transient chat
      // read failure must not hide an actionable friend-request badge.
      chatService.getUnreadSummary(req.user.id).catch(() => ({
        unreadMessageCount: 0,
        incomingClearRequestCount: 0,
      })),
    ]);
    return res.json({
      ...result,
      unreadMessageCount: chatSummary.unreadMessageCount,
      incomingClearRequestCount: chatSummary.incomingClearRequestCount,
    });
  } catch (error) {
    return next(error);
  }
}

async function search(req, res, next) {
  preventResponseCaching(res);
  try {
    const result = await friendshipService.searchPlayers(req.user.id, req.query.q);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

async function getRelationship(req, res, next) {
  preventResponseCaching(res);
  try {
    const relationship = await friendshipService.getRelationship(
      req.user.id,
      req.params.userId,
    );
    return res.json({ relationship });
  } catch (error) {
    return next(error);
  }
}

async function sendRequest(req, res, next) {
  preventResponseCaching(res);
  try {
    const result = await friendshipService.sendRequest(
      req.user.id,
      req.body && req.body.userId,
    );
    return res.status(201).json(result);
  } catch (error) {
    return next(error);
  }
}

async function acceptRequest(req, res, next) {
  preventResponseCaching(res);
  try {
    const result = await friendshipService.acceptRequest(
      req.user.id,
      req.params.requestId,
    );
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

async function rejectRequest(req, res, next) {
  preventResponseCaching(res);
  try {
    const result = await friendshipService.rejectRequest(
      req.user.id,
      req.params.requestId,
    );
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

async function cancelRequest(req, res, next) {
  preventResponseCaching(res);
  try {
    const result = await friendshipService.cancelRequest(
      req.user.id,
      req.params.requestId,
    );
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

async function removeFriend(req, res, next) {
  preventResponseCaching(res);
  try {
    const result = await friendshipService.removeFriend(
      req.user.id,
      req.params.userId,
    );
    await afterFriendshipEnded('removed', req.user.id, req.params.userId);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

async function blockUser(req, res, next) {
  preventResponseCaching(res);
  try {
    const targetId = req.body && req.body.userId;
    const result = await friendshipService.blockUser(req.user.id, targetId);
    await afterFriendshipEnded('blocked', req.user.id, targetId);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

async function blockRequestSender(req, res, next) {
  preventResponseCaching(res);
  try {
    const result = await friendshipService.blockRequestSender(
      req.user.id,
      req.params.requestId,
    );
    await afterFriendshipEnded('blocked', req.user.id, result.userId);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

async function unblockUser(req, res, next) {
  preventResponseCaching(res);
  try {
    const result = await friendshipService.unblockUser(
      req.user.id,
      req.params.userId,
    );
    notifyRelationshipChanged('unblocked', req.user.id, req.params.userId);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

async function heartbeat(req, res, next) {
  preventResponseCaching(res);
  try {
    const now = new Date();
    await presenceService.touchPresence(req.user.id, now);
    return res.json({ online: true, checkedAt: now.toISOString() });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listFriends,
  listBlockedUsers,
  listRequests,
  getSummary,
  search,
  getRelationship,
  sendRequest,
  acceptRequest,
  rejectRequest,
  cancelRequest,
  removeFriend,
  blockUser,
  blockRequestSender,
  unblockUser,
  heartbeat,
};
