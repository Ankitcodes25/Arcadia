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
      conversationId: result.conversationId,
      messages: result.messages,
      hasMessages: result.hasMessages,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
      clearedAt: result.clearedAt,
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

// Realtime fan-out never fails a write that is already persisted: the
// database is the source of truth and every client re-reads it on reconnect.
function emitSafely(emit) {
  try {
    emit();
  } catch {
    // Best-effort delivery only.
  }
}

async function getClearState(req, res, next) {
  preventResponseCaching(res);
  try {
    const result = await chatService.getClearState(req.user.id, req.params.friendId);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

async function clearChat(req, res, next) {
  preventResponseCaching(res);
  try {
    const scope = req.body && req.body.scope;
    if (scope === chatService.CLEAR_SCOPES.ME) {
      const result = await chatService.clearForMe(req.user.id, req.params.friendId);
      emitSafely(() => chatRealtime.emitChatCleared({
        scope: result.scope,
        userId: req.user.id,
        friendId: req.params.friendId,
        clearedAt: result.clearedAt,
      }));
      return res.json(result);
    }

    if (scope === chatService.CLEAR_SCOPES.BOTH) {
      // Nothing is deleted here. The recipient must accept first.
      const result = await chatService.createClearRequest(req.user.id, req.params.friendId);
      emitSafely(() => chatRealtime.emitClearRequestUpdate(result.request));
      return res.status(201).json(result);
    }

    return res.status(400).json({ error: 'Clear scope must be "me" or "both"' });
  } catch (error) {
    return next(error);
  }
}

async function acceptClearRequest(req, res, next) {
  preventResponseCaching(res);
  try {
    const result = await chatService.acceptClearRequest(req.user.id, req.params.requestId);
    emitSafely(() => chatRealtime.emitClearRequestUpdate(result.request));
    emitSafely(() => chatRealtime.emitChatCleared({
      scope: chatService.CLEAR_SCOPES.BOTH,
      userId: result.request.recipientId,
      friendId: result.request.requesterId,
    }));
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

async function declineClearRequest(req, res, next) {
  preventResponseCaching(res);
  try {
    const result = await chatService.declineClearRequest(req.user.id, req.params.requestId);
    emitSafely(() => chatRealtime.emitClearRequestUpdate(result.request));
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

async function cancelClearRequest(req, res, next) {
  preventResponseCaching(res);
  try {
    const result = await chatService.cancelClearRequest(req.user.id, req.params.requestId);
    emitSafely(() => chatRealtime.emitClearRequestUpdate(result.request));
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

async function acknowledgeClearRequest(req, res, next) {
  preventResponseCaching(res);
  try {
    const result = await chatService.acknowledgeClearRequest(req.user.id, req.params.requestId);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listConversations,
  listMessages,
  sendMessage,
  markRead,
  getClearState,
  clearChat,
  acceptClearRequest,
  declineClearRequest,
  cancelClearRequest,
  acknowledgeClearRequest,
};
