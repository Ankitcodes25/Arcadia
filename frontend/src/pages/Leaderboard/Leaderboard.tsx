import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  ArrowLeft,
  ChevronDown,
  Crown,
  Gamepad2,
  RotateCcw,
  Search,
  Star,
  Trophy,
  X,
} from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { getLocalAvatarOption } from "../../auth/avatarCatalog";
import {
  DUMMY_GAMES,
  DUMMY_PLAYERS,
  DUMMY_PLAYERS_ENABLED,
  type DummyPlayer,
} from "../../data/development/dummyPlayers";
import { navigateTo } from "../../lib/navigation";
import PlayerProfile from "../../components/PlayerProfileModal";
import "./Leaderboard.css";

/* Hero images: Arcadion + peeche #1 / #2 / #3 cards.
   Agar tumhare assets ka path alag hai to sirf yeh imports badal do. */
import arcadion from "./assets/leadArc.png";
import rankCard1 from "./Assets/lead1.png";
import rankCard2 from "./Assets/lead2.png";
import rankCard3 from "./Assets/lead3.png";

/* ===========================================================
   LEADERBOARD  (full page, navbar nahi)

   Upar se neeche:
     1. Hero  (back button top-left, Arcadion + #1/#2/#3 cards)
     2. Patla filter box  (search + game dropdown + clear filters)
     3. Top 3 podium  (landing page ke cards jaise, 4th-image wali positioning)
     4. Ranking list  (top 10 pehle dikhta hai, scroll karne par baaki)

   "YOU" row:
     - rank 10 se upar (1-9)  -> list me apni jagah par highlight
     - rank 10 ya usse neeche -> card screen ke neeche freeze rehta hai
       (CSS position: sticky; bottom). Jaise hi scroll karte karte asli
       jagah aati hai, wahin dock ho jata hai aur normal scroll karta hai.

   DATA
   Real standings aate hain `entries` prop se (aur games `games` prop se).
   Jab tak API nahi hai, development build me centralized dummy players
   (src/data/development/dummyPlayers.ts) dikhte hain. Production build me
   DUMMY_PLAYERS_ENABLED false hai, isliye wahan koi dummy player nahi aata.
   =========================================================== */

/** Is rank se (aur neeche) "You" ka card neeche freeze hota hai. */
const PIN_FROM_RANK = 10;

const ALL_GAMES = "all";
const COUNT_UP_MS = 1100;

export type GameStat = {
  score: number;
  wins: number;
};

export type LeaderboardEntry = {
  id: string;
  name: string;
  level: number;
  xp: number;
  wins: number;
  /** Per-game score + wins. Key = game id (GameOption.value). */
  games?: Record<string, GameStat>;
  /** Optional picture. Bina iske initials dikhte hain. */
  avatarUrl?: string;
  /** Local avatar catalogue id, jab picture na ho. */
  avatarId?: string;
  /** Signed-in player. "You" dikhta hai aur highlight hota hai. */
  isYou?: boolean;
};

export type GameOption = { value: string; label: string };

/* Real data ke liye games `games` prop se bhejo. Default wahi five games hain
   jo account screens aur development fixtures use karte hain. */
const DEFAULT_GAMES: GameOption[] = DUMMY_GAMES.map((game) => ({
  value: game.id,
  label: game.name,
}));

type RankedEntry = LeaderboardEntry & {
  rank: number;
  /** All games = XP, kisi game ka filter = us game ka score */
  value: number;
  shownWins: number;
};

type LeaderboardProps = {
  /** Return kahan jayega (Profile Popup wahi page record karta hai). */
  returnPath: string;
  /** Real standings, kisi bhi order me. */
  entries?: LeaderboardEntry[];
  /** Dropdown ke games. Na do to DEFAULT_GAMES. */
  games?: GameOption[];
};

/* ---------------- Development preview data ---------------- */

/**
 * The leaderboard rows are a projection of the centralized dummy players: the
 * fixture stays the single source, so the card, the table, the per-game filters
 * and the profile modal can never describe different numbers.
 */
function toLeaderboardEntry(player: DummyPlayer): LeaderboardEntry {
  const games: Record<string, GameStat> = {};

  for (const game of DUMMY_GAMES) {
    const stats = player.stats.games[game.id];
    games[game.id] = { score: stats.totalScore, wins: stats.wins };
  }

  return {
    id: `dummy:${player.id}`,
    name: player.username,
    level: player.progression.level,
    xp: player.totalXp,
    wins: player.stats.wins,
    games,
    avatarId: player.avatarId,
  };
}

const PREVIEW_ENTRIES: LeaderboardEntry[] = DUMMY_PLAYERS.map(toLeaderboardEntry);

function hashOf(text: string): number {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash;
}

/* ---------------- Small helpers ---------------- */

function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

function displayName(entry: LeaderboardEntry): string {
  return entry.isYou ? "You" : entry.name;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Zyada value pehle; tie par zyada wins; phir naam (order stable rahe). */
function rankEntries(entries: LeaderboardEntry[], gameId: string): RankedEntry[] {
  const scored: Array<Omit<RankedEntry, "rank">> = [];

  for (const entry of entries) {
    if (gameId === ALL_GAMES) {
      scored.push({ ...entry, value: entry.xp, shownWins: entry.wins });
      continue;
    }

    const stat = entry.games?.[gameId];
    if (!stat) continue; // is game ko khela hi nahi

    scored.push({ ...entry, value: stat.score, shownWins: stat.wins });
  }

  return scored
    .sort(
      (a, b) =>
        b.value - a.value ||
        b.shownWins - a.shownWins ||
        a.name.localeCompare(b.name)
    )
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

/** Purple-pink hue har naam ke liye fixed, taaki initials avatar theme par rahein. */
function hueFor(name: string): number {
  return 250 + (hashOf(name) % 90);
}

function XpIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.6 20 7.3v9.4l-8 4.7-8-4.7V7.3l8-4.7Z"
        fill="currentColor"
        fillOpacity="0.28"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="m9 9.2 6 5.6M15 9.2l-6 5.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Avatar({ entry, className }: { entry: LeaderboardEntry; className: string }) {
  if (entry.avatarUrl) {
    return <img className={className} src={entry.avatarUrl} alt="" draggable={false} />;
  }

  const hue = hueFor(entry.name);
  const catalogAvatar = entry.avatarId ? getLocalAvatarOption(entry.avatarId) : null;

  return (
    <span
      className={`${className} leaderboard-initials`}
      aria-hidden="true"
      style={{
        background:
          catalogAvatar?.background
          ?? `linear-gradient(135deg, hsl(${hue} 72% 58%), hsl(${hue + 28} 62% 30%))`,
      }}
    >
      {entry.name.slice(0, 2).toUpperCase()}
    </span>
  );
}

/* ---------------- Themed dropdown ---------------- */

type FilterSelectProps = {
  label: string;
  options: GameOption[];
  value: string;
  onChange: (value: string) => void;
};

function GameSelect({ label, options, value, onChange }: FilterSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="leaderboard-select" ref={rootRef}>
      <button
        type="button"
        className={`leaderboard-select-trigger${open ? " leaderboard-select-trigger--open" : ""}`}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <span className="leaderboard-select-icon">
          <Gamepad2 aria-hidden="true" />
        </span>
        <span className="leaderboard-select-value">{current.label}</span>
        <span className="leaderboard-select-chevron">
          <ChevronDown aria-hidden="true" />
        </span>
      </button>

      {open && (
        <ul className="leaderboard-select-menu" role="listbox" aria-label={label}>
          {options.map((option) => (
            <li key={option.value} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={`leaderboard-select-option${
                  option.value === value ? " leaderboard-select-option--selected" : ""
                }`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------- Count-up (landing page jaisa) ---------------- */

function CountUp({ value, delay }: { value: number; delay: number }) {
  const [current, setCurrent] = useState(() => (prefersReducedMotion() ? value : 0));

  useEffect(() => {
    if (prefersReducedMotion()) {
      setCurrent(value);
      return;
    }

    let frame = 0;
    let startedAt = 0;

    const tick = (now: number) => {
      if (!startedAt) startedAt = now;

      const t = Math.min((now - startedAt) / COUNT_UP_MS, 1);
      setCurrent(Math.round(value * (1 - Math.pow(1 - t, 3))));

      if (t < 1) frame = window.requestAnimationFrame(tick);
    };

    const timer = window.setTimeout(() => {
      frame = window.requestAnimationFrame(tick);
    }, delay);

    return () => {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
    };
  }, [value, delay]);

  return (
    <span className="leaderboard-card-count">
      <span className="leaderboard-sr-only">{formatNumber(value)} points</span>
      {/* ghost = final width reserve, taaki number badhte waqt box na hile */}
      <span className="leaderboard-card-count-ghost" aria-hidden="true">
        {formatNumber(value)}
      </span>
      <span className="leaderboard-card-count-live" aria-hidden="true">
        {formatNumber(current)}
      </span>
    </span>
  );
}

/* ---------------- Podium ---------------- */

const TIER_CLASS: Record<number, string> = {
  1: "is-first",
  2: "is-second",
  3: "is-third",
};

function Podium({
  podium,
  unit,
  onPlayerOpen,
  currentUserId,
}: {
  podium: RankedEntry[];
  unit: string;
  onPlayerOpen?: (entry: RankedEntry) => void;
  currentUserId?: string;
}) {
  // Visual order: 2nd left, 1st beech me (bada), 3rd right.
  const slots: Array<RankedEntry | undefined> = [podium[1], podium[0], podium[2]];

  return (
    <div className="leaderboard-podium" aria-label="Top three players">
      {slots.map((entry, index) => {
        if (!entry) {
          return (
            <div key={`empty-${index}`} className="leaderboard-slot" aria-hidden="true" />
          );
        }

        return (
          <div
            key={`${entry.id}-${unit}`}
            className={`leaderboard-slot leaderboard-slot-${entry.rank}`}
          >
            <article
              className={`leaderboard-card${onPlayerOpen && !entry.isYou && entry.id !== currentUserId ? " leaderboard-card--profile-clickable" : ""} ${TIER_CLASS[entry.rank]}${
                entry.isYou ? " leaderboard-card--you" : ""
              }`}
              style={{ "--i": index } as CSSProperties}
              {...(onPlayerOpen && !entry.isYou && entry.id !== currentUserId
                ? {
                    role: "button" as const,
                    tabIndex: 0,
                    "aria-label": `View ${entry.name}'s profile`,
                    onClick: () => onPlayerOpen(entry),
                    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onPlayerOpen(entry);
                      }
                    },
                  }
                : {})}
            >
              <div className="leaderboard-card-badge">
                <Crown className="leaderboard-card-crown" aria-hidden="true" />

                <div className="leaderboard-card-avatar">
                  <Avatar entry={entry} className="leaderboard-card-avatar-face" />
                </div>

                <span className="leaderboard-card-rank">#{entry.rank}</span>
              </div>

              <div className="leaderboard-card-player">{displayName(entry)}</div>

              <div className="leaderboard-card-score">
                <Star aria-hidden="true" />
                <CountUp value={entry.value} delay={index * 90 + 200} />
                <em aria-hidden="true">{unit}</em>
              </div>
            </article>

            <div className="leaderboard-base" aria-hidden="true" />
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Ranking list ---------------- */

function RankCell({ rank }: { rank: number }) {
  if (rank <= 3) {
    return (
      <span
        className={`leaderboard-rank-crown leaderboard-rank-crown-${rank}`}
        aria-label={`Rank ${rank}`}
      >
        <Crown aria-hidden="true" />
      </span>
    );
  }

  return <span className="leaderboard-rank-number">{rank}</span>;
}

function RankingTable({
  rows,
  isGame,
  onPlayerOpen,
  currentUserId,
}: {
  rows: RankedEntry[];
  isGame: boolean;
  onPlayerOpen?: (entry: RankedEntry) => void;
  currentUserId?: string;
}) {
  return (
    <section className="leaderboard-table" role="table" aria-label="Player rankings">
      <div className="leaderboard-row leaderboard-row-head" role="row">
        <span role="columnheader">Rank</span>
        <span role="columnheader" className="leaderboard-col-player">Player</span>
        <span role="columnheader" className="leaderboard-col-level">
          Level
        </span>
        <span role="columnheader">{isGame ? "Score" : "XP"}</span>
        <span role="columnheader" className="leaderboard-col-wins leaderboard-head-wins">
          <Trophy aria-hidden="true" />
          Wins
        </span>
      </div>

      {rows.map((entry) => {
        const pinned = entry.isYou && entry.rank >= PIN_FROM_RANK;

        return (
          <div
            key={entry.id}
            role="row"
            className={`leaderboard-row leaderboard-row-body${
              entry.isYou ? " leaderboard-row--you" : ""
            }${pinned ? " leaderboard-row--pinned" : ""}${
              onPlayerOpen && !entry.isYou && entry.id !== currentUserId
                ? " leaderboard-row--profile-clickable"
                : ""
            }`}
            {...(onPlayerOpen && !entry.isYou && entry.id !== currentUserId
              ? {
                  tabIndex: 0,
                  "aria-label": `View ${entry.name}'s profile`,
                  onClick: () => onPlayerOpen(entry),
                  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onPlayerOpen(entry);
                    }
                  },
                }
              : {})}
          >
            <span role="cell" className="leaderboard-cell-rank">
              <RankCell rank={entry.rank} />
            </span>

            <span role="cell" className="leaderboard-cell-player">
              {onPlayerOpen && !entry.isYou && entry.id !== currentUserId ? (
                <button
                  type="button"
                  className="leaderboard-profile-trigger"
                  aria-label={`View ${entry.name}'s profile`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onPlayerOpen(entry);
                  }}
                >
                  <Avatar entry={entry} className="leaderboard-row-avatar" />
                  <span className="leaderboard-cell-name">{displayName(entry)}</span>
                </button>
              ) : (
                <>
                  <Avatar entry={entry} className="leaderboard-row-avatar" />
                  <span className="leaderboard-cell-name">{displayName(entry)}</span>
                </>
              )}
            </span>

            <span role="cell" className="leaderboard-col-level">
              <span className="leaderboard-level-pill">Lv. {entry.level}</span>
            </span>

            <span role="cell" className="leaderboard-cell-value">
              <span className="leaderboard-cell-value-icon" aria-hidden="true">
                {isGame ? <Star /> : <XpIcon />}
              </span>
              {formatNumber(entry.value)} {isGame ? "pts" : "XP"}
            </span>

            <span role="cell" className="leaderboard-col-wins leaderboard-cell-wins">
              <span className="leaderboard-cell-wins-icon" aria-hidden="true">
                <Trophy />
              </span>
              {formatNumber(entry.shownWins)}
            </span>
          </div>
        );
      })}
    </section>
  );
}

/* ---------------- Hero (Match History jaisa) ---------------- */

function LeaderboardHero({ onBack }: { onBack: () => void }) {
  return (
    <>
      <button
        type="button"
        className="leaderboard-return"
        onClick={onBack}
        aria-label="Back to Profile"
        title="Back to Profile"
      >
        <span className="leaderboard-return-icon" aria-hidden="true">
          <ArrowLeft />
        </span>
      </button>

      {/* Match History wali hero: heading left, Arcadion + rank cards right */}
      <section className="leaderboard-hero" aria-labelledby="leaderboard-title">
        <div className="leaderboard-hero-stage" aria-hidden="true">
          {/* peeche ke #1 / #2 / #3 cards (Arcadion ke piche, #1 sabse peeche) */}
          <img
            className="leaderboard-hero-card leaderboard-hero-card-1"
            src={rankCard1}
            alt=""
            draggable={false}
          />
          <img
            className="leaderboard-hero-card leaderboard-hero-card-2"
            src={rankCard2}
            alt=""
            draggable={false}
          />
          <img
            className="leaderboard-hero-card leaderboard-hero-card-3"
            src={rankCard3}
            alt=""
            draggable={false}
          />
          <div className="leaderboard-hero-character-glow" />
          {/* dark silhouette: cards Arcadion ke andar se na dikhe */}
          <img
            className="leaderboard-hero-character-shadow"
            src={arcadion}
            alt=""
            draggable={false}
          />
          <img
            className="leaderboard-hero-character"
            src={arcadion}
            alt=""
            draggable={false}
          />
        </div>

        <div className="leaderboard-hero-note" aria-hidden="true">
          <Crown className="leaderboard-hero-note-crown" />
          <span>
            Only one
            <br />
            wears
            <br />
            the crown
          </span>
          <svg viewBox="0 0 60 60" className="leaderboard-hero-note-arrow">
            <path
              d="M44 4c2 20-10 34-32 44m0 0l14-2m-14 2l4-13"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div className="leaderboard-hero-heading">
          <span className="leaderboard-hero-kicker">Compete · Climb · Conquer</span>

          <h1 id="leaderboard-title">
            LEADER<span data-text="BOARD">BOARD</span>
          </h1>

          <p>
            Rise through the ranks, challenge the best, and make your mark across
            the Arcadia.
          </p>
        </div>
      </section>
    </>
  );
}

/* ---------------- Page ---------------- */

function Leaderboard({ returnPath, entries, games }: LeaderboardProps) {
  const [game, setGame] = useState(ALL_GAMES);
  const [query, setQuery] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<{
    playerId?: string;
    username: string;
    demo: boolean;
    rank: number;
  } | null>(null);
  const { user, isAuthenticated } = useAuth();

  const gameOptions = useMemo<GameOption[]>(
    () => [{ value: ALL_GAMES, label: "All games" }, ...(games ?? DEFAULT_GAMES)],
    [games]
  );

  /*
   * Return: sirf wapas jana. Profile Popup wapas lana hai ya nahi, yeh isi
   * navigation par Navbar decide karta hai — jahan se reader aaya tha wahi
   * dekh kar. Wahi ek jagah decide hone se on-page arrow aur browser ka back
   * button ek hi raste se guzarte hain, aur dono ka hasil ek jaisa rehta hai.
   */
  const handleReturn = useCallback(() => {
    navigateTo(returnPath);
  }, [returnPath]);

  const showingDummyPlayers = entries === undefined && DUMMY_PLAYERS_ENABLED;
  const source = useMemo(
    () => entries ?? (showingDummyPlayers ? PREVIEW_ENTRIES : []),
    [entries, showingDummyPlayers],
  );
  const handlePlayerOpen = useCallback((entry: RankedEntry) => {
    if (
      entry.isYou ||
      entry.id === user?.id ||
      entry.name.trim().toLowerCase() === user?.username?.trim().toLowerCase()
    ) return;
    if (!isAuthenticated) {
      window.dispatchEvent(new Event("arcadia:open-login"));
      return;
    }
    setSelectedPlayer({
      ...(entries === undefined ? {} : { playerId: entry.id }),
      username: entry.name,
      demo: entries === undefined,
      rank: entry.rank,
    });
  }, [entries, isAuthenticated, user?.id, user?.username]);

  // Game ke hisaab se asli rank (search se rank nahi badalta)
  const ranked = useMemo(() => rankEntries(source, game), [source, game]);

  const needle = query.trim().toLowerCase();
  const searching = needle.length > 0;

  const rows = useMemo(
    () =>
      searching
        ? ranked.filter(
            (entry) =>
              entry.name.toLowerCase().includes(needle) ||
              displayName(entry).toLowerCase().includes(needle)
          )
        : ranked,
    [ranked, needle, searching]
  );

  // Search chalte waqt podium hata dete hain, sirf matching rows dikhte hain
  const podium = searching ? [] : ranked.slice(0, 3);

  // Podium dikh raha ho to list #4 se shuru hoti hai (top 3 cards me already hain)
  const listRows = searching ? rows : rows.slice(3);

  const isGame = game !== ALL_GAMES;
  const filtersActive = isGame || searching;

  const clearFilters = () => {
    setGame(ALL_GAMES);
    setQuery("");
  };

  return (
    <main className="leaderboard-page">
      <div className="leaderboard-inner">
      <LeaderboardHero onBack={handleReturn} />

      {/* ---------- Patla filter box ---------- */}
      <div className="leaderboard-filters" role="search">
        <label className="leaderboard-search">
          <Search aria-hidden="true" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search player"
            aria-label="Search player"
            autoComplete="off"
            spellCheck={false}
          />
          {searching && (
            <button
              type="button"
              className="leaderboard-search-clear"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              <X aria-hidden="true" />
            </button>
          )}
        </label>

        <GameSelect
          label="Game"
          options={gameOptions}
          value={game}
          onChange={setGame}
        />

        <button
          type="button"
          className="leaderboard-clear"
          onClick={clearFilters}
          disabled={!filtersActive}
        >
          <RotateCcw aria-hidden="true" />
          Clear filters
        </button>
      </div>

      {/* ---------- Podium + list (box ke bahar) ---------- */}
      {rows.length > 0 ? (
        <>
          {podium.length > 0 && (
            <Podium
              podium={podium}
              unit={isGame ? "PTS" : "XP"}
              onPlayerOpen={handlePlayerOpen}
              currentUserId={user?.id}
            />
          )}
          {listRows.length > 0 && (
            <RankingTable
              rows={listRows}
              isGame={isGame}
              onPlayerOpen={handlePlayerOpen}
              currentUserId={user?.id}
            />
          )}
        </>
      ) : (
        <div className="leaderboard-empty" role="status">
          <span className="leaderboard-empty-icon" aria-hidden="true">
            <Trophy />
          </span>
          <h3>{ranked.length === 0 ? "No players found" : "No players found"}</h3>
          <p>Try adjusting or clearing your filters above.</p>
        </div>
      )}
      </div>
      {selectedPlayer && (
        <PlayerProfile
          playerId={selectedPlayer.playerId}
          username={selectedPlayer.username}
          currentUserId={user?.id}
          demoFallback={selectedPlayer.demo}
          globalRank={selectedPlayer.rank}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </main>
  );
}

export default Leaderboard;