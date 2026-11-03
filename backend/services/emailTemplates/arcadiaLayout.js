const path = require('node:path');

/*
 * The shared Arcadia email layout.
 *
 * Email clients are not browsers: Gmail strips <style> animation and ignores
 * background-clip text. So this layout is table based with inline styles.
 * Images are linked from assetBaseUrl (the backend serves ASSET_DIRECTORY at
 * /email-assets), never attached: attachments show up as files in the mail
 * client and make a message look like bulk mail. Without a public assetBaseUrl
 * the layout drops its artwork and draws the logo in CSS, so it never shows
 * broken images. Every enhancement degrades to a layout that still reads correctly:
 *   - the cube floats only where CSS animation is supported (Apple Mail, iOS);
 *     elsewhere it simply sits beside the call to action;
 *   - the heading glow is text-shadow, ignored where unsupported;
 *   - the colour scheme is pinned dark so clients do not invert the artwork.
 *
 * Every string interpolated into HTML must already be escaped with escapeHtml.
 */

const EMAIL_BACKGROUND = '#0b0316';
const ASSET_DIRECTORY = path.join(__dirname, '..', '..', 'assets', 'email');

// Built by backend/scripts/build-email-assets.py from the landing-page art.
// height is the display height at the width used in the layout, so a client
// that blocks images still reserves the right space.
const EMAIL_IMAGES = Object.freeze({
  logo: { filename: 'logo.png' },
  heroWelcome: { filename: 'hero-welcome.jpg', heroHeight: 407 },
  heroWelcomeBack: { filename: 'hero-welcome-back.jpg', heroHeight: 338 },
  cube: { filename: 'cube.png' },
  crest: { filename: 'crest.png' },
});

const FONT_STACK = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const DISPLAY_FONT_STACK = "Orbitron,'Arial Black','Segoe UI',Arial,sans-serif";

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getImage(key) {
  const image = EMAIL_IMAGES[key];
  if (!image) throw new Error(`Unknown email image: ${key}`);
  return image;
}

function imageSource(assetBaseUrl, key) {
  return escapeHtml(`${assetBaseUrl}/${encodeURIComponent(getImage(key).filename)}`);
}

const HEAD_STYLES = `
  @keyframes arcadiaFloat { 0%, 100% { transform: translateY(0) rotate(-4deg); } 50% { transform: translateY(-10px) rotate(4deg); } }
  .arcadia-float { animation: arcadiaFloat 4.5s ease-in-out infinite; }
  @media (prefers-reduced-motion: reduce) { .arcadia-float { animation: none !important; } }
  @media only screen and (max-width: 620px) {
    .arcadia-pad { padding-left: 20px !important; padding-right: 20px !important; }
    .arcadia-title { font-size: 28px !important; letter-spacing: 2px !important; }
    .arcadia-feature { display: block !important; width: 100% !important; padding: 0 0 10px !important; }
    .arcadia-cube { width: 56px !important; height: auto !important; }
    .arcadia-cta-link { padding: 14px 18px !important; font-size: 13px !important; letter-spacing: 1px !important; }
    .arcadia-hide-mobile { display: none !important; }
  }`;

function renderParagraphs(paragraphs) {
  return paragraphs
    .map((html) => `<p style="margin:0 0 16px;font-family:${FONT_STACK};font-size:16px;line-height:1.65;color:#e9dcff">${html}</p>`)
    .join('');
}

function renderAccentBar() {
  return `<table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:14px auto 0"><tr>
    <td width="28" height="3" style="background:#ff2bd6;font-size:0;line-height:0">&nbsp;</td>
    <td width="6" style="font-size:0;line-height:0">&nbsp;</td>
    <td width="56" height="3" style="background:#b44cff;font-size:0;line-height:0">&nbsp;</td>
    <td width="6" style="font-size:0;line-height:0">&nbsp;</td>
    <td width="28" height="3" style="background:#00f0ff;font-size:0;line-height:0">&nbsp;</td>
  </tr></table>`;
}

function renderFeatures(features) {
  if (!features || features.length === 0) return '';
  const cells = features.map(({ label, text }) => `<td class="arcadia-feature" width="33%" valign="top" style="padding:0 5px">
      <div style="background:#170c2c;border:1px solid #3d2263;border-radius:14px;padding:14px 12px;text-align:center">
        <div style="font-family:${DISPLAY_FONT_STACK};font-size:12px;font-weight:700;letter-spacing:3px;color:#d7a6ff">${label}</div>
        <div style="margin-top:6px;font-family:${FONT_STACK};font-size:13px;line-height:1.5;color:#bfaedb">${text}</div>
      </div>
    </td>`).join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:8px 0 24px"><tr>${cells}</tr></table>`;
}

function renderHighlight(html) {
  if (!html) return '';
  return `<div style="margin:8px 0 24px;padding:18px 20px;border-radius:14px;border:1px solid #4b2a78;border-left:3px solid #ff2bd6;background:#170c2c;font-family:${DISPLAY_FONT_STACK};font-size:16px;font-weight:700;letter-spacing:1px;color:#ffffff">${html}</div>`;
}

function renderLogo(assetBaseUrl) {
  if (assetBaseUrl) {
    return `<img src="${imageSource(assetBaseUrl, 'logo')}" width="44" height="44" alt="" style="display:block;width:44px;height:44px;border:0;border-radius:12px">`;
  }
  return `<table role="presentation" cellspacing="0" cellpadding="0"><tr>
    <td width="44" height="44" align="center" valign="middle" bgcolor="#a93cff" style="width:44px;height:44px;border-radius:12px;background:#a93cff;background-image:linear-gradient(135deg,#e03cff 0%,#6b2bff 100%);font-family:${DISPLAY_FONT_STACK};font-size:22px;font-weight:800;line-height:44px;color:#ffffff">A</td>
  </tr></table>`;
}

function renderCallToAction({ label, url }, assetBaseUrl) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:8px 0 28px"><tr>
    <td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0"><tr>
        ${assetBaseUrl ? `<td valign="middle" style="padding-right:14px">
          <img class="arcadia-float arcadia-cube" src="${imageSource(assetBaseUrl, 'cube')}" width="80" height="87" alt="" style="display:block;width:80px;height:auto;border:0">
        </td>` : ''}
        <td valign="middle" bgcolor="#a93cff" style="border-radius:12px;background:#a93cff;background-image:linear-gradient(135deg,#e03cff 0%,#8b3bff 100%);box-shadow:0 8px 24px rgba(180,76,255,0.45)">
          <a class="arcadia-cta-link" href="${url}" style="display:inline-block;white-space:nowrap;padding:16px 28px;font-family:${DISPLAY_FONT_STACK};font-size:14px;font-weight:700;letter-spacing:2px;color:#ffffff;text-decoration:none;border-radius:12px">${label}</a>
        </td>
      </tr></table>
    </td>
  </tr></table>`;
}

/**
 * Renders a complete Arcadia-themed email document.
 *
 * All text arguments are HTML fragments that the caller has already escaped;
 * contentHtml is an optional block of caller-built markup placed after the
 * paragraphs. assetBaseUrl is the public https base for images, or null for
 * the image-free layout.
 */
function renderArcadiaEmail({
  preview,
  eyebrow,
  title,
  hero,
  heroAlt,
  paragraphs,
  contentHtml,
  features,
  highlight,
  cta,
  signoff,
  footerNotes,
  supportEmail,
  assetBaseUrl = null,
}) {
  const showHero = Boolean(hero && assetBaseUrl);
  const heroRow = showHero
    ? `<tr><td bgcolor="${EMAIL_BACKGROUND}" style="padding:0;line-height:0"><img src="${imageSource(assetBaseUrl, hero)}" width="600" height="${getImage(hero).heroHeight}" alt="${heroAlt || ''}" style="display:block;width:100%;max-width:600px;height:auto;border:0;color:#9c8bb3;font-family:${FONT_STACK};font-size:12px"></td></tr>`
    : '';
  const crest = assetBaseUrl
    ? `<img src="${imageSource(assetBaseUrl, 'crest')}" width="30" height="38" alt="" style="display:block;width:30px;height:auto;border:0;margin:0 auto 12px">`
    : '';
  const supportLine = supportEmail
    ? `<p style="margin:0 0 8px">Need help? Write to <a href="mailto:${supportEmail}" style="color:#d7a6ff;text-decoration:underline">${supportEmail}</a>.</p>`
    : '';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${title}</title>
<style>${HEAD_STYLES}</style>
</head>
<body style="margin:0;padding:0;background:${EMAIL_BACKGROUND};color:#f7efff">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${preview}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="${EMAIL_BACKGROUND}" style="background:${EMAIL_BACKGROUND}">
<tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="600" cellspacing="0" cellpadding="0" bgcolor="${EMAIL_BACKGROUND}" style="width:100%;max-width:600px;border-collapse:separate;border:1px solid #3a1d5c;border-radius:22px;overflow:hidden;background:${EMAIL_BACKGROUND}">
    <tr><td class="arcadia-pad" style="padding:22px 28px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
        <td valign="middle" width="56">${renderLogo(assetBaseUrl)}</td>
        <td valign="middle" style="font-family:${DISPLAY_FONT_STACK};font-size:20px;font-weight:800;letter-spacing:6px;color:#ffffff">ARCADIA</td>
        <td class="arcadia-hide-mobile" valign="middle" align="right" style="font-family:${DISPLAY_FONT_STACK};font-size:10px;font-weight:700;letter-spacing:3px;color:#b98cff">PLAY · CHALLENGE · REPEAT</td>
      </tr></table>
    </td></tr>
    ${heroRow}
    <tr><td class="arcadia-pad" align="center" style="padding:${showHero ? '8px' : '28px'} 28px 4px;background-image:radial-gradient(ellipse at 50% 0%,rgba(180,76,255,0.22) 0%,rgba(11,3,22,0) 70%)">
      <div style="font-family:${DISPLAY_FONT_STACK};font-size:12px;font-weight:700;letter-spacing:5px;color:#c56bff">${eyebrow}</div>
      <h1 class="arcadia-title" style="margin:10px 0 0;font-family:${DISPLAY_FONT_STACK};font-size:34px;line-height:1.15;font-weight:800;letter-spacing:3px;color:#ffffff;text-shadow:0 0 18px rgba(197,107,255,0.65)">${title}</h1>
      ${renderAccentBar()}
    </td></tr>
    <tr><td class="arcadia-pad" style="padding:26px 28px 6px">
      ${renderParagraphs(paragraphs)}
      ${contentHtml || ''}
      ${renderFeatures(features)}
      ${renderHighlight(highlight)}
      ${cta ? renderCallToAction(cta, assetBaseUrl) : ''}
      ${signoff ? renderParagraphs(signoff) : ''}
      <p style="margin:4px 0 24px;font-family:${DISPLAY_FONT_STACK};font-size:12px;font-weight:700;letter-spacing:4px;color:#ff5fe0">PLAY. CHALLENGE. REPEAT.</p>
    </td></tr>
    <tr><td class="arcadia-pad" align="center" style="padding:22px 28px 28px;border-top:1px solid #2e1a4a">
      ${crest}
      <div style="font-family:${FONT_STACK};font-size:12px;line-height:1.6;color:#9c8bb3">
        ${supportLine}
        ${footerNotes.map((note) => `<p style="margin:0 0 8px">${note}</p>`).join('')}
      </div>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;

  return { html };
}

module.exports = {
  ASSET_DIRECTORY,
  EMAIL_BACKGROUND,
  EMAIL_IMAGES,
  FONT_STACK,
  escapeHtml,
  renderArcadiaEmail,
};
