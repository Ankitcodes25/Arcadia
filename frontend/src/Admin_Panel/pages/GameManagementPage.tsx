/*
 * Game Management — a clean operations view of the EXISTING Arcadia games.
 *
 * The game list is derived from src/constants/gameData.ts (the same catalogue
 * the player site renders), joined with preview operational figures from
 * data/previewData.ts. No new games are invented, no game logic is touched,
 * and status changes here are local UI state only.
 */

import { useState } from "react";
import AdminLayout from "../components/AdminLayout";
import { PreviewDataNotice, StatusBadge } from "../components/AdminDisplay";
import { games as catalogGames } from "../../constants/gameData";
import { previewGames } from "../data/previewData";
import { formatNumber } from "../utils/formatters";
import type { PreviewGame } from "../types/adminTypes";

/*
 * Join the real catalogue with the preview operational row by game name, so
 * the management list can never drift from what the site actually offers.
 */
function buildManagedGames(): PreviewGame[] {
  return catalogGames.map((game) => {
    const operational = previewGames.find((entry) => entry.name === game.name);
    return {
      id: operational?.id ?? `g-${game.name.toLowerCase().replace(/\s+/g, "-")}`,
      name: game.name,
      category: game.category,
      icon: game.icon,
      description: game.description,
      status: operational?.status ?? "Live",
      totalMatches: operational?.totalMatches ?? 0,
      activePlayers: operational?.activePlayers ?? 0,
    };
  });
}

function GameManagementPage() {
  const [managedGames, setManagedGames] = useState<PreviewGame[]>(buildManagedGames);

  const setStatus = (id: string, status: PreviewGame["status"]) => {
    // Local preview state only — no backend is called and no game logic runs.
    setManagedGames((games) =>
      games.map((game) => (game.id === id ? { ...game, status } : game)),
    );
  };

  return (
    <AdminLayout activePage="games">
      <div className="adm-page-head">
        <div>
          <h2 className="adm-page-head__title">Game Management</h2>
          <p className="adm-page-head__sub">
            Operational view of the current Arcadia game catalogue. Status controls are UI previews
            and do not affect the live site.
          </p>
        </div>
      </div>

      <PreviewDataNotice />

      <div className="adm-games-grid">
        {managedGames.map((game) => (
          <article key={game.id} className="adm-game-card">
            <div className="adm-game-card__head">
              <span className="adm-game-card__icon" aria-hidden="true">
                {game.icon}
              </span>
              <div>
                <h3 className="adm-game-card__name">{game.name}</h3>
                <span className="adm-game-card__category">{game.category}</span>
              </div>
            </div>

            <p className="adm-game-card__desc">{game.description}</p>

            <div className="adm-game-card__stats">
              <div className="adm-game-card__stat">
                <span className="adm-game-card__stat-value">{formatNumber(game.totalMatches)}</span>
                <span className="adm-game-card__stat-label">Matches (preview)</span>
              </div>
              <div className="adm-game-card__stat">
                <span className="adm-game-card__stat-value">{formatNumber(game.activePlayers)}</span>
                <span className="adm-game-card__stat-label">Players now (preview)</span>
              </div>
            </div>

            <div className="adm-game-card__footer">
              <StatusBadge status={game.status} />
              <select
                className="adm-select adm-toolbar__filter"
                style={{ minWidth: 140, minHeight: 34 }}
                value={game.status}
                onChange={(event) => setStatus(game.id, event.target.value as PreviewGame["status"])}
                aria-label={`Set status for ${game.name} (preview only)`}
              >
                <option value="Live">Live</option>
                <option value="Maintenance">Maintenance</option>
                <option value="Disabled">Disabled</option>
              </select>
            </div>
          </article>
        ))}
      </div>
    </AdminLayout>
  );
}

export default GameManagementPage;
