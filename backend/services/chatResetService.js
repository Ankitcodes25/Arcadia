const mongoose = require('mongoose');
const { Conversation } = require('../models/Conversation');
const { Message } = require('../models/Message');
const { ClearChatRequest } = require('../models/ClearChatRequest');
const { getPairKey, getOrderedPair, toObjectId } = require('../utils/friendship');
const { runInTransactionIfSupported } = require('../utils/mongoTransactions');

/*
 * Chat reset lifecycle.
 *
 * A block ends the friendship but deliberately leaves the conversation stored
 * while the pair are not friends: existing history remains inaccessible because
 * every chat route re-checks the friendship. Marking the conversation here is
 * what makes the next accepted friendship start fresh rather than resume the
 * old thread.
 *
 * On accept, the marked conversation and everything that references it are
 * removed and a new empty conversation is created. Both participants therefore
 * observe the same new conversation id, empty preview, zero unread count and no
 * history. Conversations for unrelated pairs are never touched.
 */

function conversationFilter(first, second) {
  return {
    participantKey: getPairKey(first, second),
    participants: { $all: [first, second] },
  };
}

function buildConversation(first, second) {
  const { userA, userB } = getOrderedPair(first, second);
  return {
    participantKey: getPairKey(first, second),
    participants: [
      new mongoose.Types.ObjectId(userA),
      new mongoose.Types.ObjectId(userB),
    ],
    lastMessage: '',
    lastMessageAt: null,
    lastMessageSenderId: null,
  };
}

/**
 * Marks any existing conversation for this pair so the next accepted
 * friendship discards it. Blocking a pair that never chatted is a no-op.
 */
async function markConversationForReset(firstId, secondId) {
  const first = toObjectId(firstId);
  const second = toObjectId(secondId);
  if (!first || !second) return false;

  const result = await Conversation.updateOne(
    conversationFilter(first, second),
    { $set: { chatResetAt: new Date() } },
  );
  return Boolean(result.matchedCount);
}

/**
 * Replaces a blocked conversation with a brand-new empty one when the pair
 * become friends again. Without a reset marker (for example after a plain
 * "Remove friend") the existing conversation is kept, preserving the previous
 * product behaviour.
 *
 * Returns the ids so callers can compensate if the friendship cannot be
 * completed after the reset has already run.
 */
async function resetConversationForNewFriendship(firstId, secondId) {
  const first = toObjectId(firstId);
  const second = toObjectId(secondId);
  if (!first || !second) {
    return { reset: false, previousConversationId: null, conversationId: null };
  }

  const existing = await Conversation.findOne(conversationFilter(first, second)).lean();
  if (!existing || !existing.chatResetAt) {
    return {
      reset: false,
      previousConversationId: null,
      conversationId: existing ? String(existing._id) : null,
    };
  }

  const created = await runInTransactionIfSupported(async (session) => {
    const options = session ? { session } : {};

    await Message.deleteMany({ conversationId: existing._id }, options);
    await ClearChatRequest.deleteMany({ conversationId: existing._id }, options);
    await Conversation.deleteOne({ _id: existing._id }, options);

    const [conversation] = await Conversation.create(
      [buildConversation(first, second)],
      options,
    );
    return conversation;
  });

  return {
    reset: true,
    previousConversationId: String(existing._id),
    conversationId: created ? String(created._id) : null,
  };
}

/**
 * Compensation for a reset that ran before the friendship could be completed
 * (for example the other account was deleted between the request and accept).
 * The conversation created by the reset is empty by construction.
 */
async function discardFreshConversation(conversationId, firstId, secondId) {
  const id = toObjectId(conversationId);
  const first = toObjectId(firstId);
  const second = toObjectId(secondId);
  if (!id || !first || !second) return false;

  const result = await Conversation.deleteOne({
    _id: id,
    ...conversationFilter(first, second),
    lastMessage: '',
    lastMessageAt: null,
  });
  if (!result.deletedCount) return false;

  await ClearChatRequest.deleteMany({ conversationId: id });
  return true;
}

module.exports = {
  markConversationForReset,
  resetConversationForNewFriendship,
  discardFreshConversation,
};
