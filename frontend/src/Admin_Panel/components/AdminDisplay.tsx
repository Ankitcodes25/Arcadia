/*
 * Small shared display components: status badges, tier chips, the preview-data
 * notice and dashboard stat cards.
 */

import type { ReactNode } from "react";
import type { PreviewAccountStatus, PreviewBadge } from "../types/adminTypes";
import { PREVIEW_DATA_NOTICE } from "../data/previewData";
import { usePanelPreferences } from "../hooks/panelPreferences";

/* ---- Status badge --------------------------------------------------------- */

type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

const STATUS_TONES: Record<string, BadgeTone> = {
  // Accounts
  Active: "success",
  Suspended: "danger",
  Pending: "warning",
  // Reports
  Open: "warning",
  "Under Review": "info",
  Resolved: "success",
  Dismissed: "neutral",
  // Support
  New: "warning",
  "In Progress": "info",
  Closed: "neutral",
  // Games
  Live: "success",
  Maintenance: "warning",
  Disabled: "danger",
  // Moderation
  Completed: "success",
  Reverted: "neutral",
  // Announcements
  Draft: "neutral",
  Scheduled: "info",
  Published: "success",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONES[status] ?? "neutral";
  return <span className={`adm-badge adm-badge--${tone}`}>{status}</span>;
}

/** Account-status variant kept explicit so table columns stay self-documenting. */
export function AccountStatusBadge({ status }: { status: PreviewAccountStatus }) {
  return <StatusBadge status={status} />;
}

/* ---- Player tier chip ----------------------------------------------------- */

export function TierBadge({ badge }: { badge: PreviewBadge }) {
  return <span className={`adm-tier adm-tier--${badge.tone}`}>{badge.label}</span>;
}

/* ---- Preview-data notice -------------------------------------------------- */

/**
 * Preview-data notice shown at the top of every mock page. Honours the
 * session-only "showPreviewNotices" preference from Settings (default on).
 */
export function PreviewDataNotice() {
  const { showPreviewNotices } = usePanelPreferences();
  if (!showPreviewNotices) return null;
  return (
    <div className="adm-preview-notice" role="note">
      <span aria-hidden="true">🧪</span>
      <span>{PREVIEW_DATA_NOTICE}</span>
    </div>
  );
}

/* ---- Stat card ------------------------------------------------------------ */

interface StatCardProps {
  label: string;
  value: string;
  icon: ReactNode;
  tone?: "default" | "success" | "warning";
  hint?: string;
}

export function StatCard({ label, value, icon, tone = "default", hint }: StatCardProps) {
  return (
    <div className={`adm-stat adm-stat--${tone}`}>
      <div className="adm-stat__icon" aria-hidden="true">
        {icon}
      </div>
      <div className="adm-stat__body">
        <span className="adm-stat__label">{label}</span>
        <span className="adm-stat__value">{value}</span>
        {hint ? <span className="adm-stat__hint">{hint}</span> : null}
      </div>
    </div>
  );
}
