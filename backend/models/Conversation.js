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
