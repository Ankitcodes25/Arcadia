const mongoose = require('mongoose');

/** A stable key for one unordered pair of account ids. */
function getPairKey(firstId, secondId) {
  const left = String(firstId);
  const right = String(secondId);
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

/** Returns the pair in canonical (lower id first) order. */
function getOrderedPair(firstId, secondId) {
  const left = String(firstId);
  const right = String(secondId);
  return left < right
    ? { userA: left, userB: right }
    : { userA: right, userB: left };
}

function toObjectId(value) {
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (typeof value !== 'string' || !mongoose.isValidObjectId(value)) return null;
  return new mongoose.Types.ObjectId(value);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  getPairKey,
  getOrderedPair,
  toObjectId,
  escapeRegex,
};
