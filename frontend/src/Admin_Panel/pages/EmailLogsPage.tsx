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
  MailX,
  RotateCcw,
  XCircle,
} from "lucide-react";
import AdminLayout from "../components/AdminLayout";
import AdminModal from "../components/AdminModal";
import { PreviewDataNotice, StatusBadge } from "../components/AdminDisplay";
import {
  Chip,
  EmptyState,
  KeyValueGrid,
  MetricCard,
  Note,
  PageHeader,
  PageShell,
  SearchField,
} from "../components/AdminKit";
import { PREVIEW_EMAIL_LOG_TYPES, previewEmailLogs } from "../data/previewData";
import { formatDateTime, formatNumber } from "../utils/formatters";
import type {
  PreviewEmailLog,
  PreviewEmailLogStatus,
  PreviewEmailLogType,
} from "../types/adminTypes";
import "./AdminPages.css";

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
        <button type="button" className="adk-btn" onClick={onClose}>
          Close
        </button>
      }
    >
      <KeyValueGrid
        items={[
          { label: "Recipient email", value: log.recipient },
          { label: "Email type", value: log.emailType },
          { label: "Status", value: <StatusBadge status={log.status} /> },
          { label: "Date and time", value: formatDateTime(log.sentAt) },
          {
            label: "Provider message ID",
            value: log.providerMessageId ? <span className="adk-mono">{log.providerMessageId}</span> : "—",
          },
          { label: "Failure reason", value: log.failureReason || "—" },
        ]}
      />

      <Note tone="blue">
        This preview never displays SMTP credentials, passwords, reset tokens or the contents of the
        email.
      </Note>
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

  const deliveryRate = stats.total > 0 ? (stats.sent / stats.total) * 100 : 0;

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
      <PageShell>
        <PageHeader
          title="Email Logs"
          icon={<Mail />}
          subtitle="Delivery outcomes for account and support emails. Search, filter and inspect a record without exposing credentials or message contents."
          actions={
            <Chip tone={stats.failed > 0 ? "rose" : "green"} dot>
              {Math.round(deliveryRate)}% delivered
            </Chip>
          }
        />

        <PreviewDataNotice />

        <div className="adk-metrics">
          <MetricCard
            label="Total Emails"
            value={formatNumber(stats.total)}
            icon={<Mail size={21} />}
            hint="All sample delivery attempts"
          />
          <MetricCard
            label="Sent"
            value={formatNumber(stats.sent)}
            icon={<CheckCircle2 size={21} />}
            tone="green"
            hint="Accepted by the provider"
            meter={deliveryRate}
          />
          <MetricCard
            label="Failed"
            value={formatNumber(stats.failed)}
            icon={<XCircle size={21} />}
            tone="rose"
            hint="Delivery error recorded"
          />
          <MetricCard
            label="Pending"
            value={formatNumber(stats.pending)}
            icon={<Clock size={21} />}
            tone="amber"
            hint="Awaiting a provider result"
          />
        </div>

        <div className="adk-toolbar adp-email-toolbar">
          <SearchField
            value={query}
            onChange={(value) => {
              setQuery(value);
              resetPage();
            }}
            placeholder="Search recipient email"
            ariaLabel="Search email logs by recipient"
          />

          <select
            className="adk-select adp-select"
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
            className="adk-select adp-select"
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

          <div className="adp-date-range">
            <label className="adp-date">
              <span>From</span>
              <input
                type="date"
                className="adk-input"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(event) => {
                  setDateFrom(event.target.value);
                  resetPage();
                }}
                aria-label="Filter email logs from date"
              />
            </label>
            <label className="adp-date">
              <span>To</span>
              <input
                type="date"
                className="adk-input"
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

          <button type="button" className="adk-btn adk-btn--ghost" onClick={clearFilters} disabled={!hasFilters}>
            <RotateCcw size={15} aria-hidden="true" />
            Clear filters
          </button>
        </div>

        <div className="adk-table-wrap">
          <table className="adk-table">
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
                  <td className="adk-table__strong">{log.recipient}</td>
                  <td>
                    <Chip tone="violet">{log.emailType}</Chip>
                  </td>
                  <td>
                    <StatusBadge status={log.status} />
                  </td>
                  <td>{formatDateTime(log.sentAt)}</td>
                  <td>
                    {log.providerMessageId ? (
                      <span className="adk-mono adp-provider-id">{log.providerMessageId}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="adk-btn adk-btn--sm"
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
                    <EmptyState
                      icon={<MailX size={24} />}
                      title="No email logs found"
                      hint="No email logs match these filters."
                      action={
                        hasFilters ? (
                          <button type="button" className="adk-btn adk-btn--sm" onClick={clearFilters}>
                            Clear filters
                          </button>
                        ) : undefined
                      }
                    />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <nav className="adp-pager" aria-label="Email log pagination">
          <span className="adp-pager__summary">
            {filteredLogs.length === 0
              ? "0 emails"
              : `Showing ${pageStart + 1}–${Math.min(pageStart + PAGE_SIZE, filteredLogs.length)} of ${filteredLogs.length}`}
          </span>
          <div className="adp-pager__controls">
            <button
              type="button"
              className="adk-btn adk-btn--sm"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={currentPage <= 1}
            >
              <ChevronLeft size={15} aria-hidden="true" />
              Previous
            </button>
            <span className="adp-pager__page">
              Page {currentPage} of {pageCount}
            </span>
            <button
              type="button"
              className="adk-btn adk-btn--sm"
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
              disabled={currentPage >= pageCount}
            >
              Next
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          </div>
        </nav>

        {selectedLog ? (
          <EmailDetailsModal log={selectedLog} onClose={() => setSelectedLog(null)} />
        ) : null}
      </PageShell>
    </AdminLayout>
  );
}

export default EmailLogsPage;