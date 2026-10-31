/*
 * Types for the Arcadia Admin Panel.
 *
 * The admin identity (AdminIdentity) comes from the real admin auth API
 * (/api/admin/auth). Everything under "preview data" types (PreviewPlayer, PreviewReport,
 * ...) describes DEVELOPMENT-PREVIEW data shapes only — see
 * ../data/previewData.ts. They are placeholders for future management APIs
 * and are never presented as real production statistics.
 */

/** The authenticated admin, as returned by GET /api/admin/auth/me. */
export interface AdminIdentity {
  username: string;
  displayName: string;
  role: string;
}

export type AdminSessionStatus = "loading" | "authenticated" | "unauthenticated";

/** Canonical admin page keys, used for routing + page titles. */
export type AdminPageKey =
  | "dashboard"
  | "players"
  | "reports"
  | "support"
  | "games"
  | "moderation"
  | "announcements"
  | "settings";

/* -------------------------------------------------------------------------
 * Preview-data shapes (frontend-only until real admin APIs exist)
 * ---------------------------------------------------------------------- */

export type PreviewAccountStatus = "Active" | "Suspended" | "Pending";

export interface PreviewBadge {
  label: string;
  tone: "bronze" | "silver" | "gold" | "diamond" | "crown";
}

export interface PreviewPlayer {
  id: string;
  playerId: string;
  username: string;
  displayName: string;
  avatar: string;
  badge: PreviewBadge;
  level: number;
  totalXp: number;
  xpIntoLevel: number;
  xpPerLevel: number;
  status: PreviewAccountStatus;
  joinedDate: string;
  lastActive: string;
  stats: {
    matchesPlayed: number;
    wins: number;
    losses: number;
    draws: number;
    favoriteGame: string;
    winRate: number;
  };
  moderation: {
    warnings: number;
    reportsAgainst: number;
    lastAction: string | null;
  };
}

export type PreviewReportStatus = "Open" | "Under Review" | "Resolved" | "Dismissed";

export interface PreviewReport {
  id: string;
  reportedPlayer: { username: string; playerId: string; displayName: string };
  reportingPlayer: { username: string; playerId: string; displayName: string };
  reason: string;
  details: string;
  submittedDate: string;
  status: PreviewReportStatus;
}

export type PreviewSupportStatus = "New" | "In Progress" | "Resolved" | "Closed";

export interface PreviewSupportRequest {
  id: string;
  user: { username: string; playerId: string; email: string };
  subject: string;
  category: string;
  message: string;
  submittedDate: string;
  status: PreviewSupportStatus;
  priority: "Low" | "Normal" | "High";
}

export interface PreviewGame {
  id: string;
  name: string;
  category: string;
  icon: string;
  description: string;
  status: "Live" | "Maintenance" | "Disabled";
  totalMatches: number;
  activePlayers: number;
}

export interface PreviewModerationAction {
  id: string;
  actionType: "Warning" | "Report Review" | "Note" | "Escalation";
  targetType: "Player" | "Report";
  targetReference: string;
  targetUsername: string;
  reason: string;
  details: string;
  moderator: string;
  status: "Completed" | "Pending" | "Reverted";
  createdDate: string;
}

export type PreviewAnnouncementStatus = "Draft" | "Scheduled" | "Published";

export interface PreviewAnnouncement {
  id: string;
  title: string;
  body: string;
  status: PreviewAnnouncementStatus;
  author: string;
  createdDate: string;
  publishedDate: string | null;
}

export interface PreviewActivityEntry {
  id: string;
  icon: "user" | "shield" | "flag" | "megaphone" | "gamepad";
  text: string;
  timestamp: string;
}

export interface PreviewDashboardStats {
  totalPlayers: number;
  activePlayers: number;
  totalMatches: number;
  pendingReports: number;
}
