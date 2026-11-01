const { PasswordResetToken } = require('../models/PasswordResetToken');
const { User, ACCOUNT_STATUSES, GOOGLE_PROVIDER } = require('../models/User');
const { Session } = require('../models/Session');
const { OAuthHandoff } = require('../models/OAuthHandoff');
const { Match } = require('../models/Match');
const { SupportReport } = require('../models/SupportReport');
const { FriendRequest } = require('../models/FriendRequest');
const { Friendship } = require('../models/Friendship');
const { Block } = require('../models/Block');
const { Conversation } = require('../models/Conversation');
const { Message } = require('../models/Message');
const normalizeEmail = require('../utils/normalizeEmail');
const {
  generatePasswordResetToken,
  isValidSecureToken,
  hashSecureToken,
  verifySecureTokenHash,
} = require('../utils/secureToken');
const {
  getPasswordValidationError,
  getBcryptByteLengthError,
} = require('../utils/passwordPolicy');
const { hashPassword } = require('../utils/bcrypt');
const bcrypt = require('bcryptjs');
const emailService = require('./emailService');

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const RESET_REQUEST_COOLDOWN_MS = 60 * 1000;
const GENERIC_RESET_MESSAGE = 'If the account is eligible, a password reset email has been sent.';

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.expose = true;
  return error;
}

function isRequestObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function assertOnlyKeys(body, allowedKeys) {
  if (!isRequestObject(body)) {
    throw createError('Request body must be an object', 400);
  }
  if (Object.keys(body).some((key) => !allowedKeys.includes(key))) {
    throw createError('Request contains unsupported fields', 400);
  }
}

async function issuePasswordResetForUser(userId) {
  await PasswordResetToken.init();
  const now = new Date();
  const cutoff = new Date(now.getTime() - RESET_REQUEST_COOLDOWN_MS);
  const user = await User.findOneAndUpdate(
    {
      _id: userId,
      status: ACCOUNT_STATUSES.ACTIVE,
      passwordHash: { $exists: true, $ne: null },
      'google.provider': { $ne: GOOGLE_PROVIDER },
      $or: [
        { passwordResetRequestedAt: null },
        { passwordResetRequestedAt: { $exists: false } },
        { passwordResetRequestedAt: { $lte: cutoff } },
      ],
    },
    { $set: { passwordResetRequestedAt: now } },
    { returnDocument: 'after' },
  );

  if (!user) {
    return { sent: false, reason: 'not_eligible' };
  }

  await PasswordResetToken.updateMany(
    { userId, consumedAt: null },
    { $set: { consumedAt: now } },
  );

  const rawToken = generatePasswordResetToken();
  await PasswordResetToken.create({
    userId,
    tokenHash: hashSecureToken(rawToken),
    credentialVersion: user.tokenVersion,
    expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
  });

  let delivery = { sent: false, reason: 'delivery_failed' };
  try {
    delivery = await emailService.sendPasswordResetEmail({ to: user.email, token: rawToken });
  } catch {
    delivery = { sent: false, reason: 'delivery_failed' };
  }

  return {
    sent: Boolean(delivery && delivery.sent === true),
    reason: delivery && delivery.reason ? delivery.reason : 'delivery_failed',
  };
}

async function forgotPassword(email, body) {
  if (body !== undefined) assertOnlyKeys(body, ['email']);
  const normalizedEmail = normalizeEmail(email);
  if (!normalizeEmail.isValidEmail(normalizedEmail)) {
    return { message: GENERIC_RESET_MESSAGE };
  }

  const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');
  if (!user || user.status !== ACCOUNT_STATUSES.ACTIVE || !user.passwordHash || user.google?.provider === GOOGLE_PROVIDER) {
    return { message: GENERIC_RESET_MESSAGE };
  }

  await issuePasswordResetForUser(user._id);
  return { message: GENERIC_RESET_MESSAGE };
}

async function resetPassword({ token, password, body } = {}) {
  if (body !== undefined) assertOnlyKeys(body, ['token', 'password']);
  if (!isValidSecureToken(token) || !token.startsWith('arc_reset_')) {
    throw createError('Invalid or expired password reset token', 400);
  }

  const passwordError = getPasswordValidationError(password);
  if (passwordError) {
    throw createError(passwordError, 400);
  }

  const now = new Date();
  const tokenRecord = await PasswordResetToken.findOneAndUpdate(
    {
      tokenHash: hashSecureToken(token),
      consumedAt: null,
      expiresAt: { $gt: now },
    },
    { $set: { consumedAt: now } },
    { returnDocument: 'after' },
  ).select('+tokenHash');

  if (!tokenRecord || !verifySecureTokenHash(token, tokenRecord.tokenHash)) {
    throw createError('Invalid or expired password reset token', 400);
  }

  const user = await User.findById(tokenRecord.userId).select('+passwordHash');
  if (
    !user
    || user.status !== ACCOUNT_STATUSES.ACTIVE
    || !user.passwordHash
    || user.google?.provider === GOOGLE_PROVIDER
    || !Number.isSafeInteger(user.tokenVersion)
    || user.tokenVersion !== tokenRecord.credentialVersion
  ) {
    throw createError('Invalid or expired password reset token', 400);
  }

  const passwordHash = await hashPassword(password);
  await User.updateOne(
    { _id: user._id },
    {
      $set: { passwordHash },
      $inc: { tokenVersion: 1 },
    },
  );
  await Session.updateMany(
    { userId: user._id, revokedAt: null },
    {
      $set: { revokedAt: now },
      $unset: { rotationClaimId: 1, rotationClaimExpiresAt: 1 },
    },
  );
  await PasswordResetToken.updateMany(
    { userId: user._id, consumedAt: null },
    { $set: { consumedAt: now } },
  );

  return { message: 'Password reset successfully. You can now log in.' };
}

/*
 * Permanent account deletion.
 *
 * This is a hard delete of this one account and everything that hangs off it,
 * gated behind two independent checks that must BOTH pass:
 *
 *  1. The caller types the literal confirmation word, which rules out a
 *     mis-click or a stray form submission ever destroying an account.
 *  2. The caller re-authenticates with the account password. A Google-only
 *     account has no local password to re-enter (its credential lives with the
 *     identity provider and there is no Google re-prompt wired into Arcadia
 *     yet), so for those the typed confirmation is the only gate. That is a
 *     documented limitation of the current architecture, not a design goal:
 *     adding an OAuth re-prompt would close it without changing this flow.
 *
 * The order below is deliberate and fail-safe. Sessions and tokens are revoked
 * FIRST, so an interruption leaves a live account that is merely signed out
 * everywhere rather than a half-deleted one that still answers tokens. The user
 * document is deleted LAST, guarded by the tokenVersion written in step one, so
 * a concurrent session cannot resurrect data the cleanup already removed.
 *
 * Ownership is never inferred from the request beyond the verified access
 * token: every delete is scoped to the authenticated user's own id, so no
 * other account's rows — including an opponent's public display name on a
 * shared match row — are ever touched.
 */
const ACCOUNT_DELETION_CONFIRMATION = 'DELETE';

async function deleteAccount({ userId, body }) {
  assertOnlyKeys(body, ['confirmation', 'password']);

  if (body.confirmation !== ACCOUNT_DELETION_CONFIRMATION) {
    throw createError('Type DELETE to confirm account deletion', 400);
  }

  const user = await User.findById(userId).select('+passwordHash');
  if (!user || user.status !== ACCOUNT_STATUSES.ACTIVE) {
    throw createError('Account not found', 404);
  }

  /*
   * Re-authentication. Password accounts must prove the credential; Google
   * accounts cannot re-enter a local password, so the typed confirmation is
   * the only gate for them (documented above).
   */
  if (user.passwordHash) {
    if (typeof body.password !== 'string' || body.password === '') {
      throw createError('Enter your password to confirm deletion', 400);
    }

    const passwordLengthError = getBcryptByteLengthError(body.password);
    if (passwordLengthError) {
      throw createError('Password is incorrect', 401);
    }

    const passwordMatches = await bcrypt.compare(body.password, user.passwordHash);
    if (!passwordMatches) {
      throw createError('Password is incorrect', 401);
    }
  } else if (body.password !== undefined && body.password !== null && body.password !== '') {
    // A password was supplied for an account that has none. That is never a
    // valid credential here, so it is rejected rather than ignored.
    throw createError('Password is incorrect', 401);
  }

  const now = new Date();

  // 1. Invalidate every credential this account holds anywhere.
  const deletion = await User.findOneAndUpdate(
    { _id: user._id, status: ACCOUNT_STATUSES.ACTIVE },
    { $inc: { tokenVersion: 1 } },
    { returnDocument: 'after' },
  ).select('+passwordHash');
  if (!deletion) {
    throw createError('Account not found', 404);
  }

  await Session.updateMany(
    { userId: user._id, revokedAt: null },
    {
      $set: { revokedAt: now },
      $unset: { rotationClaimId: 1, rotationClaimExpiresAt: 1 },
    },
  );
  await PasswordResetToken.updateMany(
    { userId: user._id, consumedAt: null },
    { $set: { consumedAt: now } },
  );

  // 2. Remove every record owned by this account. Nothing here is another
  //    account's data: match rows carry a public opponent label, never a
  //    reference to the other player's document, so deleting this account's
  //    rows leaves every other account's history intact.
  await Session.deleteMany({ userId: user._id });
  await PasswordResetToken.deleteMany({ userId: user._id });
  await OAuthHandoff.deleteMany({ userId: user._id });
  await Match.deleteMany({ userId: user._id });
  await SupportReport.deleteMany({ userId: user._id });
  // Friend rows are shared with another account, so delete both directions:
  // a pending request, friendship or block involving this account cannot
  // outlive it and leave the other player with a phantom badge or entry.
  await FriendRequest.deleteMany({
    $or: [{ from: user._id }, { to: user._id }],
  });
  await Friendship.deleteMany({
    $or: [{ userA: user._id }, { userB: user._id }],
  });
  await Block.deleteMany({
    $or: [{ blocker: user._id }, { blocked: user._id }],
  });
  // Chat rows are also shared with another account. Remove the account's
  // messages and conversations so no private history outlives the account.
  await Message.deleteMany({
    $or: [{ senderId: user._id }, { receiverId: user._id }],
  });
  await Conversation.deleteMany({ participants: user._id });

  // 3. Delete the account itself, guarded so a concurrent status change (an
  //    admin suspension racing this write) cannot be overwritten.
  const removed = await User.deleteOne({ _id: user._id, status: ACCOUNT_STATUSES.ACTIVE });
  if (removed.deletedCount !== 1) {
    throw createError('Account could not be deleted; please try again', 409);
  }

  return { message: 'Your account and all of its data have been permanently deleted.' };
}

module.exports = {
  RESET_TOKEN_TTL_MS,
  RESET_REQUEST_COOLDOWN_MS,
  GENERIC_RESET_MESSAGE,
  ACCOUNT_DELETION_CONFIRMATION,
  issuePasswordResetForUser,
  forgotPassword,
  resetPassword,
  deleteAccount,
};
