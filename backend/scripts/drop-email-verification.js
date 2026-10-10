/*
 * Remove the retired email-verification state from an existing database.
 *
 * Arcadia no longer verifies email addresses: a signup is complete the moment
 * the account is created, so nothing reads `emailVerified`,
 * `verificationEmailRequestedAt` or the `emailverificationtokens` collection
 * any more. This script only clears those leftovers so the stored documents
 * match the schema that is in use.
 *
 * Run it once against an existing database, from the backend directory:
 *
 *   npm run migrate:drop-email-verification
 *
 * The script is idempotent. Every write is a `$unset` of fields that are only
 * removed when they are still present, and the collection drop is skipped when
 * the collection is already gone, so running it twice is a no-op. It never
 * touches any other field: progression, identity, credentials, sessions and
 * matches are outside its scope by design. Existing accounts do not need this
 * script to sign in — login never consulted the verification state — but
 * running it keeps the data clean.
 */
const FAILURE_CATEGORY = {
  CONFIG: 'environment/configuration problem',
  CONNECTION: 'MongoDB connection problem',
  RUNTIME: 'other runtime exception',
};

/*
 * Only these messages are ever shown. They are the safe configuration messages
 * `config/env.js` produces, and none of them contains a host, a database name or
 * a credential. Every other failure, including a driver or server error whose
 * text may embed the connection string, is reported by category only.
 */
const SAFE_CONFIG_MESSAGES = new Set([
  'MONGODB_URI is required',
  'MONGODB_URI must be a valid mongodb:// or mongodb+srv:// URI',
  'MONGODB_URI contains invalid characters',
  'MONGODB_URI must include a database name',
  'MONGODB_URI must enable TLS in production',
  'JWT_SECRET is required',
  'JWT_SECRET must be at least 32 characters',
  'JWT_SECRET must be a high-entropy production secret',
  'NODE_ENV must be development, test, or production',
  'FRONTEND_URL or CORS_ORIGIN is required in production',
  'FRONTEND_URL/CORS_ORIGIN cannot use a wildcard or null origin',
  'COOKIE_SAME_SITE must be lax, strict, or none',
  'COOKIE_SAME_SITE=none is only allowed in production',
  'TRUST_PROXY must be false, a hop count, or explicit proxy addresses',
]);

const NETWORK_ERROR_NAMES = new Set([
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoParseError',
  'MongoServerSelectionError',
  'MongooseServerSelectionError',
  'MongoServerError',
  'MongooseError',
]);

function getSafeErrorMessage(error) {
  if (typeof error?.safeMessage === 'string' && SAFE_CONFIG_MESSAGES.has(error.safeMessage)) {
    return error.safeMessage;
  }

  if (typeof error?.message === 'string' && SAFE_CONFIG_MESSAGES.has(error.message)) {
    return error.message;
  }

  return null;
}

function printSafeFailure(error) {
  const safeMessage = getSafeErrorMessage(error);
  const category = safeMessage
    ? FAILURE_CATEGORY.CONFIG
    : NETWORK_ERROR_NAMES.has(error?.name)
      ? FAILURE_CATEGORY.CONNECTION
      : FAILURE_CATEGORY.RUNTIME;

  console.error('Email-verification cleanup failed.');
  console.error(`Category: ${category}`);
  if (safeMessage) {
    console.error(`Safe details: ${safeMessage}`);
  } else {
    // The raw message is withheld because a driver error can embed the
    // connection string, which must never reach the terminal.
    console.error('Safe details: raw error message withheld because it is not allowlisted.');
  }
}

async function collectionExists(db, name) {
  const collections = await db.listCollections({ name }).toArray();
  return collections.length > 0;
}

async function dropEmailVerificationState() {
  const { User } = require('../models/User');

  // The raw driver collection is used because the fields are no longer part of
  // the Mongoose schema, so a cast through the model would drop them from the
  // update instead of removing them from the stored documents.
  const users = await User.collection.updateMany(
    { $or: [{ emailVerified: { $exists: true } }, { verificationEmailRequestedAt: { $exists: true } }] },
    { $unset: { emailVerified: 1, verificationEmailRequestedAt: 1 } },
  );

  // `Model.db` is the Mongoose connection, whose `listCollections()` helper
  // returns a Promise listing *every* collection and ignores any filter. The
  // raw driver `Db` behind it (`connection.db`) is what this script needs: a
  // cursor, so the existence check below is actually filtered by name.
  const db = User.db.db;
  // The model was deleted with the feature, so the collection name is written
  // out here; it is the pluralised name Mongoose gave the old model.
  const tokenCollection = 'emailverificationtokens';
  let tokensDropped = false;
  if (await collectionExists(db, tokenCollection)) {
    await db.dropCollection(tokenCollection);
    tokensDropped = true;
  }

  return { users, tokensDropped };
}

async function main() {
  /*
   * Requiring config/env is what loads backend/.env, because its first
   * statement is `require('dotenv').config()`. It also validates the
   * environment on load and exposes the already validated `mongoUri`, so this
   * script neither reads the URI out of process.env itself nor repeats any of
   * the parsing or validation rules. This is the same path server.js takes.
   */
  const env = require('../config/env');
  const database = require('../config/database');

  try {
    await database.connectDatabase(env.mongoUri);
    const result = await dropEmailVerificationState();

    console.log(
      `Email-verification cleanup complete. Accounts updated: ${result.users.modifiedCount} `
      + `of ${result.users.matchedCount} matching; token collection dropped: ${result.tokensDropped ? 'yes' : 'no'}.`,
    );

    return result;
  } finally {
    await database.disconnectDatabase().catch(() => {
      process.exitCode = 1;
    });
  }
}

if (require.main === module) {
  main().catch((error) => {
    printSafeFailure(error);
    process.exitCode = 1;
  });
}

module.exports = { main, printSafeFailure, dropEmailVerificationState };
