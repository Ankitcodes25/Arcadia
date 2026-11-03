const mongoose = require('mongoose');

/*
 * A pending friend request.
 *
 * Only PENDING requests are stored: accepting, rejecting and cancelling all
 * remove the row. `pairKey` is the two account ids in a canonical order, so a
 * unique index makes it impossible for A -> B and B -> A to both be pending at
 * the same time. The sender and recipient are still stored separately because
 * direction is what makes an incoming request different from an outgoing one.
 */
const friendRequestSchema = new mongoose.Schema(
  {
    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    pairKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

friendRequestSchema.index({ to: 1, createdAt: -1 });
friendRequestSchema.index({ from: 1, createdAt: -1 });

const FriendRequest = mongoose.models.FriendRequest
  || mongoose.model('FriendRequest', friendRequestSchema);

module.exports = { FriendRequest };
