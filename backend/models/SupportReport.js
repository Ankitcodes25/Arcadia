const mongoose = require('mongoose');

/*
 * A problem report filed from Help & Support > Report a Problem.
 *
 * The report is saved before anything is emailed, so the support inbox is a
 * notification channel, not the record: a report whose email failed is still
 * here and still listed by the admin reports API. `emailDelivery` records what
 * happened to that notification so an admin can tell which reports never
 * reached the inbox.
 *
 * Reports belong to the account that filed them and are deleted with it.
 */

/** Must match REPORT_CATEGORIES in frontend/src/pages/HelpandSupport/HelpSupportModal.tsx. */
const REPORT_CATEGORIES = Object.freeze(['Bug', 'Login Issue', 'Gameplay', 'Account', 'Other']);

const REPORT_STATUSES = Object.freeze({
  OPEN: 'OPEN',
  RESOLVED: 'RESOLVED',
});

const EMAIL_DELIVERY_STATUSES = Object.freeze({
  PENDING: 'PENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
});

// Same bounds as the Report a Problem form.
const SUBJECT_MAX_LENGTH = 100;
const DESCRIPTION_MIN_LENGTH = 10;
const DESCRIPTION_MAX_LENGTH = 2000;

const supportReportSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: REPORT_CATEGORIES,
      required: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: SUBJECT_MAX_LENGTH,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: DESCRIPTION_MIN_LENGTH,
      maxlength: DESCRIPTION_MAX_LENGTH,
    },
    status: {
      type: String,
      enum: Object.values(REPORT_STATUSES),
      default: REPORT_STATUSES.OPEN,
      required: true,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    emailDelivery: {
      status: {
        type: String,
        enum: Object.values(EMAIL_DELIVERY_STATUSES),
        default: EMAIL_DELIVERY_STATUSES.PENDING,
      },
      // A short machine reason (not_configured, no_support_inbox, delivery_failed),
      // never an SMTP response, which could echo account details.
      reason: {
        type: String,
        default: null,
        maxlength: 64,
      },
      attemptedAt: {
        type: Date,
        default: null,
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Newest-first admin listing, optionally filtered by status.
supportReportSchema.index({ status: 1, createdAt: -1 });
supportReportSchema.index({ createdAt: -1 });

const SupportReport = mongoose.models.SupportReport
  || mongoose.model('SupportReport', supportReportSchema);

module.exports = {
  SupportReport,
  REPORT_CATEGORIES,
  REPORT_STATUSES,
  EMAIL_DELIVERY_STATUSES,
  SUBJECT_MAX_LENGTH,
  DESCRIPTION_MIN_LENGTH,
  DESCRIPTION_MAX_LENGTH,
};
