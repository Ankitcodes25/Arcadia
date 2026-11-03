const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const {
  getEmailAssetBaseUrl,
  getEmailConfig,
  getEmailLogConfig,
  getSupportInboxEmail,
  getWelcomeBackInactivityDays,
} = require('../config/email');
const { escapeHtml } = require('./emailTemplates/arcadiaLayout');
const { buildWelcomeEmail, buildWelcomeBackEmail } = require('./emailTemplates/welcomeEmails');
const { buildSupportReportEmail } = require('./emailTemplates/supportReportEmail');

let transportOverride = null;
let smtpTransport = null;

function setEmailTransportForTests(sender) {
  transportOverride = sender;
}

function resetEmailTransportForTests() {
  transportOverride = null;
  smtpTransport = null;
}

function getTransport(config) {
  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      requireTLS: config.port === 587 || config.port === 25,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      auth: {
        user: config.user,
        pass: config.password,
      },
    });
  }

  return smtpTransport;
}

function buildActionUrl(baseUrl, parameter, token) {
  const url = new URL(baseUrl);
  const fragment = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
  fragment.set(parameter, token);
  url.hash = fragment.toString();
  return url.toString();
}

// What to do about each SMTP failure, by Nodemailer error code. Only the code
// is logged: SMTP responses can echo the account name, never the password.
const SMTP_FAILURE_ADVICE = Object.freeze({
  EAUTH: 'the SMTP server rejected SMTP_USER/SMTP_PASSWORD. For Gmail, SMTP_PASSWORD must be a Google App Password, not the account password. Update backend/.env and restart the backend',
  ECONNECTION: 'the SMTP server could not be reached. Check SMTP_HOST and SMTP_PORT in backend/.env and the network connection',
  ETIMEDOUT: 'the SMTP server did not answer in time. Check SMTP_HOST, SMTP_PORT and the network connection',
  EDNS: 'SMTP_HOST did not resolve. Check SMTP_HOST in backend/.env',
  EENVELOPE: 'the sender or recipient address was rejected. Check EMAIL_FROM and the recipient address',
});

// What to do when an email is skipped before reaching SMTP, by result reason.
const SKIPPED_EMAIL_ADVICE = Object.freeze({
  not_configured: 'email is off. Set EMAIL_PROVIDER=smtp, EMAIL_FROM, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD and FRONTEND_PASSWORD_RESET_URL in backend/.env, then restart the backend (it only reads .env at startup)',
  unsupported_provider: 'EMAIL_PROVIDER in backend/.env must be smtp or disabled. Fix it and restart the backend',
  invalid_configuration: 'SMTP_PORT, FRONTEND_PASSWORD_RESET_URL or FRONTEND_URL in backend/.env is invalid. Fix it and restart the backend',
  no_support_inbox: 'SUPPORT_INBOX_EMAIL is not set to a valid address in backend/.env. Set it and restart the backend',
});

const DEFAULT_EMAIL_LOG_PATH = path.join(__dirname, '..', 'logs', 'email.log');
let emailLogPath = DEFAULT_EMAIL_LOG_PATH;
let emailLogConfigOverride = null;
let emailLogWriteQueue = Promise.resolve();

function setEmailLogPathForTests(logPath) {
  emailLogPath = logPath || DEFAULT_EMAIL_LOG_PATH;
}

function setEmailLogConfigForTests(config) {
  emailLogConfigOverride = config ? { ...getEmailLogConfig(), ...config } : null;
}

function resetEmailLogConfigForTests() {
  emailLogConfigOverride = null;
}

function getActiveEmailLogConfig() {
  return emailLogConfigOverride || getEmailLogConfig();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getEmailLogBaseName() {
  return path.basename(emailLogPath);
}

function getEmailLogArchivePattern() {
  const stem = getEmailLogBaseName().replace(/\.log$/i, '');
  return new RegExp(`^${escapeRegex(stem)}-\\d{8}-\\d{6}-\\d{3}-[a-f0-9]{8}\\.log$`);
}

function buildEmailLogArchivePath(now = new Date()) {
  const pad = (value, length = 2) => String(value).padStart(length, '0');
  const stamp = [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    '-',
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds()),
    '-',
    pad(now.getUTCMilliseconds(), 3),
  ].join('');
  const stem = getEmailLogBaseName().replace(/\.log$/i, '');
  return path.join(
    path.dirname(emailLogPath),
    `${stem}-${stamp}-${crypto.randomBytes(4).toString('hex')}.log`,
  );
}

/*
 * Serializes rotation, cleanup and append operations inside this process. Two
 * concurrent email sends can otherwise both see the same undersized file and
 * rotate it twice. Cross-process log shipping is out of scope for this local
 * file; the serialization guarantees an uncorrupted single-writer log.
 */
function enqueueEmailLogWrite(work) {
  const run = emailLogWriteQueue.then(work, work);
  emailLogWriteQueue = run.then(() => undefined, () => undefined);
  return run;
}

function isManagedEmailLogFile(name) {
  return name === getEmailLogBaseName() || getEmailLogArchivePattern().test(name);
}

/**
 * Deletes only this log's active file and archives that are older than the
 * configured retention period. Unrelated files in the directory are ignored.
 */
async function cleanupExpiredEmailLogs({ now = Date.now(), config = getActiveEmailLogConfig() } = {}) {
  const directory = path.dirname(emailLogPath);
  let entries;
  try {
    entries = await fs.promises.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') return 0;
    throw error;
  }

  const cutoff = Number(now) - (config.retentionDays * 24 * 60 * 60 * 1000);
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !isManagedEmailLogFile(entry.name)) continue;
    const filePath = path.join(directory, entry.name);
    try {
      const stats = await fs.promises.stat(filePath);
      if (stats.mtimeMs < cutoff) {
        await fs.promises.unlink(filePath);
        removed += 1;
      }
    } catch (error) {
      // A file removed by another worker between readdir and stat/unlink is
      // already at the desired state. Other errors are reported by the caller.
      if (!error || error.code !== 'ENOENT') throw error;
    }
  }
  return removed;
}

/**
 * Moves the active file to a dated archive when the next line would exceed the
 * configured size. Returns the archive path, or null when no rotation was due.
 */
async function rotateEmailLogIfNeeded(lineBytes, config) {
  let stats;
  try {
    stats = await fs.promises.stat(emailLogPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }

  if (!stats.isFile() || stats.size === 0 || stats.size + lineBytes <= config.maxBytes) {
    return null;
  }

  const archivePath = buildEmailLogArchivePath();
  try {
    await fs.promises.rename(emailLogPath, archivePath);
    return archivePath;
  } catch (error) {
    // Rotation must not silently stop delivery logging. If the archive cannot
    // be created, keep appending to the active file; the next send retries.
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeEmailLogLine(line) {
  const config = getActiveEmailLogConfig();
  const payload = `${new Date().toISOString()} ${line}\n`;
  const payloadBytes = Buffer.byteLength(payload);
  const directory = path.dirname(emailLogPath);

  return enqueueEmailLogWrite(async () => {
    await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
    await fs.promises.chmod(directory, 0o700).catch(() => {});
    await cleanupExpiredEmailLogs({ config }).catch((error) => {
      console.warn(`[email] could not clean expired logs (${error && error.code}): continuing to log delivery outcomes.`);
    });
    await rotateEmailLogIfNeeded(payloadBytes, config).catch((error) => {
      console.warn(`[email] could not rotate ${emailLogPath} (${error && error.code}): continuing to append.`);
    });
    await fs.promises.appendFile(emailLogPath, payload, { mode: 0o600 });
    await fs.promises.chmod(emailLogPath, 0o600).catch(() => {});
  });
}

// Keeps the log useful for matching a report to a user without storing full
// addresses: "player@example.com" becomes "p****r@example.com".
function maskEmailAddress(address) {
  if (typeof address !== 'string' || !address.includes('@')) return 'unknown';
  const [local, domain] = address.split('@');
  const masked = local.length <= 2 ? `${local[0] || ''}*` : `${local[0]}****${local[local.length - 1]}`;
  return `${masked}@${domain}`;
}

function describeEmailOutcome(result) {
  if (result && result.sent) {
    return { level: 'info', text: `sent${result.messageId ? ` messageId=${result.messageId}` : ''}` };
  }

  const reason = (result && result.reason) || 'unknown';
  if (reason === 'delivery_failed') {
    const code = result && result.code;
    const advice = SMTP_FAILURE_ADVICE[code] || 'the message was not accepted. Read the SMTP error code and check the SMTP_* values in backend/.env';
    return { level: 'warn', text: `FAILED${code ? ` (${code})` : ''}: ${advice}` };
  }

  const advice = SKIPPED_EMAIL_ADVICE[reason] || 'the email was not attempted. Check the email settings in backend/.env';
  return { level: 'warn', text: `SKIPPED (${reason}): ${advice}` };
}

// Every send attempt leaves one line in the terminal and in backend/logs/email.log,
// so "no email arrived" can be traced to sent, skipped or failed. Writing the log
// must never affect delivery, so file errors are reported and swallowed.
async function recordEmailOutcome(kind, to, result) {
  const { level, text } = describeEmailOutcome(result);
  const line = `[email] ${kind} to=${maskEmailAddress(to)} ${text}`;
  console[level](line);

  try {
    await writeEmailLogLine(line);
  } catch (error) {
    console.warn(`[email] could not write ${emailLogPath} (${error && error.code}): check that backend/logs is writable.`);
  }
}

function withOutcomeLog(kind, getRecipient, send) {
  return async (args) => {
    try {
      const result = await send(args);
      await recordEmailOutcome(kind, getRecipient(args), result);
      return result;
    } catch (error) {
      const code = error && typeof error.code === 'string' ? error.code : null;
      await recordEmailOutcome(kind, getRecipient(args), { sent: false, reason: 'delivery_failed', code });
      throw error;
    }
  };
}

async function deliverEmail({ to, subject, text, html, replyTo }) {
  const message = { to, subject, text, html };
  if (replyTo) message.replyTo = replyTo;

  if (transportOverride) {
    return transportOverride(message);
  }

  const config = getEmailConfig();
  if (!config.configured) {
    return { sent: false, reason: config.reason };
  }

  try {
    const info = await getTransport(config).sendMail({ from: config.from, ...message });
    return { sent: true, messageId: info && info.messageId ? info.messageId : null };
  } catch (error) {
    const code = error && typeof error.code === 'string' ? error.code : null;
    return { sent: false, reason: 'delivery_failed', code };
  }
}

// Sends one templated email. Never throws: callers decide whether a failed send
// matters to the user, and withOutcomeLog records what happened.
async function sendTemplatedEmail(to, content) {
  try {
    return await deliverEmail({ to, ...content });
  } catch (error) {
    return { sent: false, reason: 'delivery_failed', code: error && typeof error.code === 'string' ? error.code : null };
  }
}

function getFrontendUrl(config) {
  try {
    return new URL(config.frontendUrl).toString();
  } catch {
    return null;
  }
}

async function sendWelcomeEmailUnlogged({ to, displayName }) {
  const config = getEmailConfig();
  if (!config.configured) return { sent: false, reason: config.reason };

  const link = getFrontendUrl(config);
  if (!link) return { sent: false, reason: 'invalid_configuration' };

  return sendTemplatedEmail(to, buildWelcomeEmail({
    displayName,
    link,
    supportEmail: getSupportInboxEmail(),
    assetBaseUrl: getEmailAssetBaseUrl(),
  }));
}

async function sendWelcomeBackEmailUnlogged({ to, displayName }) {
  const config = getEmailConfig();
  if (!config.configured) return { sent: false, reason: config.reason };

  const link = getFrontendUrl(config);
  if (!link) return { sent: false, reason: 'invalid_configuration' };

  return sendTemplatedEmail(to, buildWelcomeBackEmail({
    displayName,
    link,
    supportEmail: getSupportInboxEmail(),
    inactivityDays: getWelcomeBackInactivityDays(),
    assetBaseUrl: getEmailAssetBaseUrl(),
  }));
}

/*
 * Emails one saved problem report to the support inbox. The report is already
 * stored before this runs, so a failure here never loses the report.
 */
async function sendSupportReportEmailUnlogged({ report, reporter }) {
  const inbox = getSupportInboxEmail();
  if (!inbox) return { sent: false, reason: 'no_support_inbox' };

  const config = getEmailConfig();
  if (!config.configured) return { sent: false, reason: config.reason };

  return sendTemplatedEmail(inbox, buildSupportReportEmail({ report, reporter, assetBaseUrl: getEmailAssetBaseUrl() }));
}

async function sendPasswordResetEmailUnlogged({ to, token }) {
  const config = getEmailConfig();
  if (!config.configured) {
    return { sent: false, reason: config.reason };
  }

  const link = buildActionUrl(
    config.resetUrl,
    'reset_token',
    token,
  );
  const safeLink = escapeHtml(link);
  const expiryText = 'This password reset link expires in 1 hour.';

  return deliverEmail({
    to,
    subject: 'Reset your Arcadia password',
    text: `Reset your Arcadia password by opening this link: ${link}\n\n${expiryText}\n\nIf you did not request this, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;background:#0b0316;color:#f5e7fa;padding:32px"><h1 style="color:#e06cff">ARCADIA</h1><p>A password reset was requested for your Arcadia account.</p><p><a href="${safeLink}" style="color:#e06cff">Reset password</a></p><p>${expiryText}</p><p>If you did not request this, you can ignore this email.</p></div>`,
  });
}

const recipientArgument = ({ to }) => to;

const sendWelcomeEmail = withOutcomeLog('welcome', recipientArgument, sendWelcomeEmailUnlogged);
const sendWelcomeBackEmail = withOutcomeLog('welcome_back', recipientArgument, sendWelcomeBackEmailUnlogged);
const sendSupportReportEmail = withOutcomeLog(
  'support_report',
  () => getSupportInboxEmail(),
  sendSupportReportEmailUnlogged,
);
const sendPasswordResetEmail = withOutcomeLog('password_reset', recipientArgument, sendPasswordResetEmailUnlogged);

module.exports = {
  sendWelcomeEmail,
  sendWelcomeBackEmail,
  sendSupportReportEmail,
  sendPasswordResetEmail,
  recordEmailOutcome,
  cleanupExpiredEmailLogs,
  setEmailTransportForTests,
  resetEmailTransportForTests,
  setEmailLogPathForTests,
  setEmailLogConfigForTests,
  resetEmailLogConfigForTests,
};
