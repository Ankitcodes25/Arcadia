/*
 * Help & Support — support request list with status tabs and a Request
 * Details modal. Preview data only.
 */

import { useMemo, useState } from "react";
import { LifeBuoy, Mail } from "lucide-react";
import AdminLayout from "../components/AdminLayout";
import AdminModal from "../components/AdminModal";
import { PreviewDataNotice, StatusBadge } from "../components/AdminDisplay";
import {
  Avatar,
  Chip,
  EmptyState,
  FilterTabs,
  KeyValueGrid,
  Note,
  PageHeader,
  PageShell,
  Person,
  SectionTitle,
  toneForPriority,
  toneForStatus,
} from "../components/AdminKit";
import { previewSupportRequests } from "../data/previewData";
import { formatDate } from "../utils/formatters";
import type { PreviewSupportRequest } from "../types/adminTypes";
import "./AdminPages.css";

type StatusFilter = "all" | PreviewSupportRequest["status"];

const STATUSES: Array<PreviewSupportRequest["status"]> = ["New", "In Progress", "Resolved", "Closed"];

function RequestDetailsModal({
  request,
  onClose,
}: {
  request: PreviewSupportRequest;
  onClose: () => void;
}) {
  return (
    <AdminModal
      title={request.subject}
      subtitle={`Request ${request.id} · ${request.category}`}
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
            title="Requires backend integration"
          >
            Mark resolved
          </button>
        </>
      }
    >
      <div className="adk-identity-head">
        <Avatar name={request.user.username} size="lg" />
        <div>
          <div className="adk-identity-head__row">
            <strong>{request.user.username}</strong>
            <Chip tone={toneForPriority(request.priority)} dot>
              {request.priority} priority
            </Chip>
            <StatusBadge status={request.status} />
          </div>
          <span className="adk-identity-head__meta">
            <span className="adk-mono">{request.user.playerId}</span>
          </span>
        </div>
      </div>

      <SectionTitle>Request</SectionTitle>
      <KeyValueGrid
        items={[
          { label: "Email", value: request.user.email },
          { label: "Category", value: request.category },
          { label: "Submitted", value: formatDate(request.submittedDate) },
        ]}
      />

      <SectionTitle>Message</SectionTitle>
      <div className="adp-message">
        <Avatar name={request.user.username} size="sm" />
        <div className="adp-message__bubble">
          <div className="adp-message__meta">
            <strong>{request.user.username}</strong>
            <span>{formatDate(request.submittedDate)}</span>
          </div>
          <p>{request.message}</p>
        </div>
      </div>

      <Note>Reply and status-change actions are disabled in this preview pending a support backend.</Note>
    </AdminModal>
  );
}

function SupportPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedRequest, setSelectedRequest] = useState<PreviewSupportRequest | null>(null);

  const counts = useMemo(() => {
    const result: Record<string, number> = { all: previewSupportRequests.length };
    STATUSES.forEach((status) => {
      result[status] = previewSupportRequests.filter((request) => request.status === status).length;
    });
    return result;
  }, []);

  const filteredRequests = useMemo(
    () =>
      previewSupportRequests.filter(
        (request) => statusFilter === "all" || request.status === statusFilter,
      ),
    [statusFilter],
  );

  return (
    <AdminLayout activePage="support">
      <PageShell>
        <PageHeader
          title="Help & Support"
          icon={<LifeBuoy />}
          subtitle="Support requests submitted by players. Click a row for the full request."
          actions={
            <Chip tone="blue" dot icon={<Mail size={13} />}>
              {counts.New} new
            </Chip>
          }
        />

        <PreviewDataNotice />

        <FilterTabs<StatusFilter>
          label="Filter support requests by status"
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
                <th>Request</th>
                <th>User</th>
                <th>Subject / Category</th>
                <th>Priority</th>
                <th>Submitted</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map((request) => (
                <tr
                  key={request.id}
                  className="adk-table__row--interactive"
                  tabIndex={0}
                  role="button"
                  aria-label={`Open support request ${request.id}`}
                  onClick={() => setSelectedRequest(request)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedRequest(request);
                    }
                  }}
                >
                  <td>
                    <span className="adk-mono">{request.id}</span>
                  </td>
                  <td>
                    <Person name={request.user.username} size="sm" />
                  </td>
                  <td>
                    <span className="adk-table__strong">{request.subject}</span>
                    <span className="adk-table__sub">{request.category}</span>
                  </td>
                  <td>
                    <Chip tone={toneForPriority(request.priority)} dot>
                      {request.priority}
                    </Chip>
                  </td>
                  <td>{formatDate(request.submittedDate)}</td>
                  <td>
                    <StatusBadge status={request.status} />
                  </td>
                </tr>
              ))}
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={<LifeBuoy size={24} />}
                      title="No requests here"
                      hint="No support requests match this filter."
                    />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {selectedRequest ? (
          <RequestDetailsModal request={selectedRequest} onClose={() => setSelectedRequest(null)} />
        ) : null}
      </PageShell>
    </AdminLayout>
  );
}

export default SupportPage;