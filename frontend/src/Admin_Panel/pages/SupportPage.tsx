/*
 * Help & Support — support request list with a Request Details modal.
 * Preview data only.
 */

import { useMemo, useState } from "react";
import AdminLayout from "../components/AdminLayout";
import AdminModal from "../components/AdminModal";
import { PreviewDataNotice, StatusBadge } from "../components/AdminDisplay";
import { previewSupportRequests } from "../data/previewData";
import { formatDate } from "../utils/formatters";
import type { PreviewSupportRequest } from "../types/adminTypes";
import "./ListPages.css";

const PRIORITY_TONES: Record<string, string> = {
  High: "adm-badge--danger",
  Normal: "adm-badge--info",
  Low: "adm-badge--neutral",
};

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
          <button type="button" className="adm-btn" onClick={onClose}>
            Close
          </button>
          <button type="button" className="adm-btn adm-btn--primary" disabled title="Requires backend integration">
            Mark resolved
          </button>
        </>
      }
    >
      <div className="adm-kv-grid">
        <div className="adm-kv">
          <span className="adm-kv__label">User</span>
          <span className="adm-kv__value">{request.user.username}</span>
        </div>
        <div className="adm-kv">
          <span className="adm-kv__label">Player ID</span>
          <span className="adm-kv__value">
            <span className="adm-mono">{request.user.playerId}</span>
          </span>
        </div>
        <div className="adm-kv">
          <span className="adm-kv__label">Email</span>
          <span className="adm-kv__value">{request.user.email}</span>
        </div>
        <div className="adm-kv">
          <span className="adm-kv__label">Category</span>
          <span className="adm-kv__value">{request.category}</span>
        </div>
        <div className="adm-kv">
          <span className="adm-kv__label">Submitted</span>
          <span className="adm-kv__value">{formatDate(request.submittedDate)}</span>
        </div>
        <div className="adm-kv">
          <span className="adm-kv__label">Status</span>
          <span className="adm-kv__value">
            <StatusBadge status={request.status} />
          </span>
        </div>
      </div>

      <h4 className="adm-modal__section-title">Message</h4>
      <p className="lp-detail-text">{request.message}</p>

      <p className="lp-note">
        Reply and status-change actions are disabled in this preview pending a support backend.
      </p>
    </AdminModal>
  );
}

function SupportPage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedRequest, setSelectedRequest] = useState<PreviewSupportRequest | null>(null);

  const filteredRequests = useMemo(
    () =>
      previewSupportRequests.filter(
        (request) => statusFilter === "all" || request.status === statusFilter,
      ),
    [statusFilter],
  );

  return (
    <AdminLayout activePage="support">
      <div className="adm-page-head">
        <div>
          <h2 className="adm-page-head__title">Help &amp; Support</h2>
          <p className="adm-page-head__sub">
            Support requests submitted by players. Click a row for the full request.
          </p>
        </div>
      </div>

      <PreviewDataNotice />

      <div className="adm-toolbar">
        <select
          className="adm-select adm-toolbar__filter"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          aria-label="Filter support requests by status"
        >
          <option value="all">All statuses</option>
          <option value="New">New</option>
          <option value="In Progress">In Progress</option>
          <option value="Resolved">Resolved</option>
          <option value="Closed">Closed</option>
        </select>
      </div>

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Request</th>
              <th>User</th>
              <th>Subject / Category</th>
              <th>Priority</th>
              <th>Submission Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredRequests.map((request) => (
              <tr
                key={request.id}
                className="adm-table__row--interactive"
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
                  <span className="adm-mono">{request.id}</span>
                </td>
                <td className="adm-table__cell-strong">{request.user.username}</td>
                <td>
                  {request.subject}
                  <br />
                  <span className="lp-sub">{request.category}</span>
                </td>
                <td>
                  <span className={`adm-badge ${PRIORITY_TONES[request.priority] ?? "adm-badge--neutral"}`}>
                    {request.priority}
                  </span>
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
                  <div className="adm-empty">No support requests match this filter.</div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selectedRequest ? (
        <RequestDetailsModal request={selectedRequest} onClose={() => setSelectedRequest(null)} />
      ) : null}
    </AdminLayout>
  );
}

export default SupportPage;
