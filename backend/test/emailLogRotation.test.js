const { after, afterEach, before, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/arcadia_email_log_test';
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.CORS_ORIGIN = 'http://localhost:5173';
process.env.EMAIL_PROVIDER = 'smtp';
process.env.EMAIL_FROM = 'test@example.com';
process.env.SMTP_HOST = 'smtp.test.local';
process.env.SMTP_PORT = '587';
process.env.SMTP_USER = 'test-user';
process.env.SMTP_PASSWORD = 'test-password';
process.env.FRONTEND_PASSWORD_RESET_URL = 'http://localhost:5173/';

const emailService = require('../services/emailService');
const { getEmailLogConfig } = require('../config/email');

let tempDirectory;
let logPath;
let originalInfo;
let originalWarn;
const warnings = [];

before(() => {
  originalInfo = console.info;
  originalWarn = console.warn;
  console.info = () => {};
  console.warn = (message) => {
    warnings.push(String(message));
  };
});

after(() => {
  console.info = originalInfo;
  console.warn = originalWarn;
});

beforeEach(() => {
  tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'arcadia-email-log-'));
  logPath = path.join(tempDirectory, 'email.log');
  warnings.length = 0;
  emailService.setEmailLogPathForTests(logPath);
  emailService.setEmailLogConfigForTests({ retentionDays: 90, maxBytes: 5 * 1024 * 1024 });
});

afterEach(() => {
  emailService.resetEmailTransportForTests();
  emailService.resetEmailLogConfigForTests();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

test('email log settings default to 90 days and accept environment overrides', () => {
  const defaults = getEmailLogConfig({});
  assert.equal(defaults.retentionDays, 90);
  assert.equal(defaults.maxBytes, 5 * 1024 * 1024);

  const custom = getEmailLogConfig({
    EMAIL_LOG_RETENTION_DAYS: '30',
    EMAIL_LOG_MAX_SIZE_BYTES: '2048',
  });
  assert.deepEqual(custom, { retentionDays: 30, maxBytes: 2048 });
});

test('concurrent writes rotate at the size limit without losing a line', async () => {
  emailService.setEmailLogConfigForTests({ retentionDays: 90, maxBytes: 180 });

  await Promise.all(Array.from({ length: 20 }, (_, index) => (
    emailService.recordEmailOutcome('welcome', `player${index}@example.com`, {
      sent: true,
      messageId: `<message-${index}@test>`,
    })
  )));

  const files = fs.readdirSync(tempDirectory);
  assert.ok(files.includes('email.log'), 'the active file remains');
  assert.ok(
    files.some((name) => /^email-\d{8}-\d{6}-\d{3}-[a-f0-9]{8}\.log$/.test(name)),
    'at least one size-based archive was created',
  );

  emailService.setEmailTransportForTests(async () => ({ sent: true, messageId: '<after-rotation@test>' }));
  const sent = await emailService.sendWelcomeEmail({
    to: 'after-rotation@example.com',
    displayName: 'After Rotation',
  });
  assert.equal(sent.sent, true, 'sending still works after rotation');
  assert.equal(fs.existsSync(logPath), true, 'the new send recreates or extends the active log');
});

test('cleanup removes only expired files belonging to this log', async () => {
  const oldArchive = path.join(tempDirectory, 'email-20200101-000000-000-deadbeef.log');
  const unrelatedLog = path.join(tempDirectory, 'other.log');
  const unrelatedText = path.join(tempDirectory, 'email-notes.txt');
  fs.writeFileSync(oldArchive, 'expired archive\n');
  fs.writeFileSync(unrelatedLog, 'unrelated log\n');
  fs.writeFileSync(unrelatedText, 'unrelated text\n');
  fs.writeFileSync(logPath, 'fresh active log\n');

  const oldTime = new Date(Date.now() - (91 * 24 * 60 * 60 * 1000));
  fs.utimesSync(oldArchive, oldTime, oldTime);
  fs.utimesSync(unrelatedLog, oldTime, oldTime);
  fs.utimesSync(unrelatedText, oldTime, oldTime);

  const removed = await emailService.cleanupExpiredEmailLogs({
    config: { retentionDays: 90, maxBytes: 5 * 1024 * 1024 },
  });
  assert.equal(removed, 1);
  assert.equal(fs.existsSync(oldArchive), false, 'the expired archive is removed');
  assert.equal(fs.existsSync(unrelatedLog), true, 'unrelated logs are not deleted');
  assert.equal(fs.existsSync(unrelatedText), true, 'unrelated files are not deleted');
  assert.equal(fs.existsSync(logPath), true, 'a fresh active log is not deleted');
});

test('missing log directories and file-system failures never crash the caller', async () => {
  const blocker = path.join(tempDirectory, 'not-a-directory');
  fs.writeFileSync(blocker, 'blocker');
  emailService.setEmailLogPathForTests(path.join(blocker, 'email.log'));

  await assert.doesNotReject(
    emailService.recordEmailOutcome('welcome', 'player@example.com', { sent: true }),
  );
  assert.ok(warnings.some((line) => line.includes('[email] could not write')), 'the failure is reported safely');
});

test('logs never contain passwords, reset tokens, or full recipient addresses', async () => {
  const token = `arc_reset_${'s'.repeat(43)}`;
  emailService.setEmailTransportForTests(async () => ({ sent: true, messageId: '<reset@test>' }));

  const result = await emailService.sendPasswordResetEmail({
    to: 'player@example.com',
    token,
  });
  assert.equal(result.sent, true);

  const contents = fs.readFileSync(logPath, 'utf8');
  assert.doesNotMatch(contents, new RegExp(token), 'the reset token is never logged');
  assert.doesNotMatch(contents, /test-password/, 'the SMTP password is never logged');
  assert.doesNotMatch(contents, /player@example\.com/, 'the full recipient address is never logged');
  assert.match(contents, /p\*{4}r@example\.com/, 'the masked recipient is logged for traceability');
});
