/*
 * Moderation — overview cards, the moderation action log with player/report
 * references, and an Action Details modal.
 *
 * Strictly display-only: no suspension, deletion or banning operation exists
 * here. Real actions require a future backend integration and explicit
 * authorization, which the UI states wherever an action would sit.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Shield, ShieldCheck } from "lucide-react";
import AdminLayout from "../components/AdminLayout";
import AdminModal from "../components/AdminModal";
import { PreviewDataNotice, StatusBadge } from "../components/AdminDisplay";
import {
  Chip,
  DetailText,
  KeyValueGrid,
  MetricCard,
  Note,
  PageHeader,
  PageShell,
  Panel,
  SectionTitle,
  type Tone,
} from "../components/AdminKit";
import { previewModerationActions, previewPlayers, previewReports } from "../data/previewData";
import { formatDate, formatNumber, formatRelativeTime } from "../utils/formatters";
import type { PreviewModerationAction } from "../types/adminTypes";
import "./AdminPages.css";

/* Colour an action type by what it does. Unknown types stay violet. */
function toneForAction(actionType: string): Tone {
  const value = actionType.toLowerCase();
  if (value.includes("ban") || value.includes("suspend") || value.includes("delete")) return "rose";
  if (value.includes("warn")) return "amber";
  if (value.includes("note") || value.includes("review")) return "blue";
  if (value.includes("restore") || value.includes("reinstat") || value.includes("dismiss")) return "green";
  return "violet";
}

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
        <button type="button" className="adk-btn" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="adk-identity-head">
        <span className={`adp-action-badge adp-tone-${toneForAction(action.actionType)}`} aria-hidden="true">
          <Shield size={22} />
        </span>
        <div>
          <div className="adk-identity-head__row">
            <strong>{action.actionType}</strong>
            <StatusBadge status={action.status} />
          </div>
          <span className="adk-identity-head__meta">
            {action.targetType} · {action.targetUsername}
          </span>
        </div>
      </div>

      <SectionTitle>Overview</SectionTitle>
      <KeyValueGrid
        items={[
          { label: "Target", value: `${action.targetType} · ${action.targetUsername}` },
          { label: "Reference", value: <span className="adk-mono">{action.targetReference}</span> },
          { label: "Reason", value: action.reason },
          { label: "Moderator", value: action.moderator },
          { label: "Created", value: formatDate(action.createdDate) },
        ]}
      />

      <SectionTitle>Action details</SectionTitle>
      <DetailText>{action.details}</DetailText>

      <Note>
        This log is read-only in the preview. Creating or reverting moderation actions requires a
        future backend integration and explicit authorization.
      </Note>
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
      <PageShell>
        <PageHeader
          title="Moderation"
          icon={<ShieldCheck />}
          subtitle="Overview of moderation work: open reports, flagged accounts and the action log."
        />

        <PreviewDataNotice />

        <div className="adk-metrics">
          <MetricCard
            label="Open Reports"
            value={formatNumber(overview.openReports)}
            icon={<AlertTriangle size={21} />}
            tone="amber"
            hint="Open or under review"
          />
          <MetricCard
            label="Suspended Accounts"
            value={formatNumber(overview.suspendedPlayers)}
            icon={<Shield size={21} />}
            tone="rose"
            hint="Currently suspended (preview)"
          />
          <MetricCard
            label="Pending Actions"
            value={formatNumber(overview.pendingActions)}
            icon={<Clock size={21} />}
            tone="blue"
            hint="Awaiting completion"
          />
          <MetricCard
            label="Completed Actions"
            value={formatNumber(overview.completedActions)}
            icon={<CheckCircle2 size={21} />}
            tone="green"
            hint="Action log entries"
          />
        </div>

        <Panel
          title="Moderation Action Log"
          subtitle="Player and report references with action status. Click a row for details."
          icon={<Shield size={18} />}
          flush
        >
          <div className="adk-table-wrap">
            <table className="adk-table">
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
                    className="adk-table__row--interactive"
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
                      <span className="adk-mono">{action.id}</span>
                    </td>
                    <td>
                      <Chip tone={toneForAction(action.actionType)}>{action.actionType}</Chip>
                    </td>
                    <td className="adk-table__strong">{action.targetUsername}</td>
                    <td>
                      <span className="adk-mono">{action.targetReference}</span>
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
        </Panel>

        {selectedAction ? (
          <ActionDetailsModal action={selectedAction} onClose={() => setSelectedAction(null)} />
        ) : null}
      </PageShell>
    </AdminLayout>
  );
}

export default ModerationPage;