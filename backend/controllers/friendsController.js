const friendshipService = require('../services/friendshipService');
const presenceService = require('../services/presenceService');

function preventResponseCaching(res) {
  res.set('Cache-Control', 'no-store');
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
    const result = await friendshipService.getRequestSummary(req.user.id);
    return res.json(result);
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

async function blockUser(req, res, next) {
  preventResponseCaching(res);
  try {
    const result = await friendshipService.blockUser(
      req.user.id,
      req.body && req.body.userId,
    );
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
  listRequests,
  getSummary,
  search,
  getRelationship,
  sendRequest,
  acceptRequest,
  rejectRequest,
  cancelRequest,
  blockUser,
  blockRequestSender,
  unblockUser,
  heartbeat,
};
