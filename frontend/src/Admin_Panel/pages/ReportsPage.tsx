/*
 * Player Reports — reports table with status tabs and a Report Details modal.
 *
 * Preview data only; resolution actions are display placeholders pending a
 * future moderation backend.
 */

import { useMemo, useState } from "react";
import { Flag, ShieldAlert, User } from "lucide-react";
import AdminLayout from "../components/AdminLayout";
import AdminModal from "../components/AdminModal";
import { PreviewDataNotice, StatusBadge } from "../components/AdminDisplay";
import {
  Chip,
  DetailText,
  EmptyState,
  FilterTabs,
  KeyValueGrid,
  Note,
  PageHeader,
  PageShell,
  Person,
  SectionTitle,
  toneForStatus,
} from "../components/AdminKit";
import { previewReports } from "../data/previewData";
import { formatDate, formatRelativeTime } from "../utils/formatters";
import type { PreviewReport } from "../types/adminTypes";
import "./AdminPages.css";

type StatusFilter = "all" | PreviewReport["status"];

const STATUSES: Array<PreviewReport["status"]> = ["Open", "Under Review", "Resolved", "Dismissed"];

function ReportDetailsModal({ report, onClose }: { report: PreviewReport; onClose: () => void }) {
  return (
    <AdminModal
      title={`Report ${report.id}`}
      subtitle={`Submitted ${formatRelativeTime(report.submittedDate)}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="adk-btn" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="adk-btn adk-btn--primary"
            disabled
            title="Requires backend integration and authorization"
          >
            Resolve report
          </button>
        </>
      }
    >
      <div className="adp-people">
        <div className="adp-people__card adp-people__card--reported">
          <span className="adp-people__label">
            <ShieldAlert size={13} aria-hidden="true" />
            Reported player
          </span>
          <Person
            name={report.reportedPlayer.displayName}
            sub={<span className="adk-mono">{report.reportedPlayer.playerId}</span>}
            tone="rose"
            size="lg"
          />
        </div>
        <div className="adp-people__card">
          <span className="adp-people__label">
            <User size={13} aria-hidden="true" />
            Reported by
          </span>
          <Person
            name={report.reportingPlayer.displayName}
            sub={<span className="adk-mono">{report.reportingPlayer.playerId}</span>}
            tone="blue"
            size="lg"
          />
        </div>
      </div>

      <SectionTitle>Overview</SectionTitle>
      <KeyValueGrid
        items={[
          { label: "Reason", value: report.reason },
          { label: "Submitted", value: formatDate(report.submittedDate) },
          { label: "Status", value: <StatusBadge status={report.status} /> },
        ]}
      />

      <SectionTitle>Report details</SectionTitle>
      <DetailText>{report.details}</DetailText>

      <Note>
        Resolution actions are disabled in this preview. Acting on reports requires a future
        moderation backend and explicit authorization.
      </Note>
    </AdminModal>
  );
}

function ReportsPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedReport, setSelectedReport] = useState<PreviewReport | null>(null);

  const counts = useMemo(() => {
    const result: Record<string, number> = { all: previewReports.length };
    STATUSES.forEach((status) => {
      result[status] = previewReports.filter((report) => report.status === status).length;
    });
    return result;
  }, []);

  const filteredReports = useMemo(
    () => previewReports.filter((report) => statusFilter === "all" || report.status === statusFilter),
    [statusFilter],
  );

  return (
    <AdminLayout activePage="reports">
      <PageShell>
        <PageHeader
          title="Player Reports"
          icon={<Flag />}
          subtitle="Player-submitted reports awaiting review. Click a row for the full report."
          actions={
            <Chip tone="amber" dot>
              {counts.Open + counts["Under Review"]} need attention
            </Chip>
          }
        />

        <PreviewDataNotice />

        <FilterTabs<StatusFilter>
          label="Filter reports by status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "all", label: "All", count: counts.all },
            ...STATUSES.map((status) => ({
              value: status as StatusFilter,
              label: status,
              count: counts[status],
              tone: toneForStatus(status),
            })),
          ]}
        />

        <div className="adk-table-wrap">
          <table className="adk-table">
            <thead>
              <tr>
                <th>Report</th>
                <th>Reported Player</th>
                <th>Reporting Player</th>
                <th>Reason</th>
                <th>Submitted</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.map((report) => (
                <tr
                  key={report.id}
                  className="adk-table__row--interactive"
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
                    <span className="adk-mono">{report.id}</span>
                  </td>
                  <td>
                    <Person
                      name={report.reportedPlayer.username}
                      sub={<span className="adk-mono">{report.reportedPlayer.playerId}</span>}
                      tone="rose"
                      size="sm"
                    />
                  </td>
                  <td>
                    <Person name={report.reportingPlayer.username} tone="blue" size="sm" />
                  </td>
                  <td>
                    <Chip tone="violet">{report.reason}</Chip>
                  </td>
                  <td>{formatDate(report.submittedDate)}</td>
                  <td>
                    <StatusBadge status={report.status} />
                  </td>
                </tr>
              ))}
              {filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={<Flag size={24} />}
                      title="No reports here"
                      hint="No reports match this filter."
                    />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {selectedReport ? (
          <ReportDetailsModal report={selectedReport} onClose={() => setSelectedReport(null)} />
        ) : null}
      </PageShell>
    </AdminLayout>
  );
}

export default ReportsPage;