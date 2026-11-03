const mongoose = require('mongoose');

/*
 * An accepted friendship.
 *
 * `userA` and `userB` are always stored in the same canonical order (the lower
 * account id first), which lets one compound unique index enforce exactly one
 * friendship per pair regardless of who accepted first.
 */
const friendshipSchema = new mongoose.Schema(
  {
    userA: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    userB: {
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

friendshipSchema.index({ userA: 1, userB: 1 }, { unique: true });

const Friendship = mongoose.models.Friendship
  || mongoose.model('Friendship', friendshipSchema);

module.exports = { Friendship };
