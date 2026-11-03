const mongoose = require('mongoose');

const MESSAGE_STATUSES = Object.freeze({
  SENT: 'SENT',
  DELIVERED: 'DELIVERED',
  READ: 'READ',
});

const MAX_MESSAGE_LENGTH = 2000;

/*
 * A single persisted chat message.
 *
 * Messages are separate documents rather than an array on the conversation so
 * history is unbounded and pagination can use an index. `clientMessageId` is an
 * optional idempotency key supplied by the sender: a retry of the same send
 * returns the already-stored row instead of creating a second message.
 *
 * Status only moves forward: SENT -> DELIVERED -> READ. Each transition also
 * stores its own timestamp so the UI never has to infer a state from presence.
 */
const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: MAX_MESSAGE_LENGTH,
    },
    clientMessageId: {
      type: String,
      default: null,
      trim: true,
      maxlength: 100,
    },
    status: {
      type: String,
      enum: Object.values(MESSAGE_STATUSES),
      default: MESSAGE_STATUSES.SENT,
      required: true,
    },
    sentAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

// Newest-first history reads and cursor pagination.
messageSchema.index({ conversationId: 1, createdAt: -1, _id: -1 });
// Unread counts and read-receipt updates are always scoped to the receiver.
messageSchema.index({ conversationId: 1, receiverId: 1, readAt: 1 });
// Pending messages are found by recipient, state and age when a socket
// authenticates after an offline period.
messageSchema.index({ receiverId: 1, status: 1, createdAt: 1 });
// A sender can retry a send safely. Only rows that actually supplied a key are
// included, so legacy/optional-key messages are not blocked by the index.
messageSchema.index(
  { senderId: 1, clientMessageId: 1 },
  {
    unique: true,
    partialFilterExpression: { clientMessageId: { $type: 'string' } },
  },
);

const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

module.exports = { Message, MESSAGE_STATUSES, MAX_MESSAGE_LENGTH };
