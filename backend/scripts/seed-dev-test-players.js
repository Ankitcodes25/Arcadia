/*
 * Development-only test-player seed.
 *
 * Creates exactly three login-enabled player accounts in the database already
 * configured by backend/.env, using the same account-creation path as a normal
 * password signup:
 *
 *   - authService.register() validates the identity and hashes the password
 *     with the configured bcrypt cost.
 *   - createUserWithPlayerId() generates the permanent ARC-XXXXXXXX Player ID.
 *   - The User schema supplies the normal defaults, including the local avatar.
 *
 * Arcadia no longer has an email-verification step: a signup is ACTIVE and can
 * log in immediately. This script therefore creates no verification token and
 * sends no email.
 *
 * Safety rules:
 *   - Refuses to run unless NODE_ENV is exactly development.
 *   - Refuses to write without --confirm.
 *   - Only ever inserts the three fixed, reserved @example.com identities.
 *   - Never updates or deletes an existing account. If one of the fixed
 *     identities already exists, its local credential entry must match it or
 *     the script stops without making changes.
 *   - Passwords are generated with node:crypto and stored only in a local,
 *     git-ignored JSON file. MongoDB receives only the bcrypt password hash.
 *
 * Run from the backend directory after reviewing the dry-run output:
 *
 *   npm run seed:dev-players -- --confirm
 */
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const bcrypt = require('bcryptjs');

const CREDENTIALS_FILE = path.join(__dirname, '..', '.dev-test-players.json');
const CREDENTIALS_FILE_NAME = '.dev-test-players.json';
const PASSWORD_PREFIX = 'Arc9!';
const PASSWORD_RANDOM_BYTES = 18;
const CONFIRM_FLAG = '--confirm';

const SEED_ACCOUNTS = Object.freeze([
  Object.freeze({
    username: 'ArcadeDevRook',
    email: 'arcadia.dev.rook@example.com',
    displayName: 'Arcadia Dev Rook',
    avatarId: 'avatar-02',
  }),
  Object.freeze({
    username: 'ArcadeDevKnight',
    email: 'arcadia.dev.knight@example.com',
    displayName: 'Arcadia Dev Knight',
    avatarId: 'avatar-04',
  }),
  Object.freeze({
    username: 'ArcadeDevOracle',
    email: 'arcadia.dev.oracle@example.com',
    displayName: 'Arcadia Dev Oracle',
    avatarId: 'avatar-06',
  }),
]);

class SeedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SeedError';
    this.seedSafeMessage = message;
  }
}

function getMongoDatabaseName(uri) {
  try {
    const match = String(uri).match(/^(mongodb(?:\+srv)?:\/\/)([^/?#]+)([^?#]*)(?:\?([^#]*))?$/i);
    if (!match) return null;
    const databaseName = decodeURIComponent((match[3] || '').replace(/^\//, ''));
    return /^[A-Za-z0-9_.$-]{1,64}$/.test(databaseName) ? databaseName : null;
  } catch {
    return null;
  }
}

function generatePassword() {
  // base64url supplies 24 characters from 144 bits of randomness. The prefix
  // guarantees upper-case, lower-case, digit and symbol characters.
  return `${PASSWORD_PREFIX}${crypto.randomBytes(PASSWORD_RANDOM_BYTES).toString('base64url')}`;
}

function printPlan(databaseName, collectionName) {
  console.log('Arcadia development test-player seed');
  console.log(`Target database: ${databaseName || 'unavailable'}`);
  console.log(`Target collection: ${collectionName}`);
  console.log('Accounts:');
  for (const account of SEED_ACCOUNTS) {
    console.log(`  - ${account.username} <${account.email}> (${account.avatarId})`);
  }
}

async function readCredentialStore() {
  let raw;
  try {
    raw = await fs.readFile(CREDENTIALS_FILE, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {
        note: 'LOCAL DEVELOPMENT CREDENTIALS ONLY - never commit this file',
        accounts: [],
      };
    }
    throw new SeedError(`Could not read ${CREDENTIALS_FILE_NAME}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SeedError(`${CREDENTIALS_FILE_NAME} is not valid JSON; refusing to overwrite it`);
  }

  if (!parsed || !Array.isArray(parsed.accounts)) {
    throw new SeedError(`${CREDENTIALS_FILE_NAME} has an unexpected shape; refusing to overwrite it`);
  }

  return parsed;
}

function getCredentialEntry(store, account) {
  return store.accounts.find((entry) => (
    entry && typeof entry.email === 'string'
    && entry.email.toLowerCase() === account.email
  )) || null;
}

async function writeCredentialStore(store, databaseName, collectionName) {
  const payload = {
    note: 'LOCAL DEVELOPMENT CREDENTIALS ONLY - never commit this file',
    database: databaseName,
    collection: collectionName,
    updatedAt: new Date().toISOString(),
    accounts: store.accounts,
  };

  await fs.writeFile(CREDENTIALS_FILE, `${JSON.stringify(payload, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await fs.chmod(CREDENTIALS_FILE, 0o600).catch(() => {});
}

async function findExistingAccount(User, account, normalizeUsername) {
  const select = '_id email username usernameNormalized playerId avatar role status passwordHash';
  const byEmail = await User.findOne({ email: account.email }).select(select).lean();
  const byUsername = await User.findOne({
    usernameNormalized: normalizeUsername(account.username),
  }).select(select).lean();

  if (!byEmail && !byUsername) {
    return null;
  }

  if (!byEmail || !byUsername || String(byEmail._id) !== String(byUsername._id)) {
    throw new SeedError(
      `Safety stop: ${account.username} or ${account.email} is already in use by an account this seed does not own`,
    );
  }

  if (byEmail.username !== account.username) {
    throw new SeedError(
      `Safety stop: ${account.email} belongs to a different username; no changes made`,
    );
  }

  return byEmail;
}

async function createTestAccount(authService, User, account, password, AVATAR_TYPES, normalizeUsername) {
  const result = await authService.register({
    email: account.email,
    password,
    name: account.displayName,
    username: account.username,
  });

  const userId = result && result.user && result.user.id;
  if (!userId) {
    throw new SeedError(`Registration did not return an id for ${account.username}`);
  }

  await User.updateOne(
    {
      _id: userId,
      email: account.email,
      usernameNormalized: normalizeUsername(account.username),
    },
    {
      $set: {
        avatar: {
          type: AVATAR_TYPES.LOCAL,
          value: account.avatarId,
        },
      },
    },
  );

  const stored = await User.findById(userId).select('+passwordHash').lean();
  if (!stored) {
    throw new SeedError(`Could not verify the stored account for ${account.username}`);
  }

  if (!stored.passwordHash || !(await bcrypt.compare(password, stored.passwordHash))) {
    throw new SeedError(`Password verification failed for ${account.username}`);
  }

  if (stored.avatar && stored.avatar.value !== account.avatarId) {
    throw new SeedError(`Avatar assignment failed for ${account.username}`);
  }

  return stored;
}

async function verifyExistingAccount(existing, entry, account, bcryptModule) {
  if (!entry || typeof entry.password !== 'string' || !entry.password) {
    throw new SeedError(
      `Safety stop: ${account.username} already exists but ${CREDENTIALS_FILE_NAME} has no password for it; no changes made`,
    );
  }

  if (!existing.passwordHash || !(await bcryptModule.compare(entry.password, existing.passwordHash))) {
    throw new SeedError(
      `Safety stop: the stored password for ${account.username} does not match ${CREDENTIALS_FILE_NAME}; no changes made`,
    );
  }

  if (existing.role !== 'USER' || existing.status !== 'ACTIVE') {
    throw new SeedError(
      `Safety stop: ${account.username} exists but is not an active player account; no changes made`,
    );
  }
}

async function main() {
  const env = require('../config/env');
  const { User } = require('../models/User');
  const { AVATAR_TYPES, isAllowedLocalAvatarId } = require('../config/avatar');
  const { normalizeUsername } = require('../utils/username');
  const authService = require('../services/authService');

  if (env.isProduction || env.nodeEnv !== 'development') {
    throw new SeedError('This seed only runs with NODE_ENV=development');
  }

  for (const account of SEED_ACCOUNTS) {
    if (!isAllowedLocalAvatarId(account.avatarId)) {
      throw new SeedError(`Invalid configured avatar id for ${account.username}`);
    }
  }

  const databaseName = getMongoDatabaseName(env.mongoUri);
  const collectionName = User.collection.collectionName;
  printPlan(databaseName, collectionName);

  if (!process.argv.includes(CONFIRM_FLAG)) {
    console.log('');
    console.log('No changes made. Re-run with --confirm to create the accounts:');
    console.log('  npm run seed:dev-players -- --confirm');
    return;
  }

  const database = require('../config/database');
  const store = await readCredentialStore();
  let connected = false;

  try {
    await database.connectDatabase(env.mongoUri);
    connected = true;
    await User.init();

    const existingAccounts = [];
    for (const account of SEED_ACCOUNTS) {
      const existing = await findExistingAccount(User, account, normalizeUsername);
      existingAccounts.push({ account, existing });
    }

    // Generate credentials for missing accounts before any write, then persist
    // the local file first. A failed insert can therefore be retried without
    // losing the generated password.
    for (const { account, existing } of existingAccounts) {
      const entry = getCredentialEntry(store, account);

      if (existing) {
        if (!entry || typeof entry.password !== 'string' || !entry.password) {
          throw new SeedError(
            `Safety stop: ${account.username} already exists but ${CREDENTIALS_FILE_NAME} has no password for it; no changes made`,
          );
        }
        entry.username = account.username;
        entry.email = account.email;
        entry.displayName = account.displayName;
        entry.avatarId = account.avatarId;
        continue;
      }

      if (!entry) {
        store.accounts.push({
          username: account.username,
          email: account.email,
          displayName: account.displayName,
          avatarId: account.avatarId,
          password: generatePassword(),
          playerId: null,
        });
        continue;
      }

      entry.username = account.username;
      entry.email = account.email;
      entry.displayName = account.displayName;
      entry.avatarId = account.avatarId;
      if (typeof entry.password !== 'string' || !entry.password) {
        entry.password = generatePassword();
      }
    }

    await writeCredentialStore(store, databaseName, collectionName);

    for (const { account, existing } of existingAccounts) {
      const entry = getCredentialEntry(store, account);
      if (existing) {
        await verifyExistingAccount(existing, entry, account, bcrypt);
        entry.playerId = existing.playerId || entry.playerId || null;
        entry.updatedAt = new Date().toISOString();
        console.log(`${account.username}: already exists; unchanged`);
        continue;
      }

      const stored = await createTestAccount(
        authService,
        User,
        account,
        entry.password,
        AVATAR_TYPES,
        normalizeUsername,
      );
      entry.playerId = stored.playerId || null;
      entry.createdAt = new Date().toISOString();
      entry.updatedAt = entry.createdAt;
      console.log(`${account.username}: created (${entry.playerId || 'Player ID pending'})`);
      await writeCredentialStore(store, databaseName, collectionName);
    }

    await writeCredentialStore(store, databaseName, collectionName);
    console.log('');
    console.log(`Credentials saved locally to ${CREDENTIALS_FILE_NAME}.`);
    console.log('No plaintext password was stored in MongoDB.');
  } finally {
    if (connected) {
      await database.disconnectDatabase().catch(() => {
        process.exitCode = 1;
      });
    }
  }
}

function printSafeFailure(error) {
  console.error('Development test-player seed failed.');
  if (error && typeof error.seedSafeMessage === 'string') {
    console.error(`Reason: ${error.seedSafeMessage}`);
    return;
  }

  const name = error && typeof error.name === 'string' ? error.name : 'UnknownError';
  console.error(`Reason: unexpected ${name}; raw details withheld to avoid printing connection secrets.`);
}

if (require.main === module) {
  main().catch((error) => {
    printSafeFailure(error);
    process.exitCode = 1;
  });
}

module.exports = {
  SEED_ACCOUNTS,
  CREDENTIALS_FILE_NAME,
  generatePassword,
  getMongoDatabaseName,
  main,
};
