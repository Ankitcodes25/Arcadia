/*
 * Player Reports — reports table with a Report Details modal.
 *
 * Preview data only; resolution actions are display placeholders pending a
 * future moderation backend.
 */

import { useMemo, useState } from "react";
import AdminLayout from "../components/AdminLayout";
import AdminModal from "../components/AdminModal";
import { PreviewDataNotice, StatusBadge } from "../components/AdminDisplay";
import { previewReports } from "../data/previewData";
import { formatDate, formatRelativeTime } from "../utils/formatters";
import type { PreviewReport } from "../types/adminTypes";
import "./ListPages.css";

function ReportDetailsModal({ report, onClose }: { report: PreviewReport; onClose: () => void }) {
  return (
    <AdminModal
      title={`Report ${report.id}`}
      subtitle={`Submitted ${formatRelativeTime(report.submittedDate)}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="adm-btn" onClick={onClose}>
            Close
          </button>
          <button type="button" className="adm-btn adm-btn--primary" disabled title="Requires backend integration and authorization">
            Resolve report
          </button>
        </>
      }
    >
      <div className="adm-kv-grid">
        <div className="adm-kv">
          <span className="adm-kv__label">Reported player</span>
          <span className="adm-kv__value">
            {report.reportedPlayer.displayName} <span className="adm-mono">({report.reportedPlayer.playerId})</span>
          </span>
        </div>
        <div className="adm-kv">
          <span className="adm-kv__label">Reporting player</span>
          <span className="adm-kv__value">
            {report.reportingPlayer.displayName} <span className="adm-mono">({report.reportingPlayer.playerId})</span>
          </span>
        </div>
        <div className="adm-kv">
          <span className="adm-kv__label">Reason</span>
          <span className="adm-kv__value">{report.reason}</span>
        </div>
        <div className="adm-kv">
          <span className="adm-kv__label">Submitted</span>
          <span className="adm-kv__value">{formatDate(report.submittedDate)}</span>
        </div>
        <div className="adm-kv">
          <span className="adm-kv__label">Status</span>
          <span className="adm-kv__value">
            <StatusBadge status={report.status} />
          </span>
        </div>
      </div>

      <h4 className="adm-modal__section-title">Report details</h4>
      <p className="lp-detail-text">{report.details}</p>

      <p className="lp-note">
        Resolution actions are disabled in this preview. Acting on reports requires a future
        moderation backend and explicit authorization.
      </p>
    </AdminModal>
  );
}

function ReportsPage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedReport, setSelectedReport] = useState<PreviewReport | null>(null);

  const filteredReports = useMemo(
    () => previewReports.filter((report) => statusFilter === "all" || report.status === statusFilter),
    [statusFilter],
  );

  return (
    <AdminLayout activePage="reports">
      <div className="adm-page-head">
        <div>
          <h2 className="adm-page-head__title">Player Reports</h2>
          <p className="adm-page-head__sub">
            Player-submitted reports awaiting review. Click a row for the full report.
          </p>
        </div>
      </div>

      <PreviewDataNotice />

      <div className="adm-toolbar">
        <select
          className="adm-select adm-toolbar__filter"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          aria-label="Filter reports by status"
        >
          <option value="all">All statuses</option>
          <option value="Open">Open</option>
          <option value="Under Review">Under Review</option>
          <option value="Resolved">Resolved</option>
          <option value="Dismissed">Dismissed</option>
        </select>
      </div>

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Report</th>
              <th>Reported Player</th>
              <th>Reporting Player</th>
              <th>Reason</th>
              <th>Submission Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredReports.map((report) => (
              <tr
                key={report.id}
                className="adm-table__row--interactive"
                tabIndex={0}
                role="button"
                aria-label={`Open report ${report.id}`}
                onClick={() => setSelectedReport(report)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedReport(report);
                  }
                }}
              >
                <td>
                  <span className="adm-mono">{report.id}</span>
                </td>
                <td className="adm-table__cell-strong">{report.reportedPlayer.username}</td>
                <td>{report.reportingPlayer.username}</td>
                <td>{report.reason}</td>
                <td>{formatDate(report.submittedDate)}</td>
                <td>
                  <StatusBadge status={report.status} />
                </td>
              </tr>
            ))}
            {filteredReports.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="adm-empty">No reports match this filter.</div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selectedReport ? (
        <ReportDetailsModal report={selectedReport} onClose={() => setSelectedReport(null)} />
      ) : null}
    </AdminLayout>
  );
}

export default ReportsPage;
