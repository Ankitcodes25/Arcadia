const nodemailer = require('nodemailer');
const { getEmailConfig } = require('../config/email');

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

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function buildActionUrl(baseUrl, parameter, token) {
  const url = new URL(baseUrl);
  const fragment = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
  fragment.set(parameter, token);
  url.hash = fragment.toString();
  return url.toString();
}

async function deliverEmail({ to, subject, text, html }) {
  if (transportOverride) {
    return transportOverride({ to, subject, text, html });
  }

  const config = getEmailConfig();
  if (!config.configured) {
    return { sent: false, reason: config.reason };
  }

  try {
    await getTransport(config).sendMail({
      from: config.from,
      to,
      subject,
      text,
      html,
    });
    return { sent: true };
  } catch {
    return { sent: false, reason: 'delivery_failed' };
  }
}

function getWelcomeDisplayName(value) {
  if (typeof value !== 'string') return 'there';
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized ? normalized.slice(0, 80) : 'there';
}

function getFrontendUrl(config) {
  try {
    return new URL(config.frontendUrl).toString();
  } catch {
    return null;
  }
}

function buildWelcomeEmailContent({ config, displayName, returning }) {
  const link = getFrontendUrl(config);
  if (!link) return null;

  const safeName = escapeHtml(getWelcomeDisplayName(displayName));
  const safeLink = escapeHtml(link);

  if (returning) {
    const preview = 'Your games are waiting. Ready for another run?';
    const subject = 'Welcome Back to Arcadia 🎮';
    const text = `${preview}\n\nHey ${getWelcomeDisplayName(displayName)},\n\nGood to see you again.\n\nIt's been a while, but your Arcadia journey isn't going anywhere.\n\nWhether you're here to pick up where you left off, beat your previous score, take on a new challenge, or simply play something fun — there's always another run waiting for you.\n\nYour next game is waiting.\n\nRETURN TO ARCADIA → ${link}\n\nSee you back in the arcade.\n\n— Team Arcadia\n\nPlay. Challenge. Repeat.\n\nYou received this email because your Arcadia account was successfully signed in.\n\nIf this wasn't you, please secure your account by changing your password and reviewing your active sessions.`;
    const html = `<!doctype html><html><body style="margin:0;background:#0b0316;color:#f7efff;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${preview}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b0316"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px"><tr><td style="padding:28px 28px 12px;text-align:center"><div style="font-size:12px;letter-spacing:4px;font-weight:700;color:#c56bff">WELCOME BACK</div><h1 style="margin:12px 0 0;font-size:30px;line-height:1.2;color:#ffffff">Welcome back to Arcadia</h1></td></tr><tr><td style="padding:12px 28px 28px"><p style="font-size:16px;line-height:1.6">Hey ${safeName},</p><p style="font-size:16px;line-height:1.6">Good to see you again.</p><p style="font-size:16px;line-height:1.6">It's been a while, but your Arcadia journey isn't going anywhere.</p><p style="font-size:16px;line-height:1.6">Whether you're here to pick up where you left off, beat your previous score, take on a new challenge, or simply play something fun — there's always another run waiting for you.</p><div style="margin:28px 0;padding:18px;border-left:3px solid #b44cff;background:#17102a;font-size:18px;font-weight:700">Your next game is waiting.</div><p style="text-align:center;margin:28px 0"><a href="${safeLink}" style="display:inline-block;padding:14px 22px;border-radius:10px;background:linear-gradient(135deg,#b44cff,#7135dc);color:#ffffff;text-decoration:none;font-weight:700">RETURN TO ARCADIA →</a></p><p style="font-size:16px;line-height:1.6">See you back in the arcade.</p><p style="font-size:16px;line-height:1.6">— Team Arcadia<br>Play. Challenge. Repeat.</p></td></tr><tr><td style="padding:0 28px 28px;border-top:1px solid #392451;font-size:12px;line-height:1.6;color:#b9a8c9"><p>You received this email because your Arcadia account was successfully signed in.</p><p>If this wasn't you, please secure your account by changing your password and reviewing your active sessions.</p></td></tr></table></td></tr></table></body></html>`;
    return { subject, text, html };
  }

  const preview = 'Your Arcadia account is ready. There\'s a whole world waiting for you.';
  const subject = 'Welcome to Arcadia 🎮 — Your Journey Starts Here';
  const text = `${preview}\n\nHey ${getWelcomeDisplayName(displayName)},\n\nWelcome to Arcadia.\n\nYour account is officially ready, and your journey starts now.\n\nArcadia is a place to play, challenge yourself, discover new games, and build your own record along the way. Every game is a new challenge, every score is part of your journey, and every win gets you one step further.\n\nENTER ARCADIA → ${link}\n\nSee you inside.\n\n— Team Arcadia\n\nPlay. Challenge. Repeat.\n\nThis email was sent because an Arcadia account was created using this email address.\nIf you didn't create this account, you can safely ignore this email.`;
  const html = `<!doctype html><html><body style="margin:0;background:#0b0316;color:#f7efff;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${preview}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b0316"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px"><tr><td style="padding:28px 28px 12px;text-align:center"><div style="font-size:12px;letter-spacing:4px;font-weight:700;color:#c56bff">WELCOME TO ARCADIA</div><h1 style="margin:12px 0 0;font-size:30px;line-height:1.2;color:#ffffff">Welcome to Arcadia</h1></td></tr><tr><td style="padding:12px 28px 28px"><p style="font-size:16px;line-height:1.6">Hey ${safeName},</p><p style="font-size:16px;line-height:1.6">Welcome to Arcadia.</p><p style="font-size:16px;line-height:1.6">Your account is officially ready, and your journey starts now.</p><p style="font-size:16px;line-height:1.6">Arcadia is a place to play, challenge yourself, discover new games, and build your own record along the way. Every game is a new challenge, every score is part of your journey, and every win gets you one step further.</p><p style="text-align:center;margin:28px 0"><a href="${safeLink}" style="display:inline-block;padding:14px 22px;border-radius:10px;background:linear-gradient(135deg,#b44cff,#7135dc);color:#ffffff;text-decoration:none;font-weight:700">ENTER ARCADIA →</a></p><p style="font-size:16px;line-height:1.6">See you inside.</p><p style="font-size:16px;line-height:1.6">— Team Arcadia<br>Play. Challenge. Repeat.</p></td></tr><tr><td style="padding:0 28px 28px;border-top:1px solid #392451;font-size:12px;line-height:1.6;color:#b9a8c9"><p>This email was sent because an Arcadia account was created using this email address.</p><p>If you didn't create this account, you can safely ignore this email.</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}

function logWelcomeDeliveryFailure(kind) {
  console.warn(`[email] ${kind}_delivery_failed`);
}

async function sendWelcomeEmail({ to, displayName }) {
  const config = getEmailConfig();
  if (!config.configured) return { sent: false, reason: config.reason };

  const content = buildWelcomeEmailContent({ config, displayName, returning: false });
  if (!content) return { sent: false, reason: 'invalid_configuration' };

  try {
    const delivery = await deliverEmail({ to, ...content });
    if (delivery && delivery.sent === false && delivery.reason === 'delivery_failed') {
      logWelcomeDeliveryFailure('welcome');
    }
    return delivery;
  } catch {
    logWelcomeDeliveryFailure('welcome');
    return { sent: false, reason: 'delivery_failed' };
  }
}

async function sendWelcomeBackEmail({ to, displayName }) {
  const config = getEmailConfig();
  if (!config.configured) return { sent: false, reason: config.reason };

  const content = buildWelcomeEmailContent({ config, displayName, returning: true });
  if (!content) return { sent: false, reason: 'invalid_configuration' };

  try {
    const delivery = await deliverEmail({ to, ...content });
    if (delivery && delivery.sent === false && delivery.reason === 'delivery_failed') {
      logWelcomeDeliveryFailure('welcome_back');
    }
    return delivery;
  } catch {
    logWelcomeDeliveryFailure('welcome_back');
    return { sent: false, reason: 'delivery_failed' };
  }
}

async function sendPasswordResetEmail({ to, token }) {
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

module.exports = {
  sendWelcomeEmail,
  sendWelcomeBackEmail,
  sendPasswordResetEmail,
  setEmailTransportForTests,
  resetEmailTransportForTests,
};
