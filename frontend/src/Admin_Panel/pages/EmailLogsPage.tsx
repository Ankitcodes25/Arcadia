/*
 * Email Logs — preview-only delivery log with local search, filters, pagination
 * and a details modal. No API, database or email-sending code is involved.
 *
 * The rows come from development preview data. A future backend integration can
 * replace `previewEmailLogs` with a service response without changing this page's
 * shape. Credentials, message bodies and reset tokens are never displayed.
 */

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Mail,
  RotateCcw,
  Search,
  XCircle,
} from "lucide-react";
import AdminLayout from "../components/AdminLayout";
import AdminModal from "../components/AdminModal";
import { PreviewDataNotice, StatCard, StatusBadge } from "../components/AdminDisplay";
import { PREVIEW_EMAIL_LOG_TYPES, previewEmailLogs } from "../data/previewData";
import { formatDateTime, formatNumber } from "../utils/formatters";
import type {
  PreviewEmailLog,
  PreviewEmailLogStatus,
  PreviewEmailLogType,
} from "../types/adminTypes";
import "./ListPages.css";
import "./EmailLogsPage.css";

const PAGE_SIZE = 8;

const STATUS_OPTIONS: Array<{ value: "all" | PreviewEmailLogStatus; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "Sent", label: "Sent" },
  { value: "Failed", label: "Failed" },
  { value: "Pending", label: "Pending" },
];

function parseDateBoundary(value: string, endOfDay = false): number | null {
  if (!value) return null;
  const time = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`).getTime();
  return Number.isNaN(time) ? null : time;
}

function EmailDetailsModal({
  log,
  onClose,
}: {
  log: PreviewEmailLog;
  onClose: () => void;
}) {
  return (
    <AdminModal
      title="Email delivery details"
      subtitle="Read-only delivery record"
      onClose={onClose}
      wide
      footer={
        <button type="button" className="adm-btn" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="adm-kv-grid">
        <div className="adm-kv">
          <span className="adm-kv__label">Recipient email</span>
          <span className="adm-kv__value">{log.recipient}</span>
        </div>
        <div className="adm-kv">
          <span className="adm-kv__label">Email type</span>
          <span className="adm-kv__value">{log.emailType}</span>
        </div>
        <div className="adm-kv">
          <span className="adm-kv__label">Status</span>
          <span className="adm-kv__value">
            <StatusBadge status={log.status} />
          </span>
        </div>
        <div className="adm-kv">
          <span className="adm-kv__label">Date and time</span>
          <span className="adm-kv__value">{formatDateTime(log.sentAt)}</span>
        </div>
        <div className="adm-kv">
          <span className="adm-kv__label">Provider message ID</span>
          <span className="adm-kv__value">
            {log.providerMessageId ? <span className="adm-mono">{log.providerMessageId}</span> : "—"}
          </span>
        </div>
        <div className="adm-kv">
          <span className="adm-kv__label">Failure reason</span>
          <span className="adm-kv__value">{log.failureReason || "—"}</span>
        </div>
      </div>

      <p className="lp-note">
        This preview never displays SMTP credentials, passwords, reset tokens or the contents of
        the email.
      </p>
    </AdminModal>
  );
}

function EmailLogsPage() {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | PreviewEmailLogType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | PreviewEmailLogStatus>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<PreviewEmailLog | null>(null);

  const stats = useMemo(() => ({
    total: previewEmailLogs.length,
    sent: previewEmailLogs.filter((log) => log.status === "Sent").length,
    failed: previewEmailLogs.filter((log) => log.status === "Failed").length,
    pending: previewEmailLogs.filter((log) => log.status === "Pending").length,
  }), []);

  const filteredLogs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const from = parseDateBoundary(dateFrom);
    const to = parseDateBoundary(dateTo, true);

    return previewEmailLogs
      .filter((log) => {
        if (needle && !log.recipient.toLowerCase().includes(needle)) return false;
        if (typeFilter !== "all" && log.emailType !== typeFilter) return false;
        if (statusFilter !== "all" && log.status !== statusFilter) return false;

        const sentAt = new Date(log.sentAt).getTime();
        if (from !== null && sentAt < from) return false;
        if (to !== null && sentAt > to) return false;
        return true;
      })
      .sort((first, second) => Date.parse(second.sentAt) - Date.parse(first.sentAt));
  }, [query, typeFilter, statusFilter, dateFrom, dateTo]);

  const pageCount = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filteredLogs.slice(pageStart, pageStart + PAGE_SIZE);
  const hasFilters = Boolean(
    query.trim() || typeFilter !== "all" || statusFilter !== "all" || dateFrom || dateTo,
  );

  const resetPage = () => setPage(1);

  const clearFilters = () => {
    setQuery("");
    setTypeFilter("all");
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  return (
    <AdminLayout activePage="emailLogs">
      <div className="adm-page-head">
        <div>
          <h2 className="adm-page-head__title">Email Logs</h2>
          <p className="adm-page-head__sub">
            Delivery outcomes for account and support emails. Search, filter and inspect a record
            without exposing credentials or message contents.
          </p>
        </div>
      </div>

      <PreviewDataNotice />

      <div className="adm-stats-grid">
        <StatCard
          label="Total Emails"
          value={formatNumber(stats.total)}
          icon={<Mail size={20} />}
          hint="All sample delivery attempts"
        />
        <StatCard
          label="Sent"
          value={formatNumber(stats.sent)}
          icon={<CheckCircle2 size={20} />}
          tone="success"
          hint="Accepted by the provider"
        />
        <StatCard
          label="Failed"
          value={formatNumber(stats.failed)}
          icon={<XCircle size={20} />}
          tone="warning"
          hint="Delivery error recorded"
        />
        <StatCard
          label="Pending"
          value={formatNumber(stats.pending)}
          icon={<Clock size={20} />}
          hint="Awaiting a provider result"
        />
      </div>

      <div className="adm-toolbar ael-toolbar">
        <label className="ael-search">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              resetPage();
            }}
            placeholder="Search recipient email"
            aria-label="Search email logs by recipient"
          />
        </label>

        <select
          className="adm-select adm-toolbar__filter"
          value={typeFilter}
          onChange={(event) => {
            setTypeFilter(event.target.value as "all" | PreviewEmailLogType);
            resetPage();
          }}
          aria-label="Filter email logs by type"
        >
          <option value="all">All email types</option>
          {PREVIEW_EMAIL_LOG_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>

        <select
          className="adm-select adm-toolbar__filter"
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value as "all" | PreviewEmailLogStatus);
            resetPage();
          }}
          aria-label="Filter email logs by status"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <div className="ael-date-range">
          <label className="ael-date">
            <span>From</span>
            <input
              type="date"
              className="adm-input"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(event) => {
                setDateFrom(event.target.value);
                resetPage();
              }}
              aria-label="Filter email logs from date"
            />
          </label>
          <label className="ael-date">
            <span>To</span>
            <input
              type="date"
              className="adm-input"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => {
                setDateTo(event.target.value);
                resetPage();
              }}
              aria-label="Filter email logs to date"
            />
          </label>
        </div>

        <button
          type="button"
          className="adm-btn ael-clear"
          onClick={clearFilters}
          disabled={!hasFilters}
        >
          <RotateCcw size={15} aria-hidden="true" />
          Clear filters
        </button>
      </div>

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Recipient</th>
              <th>Email Type</th>
              <th>Status</th>
              <th>Date &amp; Time</th>
              <th>Provider ID</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((log) => (
              <tr key={log.id}>
                <td className="adm-table__cell-strong">{log.recipient}</td>
                <td>{log.emailType}</td>
                <td>
                  <StatusBadge status={log.status} />
                </td>
                <td>{formatDateTime(log.sentAt)}</td>
                <td>
                  {log.providerMessageId ? (
                    <span className="adm-mono ael-provider-id">{log.providerMessageId}</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    className="adm-btn adm-btn--sm ael-view"
                    onClick={() => setSelectedLog(log)}
                    aria-label={`View details for email ${log.id}`}
                  >
                    <Eye size={14} aria-hidden="true" />
                    View Details
                  </button>
                </td>
              </tr>
            ))}
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="adm-empty">
                    No email logs match these filters.
                    {hasFilters ? (
                      <button type="button" className="ael-empty-clear" onClick={clearFilters}>
                        Clear filters
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="ael-pagination" aria-label="Email log pagination">
        <span className="ael-pagination__summary">
          {filteredLogs.length === 0
            ? "0 emails"
            : `Showing ${pageStart + 1}–${Math.min(pageStart + PAGE_SIZE, filteredLogs.length)} of ${filteredLogs.length}`}
        </span>
        <div className="ael-pagination__controls">
          <button
            type="button"
            className="adm-btn adm-btn--sm"
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            disabled={currentPage <= 1}
          >
            <ChevronLeft size={15} aria-hidden="true" />
            Previous
          </button>
          <span className="ael-pagination__page">
            Page {currentPage} of {pageCount}
          </span>
          <button
            type="button"
            className="adm-btn adm-btn--sm"
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
            disabled={currentPage >= pageCount}
          >
            Next
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      {selectedLog ? (
        <EmailDetailsModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      ) : null}
    </AdminLayout>
  );
}

export default EmailLogsPage;
