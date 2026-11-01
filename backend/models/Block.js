const mongoose = require('mongoose');

/*
 * A directed block.
 *
 * Blocks are directional: A blocking B does not imply B blocked A. Every
 * relationship lookup therefore checks both directions. The compound unique
 * index prevents a duplicate block of the same player by the same account.
 */
const blockSchema = new mongoose.Schema(
  {
    blocker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    blocked: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

blockSchema.index({ blocker: 1, blocked: 1 }, { unique: true });

const Block = mongoose.models.Block || mongoose.model('Block', blockSchema);

module.exports = { Block };
