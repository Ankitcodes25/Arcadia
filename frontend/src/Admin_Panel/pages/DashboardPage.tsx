/*
 * Admin Dashboard — overview cards, recent activity and recent registrations.
 *
 * All figures on this page come from the isolated development-preview data
 * (src/Admin_Panel/data/previewData.ts) and are labelled as such. Future
 * integration swaps the data source to services/ without touching layout.
 */

import { Users, UserCheck, Gamepad2, Flag } from "lucide-react";
import { StatCard, PreviewDataNotice, StatusBadge } from "../components/AdminDisplay";
import {
  previewDashboardStats,
  previewRecentActivity,
  previewRecentRegistrations,
} from "../data/previewData";
import { formatNumber, formatRelativeTime, formatDate } from "../utils/formatters";
import AdminLayout from "../components/AdminLayout";

const ACTIVITY_ICONS: Record<string, string> = {
  user: "👤",
  shield: "🛡️",
  flag: "🚩",
  megaphone: "📣",
  gamepad: "🎮",
};

function DashboardPage() {
  const stats = previewDashboardStats;

  return (
    <AdminLayout activePage="dashboard">
      <div className="adm-page-head">
        <div>
          <h2 className="adm-page-head__title">Dashboard</h2>
          <p className="adm-page-head__sub">
            Platform overview at a glance: players, activity and open moderation work.
          </p>
        </div>
      </div>

      <PreviewDataNotice />

      <div className="adm-stats-grid">
        <StatCard
          label="Total Players"
          value={formatNumber(stats.totalPlayers)}
          icon={<Users size={20} />}
          hint="All registered accounts"
        />
        <StatCard
          label="Active Players"
          value={formatNumber(stats.activePlayers)}
          icon={<UserCheck size={20} />}
          tone="success"
          hint="Active in the last 7 days"
        />
        <StatCard
          label="Total Matches"
          value={formatNumber(stats.totalMatches)}
          icon={<Gamepad2 size={20} />}
          hint="All-time across games"
        />
        <StatCard
          label="Pending Reports"
          value={formatNumber(stats.pendingReports)}
          icon={<Flag size={20} />}
          tone="warning"
          hint="Awaiting review"
        />
      </div>

      <div className="adm-grid-2">
        <section className="adm-card">
          <h3 className="adm-card__title">Recent Activity</h3>
          <p className="adm-card__subtitle">Latest events across the platform (preview feed).</p>
          <ul className="adm-feed">
            {previewRecentActivity.map((entry) => (
              <li key={entry.id} className="adm-feed__item">
                <span className="adm-feed__icon" aria-hidden="true">
                  {ACTIVITY_ICONS[entry.icon] ?? "•"}
                </span>
                <div>
                  <p className="adm-feed__text">{entry.text}</p>
                  <p className="adm-feed__time">{formatRelativeTime(entry.timestamp)}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="adm-card">
          <h3 className="adm-card__title">Recent Player Registrations</h3>
          <p className="adm-card__subtitle">Newest accounts to join Arcadia (preview data).</p>
          <div className="adm-table-wrap" style={{ border: "none" }}>
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Level</th>
                  <th>Joined</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {previewRecentRegistrations.map((player) => (
                  <tr key={player.playerId}>
                    <td>
                      <span className="adm-table__cell-strong">{player.username}</span>
                      <br />
                      <span className="adm-mono">{player.playerId}</span>
                    </td>
                    <td>{player.level}</td>
                    <td>{formatDate(player.joinedDate)}</td>
                    <td>
                      <StatusBadge status={player.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}

export default DashboardPage;
