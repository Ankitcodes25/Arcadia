import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChartNoAxesColumn,
  CalendarDays,
  CircleAlert,
  Gamepad2,
  Percent,
  Star,
  Trophy,
  UserPlus,
  Zap,
  X,
} from "lucide-react";
import { AuthApiError } from "../auth/authApi";
import type { PublicPlayerProfile } from "../auth/authTypes";
import { authApi } from "../auth/authApi";
import { getAuthErrorMessage } from "../auth/authUtils";
import { formatJoinedDate } from "../auth/accountInfo";
import CopyButton from "../auth/CopyButton";
import { getBadgeDisplay } from "../auth/tierEligibility";
import { getProgressionView } from "../auth/progression";
import { getLocalAvatarOption, getSafeGoogleAvatarUrl } from "../auth/avatarCatalog";
import "../pages/Myprofile/MyProfileModal.css";
import "./PlayerProfileModal.css";
import ReportPlayerModal from "./ReportPlayerModal";

type PlayerProfileProps = {
  playerId?: string | null;
  username?: string | null;
  currentUserId?: string | null;
  demoFallback?: boolean;
  globalRank?: number | null;
  onClose: () => void;
};

const SUPPORTED_GAMES = [
  { id: "ludo", name: "Ludo", emoji: "🎲" },
  { id: "tic-tac-toe", name: "Tic Tac Toe", emoji: "#" },
  { id: "rock-paper-scissors", name: "Rock Paper Scissors", emoji: "✂️" },
  { id: "snake-ladder", name: "Snake & Ladder", emoji: "🐍" },
  { id: "memory", name: "Memory", emoji: "🧠" },
] as const;

const PREVIEW_PLAYER_IDS: Record<string, string> = {
  playerone: "ARC-PLYR0001",
  shadowx: "ARC-PLYR0002",
  nova: "ARC-PLYR0003",
  pixelrush: "ARC-PLYR0004",
  void: "ARC-PLYR0005",
  arcadion: "ARC-PLYR0006",
  ghostbyte: "ARC-PLYR0007",
  neonfox: "ARC-PLYR0008",
  drift: "ARC-PLYR0009",
  zyro: "ARC-PLYR0010",
  shadowbyte: "ARC-PLYR0011",
  pixelrogue: "ARC-PLYR0012",
  gamezen: "ARC-PLYR0013",
  novastrike: "ARC-PLYR0014",
  roguesoul: "ARC-PLYR0015",
  crystalvex: "ARC-PLYR0016",
  zenithx: "ARC-PLYR0017",
  blazefang: "ARC-PLYR0018",
  stormrider: "ARC-PLYR0019",
  voidwalker: "ARC-PLYR0020",
};

const PREVIEW_PROGRESSION: Record<string, Partial<PublicPlayerProfile["progression"]>> = {
  shadowx: {
    totalXp: 2_460,
    level: 12,
    title: "Arcadia Veteran",
    badgeKey: "gold",
    themeKey: "gold",
  },
  shadowbyte: {
    totalXp: 2_460,
    level: 12,
    title: "Arcadia Veteran",
    badgeKey: "gold",
    themeKey: "gold",
  },
  pixelrogue: {
    totalXp: 1_140,
    level: 7,
    title: "Arcadia Challenger",
    badgeKey: "silver",
    themeKey: "silver",
  },
};

const PREVIEW_STATS = {
  gamesPlayed: 128,
  gamesWon: 82,
  totalScore: 48_320,
  bestScore: 1_240,
  winRate: "64.1%",
  arcadionMatches: 36,
  arcadionWins: 24,
  arcadionWinRate: "66.7%",
  arcadionBestScore: 860,
  games: {
    ludo: { totalScore: 16_800, played: 42, highestScore: 1_240 },
    "tic-tac-toe": { totalScore: 8_400, played: 28, highestScore: 720 },
    "rock-paper-scissors": { totalScore: 12_420, played: 36, highestScore: 940 },
    "snake-ladder": { totalScore: 6_000, played: 12, highestScore: 860 },
    memory: { totalScore: 4_700, played: 10, highestScore: 680 },
  },
} as const;

function createPreviewProfile(name: string): PublicPlayerProfile {
  const normalizedName = name.toLowerCase().replace(/\s+/g, "");
  const progression = {
    totalXp: 0,
    level: 0,
    currentLevelXp: 0,
    nextLevelXp: 100,
    progressPercent: 0,
    title: "Arcadia Rookie",
    badgeKey: "bronze" as const,
    themeKey: "bronze" as const,
    ...PREVIEW_PROGRESSION[normalizedName],
  };

  return {
    id: `preview:${normalizedName}`,
    username: name,
    playerId: PREVIEW_PLAYER_IDS[normalizedName] ?? "ARC-PLYR9999",
    avatar: { type: "local", value: "avatar-01" },
    avatarUrl: null,
    progression,
    completedMatches: PREVIEW_STATS.arcadionMatches,
    createdAt: "2024-03-15T08:00:00.000Z",
  };
}

function displayNumber(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value).toLocaleString("en-US")
    : "—";
}

function isValidPlayerId(value: string | null | undefined): value is string {
  return typeof value === "string" && /^ARC-[A-Z0-9]{8}$/.test(value);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
}

function PlayerProfile({
  playerId = null,
  username = null,
  currentUserId = null,
  demoFallback = false,
  globalRank = null,
  onClose,
}: PlayerProfileProps) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [profile, setProfile] = useState<PublicPlayerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const requestGeneration = useRef(0);
  const lookupPlayerId = playerId?.trim() || null;
  const lookupUsername = username?.trim() || null;

  const loadProfile = useCallback(async () => {
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    setIsLoading(true);
    setLoadError(null);
    setIsPrivate(false);

    try {
      const response = lookupPlayerId
        ? await authApi.getPublicPlayerProfile({ playerId: lookupPlayerId })
        : lookupUsername
          ? await authApi.getPublicPlayerProfile({ username: lookupUsername })
          : null;
      if (!response) throw new Error("A player identifier is required.");
      if (generation !== requestGeneration.current) return;
      if (currentUserId && response.profile.id === currentUserId) {
        setProfile(null);
        setLoadError("Use My Profile to view your own account.");
        return;
      }
      setProfile(response.profile);
    } catch (error) {
      if (generation !== requestGeneration.current) return;
      if (error instanceof AuthApiError && error.status === 403) {
        setProfile(null);
        setIsPrivate(true);
        setLoadError("This profile is private.");
      } else if (error instanceof AuthApiError && error.status === 404) {
        if (demoFallback && lookupUsername) {
          setProfile(createPreviewProfile(lookupUsername));
        } else {
          setProfile(null);
          setLoadError("No public player profile was found. Progression and statistics are unavailable.");
        }
      } else {
        setProfile(null);
        setLoadError(getAuthErrorMessage(error, "This player profile is unavailable."));
      }
    } finally {
      if (generation === requestGeneration.current) setIsLoading(false);
    }
  }, [currentUserId, demoFallback, lookupPlayerId, lookupUsername]);

  useEffect(() => {
    setAvatarFailed(false);
    void loadProfile();
    return () => {
      requestGeneration.current += 1;
    };
  }, [loadProfile]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isReportOpen) return;
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isReportOpen, onClose]);

  const progression = profile?.progression ?? null;
  const badge = progression
    ? getBadgeDisplay(getProgressionView(progression), profile?.completedMatches ?? 0)
    : null;
  const validPlayerId = isValidPlayerId(profile?.playerId) ? profile.playerId : null;
  const isPreviewProfile = profile?.id.startsWith("preview:") ?? false;
  const shownUsername = profile?.username ?? username ?? "Player";
  const googleAvatarUrl = profile?.avatar.type === "google"
    ? getSafeGoogleAvatarUrl(profile.avatarUrl)
    : null;
  const localAvatar = profile?.avatar.type === "local"
    ? getLocalAvatarOption(profile.avatar.value)
    : null;
  const avatarUrl = googleAvatarUrl && !avatarFailed ? googleAvatarUrl : null;

  return createPortal(
    <div
      className="player-profile-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <section
        className={`player-profile-modal mpm-modal${isReportOpen ? " player-profile-modal--report-open" : ""}`}
        inert={isReportOpen}
        role="dialog"
        aria-modal="true"
        aria-labelledby="player-profile-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="player-profile-header mpm-header">
          <div className="player-profile-heading mpm-header-title">
            <span className="player-profile-heading-icon mpm-header-icon" aria-hidden="true">
              <Gamepad2 />
            </span>
            <h2 id="player-profile-title">Player Profile</h2>
          </div>
          <div className="player-profile-header-actions">
            <button
              type="button"
              className="player-profile-close mpm-close arcadia-modal-close"
              aria-label="Close player profile"
              title="Close player profile"
              onClick={onClose}
            >
              <X aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="player-profile-body mpm-body">
          {profile && profile.id !== currentUserId && (
            <button
              type="button"
              className="player-profile-report-button"
              onClick={() => setIsReportOpen(true)}
            >
              <CircleAlert aria-hidden="true" />
              <span>Report Player</span>
            </button>
          )}
          <section className="mpm-identity" aria-label="Player identity">
            <div className="player-profile-avatar-column">
              <div className="player-profile-avatar-wrap mpm-avatar-wrap">
                {avatarUrl ? (
                  <img
                    className="player-profile-avatar mpm-avatar"
                    src={avatarUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarFailed(true)}
                  />
                ) : (
                  <span
                    className={`player-profile-avatar player-profile-avatar--initials mpm-avatar${localAvatar ? ` ${localAvatar.className}` : ""}`}
                    style={localAvatar ? { background: localAvatar.background } : undefined}
                    aria-hidden="true"
                  >
                    {initials(shownUsername)}
                  </span>
                )}
              </div>
              {profile && profile.id !== currentUserId && (
                <div className="player-profile-header-friend">
                  <button
                    type="button"
                    className="player-profile-friend-button"
                    disabled
                    title="Friend requests are not available yet"
                  >
                    <UserPlus aria-hidden="true" />
                    Add Friend
                  </button>
                </div>
              )}
            </div>

            <div className="mpm-identity-main">
              <div className="mpm-identity-player">
                <span className="mpm-identity-label">Player ID</span>
                <span className="mpm-identity-value-row">
                  <span className="mpm-identity-value mpm-identity-value--player player-profile-player-id-value">
                    {validPlayerId ?? "—"}
                  </span>
                  {validPlayerId && (
                    <CopyButton
                      value={validPlayerId}
                      label="Copy player ID"
                      copiedLabel="Player ID copied"
                    />
                  )}
                </span>
              </div>
              <div className="mpm-identity-name-row">
                <h3 className="mpm-identity-value mpm-identity-value--name player-profile-username">
                  {shownUsername}
                </h3>
                <CopyButton
                  value={shownUsername}
                  label="Copy username"
                  copiedLabel="Username copied"
                />
              </div>
              {badge && progression && (
                <div className="player-profile-progression-badges">
                  <span
                    className={`mpm-identity-title mpm-identity-title--${badge.themeKey}`}
                    data-badge={progression.badgeKey}
                    data-earned={badge.isEarned ? "true" : "false"}
                  >
                    {badge.title}
                  </span>
                  <span className={`player-profile-level-pill player-profile-level-pill--${badge?.themeKey ?? progression.themeKey}`}>
                    <Star aria-hidden="true" />
                    LEVEL {String(progression.level).padStart(2, "0")}
                  </span>
                  <span className="player-profile-xp-pill">
                    <Zap aria-hidden="true" />
                    {displayNumber(progression.totalXp)} XP
                  </span>
                </div>
              )}
              <div className="player-profile-identity-details">
                <span className="player-profile-member-since">
                  <CalendarDays aria-hidden="true" />
                  Member since {formatJoinedDate(profile?.createdAt)}
                </span>
                <span className="mpm-rank-pill player-profile-rank-pill">
                  <Trophy aria-hidden="true" />
                  {globalRank != null ? `#${globalRank}` : "—"}
                  <span className="mpm-rank-label">Global Rank</span>
                </span>
              </div>
            </div>
          </section>

          {isLoading ? (
            <div className="player-profile-state" role="status">
              <span className="player-profile-spinner" aria-hidden="true" />
              Loading player profile…
            </div>
          ) : loadError ? (
            <div className={`player-profile-state${isPrivate ? " player-profile-state--private" : " player-profile-state--error"}`} role={isPrivate ? "status" : "alert"}>
              {isPrivate && <span className="player-profile-private-icon" aria-hidden="true">🔒</span>}
              <span>{loadError}</span>
              {!isPrivate && <button type="button" onClick={() => void loadProfile()}>Retry</button>}
            </div>
          ) : !profile ? (
            <p className="player-profile-unavailable" role="status">
              This player profile is unavailable.
            </p>
          ) : (
            <>
              <section className="mpm-section">
                <h3 className="mpm-section-title"><Gamepad2 aria-hidden="true" />Gaming Stats</h3>
                <div className="mpm-stat-grid mpm-stat-grid--5">
                  <StatCard Icon={Gamepad2} tone="mpm-tone-violet" label="Games Played" value={isPreviewProfile ? displayNumber(PREVIEW_STATS.gamesPlayed) : "—"} />
                  <StatCard Icon={Trophy} tone="mpm-tone-amber" label="Games Won" value={isPreviewProfile ? displayNumber(PREVIEW_STATS.gamesWon) : "—"} />
                  <StatCard Icon={ChartNoAxesColumn} tone="mpm-tone-rose" label="Total Score" value={isPreviewProfile ? displayNumber(PREVIEW_STATS.totalScore) : "—"} />
                  <StatCard Icon={Star} tone="mpm-tone-sky" label="Best Score" value={isPreviewProfile ? displayNumber(PREVIEW_STATS.bestScore) : "—"} />
                  <StatCard Icon={Percent} tone="mpm-tone-emerald" label="Win Rate" value={isPreviewProfile ? PREVIEW_STATS.winRate : "—"} />
                </div>
              </section>

              <section className="mpm-section">
                <h3 className="mpm-section-title"><Trophy aria-hidden="true" />Played with Arcadion</h3>
                <div className="mpm-stat-grid">
                  <StatCard Icon={Gamepad2} tone="mpm-tone-violet" label="Total Matches" value={isPreviewProfile ? displayNumber(PREVIEW_STATS.arcadionMatches) : "—"} />
                  <StatCard Icon={Trophy} tone="mpm-tone-amber" label="Total Wins" value={isPreviewProfile ? displayNumber(PREVIEW_STATS.arcadionWins) : "—"} />
                  <StatCard Icon={Star} tone="mpm-tone-rose" label="Best Score" value={isPreviewProfile ? displayNumber(PREVIEW_STATS.arcadionBestScore) : "—"} />
                  <StatCard Icon={Percent} tone="mpm-tone-emerald" label="Win Rate" value={isPreviewProfile ? PREVIEW_STATS.arcadionWinRate : "—"} />
                </div>
              </section>

              <section className="mpm-section mpm-section--highlight">
                <h3 className="mpm-section-title"><ChartNoAxesColumn aria-hidden="true" />Game Breakdown</h3>
                <div className="mpm-table-scroll">
                  <table className="mpm-table">
                    <thead>
                      <tr>
                        <th scope="col">Game</th>
                        <th scope="col">Total Score</th>
                        <th scope="col">Games Played</th>
                        <th scope="col">Highest Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SUPPORTED_GAMES.map((game) => {
                        const stats = isPreviewProfile ? PREVIEW_STATS.games[game.id] : null;
                        return (
                        <tr key={game.id}>
                          <td>
                            <span className="mpm-table-game-col">
                              <span className={`mpm-table-icon mpm-tone-violet${game.id === "tic-tac-toe" ? " mpm-game-emoji-text" : " mpm-game-emoji"}`}>
                                {game.emoji}
                              </span>
                              {game.name}
                            </span>
                          </td>
                          <td>{stats ? displayNumber(stats.totalScore) : "—"}</td>
                          <td>{stats ? displayNumber(stats.played) : "—"}</td>
                          <td>{stats ? displayNumber(stats.highestScore) : "—"}</td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>
      </section>
      {isReportOpen && profile && profile.id !== currentUserId && (
        <ReportPlayerModal
          profile={profile}
          onClose={() => setIsReportOpen(false)}
        />
      )}
    </div>,
    document.body,
  );
}

function StatCard({
  Icon,
  tone,
  label,
  value,
}: {
  Icon: typeof Gamepad2;
  tone: string;
  label: string;
  value: string;
}) {
  return (
    <div className="mpm-stat-card">
      <span className={`mpm-stat-icon ${tone}`} aria-hidden="true"><Icon /></span>
      <span className="mpm-stat-value">{value}</span>
      <span className="mpm-stat-label">{label}</span>
    </div>
  );
}

export default PlayerProfile;