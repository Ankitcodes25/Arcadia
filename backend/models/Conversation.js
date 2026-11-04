const mongoose = require('mongoose');

/*
 * One private conversation between exactly two accounts.
 *
 * `participantKey` is the same canonical pair key used by friendships, so the
 * unique index enforces one conversation per account pair no matter who writes
 * first. Message bodies are deliberately NOT embedded here: the last-message
 * preview is a denormalised convenience, while the full history lives in the
 * Message collection and can grow without a document-size ceiling.
 */
const conversationSchema = new mongoose.Schema(
  {
    participants: {
      type: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      }],
      required: true,
      validate: {
        validator: (value) => Array.isArray(value) && value.length === 2,
        message: 'A conversation must have exactly two participants',
      },
    },
    participantKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    lastMessage: {
      type: String,
      default: '',
      maxlength: 2000,
    },
    lastMessageAt: {
      type: Date,
      default: null,
      index: true,
    },
    lastMessageSenderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Set when a block ends an existing friendship. The stored history stays
    // readable to nobody while the pair are not friends, and is discarded when
    // a new friendship is accepted so the pair can never resume the old chat.
    chatResetAt: {
      type: Date,
      default: null,
    },
    // Per-participant "clear only my side" cutoff, keyed by account id. A
    // participant never sees a message created at or before their own cutoff;
    // the other participant's history is untouched. Bounded to two keys.
    clearedAt: {
      type: Map,
      of: Date,
      default: () => new Map(),
    },
    // Short lease held while a mutual clear deletes this conversation's
    // messages. New sends are refused while it is in the future, so a message
    // cannot be half-included in the deletion.
    clearLockUntil: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

conversationSchema.index({ participants: 1, lastMessageAt: -1 });

const Conversation = mongoose.models.Conversation
  || mongoose.model('Conversation', conversationSchema);

module.exports = { Conversation };
