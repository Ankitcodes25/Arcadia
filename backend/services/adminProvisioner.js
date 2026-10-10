const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { jwtSecret } = require('../config/env');
const { User, USER_ROLES, ACCOUNT_STATUSES } = require('../models/User');
const { Session } = require('../models/Session');
const { OAuthHandoff } = require('../models/OAuthHandoff');
const { PasswordResetToken } = require('../models/PasswordResetToken');
const { RateLimitBucket } = require('../models/RateLimitBucket');
const { AdminMutationLock } = require('../models/AdminMutationLock');
const normalizeEmail = require('../utils/normalizeEmail');
const { toSafeUser } = require('../utils/safeUser');
const {
  MIN_ADMIN_PASSWORD_LENGTH,
  getPasswordValidationError,
} = require('../utils/passwordPolicy');
const { hashPassword } = require('../utils/bcrypt');
const { createUserWithPlayerId } = require('./playerIdService');
const {
  normalizeDisplayName,
  getDisplayNameValidationError,
} = require('../utils/profileValidation');

const ADMIN_MUTATION_LOCK_KEY = 'admin-mutual-exclusion';
const ADMIN_BOOTSTRAP_LOCK_TTL_MS = 60 * 1000;
const USER_RATE_LIMIT_ROUTES = Object.freeze([
  'auth:logout-all:user',
  'account:username:user',
  'account:change-password:user',
  'account:sessions:user',
  'admin:mutation:user',
]);
const EMAIL_RATE_LIMIT_ROUTES = Object.freeze([
  'auth:register:email',
  'auth:login:email',
  'auth:forgot-password:email',
]);
const OWNED_RATE_LIMIT_ROUTES = Object.freeze([
  ...USER_RATE_LIMIT_ROUTES,
  ...EMAIL_RATE_LIMIT_ROUTES,
]);

function createError(message, statusCode, provisioningCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.expose = true;
  error.safeMessage = message;
  if (provisioningCode) {
    error.provisioningCode = provisioningCode;
  }
  return error;
}

function queryWithSession(query, session) {
  return session ? query.session(session) : query;
}

function validateBootstrapInput({ email, password, name }) {
  const normalizedEmail = normalizeEmail(email);
  const passwordError = getPasswordValidationError(password, MIN_ADMIN_PASSWORD_LENGTH);
  const normalizedName = normalizeDisplayName(name);
  const nameError = getDisplayNameValidationError(normalizedName);

  if (!normalizedEmail || !normalizeEmail.isValidEmail(normalizedEmail)) {
    throw createError('A valid admin email is required', 400, 'INVALID_ADMIN_EMAIL');
  }

  if (nameError) {
    throw createError(nameError, 400, 'INVALID_ADMIN_NAME');
  }

  if (passwordError) {
    throw createError(passwordError, 400, 'INVALID_ADMIN_PASSWORD');
  }

  return { normalizedEmail, normalizedName };
}

async function initializeBootstrapModels() {
  await User.init();
  await Session.init();
  await OAuthHandoff.init();
  await PasswordResetToken.init();
  await RateLimitBucket.init();
  await AdminMutationLock.init();
}

function isSameId(left, right) {
  return left && right && String(left) === String(right);
}

function hashOwnedRateLimitKey(route, identifier, windowStart) {
  return crypto
    .createHmac('sha256', jwtSecret)
    .update(`${route}\u0000${identifier}\u0000${windowStart}`, 'utf8')
    .digest('hex');
}

function isOwnedRateLimitBucket(bucket, userId, normalizedEmail) {
  if (!bucket || typeof bucket.keyHash !== 'string' || !Number.isSafeInteger(bucket.windowStart)) {
    return false;
  }

  let identifier;
  if (USER_RATE_LIMIT_ROUTES.includes(bucket.route)) {
    identifier = `user:${userId}`;
  } else if (EMAIL_RATE_LIMIT_ROUTES.includes(bucket.route)) {
    identifier = `email:${normalizedEmail}`;
  } else {
    return false;
  }

  const expected = Buffer.from(
    hashOwnedRateLimitKey(bucket.route, identifier, bucket.windowStart),
    'hex',
  );
  const actual = Buffer.from(bucket.keyHash, 'hex');

  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

async function findOwnedRateLimitBuckets(userId, normalizedEmail, session) {
  const options = session ? { session } : {};
  const candidates = await RateLimitBucket.collection
    .find({ route: { $in: OWNED_RATE_LIMIT_ROUTES } }, options)
    .toArray();

  return candidates.filter((bucket) => isOwnedRateLimitBucket(bucket, userId, normalizedEmail));
}

async function deleteOwnedRateLimitBuckets(buckets, session) {
  if (!buckets.length) {
    return;
  }

  const result = await queryWithSession(
    RateLimitBucket.deleteMany({
      _id: { $in: buckets.map((bucket) => bucket._id) },
      keyHash: { $in: buckets.map((bucket) => bucket.keyHash) },
    }),
    session,
  );

  if (result.deletedCount !== buckets.length) {
    throw createError(
      'Bootstrap security records changed during provisioning',
      409,
      'BOOTSTRAP_RECORD_CONFLICT',
    );
  }
}

async function deleteUserOwnedAuthenticationRecords(userId, normalizedEmail, session) {
  await queryWithSession(OAuthHandoff.deleteMany({ userId }), session);
  await queryWithSession(PasswordResetToken.deleteMany({ userId }), session);
  await queryWithSession(Session.deleteMany({ userId }), session);

  const rateLimitBuckets = await findOwnedRateLimitBuckets(userId, normalizedEmail, session);
  await deleteOwnedRateLimitBuckets(rateLimitBuckets, session);
}

async function readBootstrapState(normalizedEmail, session) {
  const targetUser = await queryWithSession(
    User.findOne({ email: normalizedEmail }).select('-passwordHash'),
    session,
  );
  const adminCount = await queryWithSession(
    User.countDocuments({ role: USER_ROLES.ADMIN }),
    session,
  );

  if (
    targetUser
    && targetUser.role !== USER_ROLES.USER
    && targetUser.role !== USER_ROLES.ADMIN
  ) {
    throw createError(
      'Bootstrap target has an unsupported role',
      409,
      'UNSUPPORTED_BOOTSTRAP_ROLE',
    );
  }

  return { targetUser, adminCount };
}

function buildAdminDocument({ normalizedEmail, normalizedName, passwordHash, adminId }) {
  return {
    _id: adminId,
    email: normalizedEmail,
    name: normalizedName,
    passwordHash,
    role: USER_ROLES.ADMIN,
    status: ACCOUNT_STATUSES.ACTIVE,
  };
}

async function createAdminUser(adminDocument, session) {
  const options = session ? { session } : undefined;
  // The schema default assigns the permanent Player ID; this wrapper also retries
  // if the unique index ever rejects a collision.
  return createUserWithPlayerId(adminDocument, options);
}

async function verifyAdminPostcondition(adminId, normalizedEmail, session) {
  const adminCount = await queryWithSession(
    User.countDocuments({ role: USER_ROLES.ADMIN }),
    session,
  );
  const provisionedAdmin = await queryWithSession(
    User.findOne({
      _id: adminId,
      email: normalizedEmail,
      role: USER_ROLES.ADMIN,
      status: ACCOUNT_STATUSES.ACTIVE,
    }).select('-passwordHash'),
    session,
  );

  if (adminCount !== 1 || !provisionedAdmin) {
    throw createError(
      'Admin bootstrap postcondition failed',
      500,
      'ADMIN_POSTCONDITION_FAILED',
    );
  }

  return { adminCount, user: toSafeUser(provisionedAdmin) };
}

async function isTransactionCapable() {
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  return typeof hello.logicalSessionTimeoutMinutes === 'number'
    && Boolean(hello.setName || hello.msg === 'isdbgrid');
}

async function acquireAdminBootstrapLock(owner) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ADMIN_BOOTSTRAP_LOCK_TTL_MS);

  try {
    const lock = await AdminMutationLock.findOneAndUpdate(
      {
        $or: [
          { expiresAt: { $lte: now } },
          { expiresAt: { $exists: false } },
        ],
      },
      {
        $set: {
          key: ADMIN_MUTATION_LOCK_KEY,
          owner,
          expiresAt,
        },
      },
      {
        upsert: true,
        returnDocument: 'after',
        setDefaultsOnInsert: true,
      },
    );

    return lock?.owner === owner ? lock : null;
  } catch (error) {
    if (error?.code === 11000) {
      return null;
    }
    throw error;
  }
}

async function releaseAdminBootstrapLock(owner) {
  await AdminMutationLock.deleteOne({
    key: ADMIN_MUTATION_LOCK_KEY,
    owner,
  }).catch(() => {});
}

async function provisionAdminTransaction({
  normalizedEmail,
  normalizedName,
  passwordHash,
  adminId,
}) {
  const session = await mongoose.connection.startSession();

  try {
    return await session.withTransaction(async () => {
      const { targetUser, adminCount } = await readBootstrapState(normalizedEmail, session);

      if (targetUser?.role === USER_ROLES.ADMIN) {
        return {
          created: false,
          replacedUser: false,
          user: toSafeUser(targetUser),
          adminCount,
        };
      }

      if (adminCount > 0) {
        throw createError(
          'Another administrator already exists; bootstrap aborted',
          409,
          'ANOTHER_ADMIN_EXISTS',
        );
      }

      if (targetUser) {
        await deleteUserOwnedAuthenticationRecords(
          targetUser._id,
          normalizedEmail,
          session,
        );

        const deletion = await queryWithSession(
          User.deleteOne({
            _id: targetUser._id,
            email: normalizedEmail,
            role: USER_ROLES.USER,
          }),
          session,
        );

        if (deletion.deletedCount !== 1) {
          throw createError(
            'Bootstrap target changed during provisioning',
            409,
            'BOOTSTRAP_TARGET_CHANGED',
          );
        }
      }

      await createAdminUser(
        buildAdminDocument({ normalizedEmail, normalizedName, passwordHash, adminId }),
        session,
      );
      const postcondition = await verifyAdminPostcondition(adminId, normalizedEmail, session);

      return {
        created: true,
        replacedUser: Boolean(targetUser),
        ...postcondition,
      };
    }, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary',
      timeoutMS: 30 * 1000,
    });
  } catch (error) {
    if (!error.provisioningCode) {
      error.safeMessage = 'Transactional admin bootstrap failed; all changes were rolled back';
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

function getStagedBootstrapEmail(userId) {
  return `arcadia-bootstrap-${userId}@invalid.invalid`;
}

async function loadFallbackRecordSnapshot(userId, normalizedEmail) {
  const oauthHandoffs = await OAuthHandoff.collection.find({ userId }).toArray();
  const passwordResetTokens = await PasswordResetToken.collection.find({ userId }).toArray();
  const sessions = await Session.collection.find({ userId }).toArray();
  const rateLimitBuckets = await findOwnedRateLimitBuckets(userId, normalizedEmail);

  return {
    oauthHandoffs,
    passwordResetTokens,
    sessions,
    rateLimitBuckets,
  };
}

async function deleteFallbackRecordSnapshot(snapshot) {
  await OAuthHandoff.collection.deleteMany({
    _id: { $in: snapshot.oauthHandoffs.map((record) => record._id) },
  });
  await PasswordResetToken.collection.deleteMany({
    _id: { $in: snapshot.passwordResetTokens.map((record) => record._id) },
  });
  await Session.collection.deleteMany({
    _id: { $in: snapshot.sessions.map((record) => record._id) },
  });
  await deleteOwnedRateLimitBuckets(snapshot.rateLimitBuckets);
}

async function restoreFallbackRecords(snapshot) {
  const collections = [
    [OAuthHandoff.collection, snapshot.oauthHandoffs],
    [PasswordResetToken.collection, snapshot.passwordResetTokens],
    [snapshot.rateLimitBuckets.length ? RateLimitBucket.collection : null, snapshot.rateLimitBuckets],
    [Session.collection, snapshot.sessions],
  ];

  for (const [collection, records] of collections) {
    if (!collection) continue;
    for (const record of records) {
      await collection.replaceOne({ _id: record._id }, record, { upsert: true });
    }
  }
}

async function verifyFallbackRollback({
  originalUser,
  recordSnapshot,
  adminId,
  normalizedEmail,
  initialAdminCount,
}) {
  const newAdmin = await User.collection.findOne({
    _id: adminId,
    email: normalizedEmail,
    role: USER_ROLES.ADMIN,
  });
  if (newAdmin) {
    throw new Error('New bootstrap administrator still exists after rollback');
  }

  if (originalUser) {
    const restoredUser = await User.collection.findOne({
      _id: originalUser._id,
      email: normalizedEmail,
      role: USER_ROLES.USER,
    });
    if (!restoredUser) {
      throw new Error('Original bootstrap user was not restored');
    }

    const recordCounts = await Promise.all([
      OAuthHandoff.collection.countDocuments({ _id: { $in: recordSnapshot.oauthHandoffs.map((r) => r._id) } }),
      PasswordResetToken.collection.countDocuments({ _id: { $in: recordSnapshot.passwordResetTokens.map((r) => r._id) } }),
      Session.collection.countDocuments({ _id: { $in: recordSnapshot.sessions.map((r) => r._id) } }),
      RateLimitBucket.collection.countDocuments({ _id: { $in: recordSnapshot.rateLimitBuckets.map((r) => r._id) } }),
    ]);
    if (recordCounts.some((count, index) => count !== [
      recordSnapshot.oauthHandoffs.length,
      recordSnapshot.passwordResetTokens.length,
      recordSnapshot.sessions.length,
      recordSnapshot.rateLimitBuckets.length,
    ][index])) {
      throw new Error('Bootstrap authentication records were not fully restored');
    }
  }

  const finalAdminCount = await User.collection.countDocuments({ role: USER_ROLES.ADMIN });
  if (finalAdminCount !== initialAdminCount) {
    throw new Error('Administrator count could not be restored');
  }
}

function createRollbackError(originalError) {
  const error = new Error('Admin bootstrap rollback could not be verified');
  error.name = 'AdminBootstrapRollbackError';
  error.code = 'ROLLBACK_FAILED';
  error.statusCode = 500;
  error.expose = true;
  error.safeMessage = error.message;
  error.cause = originalError;
  return error;
}

async function rollbackFallbackBootstrap({
  originalUser,
  recordSnapshot,
  adminId,
  normalizedEmail,
  initialAdminCount,
}) {
  await User.collection.deleteOne({
    _id: adminId,
    email: normalizedEmail,
    role: USER_ROLES.ADMIN,
  });

  if (originalUser) {
    const conflictingUser = await User.collection.findOne({ email: normalizedEmail });
    if (
      conflictingUser
      && !isSameId(conflictingUser._id, originalUser._id)
      && !isSameId(conflictingUser._id, adminId)
    ) {
      throw new Error('Original bootstrap email became occupied during rollback');
    }

    await User.collection.replaceOne(
      { _id: originalUser._id },
      originalUser,
      { upsert: true },
    );
    await restoreFallbackRecords(recordSnapshot);
  }

  await verifyFallbackRollback({
    originalUser,
    recordSnapshot,
    adminId,
    normalizedEmail,
    initialAdminCount,
  });
}

async function provisionAdminWithFallback({
  normalizedEmail,
  normalizedName,
  passwordHash,
  adminId,
}) {
  const { targetUser, adminCount: initialAdminCount } = await readBootstrapState(normalizedEmail);

  if (targetUser?.role === USER_ROLES.ADMIN) {
    return {
      created: false,
      replacedUser: false,
      user: toSafeUser(targetUser),
      adminCount: initialAdminCount,
    };
  }

  if (initialAdminCount > 0) {
    throw createError(
      'Another administrator already exists; bootstrap aborted',
      409,
      'ANOTHER_ADMIN_EXISTS',
    );
  }

  const adminDocument = buildAdminDocument({
    normalizedEmail,
    normalizedName,
    passwordHash,
    adminId,
  });
  let originalUser = null;
  let recordSnapshot = {
    oauthHandoffs: [],
    passwordResetTokens: [],
    sessions: [],
    rateLimitBuckets: [],
  };
  let newAdminCreated = false;

  try {
    if (targetUser) {
      const stagedEmail = getStagedBootstrapEmail(targetUser._id);
      originalUser = await User.collection.findOneAndUpdate(
        {
          _id: targetUser._id,
          email: normalizedEmail,
          role: USER_ROLES.USER,
        },
        {
          $set: {
            email: stagedEmail,
            status: ACCOUNT_STATUSES.DELETED,
          },
        },
        { returnDocument: 'before' },
      );

      if (!originalUser) {
        throw createError(
          'Bootstrap target changed during provisioning',
          409,
          'BOOTSTRAP_TARGET_CHANGED',
        );
      }

      recordSnapshot = await loadFallbackRecordSnapshot(
        originalUser._id,
        normalizedEmail,
      );
      await deleteFallbackRecordSnapshot(recordSnapshot);
    }

    await createAdminUser(adminDocument);
    newAdminCreated = true;

    if (originalUser) {
      const deletion = await User.collection.deleteOne({
        _id: originalUser._id,
        email: getStagedBootstrapEmail(originalUser._id),
        role: USER_ROLES.USER,
      });
      if (deletion.deletedCount !== 1) {
        throw createError(
          'Bootstrap target changed during provisioning',
          409,
          'BOOTSTRAP_TARGET_CHANGED',
        );
      }
    }

    const postcondition = await verifyAdminPostcondition(adminId, normalizedEmail);
    return {
      created: true,
      replacedUser: Boolean(originalUser),
      ...postcondition,
    };
  } catch (originalError) {
    try {
      await rollbackFallbackBootstrap({
        originalUser,
        recordSnapshot,
        adminId,
        normalizedEmail,
        initialAdminCount,
      });
    } catch {
      throw createRollbackError(originalError);
    }

    originalError.safeMessage = 'Admin bootstrap failed; rollback completed';
    throw originalError;
  }
}

async function provisionAdmin({ email, password, name }) {
  const { normalizedEmail, normalizedName } = validateBootstrapInput({ email, password, name });
  await initializeBootstrapModels();

  const [passwordHash, lockOwner] = [await hashPassword(password), crypto.randomUUID()];
  const lock = await acquireAdminBootstrapLock(lockOwner);

  if (!lock) {
    throw createError(
      'Admin bootstrap is already in progress',
      409,
      'BOOTSTRAP_LOCKED',
    );
  }

  try {
    const adminId = new mongoose.Types.ObjectId();
    const bootstrapInput = {
      normalizedEmail,
      normalizedName,
      passwordHash,
      adminId,
    };

    if (await isTransactionCapable()) {
      return await provisionAdminTransaction(bootstrapInput);
    }

    return await provisionAdminWithFallback(bootstrapInput);
  } finally {
    await releaseAdminBootstrapLock(lockOwner);
  }
}

module.exports = { provisionAdmin };
