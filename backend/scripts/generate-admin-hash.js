/*
 * Generates a bcrypt hash for ADMIN_PASSWORD_HASH without ever printing the
 * password or writing it to any file.
 *
 * Usage (from backend/):
 *   npm run hash:admin-password              → interactive, hidden prompt (asks twice)
 *   echo "correct horse battery staple" | npm run hash:admin-password -- --stdin
 *   ADMIN_NEW_PASSWORD="..." npm run hash:admin-password -- --env
 *
 * Only the resulting hash is printed to stdout. Copy it into backend/.env as
 * ADMIN_PASSWORD_HASH. The plaintext password is never echoed, logged or
 * stored anywhere by this script.
 */

const path = require('node:path');
const readline = require('node:readline');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

/*
 * Deliberately does NOT load config/env.js or config/adminPanel.js: a fresh
 * setup has no ADMIN_PASSWORD_HASH yet, and the point of this script is to
 * create it. BCRYPT_COST is read with the same bounds and default as
 * config/env.js.
 */
function resolveBcryptCost() {
  const raw = process.env.BCRYPT_COST;
  if (!raw) {
    return process.env.NODE_ENV === 'production' ? 12 : 10;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 10 || parsed > 15) {
    throw new Error('BCRYPT_COST must be an integer between 10 and 15.');
  }
  return parsed;
}

function readHiddenPrompt(promptText) {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    // Suppress echo: write the prompt, but swallow every typed character.
    const originallyWrite = rl._writeToOutput;
    rl._writeToOutput = (stringToWrite) => {
      if (stringToWrite.includes(promptText)) {
        originallyWrite.call(rl, stringToWrite);
      }
      // Everything else (typed characters, newline) is dropped.
    };

    rl.question(promptText, (answer) => {
      rl._writeToOutput = originallyWrite;
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });

    rl.on('error', reject);
  });
}

async function readFromStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

async function resolvePassword(argv) {
  if (argv.includes('--stdin')) {
    const password = await readFromStdin();
    if (!password) {
      throw new Error('No password received on stdin.');
    }
    return password;
  }

  if (argv.includes('--env')) {
    const password = process.env.ADMIN_NEW_PASSWORD;
    if (!password) {
      throw new Error('ADMIN_NEW_PASSWORD is not set.');
    }
    return password;
  }

  // Interactive path: hidden prompt, confirmed twice to prevent typos.
  const first = await readHiddenPrompt('Password to hash (input hidden): ');
  const second = await readHiddenPrompt('Repeat password (input hidden): ');
  if (first !== second) {
    throw new Error('Passwords do not match.');
  }
  if (!first) {
    throw new Error('Password must not be empty.');
  }
  return first;
}

async function main() {
  const bcryptCost = resolveBcryptCost();

  const password = await resolvePassword(process.argv.slice(2));

  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters long.');
  }

  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash(password, bcryptCost);
  // The only thing ever printed: the hash itself.
  process.stdout.write(`\nbcrypt hash (copy into backend/.env as ADMIN_PASSWORD_HASH):\n\n${hash}\n\n`);
}

main().catch((error) => {
  process.stderr.write(`\n${error.message}\n`);
  process.exit(1);
});
