const { escapeHtml, renderArcadiaEmail } = require('./arcadiaLayout');

const WELCOME_SUBJECT = 'Welcome to Arcadia 🎮 — Your Journey Starts Here';
const WELCOME_BACK_SUBJECT = 'Welcome Back to Arcadia 🎮';

function getWelcomeDisplayName(value) {
  if (typeof value !== 'string') return 'there';
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized ? normalized.slice(0, 80) : 'there';
}

function buildWelcomeEmail({ displayName, link, supportEmail, assetBaseUrl = null }) {
  const name = getWelcomeDisplayName(displayName);
  const safeName = escapeHtml(name);
  const safeLink = escapeHtml(link);
  const preview = 'Your Arcadia account is ready. There\'s a whole world waiting for you.';

  const text = [
    preview,
    '',
    `Hey ${name},`,
    '',
    'Welcome to Arcadia.',
    '',
    'Your account is officially ready, and your journey starts now.',
    '',
    'Arcadia is a place to play, challenge yourself, discover new games, and build your own record along the way. Every game is a new challenge, every score is part of your journey, and every win gets you one step further.',
    '',
    `ENTER ARCADIA → ${link}`,
    '',
    'See you inside.',
    '',
    '— Team Arcadia',
    '',
    'Play. Challenge. Repeat.',
    '',
    ...(supportEmail ? [`Need help? Write to ${supportEmail}.`, ''] : []),
    'This email was sent because an Arcadia account was created using this email address.',
    'If you didn\'t create this account, you can safely ignore this email.',
  ].join('\n');

  const { html } = renderArcadiaEmail({
    preview: escapeHtml(preview),
    eyebrow: 'WELCOME TO ARCADIA',
    title: 'YOUR JOURNEY STARTS NOW',
    hero: 'heroWelcome',
    heroAlt: 'The Arcadion, a hooded figure wreathed in violet light, reaching out',
    paragraphs: [
      `Hey ${safeName},`,
      'Your account is officially ready, and your journey starts now.',
      'Arcadia is a place to play, challenge yourself, discover new games, and build your own record along the way. Every game is a new challenge, every score is part of your journey, and every win gets you one step further.',
    ],
    features: [
      { label: 'PLAY', text: 'Jump into arcade, board and puzzle games.' },
      { label: 'CHALLENGE', text: 'Beat your best and climb the leaderboard.' },
      { label: 'REPEAT', text: 'Every run adds to your Arcadia record.' },
    ],
    cta: { label: 'ENTER ARCADIA →', url: safeLink },
    signoff: ['See you inside.', '— Team Arcadia'],
    footerNotes: [
      'This email was sent because an Arcadia account was created using this email address.',
      'If you didn\'t create this account, you can safely ignore this email.',
    ],
    supportEmail: supportEmail ? escapeHtml(supportEmail) : null,
    assetBaseUrl,
  });

  return { subject: WELCOME_SUBJECT, text, html };
}

function buildWelcomeBackEmail({
  displayName,
  link,
  supportEmail,
  inactivityDays,
  assetBaseUrl = null,
}) {
  const name = getWelcomeDisplayName(displayName);
  const safeName = escapeHtml(name);
  const safeLink = escapeHtml(link);
  const preview = 'Your games are waiting. Ready for another run?';
  const reason = `You received this email because you signed in to Arcadia after more than ${inactivityDays} days away.`;
  const advice = 'If this wasn\'t you, please secure your account by changing your password and reviewing your active sessions.';

  const text = [
    preview,
    '',
    `Hey ${name},`,
    '',
    'Good to see you again.',
    '',
    'It\'s been a while, but your Arcadia journey isn\'t going anywhere.',
    '',
    'Whether you\'re here to pick up where you left off, beat your previous score, take on a new challenge, or simply play something fun — there\'s always another run waiting for you.',
    '',
    'Your next game is waiting.',
    '',
    `RETURN TO ARCADIA → ${link}`,
    '',
    'See you back in the arcade.',
    '',
    '— Team Arcadia',
    '',
    'Play. Challenge. Repeat.',
    '',
    ...(supportEmail ? [`Need help? Write to ${supportEmail}.`, ''] : []),
    reason,
    '',
    advice,
  ].join('\n');

  const { html } = renderArcadiaEmail({
    preview: escapeHtml(preview),
    eyebrow: 'WELCOME BACK',
    title: 'YOUR GAMES ARE WAITING',
    hero: 'heroWelcomeBack',
    heroAlt: 'The Arcadion resting on a glowing violet ridge',
    paragraphs: [
      `Hey ${safeName},`,
      'Good to see you again. It\'s been a while, but your Arcadia journey isn\'t going anywhere.',
      'Whether you\'re here to pick up where you left off, beat your previous score, take on a new challenge, or simply play something fun — there\'s always another run waiting for you.',
    ],
    highlight: 'Your next game is waiting.',
    cta: { label: 'RETURN TO ARCADIA →', url: safeLink },
    signoff: ['See you back in the arcade.', '— Team Arcadia'],
    footerNotes: [escapeHtml(reason), escapeHtml(advice)],
    supportEmail: supportEmail ? escapeHtml(supportEmail) : null,
    assetBaseUrl,
  });

  return { subject: WELCOME_BACK_SUBJECT, text, html };
}

module.exports = {
  WELCOME_SUBJECT,
  WELCOME_BACK_SUBJECT,
  buildWelcomeEmail,
  buildWelcomeBackEmail,
  getWelcomeDisplayName,
};
