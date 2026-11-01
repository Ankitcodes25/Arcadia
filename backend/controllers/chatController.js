const chatService = require('../services/chatService');
const chatRealtime = require('../realtime/chatSocket');

function preventResponseCaching(res) {
  res.set('Cache-Control', 'no-store');
}

async function listConversations(req, res, next) {
  preventResponseCaching(res);
  try {
    const result = await chatService.listConversations(req.user.id);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

async function listMessages(req, res, next) {
  preventResponseCaching(res);
  try {
    const result = await chatService.listMessages(req.user.id, req.params.friendId, {
      before: req.query.before,
      limit: req.query.limit,
    });

    return res.json({
      messages: result.messages,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
    });
  } catch (error) {
    return next(error);
  }
}

async function sendMessage(req, res, next) {
  preventResponseCaching(res);
  try {
    const result = await chatService.sendMessage(
      req.user.id,
      req.params.friendId,
      req.body && req.body.text,
      req.body && req.body.clientMessageId,
    );

    if (!result.duplicate) {
      // Socket delivery is best-effort; the persisted row is the source of
      // truth and the API response already carries it.
      try {
        await chatRealtime.deliverMessage(result.message);
      } catch {
        // Do not fail a stored message because a realtime fan-out failed.
      }
    }

    return res.status(result.duplicate ? 200 : 201).json({ message: result.message });
  } catch (error) {
    return next(error);
  }
}

async function markRead(req, res, next) {
  preventResponseCaching(res);
  try {
    const result = await chatService.markConversationRead(req.user.id, req.params.friendId);

    if (result.messageIds.length) {
      chatRealtime.emitReadReceipt({
        readerId: req.user.id,
        senderId: result.senderId,
        messageIds: result.messageIds,
        readAt: result.readAt,
      });
    }

    return res.json({
      conversationId: result.conversationId,
      readAt: result.readAt,
      messageIds: result.messageIds,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listConversations,
  listMessages,
  sendMessage,
  markRead,
};
