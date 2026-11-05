/*
 * Game Management — a clean operations view of the EXISTING Arcadia games.
 *
 * The game list is derived from src/constants/gameData.ts (the same catalogue
 * the player site renders), joined with preview operational figures from
 * data/previewData.ts. No new games are invented, no game logic is touched,
 * and status changes here are local UI state only.
 */

import { useMemo, useState } from "react";
import { Gamepad2, Power, Radio, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import AdminLayout from "../components/AdminLayout";
import { PreviewDataNotice } from "../components/AdminDisplay";
import {
  Chip,
  EmptyState,
  FilterTabs,
  MetricCard,
  PageHeader,
  PageShell,
  toneForStatus,
  type Tone,
} from "../components/AdminKit";
import { games as catalogGames } from "../../constants/gameData";
import { previewGames } from "../data/previewData";
import { formatNumber } from "../utils/formatters";
import type { PreviewGame } from "../types/adminTypes";
import "./AdminPages.css";

type GameStatus = PreviewGame["status"];
type StatusFilter = "all" | GameStatus;

const STATUS_CONTROLS: Array<{ status: GameStatus; icon: ReactNode }> = [
  { status: "Live", icon: <Radio size={14} aria-hidden="true" /> },
  { status: "Maintenance", icon: <Wrench size={14} aria-hidden="true" /> },
  { status: "Disabled", icon: <Power size={14} aria-hidden="true" /> },
];

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
  const [filter, setFilter] = useState<StatusFilter>("all");

  const setStatus = (id: string, status: GameStatus) => {
    // Local preview state only — no backend is called and no game logic runs.
    setManagedGames((games) =>
      games.map((game) => (game.id === id ? { ...game, status } : game)),
    );
  };

  const counts = useMemo(
    () => ({
      all: managedGames.length,
      Live: managedGames.filter((game) => game.status === "Live").length,
      Maintenance: managedGames.filter((game) => game.status === "Maintenance").length,
      Disabled: managedGames.filter((game) => game.status === "Disabled").length,
    }),
    [managedGames],
  );

  const maxMatches = useMemo(
    () => Math.max(1, ...managedGames.map((game) => game.totalMatches)),
    [managedGames],
  );

  const visibleGames = managedGames.filter((game) => filter === "all" || game.status === filter);

  return (
    <AdminLayout activePage="games">
      <PageShell>
        <PageHeader
          title="Game Management"
          icon={<Gamepad2 />}
          subtitle="Operational view of the current Arcadia game catalogue. Status controls are UI previews and do not affect the live site."
        />

        <PreviewDataNotice />

        <div className="adk-metrics">
          <MetricCard
            label="Games"
            value={formatNumber(counts.all)}
            icon={<Gamepad2 size={21} />}
            hint="In the catalogue"
          />
          <MetricCard
            label="Live"
            value={formatNumber(counts.Live)}
            icon={<Radio size={21} />}
            tone="green"
            hint="Playable right now"
            meter={counts.all ? (counts.Live / counts.all) * 100 : 0}
          />
          <MetricCard
            label="Maintenance"
            value={formatNumber(counts.Maintenance)}
            icon={<Wrench size={21} />}
            tone="amber"
            hint="Temporarily paused"
          />
          <MetricCard
            label="Disabled"
            value={formatNumber(counts.Disabled)}
            icon={<Power size={21} />}
            tone="rose"
            hint="Switched off"
          />
        </div>

        <FilterTabs<StatusFilter>
          label="Filter games by status"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All games", count: counts.all },
            { value: "Live", label: "Live", count: counts.Live, tone: "green" },
            { value: "Maintenance", label: "Maintenance", count: counts.Maintenance, tone: "amber" },
            { value: "Disabled", label: "Disabled", count: counts.Disabled, tone: "rose" },
          ]}
        />

        {visibleGames.length === 0 ? (
          <EmptyState icon={<Gamepad2 size={24} />} title="No games here" hint="No games have this status." />
        ) : (
          <div className="adp-games">
            {visibleGames.map((game) => {
              const tone: Tone = toneForStatus(game.status);

              return (
                <article key={game.id} className={`adp-game adp-tone-${tone}`}>
                  <div className="adp-game__head">
                    <span className="adp-game__icon" aria-hidden="true">
                      {game.icon}
                    </span>
                    <div className="adp-game__title">
                      <h3 className="adp-game__name">{game.name}</h3>
                      <span className="adp-game__category">{game.category}</span>
                    </div>
                    <Chip tone={tone} dot>
                      {game.status}
                    </Chip>
                  </div>

                  <p className="adp-game__desc">{game.description}</p>

                  <div className="adp-game__stats">
                    <div className="adp-game__stat">
                      <span className="adp-game__stat-value">{formatNumber(game.totalMatches)}</span>
                      <span className="adp-game__stat-label">Matches (preview)</span>
                    </div>
                    <div className="adp-game__stat">
                      <span className="adp-game__stat-value">{formatNumber(game.activePlayers)}</span>
                      <span className="adp-game__stat-label">Players now (preview)</span>
                    </div>
                  </div>

                  <div
                    className="adp-game__bar"
                    role="presentation"
                    title="Share of the busiest game's matches"
                  >
                    <span style={{ width: `${Math.round((game.totalMatches / maxMatches) * 100)}%` }} />
                  </div>

                  <div className="adp-seg" role="radiogroup" aria-label={`Set status for ${game.name} (preview only)`}>
                    {STATUS_CONTROLS.map((control) => {
                      const active = game.status === control.status;

                      return (
                        <button
                          key={control.status}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          className={`adp-seg__option adp-tone-${toneForStatus(control.status)}${
                            active ? " adp-seg__option--active" : ""
                          }`}
                          onClick={() => setStatus(game.id, control.status)}
                        >
                          {control.icon}
                          {control.status}
                        </button>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </PageShell>
    </AdminLayout>
  );
}

export default GameManagementPage;