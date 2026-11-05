/*
 * Admin Dashboard — greeting banner, overview cards, recent activity and
 * recent registrations.
 *
 * All figures on this page come from the isolated development-preview data
 * (src/Admin_Panel/data/previewData.ts) and are labelled as such. Future
 * integration swaps the data source to services/ without touching layout.
 */

import type { ReactNode } from "react";
import {
  Activity,
  Flag,
  Gamepad2,
  Gauge,
  Megaphone,
  Shield,
  Sparkles,
  User,
  UserCheck,
  Users,
} from "lucide-react";
import AdminLayout from "../components/AdminLayout";
import { PreviewDataNotice, StatusBadge } from "../components/AdminDisplay";
import { Avatar, Chip, MetricCard, PageShell, Panel, toneForStatus, type Tone } from "../components/AdminKit";
import { useAdminAuth } from "../hooks/useAdminAuth";
import {
  previewDashboardStats,
  previewRecentActivity,
  previewRecentRegistrations,
} from "../data/previewData";
import { formatNumber, formatRelativeTime, formatDate } from "../utils/formatters";
import "./AdminPages.css";

const ACTIVITY_STYLES: Record<string, { icon: ReactNode; tone: Tone }> = {
  user: { icon: <User size={17} />, tone: "violet" },
  shield: { icon: <Shield size={17} />, tone: "blue" },
  flag: { icon: <Flag size={17} />, tone: "rose" },
  megaphone: { icon: <Megaphone size={17} />, tone: "amber" },
  gamepad: { icon: <Gamepad2 size={17} />, tone: "green" },
};

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function DashboardPage() {
  const { admin } = useAdminAuth();
  const stats = previewDashboardStats;

  const activeRate = stats.totalPlayers > 0 ? (stats.activePlayers / stats.totalPlayers) * 100 : 0;
  const matchesPerPlayer = stats.totalPlayers > 0 ? stats.totalMatches / stats.totalPlayers : 0;

  return (
    <AdminLayout activePage="dashboard">
      <PageShell>
        <section className="adp-hero" aria-labelledby="adp-hero-title">
          <div className="adp-hero__text">
            <span className="adp-hero__kicker">
              <Sparkles size={14} aria-hidden="true" />
              Admin Console
            </span>
            <h2 className="adp-hero__title" id="adp-hero-title">
              {greeting()}, <span>{admin?.username ?? "admin"}</span>
            </h2>
            <p className="adp-hero__sub">
              Platform overview at a glance: players, activity and open moderation work.
            </p>
          </div>

          <div className="adp-hero__pills">
            <div className="adp-hero__pill">
              <span className="adp-hero__pill-value">{formatNumber(stats.activePlayers)}</span>
              <span className="adp-hero__pill-label">active players</span>
            </div>
            <div className="adp-hero__pill adp-hero__pill--warn">
              <span className="adp-hero__pill-value">{formatNumber(stats.pendingReports)}</span>
              <span className="adp-hero__pill-label">reports to review</span>
            </div>
          </div>
        </section>

        <PreviewDataNotice />

        <div className="adk-metrics">
          <MetricCard
            label="Total Players"
            value={formatNumber(stats.totalPlayers)}
            icon={<Users size={21} />}
            hint="All registered accounts"
          />
          <MetricCard
            label="Active Players"
            value={formatNumber(stats.activePlayers)}
            icon={<UserCheck size={21} />}
            tone="green"
            hint="Active in the last 7 days"
            meter={activeRate}
          />
          <MetricCard
            label="Total Matches"
            value={formatNumber(stats.totalMatches)}
            icon={<Gamepad2 size={21} />}
            tone="blue"
            hint="All-time across games"
          />
          <MetricCard
            label="Pending Reports"
            value={formatNumber(stats.pendingReports)}
            icon={<Flag size={21} />}
            tone="amber"
            hint="Awaiting review"
          />
        </div>

        <div className="adp-grid-2">
          <Panel
            title="Recent Activity"
            subtitle="Latest events across the platform (preview feed)."
            icon={<Activity size={18} />}
          >
            <ol className="adp-timeline">
              {previewRecentActivity.map((entry) => {
                const style = ACTIVITY_STYLES[entry.icon] ?? { icon: <Activity size={17} />, tone: "violet" as Tone };

                return (
                  <li key={entry.id} className="adp-timeline__item">
                    <span className={`adp-timeline__icon adp-tone-${style.tone}`} aria-hidden="true">
                      {style.icon}
                    </span>
                    <div className="adp-timeline__content">
                      <p className="adp-timeline__text">{entry.text}</p>
                      <p className="adp-timeline__time">{formatRelativeTime(entry.timestamp)}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Panel>

          <div className="adp-stack">
            <Panel
              title="Recent Player Registrations"
              subtitle="Newest accounts to join Arcadia (preview data)."
              icon={<Users size={18} />}
            >
              <ul className="adp-list">
                {previewRecentRegistrations.map((player) => (
                  <li key={player.playerId} className="adp-list__row">
                    <Avatar name={player.username} tone={toneForStatus(player.status) === "green" ? "violet" : "neutral"} />
                    <div className="adp-list__main">
                      <span className="adp-list__name">{player.username}</span>
                      <span className="adk-mono">{player.playerId}</span>
                    </div>
                    <div className="adp-list__meta">
                      <Chip tone="violet">Lv {player.level}</Chip>
                      <span className="adp-list__date">{formatDate(player.joinedDate)}</span>
                    </div>
                    <StatusBadge status={player.status} />
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Quick Insights" subtitle="Worked out from the figures above." icon={<Gauge size={18} />}>
              <div className="adp-insights">
                <div className="adp-insight">
                  <span className="adp-insight__value">{Math.round(activeRate)}%</span>
                  <span className="adp-insight__label">Active rate</span>
                </div>
                <div className="adp-insight">
                  <span className="adp-insight__value">{matchesPerPlayer.toFixed(1)}</span>
                  <span className="adp-insight__label">Matches per player</span>
                </div>
                <div className="adp-insight">
                  <span className="adp-insight__value">{formatNumber(stats.pendingReports)}</span>
                  <span className="adp-insight__label">Reports waiting</span>
                </div>
              </div>
            </Panel>
          </div>
        </div>
      </PageShell>
    </AdminLayout>
  );
}

export default DashboardPage;