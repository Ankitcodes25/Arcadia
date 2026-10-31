/*
 * Moderation — overview cards, the moderation action log with player/report
 * references, and an Action Details modal.
 *
 * Strictly display-only: no suspension, deletion or banning operation exists
 * here. Real actions require a future backend integration and explicit
 * authorization, which the UI states wherever an action would sit.
 */

import { useMemo, useState } from "react";
import { Shield, AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import AdminLayout from "../components/AdminLayout";
import AdminModal from "../components/AdminModal";
import { PreviewDataNotice, StatCard, StatusBadge } from "../components/AdminDisplay";
import { previewModerationActions, previewPlayers, previewReports } from "../data/previewData";
import { formatDate, formatNumber, formatRelativeTime } from "../utils/formatters";
import type { PreviewModerationAction } from "../types/adminTypes";
import "./ListPages.css";

function ActionDetailsModal({
  action,
  onClose,
}: {
  action: PreviewModerationAction;
  onClose: () => void;
}) {
  return (
    <AdminModal
      title={`Action ${action.id}`}
      subtitle={`${action.actionType} · ${formatRelativeTime(action.createdDate)}`}
      onClose={onClose}
      footer={
        <button type="button" className="adm-btn" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="adm-kv-grid">
        <div className="adm-kv">
          <span className="adm-kv__label">Action type</span>
          <span className="adm-kv__value">{action.actionType}</span>
        </div>
        <div className="adm-kv">
          <span className="adm-kv__label">Target</span>
          <span className="adm-kv__value">
            {action.targetType} · {action.targetUsername}
          </span>
        </div>
        <div className="adm-kv">
          <span className="adm-kv__label">Reference</span>
          <span className="adm-kv__value">
            <span className="adm-mono">{action.targetReference}</span>
          </span>
        </div>
        <div className="adm-kv">
          <span className="adm-kv__label">Reason</span>
          <span className="adm-kv__value">{action.reason}</span>
        </div>
        <div className="adm-kv">
          <span className="adm-kv__label">Moderator</span>
          <span className="adm-kv__value">{action.moderator}</span>
        </div>
        <div className="adm-kv">
          <span className="adm-kv__label">Status</span>
          <span className="adm-kv__value">
            <StatusBadge status={action.status} />
          </span>
        </div>
        <div className="adm-kv">
          <span className="adm-kv__label">Created</span>
          <span className="adm-kv__value">{formatDate(action.createdDate)}</span>
        </div>
      </div>

      <h4 className="adm-modal__section-title">Action details</h4>
      <p className="lp-detail-text">{action.details}</p>

      <p className="lp-note">
        This log is read-only in the preview. Creating or reverting moderation actions requires a
        future backend integration and explicit authorization.
      </p>
    </AdminModal>
  );
}

function ModerationPage() {
  const [selectedAction, setSelectedAction] = useState<PreviewModerationAction | null>(null);

  const overview = useMemo(() => {
    const openReports = previewReports.filter(
      (report) => report.status === "Open" || report.status === "Under Review",
    ).length;
    const suspendedPlayers = previewPlayers.filter((player) => player.status === "Suspended").length;
    const pendingActions = previewModerationActions.filter((action) => action.status === "Pending").length;
    const completedActions = previewModerationActions.filter(
      (action) => action.status === "Completed",
    ).length;
    return { openReports, suspendedPlayers, pendingActions, completedActions };
  }, []);

  return (
    <AdminLayout activePage="moderation">
      <div className="adm-page-head">
        <div>
          <h2 className="adm-page-head__title">Moderation</h2>
          <p className="adm-page-head__sub">
            Overview of moderation work: open reports, flagged accounts and the action log.
          </p>
        </div>
      </div>

      <PreviewDataNotice />

      <div className="adm-stats-grid">
        <StatCard
          label="Open Reports"
          value={formatNumber(overview.openReports)}
          icon={<AlertTriangle size={20} />}
          tone="warning"
          hint="Open or under review"
        />
        <StatCard
          label="Suspended Accounts"
          value={formatNumber(overview.suspendedPlayers)}
          icon={<Shield size={20} />}
          tone="warning"
          hint="Currently suspended (preview)"
        />
        <StatCard
          label="Pending Actions"
          value={formatNumber(overview.pendingActions)}
          icon={<Clock size={20} />}
          hint="Awaiting completion"
        />
        <StatCard
          label="Completed Actions"
          value={formatNumber(overview.completedActions)}
          icon={<CheckCircle2 size={20} />}
          tone="success"
          hint="Action log entries"
        />
      </div>

      <div className="adm-page-head" style={{ marginTop: 8 }}>
        <div>
          <h3 className="adm-card__title">Moderation Action Log</h3>
          <p className="adm-card__subtitle">Player and report references with action status.</p>
        </div>
      </div>

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Action</th>
              <th>Type</th>
              <th>Target</th>
              <th>Reference</th>
              <th>Reason</th>
              <th>Moderator</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {previewModerationActions.map((action) => (
              <tr
                key={action.id}
                className="adm-table__row--interactive"
                tabIndex={0}
                role="button"
                aria-label={`Open action ${action.id}`}
                onClick={() => setSelectedAction(action)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedAction(action);
                  }
                }}
              >
                <td>
                  <span className="adm-mono">{action.id}</span>
                </td>
                <td>{action.actionType}</td>
                <td className="adm-table__cell-strong">{action.targetUsername}</td>
                <td>
                  <span className="adm-mono">{action.targetReference}</span>
                </td>
                <td>{action.reason}</td>
                <td>{action.moderator}</td>
                <td>
                  <StatusBadge status={action.status} />
                </td>
                <td>{formatDate(action.createdDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedAction ? (
        <ActionDetailsModal action={selectedAction} onClose={() => setSelectedAction(null)} />
      ) : null}
    </AdminLayout>
  );
}

export default ModerationPage;
