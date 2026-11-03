const mongoose = require('mongoose');

const CLEAR_CHAT_REQUEST_STATUSES = Object.freeze({
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  CANCELLED: 'cancelled',
});

// Completed outcomes are retained for 90 days so both participants can see
// what happened after a refresh, logout or offline period. Pending requests
// have no `respondedAt` and are deliberately excluded from expiry.
const CLEAR_CHAT_REQUEST_RETENTION_DAYS = 90;
const CLEAR_CHAT_REQUEST_RETENTION_SECONDS = CLEAR_CHAT_REQUEST_RETENTION_DAYS * 24 * 60 * 60;

/*
 * A request to permanently clear one conversation for both participants.
 *
 * Nothing is deleted when the request is created: the requester has consented
 * by sending it, and the recipient must accept before any message is removed.
 * Rows are kept after they resolve so the outcome survives a refresh, logout or
 * offline period. `requesterAcknowledgedAt` records when the requester has seen
 * that outcome, so a decline is shown once and then stays quiet.
 *
 * The partial unique index allows at most one PENDING request per conversation
 * no matter which participant sends it or how many retries race.
 */
const clearChatRequestSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    requesterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(CLEAR_CHAT_REQUEST_STATUSES),
      default: CLEAR_CHAT_REQUEST_STATUSES.PENDING,
      required: true,
    },
    respondedAt: {
      type: Date,
      default: null,
    },
    requesterAcknowledgedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

clearChatRequestSchema.index(
  { conversationId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: CLEAR_CHAT_REQUEST_STATUSES.PENDING },
    name: 'one_pending_clear_request_per_conversation',
  },
);
// Friends-list dots and the navbar summary look up a viewer's incoming
// pending requests.
clearChatRequestSchema.index({ recipientId: 1, status: 1 });

// TTL cleanup for completed requests. Only rows with a real `respondedAt` date
// are indexed, so a pending request is never removed simply because it is old.
clearChatRequestSchema.index(
  { respondedAt: 1 },
  {
    expireAfterSeconds: CLEAR_CHAT_REQUEST_RETENTION_SECONDS,
    partialFilterExpression: {
      status: {
        $in: [
          CLEAR_CHAT_REQUEST_STATUSES.ACCEPTED,
          CLEAR_CHAT_REQUEST_STATUSES.DECLINED,
          CLEAR_CHAT_REQUEST_STATUSES.CANCELLED,
        ],
      },
      respondedAt: { $type: 'date' },
    },
    name: 'completed_clear_requests_expire',
  },
);

const ClearChatRequest = mongoose.models.ClearChatRequest
  || mongoose.model('ClearChatRequest', clearChatRequestSchema);

module.exports = {
  ClearChatRequest,
  CLEAR_CHAT_REQUEST_STATUSES,
  CLEAR_CHAT_REQUEST_RETENTION_DAYS,
  CLEAR_CHAT_REQUEST_RETENTION_SECONDS,
};
