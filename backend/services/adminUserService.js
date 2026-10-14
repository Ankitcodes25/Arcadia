const crypto = require('node:crypto');
const mongoose = require('mongoose');
const {
  User,
  USER_ROLES,
  ACCOUNT_STATUSES,
} = require('../models/User');
const { AdminMutationLock } = require('../models/AdminMutationLock');
const { toSafeUser } = require('../utils/safeUser');
const { revokeAllRefreshSessions } = require('./refreshSessionService');
const { revokeAllUserSessions } = require('./userSecurityService');

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_PAGE = 100000;
const ADMIN_LOCK_KEY = 'admin-mutual-exclusion';
const ADMIN_LOCK_TTL_MS = 15 * 1000;
const STATUS_ALIASES = Object.freeze({
  ACTIVE: ACCOUNT_STATUSES.ACTIVE,
  INACTIVE: ACCOUNT_STATUSES.SUSPENDED,
  SUSPENDED: ACCOUNT_STATUSES.SUSPENDED,
});

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.expose = true;
  return error;
}

function assertOnlyKeys(body, allowedKeys) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw createError('Request body must be an object', 400);
  }
  if (Object.keys(body).some((key) => !allowedKeys.includes(key))) {
    throw createError('Request contains unsupported fields', 400);
  }
}

function parsePositiveInteger(value, name, defaultValue, maximum) {
  if (value === undefined) return defaultValue;
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw createError(`${name} must be a positive integer`, 400);
  }

  const text = String(value);
  if (!/^\d+$/.test(text)) {
    throw createError(`${name} must be a positive integer`, 400);
  }

  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw createError(`${name} must be a positive integer`, 400);
  }
  if (name === 'limit') return Math.min(parsed, maximum);
  if (parsed > maximum) throw createError(`${name} exceeds the maximum allowed value`, 400);
  return parsed;
}

function parseUserId(value) {
  if (typeof value !== 'string' || !mongoose.isValidObjectId(value)) {
    throw createError('Invalid user ID', 400);
  }
  return new mongoose.Types.ObjectId(value).toString();
}

function parseStatus(value) {
  if (typeof value !== 'string' || !Object.prototype.hasOwnProperty.call(STATUS_ALIASES, value)) {
    throw createError('Status must be ACTIVE, INACTIVE, or SUSPENDED', 400);
  }
  return STATUS_ALIASES[value];
}

function getUserById(userId) {
  return User.findById(userId).select('-passwordHash -google');
}

async function acquireAdminMutationLock() {
  await AdminMutationLock.init();
  const owner = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ADMIN_LOCK_TTL_MS);
  try {
    const lock = await AdminMutationLock.findOneAndUpdate(
      {
        key: ADMIN_LOCK_KEY,
        $or: [
          { expiresAt: { $lte: now } },
          { expiresAt: { $exists: false } },
        ],
      },
      { $set: { owner, expiresAt } },
      { upsert: true, returnDocument: 'after' },
    );
    return lock && lock.owner === owner ? { owner } : null;
  } catch (error) {
    if (error && error.code === 11000) return null;
    throw error;
  }
}

async function releaseAdminMutationLock(lock) {
  if (!lock) return;
  await AdminMutationLock.deleteOne({ key: ADMIN_LOCK_KEY, owner: lock.owner }).catch(() => {});
}

async function withAdminMutationLock(operation) {
  const lock = await acquireAdminMutationLock();
  if (!lock) {
    throw createError('Another administrator change is in progress; please retry', 409);
  }

  try {
    return await operation();
  } finally {
    await releaseAdminMutationLock(lock);
  }
}

async function assertActingAdmin(actingUserId) {
  const actingUser = await getUserById(actingUserId);
  if (!actingUser) throw createError('Authentication required', 401);
  if (actingUser.role !== USER_ROLES.ADMIN || actingUser.status !== ACCOUNT_STATUSES.ACTIVE) {
    throw createError('Administrator access required', 403);
  }
}

async function listUsers(query = {}) {
  const paginationQuery = query && typeof query === 'object' ? query : {};
  const page = parsePositiveInteger(paginationQuery.page, 'page', DEFAULT_PAGE, MAX_PAGE);
  const limit = parsePositiveInteger(paginationQuery.limit, 'limit', DEFAULT_LIMIT, MAX_LIMIT);
  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    User.find({})
      .select('-passwordHash -google')
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit),
    User.countDocuments({}),
  ]);

  return {
    users: users.map(toSafeUser),
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
}

async function getUserDetails(userId) {
  const normalizedId = parseUserId(userId);
  const user = await getUserById(normalizedId);
  if (!user) throw createError('User not found', 404);
  return toSafeUser(user);
}

async function updateUserStatus({ userId, status, actingUserId, body }) {
  assertOnlyKeys(body, ['status']);
  const normalizedId = parseUserId(userId);
  const normalizedStatus = parseStatus(status);
  const normalizedActingUserId = parseUserId(actingUserId);

  if (normalizedStatus === ACCOUNT_STATUSES.SUSPENDED && normalizedId === normalizedActingUserId) {
    throw createError('An administrator cannot deactivate their own account', 403);
  }

  return withAdminMutationLock(async () => {
    await assertActingAdmin(normalizedActingUserId);
    const currentUser = await getUserById(normalizedId);
    if (!currentUser) throw createError('User not found', 404);
    if (currentUser.status === ACCOUNT_STATUSES.DELETED) {
      throw createError('Deleted accounts cannot be status-managed', 400);
    }
    if (currentUser.status === normalizedStatus) return toSafeUser(currentUser);

    if (
      currentUser.role === USER_ROLES.ADMIN
      && currentUser.status === ACCOUNT_STATUSES.ACTIVE
      && normalizedStatus !== ACCOUNT_STATUSES.ACTIVE
    ) {
      const activeAdminCount = await User.countDocuments({
        role: USER_ROLES.ADMIN,
        status: ACCOUNT_STATUSES.ACTIVE,
      });
      if (activeAdminCount <= 1) {
        throw createError('The last active administrator cannot be deactivated', 400);
      }
    }

    const updatedUser = await User.findOneAndUpdate(
      { _id: normalizedId, status: currentUser.status },
      { $set: { status: normalizedStatus }, $inc: { tokenVersion: 1 } },
      { returnDocument: 'after' },
    ).select('-passwordHash -google');

    if (!updatedUser) throw createError('User changed concurrently; please retry', 409);
    await revokeAllRefreshSessions(normalizedId);
    return toSafeUser(updatedUser);
  });
}

async function updateUserRole({ userId, role, actingUserId, body }) {
  assertOnlyKeys(body, ['role']);
  const normalizedId = parseUserId(userId);
  const normalizedActingUserId = parseUserId(actingUserId);

  if (role !== USER_ROLES.USER && role !== USER_ROLES.ADMIN) {
    throw createError('Role must be USER or ADMIN', 400);
  }
  if (normalizedId === normalizedActingUserId) {
    throw createError('An administrator cannot change their own role', 403);
  }

  return withAdminMutationLock(async () => {
    await assertActingAdmin(normalizedActingUserId);
    const currentUser = await getUserById(normalizedId);
    if (!currentUser) throw createError('User not found', 404);
    if (currentUser.status === ACCOUNT_STATUSES.DELETED) {
      throw createError('Deleted accounts cannot be role-managed', 400);
    }
    if (currentUser.role === role) return toSafeUser(currentUser);

    if (
      currentUser.role === USER_ROLES.ADMIN
      && currentUser.status === ACCOUNT_STATUSES.ACTIVE
      && role === USER_ROLES.USER
    ) {
      const activeAdminCount = await User.countDocuments({
        role: USER_ROLES.ADMIN,
        status: ACCOUNT_STATUSES.ACTIVE,
      });
      if (activeAdminCount <= 1) {
        throw createError('The last active administrator cannot be demoted', 400);
      }
    }

    const updatedUser = await User.findOneAndUpdate(
      { _id: normalizedId, role: currentUser.role },
      { $set: { role }, $inc: { tokenVersion: 1 } },
      { returnDocument: 'after' },
    ).select('-passwordHash -google');

    if (!updatedUser) throw createError('User changed concurrently; please retry', 409);
    await revokeAllRefreshSessions(normalizedId);
    return toSafeUser(updatedUser);
  });
}

async function logoutAllUserSessions({ userId, actingUserId }) {
  const normalizedId = parseUserId(userId);
  const normalizedActingUserId = parseUserId(actingUserId);
  await assertActingAdmin(normalizedActingUserId);
  const user = await revokeAllUserSessions(normalizedId);
  if (!user) throw createError('User not found', 404);
  return toSafeUser(user);
}

module.exports = {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_PAGE,
  ADMIN_LOCK_KEY,
  ADMIN_LOCK_TTL_MS,
  parsePositiveInteger,
  listUsers,
  getUserDetails,
  updateUserStatus,
  updateUserRole,
  logoutAllUserSessions,
};
