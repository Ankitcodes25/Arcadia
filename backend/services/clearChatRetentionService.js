const {
  ClearChatRequest,
  CLEAR_CHAT_REQUEST_STATUSES,
  CLEAR_CHAT_REQUEST_RETENTION_DAYS,
  CLEAR_CHAT_REQUEST_RETENTION_SECONDS,
} = require('../models/ClearChatRequest');

const COMPLETED_CLEAR_CHAT_REQUEST_STATUSES = Object.freeze([
  CLEAR_CHAT_REQUEST_STATUSES.ACCEPTED,
  CLEAR_CHAT_REQUEST_STATUSES.DECLINED,
  CLEAR_CHAT_REQUEST_STATUSES.CANCELLED,
]);

function getCompletedClearChatRequestCutoff(now = new Date()) {
  return new Date(now.getTime() - (CLEAR_CHAT_REQUEST_RETENTION_SECONDS * 1000));
}

/**
 * Deterministic cleanup used by operational checks and tests. Production also
 * has a MongoDB TTL index on `respondedAt`, so expired completed requests are
 * removed automatically even when this function is never called.
 *
 * Pending requests have no `respondedAt` and are excluded. No conversation or
 * message document is touched.
 */
async function cleanupCompletedClearChatRequests({ now = new Date() } = {}) {
  const cutoff = getCompletedClearChatRequestCutoff(now);
  return ClearChatRequest.deleteMany({
    status: { $in: COMPLETED_CLEAR_CHAT_REQUEST_STATUSES },
    respondedAt: { $type: 'date', $lte: cutoff },
  });
}

module.exports = {
  COMPLETED_CLEAR_CHAT_REQUEST_STATUSES,
  CLEAR_CHAT_REQUEST_RETENTION_DAYS,
  CLEAR_CHAT_REQUEST_RETENTION_SECONDS,
  getCompletedClearChatRequestCutoff,
  cleanupCompletedClearChatRequests,
};
