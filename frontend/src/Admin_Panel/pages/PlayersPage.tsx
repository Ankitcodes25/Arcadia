/*
 * All Players — searchable, filterable table with a Player Details modal.
 *
 * The table stays clean (identity, id, username, level, XP, status, joined);
 * every other detail lives in the modal opened by clicking a row. Data is
 * development-preview only (see data/previewData.ts).
 */

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import AdminLayout from "../components/AdminLayout";
import AdminModal from "../components/AdminModal";
import { PreviewDataNotice, StatusBadge, TierBadge } from "../components/AdminDisplay";
import { previewPlayers } from "../data/previewData";
import { formatDate, formatNumber, formatRelativeTime } from "../utils/formatters";
import type { PreviewPlayer } from "../types/adminTypes";
import "./PlayersPage.css";

function PlayerDetailsModal({ player, onClose }: { player: PreviewPlayer; onClose: () => void }) {
  const xpPercent = Math.min(100, Math.round((player.xpIntoLevel / player.xpPerLevel) * 100));

  return (
    <AdminModal
      title={player.displayName}
      subtitle={`@${player.username} · ${player.playerId}`}
      onClose={onClose}
      wide
      footer={
        <button type="button" className="adm-btn" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="plm-identity">
        <span className="adm-avatar plm-identity__avatar" aria-hidden="true">
          {player.avatar}
        </span>
        <div>
          <div className="plm-identity__row">
            <strong>{player.displayName}</strong>
            <TierBadge badge={player.badge} />
            <StatusBadge status={player.status} />
          </div>
          <span className="plm-identity__meta">
            @{player.username} · <span className="adm-mono">{player.playerId}</span>
          </span>
        </div>
      </div>

      <h4 className="adm-modal__section-title">Progression</h4>
      <div className="adm-xp-row">
        <span>
          Level <strong>{player.level}</strong>
        </span>
        <span>
          <strong>{formatNumber(player.xpIntoLevel)}</strong> / {formatNumber(player.xpPerLevel)} XP to next level
        </span>
      </div>
      <div className="adm-progress" role="progressbar" aria-valuenow={xpPercent} aria-valuemin={0} aria-valuemax={100}>
        <div className="adm-progress__fill" style={{ width: `${xpPercent}%` }} />
      </div>
      <div className="adm-xp-row" style={{ marginTop: 6 }}>
        <span>
          Total XP: <strong>{formatNumber(player.totalXp)}</strong>
        </span>
      </div>

      <h4 className="adm-modal__section-title">Gaming statistics</h4>
      <div className="adm-mini-stats">
        <div className="adm-mini-stat">
          <span className="adm-mini-stat__label">Matches</span>
          <span className="adm-mini-stat__value">{formatNumber(player.stats.matchesPlayed)}</span>
        </div>
        <div className="adm-mini-stat">
          <span className="adm-mini-stat__label">Wins</span>
          <span className="adm-mini-stat__value">{formatNumber(player.stats.wins)}</span>
        </div>
        <div className="adm-mini-stat">
          <span className="adm-mini-stat__label">Losses</span>
          <span className="adm-mini-stat__value">{formatNumber(player.stats.losses)}</span>
        </div>
        <div className="adm-mini-stat">
          <span className="adm-mini-stat__label">Draws</span>
          <span className="adm-mini-stat__value">{formatNumber(player.stats.draws)}</span>
        </div>
        <div className="adm-mini-stat">
          <span className="adm-mini-stat__label">Win rate</span>
          <span className="adm-mini-stat__value">{player.stats.winRate}%</span>
        </div>
        <div className="adm-mini-stat">
          <span className="adm-mini-stat__label">Favourite</span>
          <span className="adm-mini-stat__value">{player.stats.favoriteGame}</span>
        </div>
      </div>

      <h4 className="adm-modal__section-title">Account</h4>
      <div className="adm-kv-grid">
        <div className="adm-kv">
          <span className="adm-kv__label">Status</span>
          <span className="adm-kv__value">
            <StatusBadge status={player.status} />
          </span>
        </div>
        <div className="adm-kv">
          <span className="adm-kv__label">Joined</span>
          <span className="adm-kv__value">{formatDate(player.joinedDate)}</span>
        </div>
        <div className="adm-kv">
          <span className="adm-kv__label">Last active</span>
          <span className="adm-kv__value">{formatRelativeTime(player.lastActive)}</span>
        </div>
      </div>

      <h4 className="adm-modal__section-title">Moderation</h4>
      <div className="adm-kv-grid">
        <div className="adm-kv">
          <span className="adm-kv__label">Warnings</span>
          <span className="adm-kv__value">{player.moderation.warnings}</span>
        </div>
        <div className="adm-kv">
          <span className="adm-kv__label">Reports against</span>
          <span className="adm-kv__value">{player.moderation.reportsAgainst}</span>
        </div>
        <div className="adm-kv">
          <span className="adm-kv__label">Last action</span>
          <span className="adm-kv__value">{player.moderation.lastAction ?? "None"}</span>
        </div>
      </div>
      <p className="plm-note">
        Moderation actions are display-only in this preview. Suspension, deletion or banning requires
        a future backend integration and explicit authorization.
      </p>
    </AdminModal>
  );
}

function PlayersPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [selectedPlayer, setSelectedPlayer] = useState<PreviewPlayer | null>(null);

  const filteredPlayers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return previewPlayers.filter((player) => {
      const matchesSearch =
        !query
        || player.displayName.toLowerCase().includes(query)
        || player.username.toLowerCase().includes(query)
        || player.playerId.toLowerCase().includes(query);
      const matchesStatus = statusFilter === "all" || player.status === statusFilter;
      const matchesLevel =
        levelFilter === "all"
        || (levelFilter === "beginner" && player.level < 10)
        || (levelFilter === "intermediate" && player.level >= 10 && player.level < 40)
        || (levelFilter === "advanced" && player.level >= 40);
      return matchesSearch && matchesStatus && matchesLevel;
    });
  }, [search, statusFilter, levelFilter]);

  return (
    <AdminLayout activePage="players">
      <div className="adm-page-head">
        <div>
          <h2 className="adm-page-head__title">All Players</h2>
          <p className="adm-page-head__sub">
            Search and review Arcadia player accounts. Click a row to open full player details.
          </p>
        </div>
      </div>

      <PreviewDataNotice />

      <div className="adm-toolbar">
        <div className="adm-toolbar__search">
          <Search size={15} aria-hidden="true" />
          <input
            className="adm-input"
            type="search"
            placeholder="Search by name, username or player ID…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search players"
          />
        </div>
        <select
          className="adm-select adm-toolbar__filter"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          aria-label="Filter by account status"
        >
          <option value="all">All statuses</option>
          <option value="Active">Active</option>
          <option value="Suspended">Suspended</option>
          <option value="Pending">Pending</option>
        </select>
        <select
          className="adm-select adm-toolbar__filter"
          value={levelFilter}
          onChange={(event) => setLevelFilter(event.target.value)}
          aria-label="Filter by level range"
        >
          <option value="all">All levels</option>
          <option value="beginner">Beginner (1–9)</option>
          <option value="intermediate">Intermediate (10–39)</option>
          <option value="advanced">Advanced (40+)</option>
        </select>
      </div>

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Player ID</th>
              <th>Username</th>
              <th>Level</th>
              <th>Total XP</th>
              <th>Account Status</th>
              <th>Joined Date</th>
            </tr>
          </thead>
          <tbody>
            {filteredPlayers.map((player) => (
              <tr
                key={player.id}
                className="adm-table__row--interactive"
                tabIndex={0}
                role="button"
                aria-label={`Open details for ${player.displayName}`}
                onClick={() => setSelectedPlayer(player)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedPlayer(player);
                  }
                }}
              >
                <td>
                  <span className="adm-identity">
                    <span className="adm-avatar" aria-hidden="true">
                      {player.avatar}
                    </span>
                    <span className="adm-identity__names">
                      <span className="adm-identity__name">{player.displayName}</span>
                      <span className="adm-identity__sub">
                        <TierBadge badge={player.badge} />
                      </span>
                    </span>
                  </span>
                </td>
                <td>
                  <span className="adm-mono">{player.playerId}</span>
                </td>
                <td>{player.username}</td>
                <td>{player.level}</td>
                <td>{formatNumber(player.totalXp)}</td>
                <td>
                  <StatusBadge status={player.status} />
                </td>
                <td>{formatDate(player.joinedDate)}</td>
              </tr>
            ))}
            {filteredPlayers.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="adm-empty">No players match the current filters.</div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selectedPlayer ? (
        <PlayerDetailsModal player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
      ) : null}
    </AdminLayout>
  );
}

export default PlayersPage;
