const { FONT_STACK, escapeHtml, renderArcadiaEmail } = require('./arcadiaLayout');

const SUBJECT_PREFIX = '[Arcadia Report]';

// Header values must never carry line breaks (header injection), and a mail
// subject reads best on one short line.
function toHeaderText(value, maxLength) {
  return String(value).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, maxLength);
}

function escapeMultiline(value) {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

function renderDetailRows(rows) {
  return rows.map(([label, value]) => `<tr>
    <td valign="top" style="padding:8px 12px 8px 0;font-family:${FONT_STACK};font-size:12px;font-weight:700;letter-spacing:1px;color:#b98cff;white-space:nowrap">${escapeHtml(label)}</td>
    <td valign="top" style="padding:8px 0;font-family:${FONT_STACK};font-size:14px;line-height:1.5;color:#f2e8ff;word-break:break-word">${escapeHtml(value)}</td>
  </tr>`).join('');
}

/**
 * The notification sent to the support inbox for one problem report.
 * `report` is the saved SupportReport; `reporter` is the safe user who filed it.
 * Reply-To is the reporter, so replying from the inbox answers them directly.
 */
function buildSupportReportEmail({ report, reporter, assetBaseUrl = null }) {
  const reporterName = reporter.username || reporter.displayName || reporter.name || 'Unknown player';
  const submittedAt = new Date(report.createdAt).toISOString();
  const rows = [
    ['Category', report.category],
    ['Subject', report.subject],
    ['Player', reporterName],
    ['Email', reporter.email],
    ['Player ID', reporter.playerId || 'not assigned'],
    ['User ID', String(report.userId)],
    ['Report ID', String(report._id)],
    ['Submitted', submittedAt],
  ];

  const subject = toHeaderText(`${SUBJECT_PREFIX} ${report.category}: ${report.subject}`, 160);
  const text = [
    'A player filed a problem report on Arcadia.',
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    'Description:',
    report.description,
    '',
    'Reply to this email to answer the player directly.',
  ].join('\n');

  const contentHtml = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;border-collapse:collapse">${renderDetailRows(rows)}</table>
    <div style="margin:0 0 24px;padding:18px 20px;border-radius:14px;border:1px solid #4b2a78;border-left:3px solid #ff2bd6;background:#170c2c">
      <div style="font-family:${FONT_STACK};font-size:12px;font-weight:700;letter-spacing:1px;color:#b98cff;margin-bottom:8px">DESCRIPTION</div>
      <div style="font-family:${FONT_STACK};font-size:15px;line-height:1.6;color:#f2e8ff;word-break:break-word">${escapeMultiline(report.description)}</div>
    </div>`;

  const { html } = renderArcadiaEmail({
    preview: escapeHtml(toHeaderText(`${report.category}: ${report.subject}`, 120)),
    eyebrow: 'SUPPORT INBOX',
    title: 'NEW PROBLEM REPORT',
    paragraphs: ['A player filed a problem report from Help &amp; Support.'],
    contentHtml,
    footerNotes: [
      'Reply to this email to answer the player directly.',
      'This report is also stored in Arcadia and listed by the admin reports API.',
    ],
    assetBaseUrl,
  });

  return {
    subject,
    text,
    html,
    replyTo: reporter.email,
  };
}

module.exports = {
  SUBJECT_PREFIX,
  buildSupportReportEmail,
  toHeaderText,
};
