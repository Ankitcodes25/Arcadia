const mongoose = require('mongoose');
const {
  SupportReport,
  REPORT_CATEGORIES,
  REPORT_STATUSES,
  EMAIL_DELIVERY_STATUSES,
  SUBJECT_MAX_LENGTH,
  DESCRIPTION_MIN_LENGTH,
  DESCRIPTION_MAX_LENGTH,
} = require('../models/SupportReport');
const emailService = require('./emailService');
const {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_PAGE,
  parsePositiveInteger,
} = require('./adminUserService');

const REPORT_FIELDS = Object.freeze(['category', 'subject', 'description']);
// Control characters other than tab and newline have no place in a report and
// would garble the support email.
const DISALLOWED_CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const REPORTER_FIELDS = 'email username displayName name playerId';

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.expose = true;
  return error;
}

function cleanText(value) {
  return value.replace(/\r\n?/g, '\n').replace(DISALLOWED_CONTROL_CHARACTERS, '').trim();
}

/*
 * Validates a report body with the same rules as the form. The body may hold
 * only the three report fields; anything else is rejected rather than ignored.
 */
function parseReportInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw createError('Request body must be an object', 400);
  }
  if (Object.keys(body).some((key) => !REPORT_FIELDS.includes(key))) {
    throw createError('Request contains unsupported fields', 400);
  }

  const { category, subject, description } = body;
  if (typeof category !== 'string' || !REPORT_CATEGORIES.includes(category)) {
    throw createError(`Category must be one of: ${REPORT_CATEGORIES.join(', ')}`, 400);
  }
  if (typeof subject !== 'string' || typeof description !== 'string') {
    throw createError('Subject and description must be text', 400);
  }

  // A subject is one line; collapse any line breaks into spaces.
  const cleanSubject = cleanText(subject).replace(/\s+/g, ' ');
  const cleanDescription = cleanText(description);

  if (!cleanSubject) throw createError('Enter a subject.', 400);
  if (cleanSubject.length > SUBJECT_MAX_LENGTH) {
    throw createError(`Keep the subject under ${SUBJECT_MAX_LENGTH} characters.`, 400);
  }
  if (!cleanDescription) throw createError('Describe the problem.', 400);
  if (cleanDescription.length < DESCRIPTION_MIN_LENGTH) {
    throw createError(`Add a little more detail (at least ${DESCRIPTION_MIN_LENGTH} characters).`, 400);
  }
  if (cleanDescription.length > DESCRIPTION_MAX_LENGTH) {
    throw createError(`Keep the description under ${DESCRIPTION_MAX_LENGTH} characters.`, 400);
  }

  return { category, subject: cleanSubject, description: cleanDescription };
}

function toOwnReport(report) {
  return {
    id: String(report._id),
    category: report.category,
    subject: report.subject,
    status: report.status,
    createdAt: report.createdAt,
  };
}

function toAdminReport(report) {
  const reporter = report.userId && typeof report.userId === 'object' && report.userId._id
    ? report.userId
    : null;

  return {
    id: String(report._id),
    category: report.category,
    subject: report.subject,
    description: report.description,
    status: report.status,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    resolvedAt: report.resolvedAt || null,
    emailDelivery: {
      status: report.emailDelivery ? report.emailDelivery.status : EMAIL_DELIVERY_STATUSES.PENDING,
      reason: report.emailDelivery ? report.emailDelivery.reason : null,
      attemptedAt: report.emailDelivery ? report.emailDelivery.attemptedAt : null,
    },
    reporter: reporter
      ? {
        id: String(reporter._id),
        email: reporter.email,
        username: reporter.username || null,
        displayName: reporter.displayName || reporter.name || null,
        playerId: reporter.playerId || null,
      }
      : null,
  };
}

function getDeliveryStatus(delivery) {
  if (delivery && delivery.sent) return EMAIL_DELIVERY_STATUSES.SENT;
  if (delivery && delivery.reason === 'delivery_failed') return EMAIL_DELIVERY_STATUSES.FAILED;
  return EMAIL_DELIVERY_STATUSES.SKIPPED;
}

/*
 * Saves a report for the signed-in user, then emails it to the support inbox.
 * The report is stored first: an email failure is recorded on the report and
 * logged, and never turns a saved report into an error for the player.
 */
async function createReport({ reporter, body }) {
  const input = parseReportInput(body);
  const report = await SupportReport.create({ ...input, userId: reporter.id });

  let delivery;
  try {
    delivery = await emailService.sendSupportReportEmail({ report, reporter });
  } catch {
    delivery = { sent: false, reason: 'delivery_failed' };
  }

  const emailDelivery = {
    status: getDeliveryStatus(delivery),
    reason: delivery && !delivery.sent ? String(delivery.reason || 'unknown').slice(0, 64) : null,
    attemptedAt: new Date(),
  };
  if (emailDelivery.status === EMAIL_DELIVERY_STATUSES.SKIPPED) {
    console.warn(
      `[support] report ${report._id} saved but not emailed (${emailDelivery.reason}): `
        + 'set EMAIL_PROVIDER=smtp, the SMTP_* values and SUPPORT_INBOX_EMAIL in backend/.env, then restart the backend.',
    );
  }

  await SupportReport.updateOne({ _id: report._id }, { $set: { emailDelivery } });
  report.emailDelivery = emailDelivery;
  return toOwnReport(report);
}

function parseReportId(value) {
  if (typeof value !== 'string' || !mongoose.isValidObjectId(value)) {
    throw createError('Invalid report ID', 400);
  }
  return new mongoose.Types.ObjectId(value);
}

function parseStatusFilter(value) {
  if (value === undefined || value === '') return null;
  if (typeof value !== 'string' || !Object.values(REPORT_STATUSES).includes(value)) {
    throw createError('Status must be OPEN or RESOLVED', 400);
  }
  return value;
}

async function listReports(query = {}) {
  const source = query && typeof query === 'object' ? query : {};
  const page = parsePositiveInteger(source.page, 'page', DEFAULT_PAGE, MAX_PAGE);
  const limit = parsePositiveInteger(source.limit, 'limit', DEFAULT_LIMIT, MAX_LIMIT);
  const status = parseStatusFilter(source.status);
  const filter = status ? { status } : {};

  const [reports, total] = await Promise.all([
    SupportReport.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('userId', REPORTER_FIELDS),
    SupportReport.countDocuments(filter),
  ]);

  return {
    reports: reports.map(toAdminReport),
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
}

async function updateReportStatus({ reportId, body, actingUserId }) {
  const id = parseReportId(reportId);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw createError('Request body must be an object', 400);
  }
  if (Object.keys(body).some((key) => key !== 'status')) {
    throw createError('Request contains unsupported fields', 400);
  }
  const status = parseStatusFilter(body.status);
  if (!status) throw createError('Status must be OPEN or RESOLVED', 400);

  const resolved = status === REPORT_STATUSES.RESOLVED;
  const report = await SupportReport.findOneAndUpdate(
    { _id: id },
    {
      $set: {
        status,
        resolvedAt: resolved ? new Date() : null,
        resolvedBy: resolved ? actingUserId : null,
      },
    },
    { returnDocument: 'after' },
  ).populate('userId', REPORTER_FIELDS);

  if (!report) throw createError('Report not found', 404);
  return toAdminReport(report);
}

module.exports = {
  createReport,
  listReports,
  parseReportInput,
  updateReportStatus,
};
