import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type {
  AccountProfileUser,
  AuthAvatar,
  GamingStatsSummary,
} from "../../auth/authTypes";
import AvatarPreview from "./AvatarPreview";
import { getAuthErrorMessage } from "../../auth/authUtils";
import {
  getLoginMethodWithEmail,
  formatHoursPlayed,
  formatJoinedDate,
  getAccountStatusLabel,
  USERNAME_SAVE_FAILED_MESSAGE,
} from "../../auth/accountInfo";
import { readEligibilitySource, getBadgeDisplay } from "../../auth/tierEligibility";
import {
  checkUsernameAvailable,
  USERNAME_TAKEN_MESSAGE,
} from "../../auth/usernameAvailability";
import CopyButton from "../../auth/CopyButton";
import AvatarsModal from "./AvatarsModal";
import UsernameModal from "../../components/UsernameModal";
import { USERNAME_MAX_LENGTH } from "../../auth/usernameRules";
import "./MyProfileModal.css";

/* ===========================================================
   ICONS — small inline SVGs, same stroke style used across the
   auth/profile popup components (stroke="currentColor").
   =========================================================== */

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4.5 19.5c1.6-3.4 4.6-5 7.5-5s5.9 1.6 7.5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5.5" width="16" height="14.5" rx="2.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 9.5h16M8 3.5v3M16 3.5v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7.6V12l3 1.9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3.2 19 6v6c0 4-3 7.2-7 8.8-4-1.6-7-4.8-7-8.8V6l7-2.8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M9.2 12.1 11.3 14.2l3.6-3.7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7 4h10v4.2c0 3-2.2 5.4-5 5.4s-5-2.4-5-5.4V4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M7 5.2H4.6c0 2.6 1.4 4.4 3 4.9M17 5.2h2.4c0 2.6-1.4 4.4-3 4.9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 13.6v3M9 20h6M9.6 20c0-1.8.8-2.8 2.4-3.2 1.6.4 2.4 1.4 2.4 3.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M14.7 4.3 19.7 9.3 8.4 20.6H3.4V15.6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M12.7 6.3 17.7 11.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5 19 19M19 5 5 19" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function ControllerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2.6" y="7.5" width="18.8" height="10" rx="5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M7 10.2v4M5 12.2h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="15.4" cy="10.8" r="1" fill="currentColor" />
      <circle cx="17.8" cy="13.2" r="1" fill="currentColor" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m12 3.6 2.4 5 5.4.8-3.9 3.8.9 5.4L12 16l-4.8 2.6.9-5.4-3.9-3.8 5.4-.8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PercentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="7.2" cy="7.2" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="16.8" cy="16.8" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M18 6 6 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function CoinsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <ellipse cx="9" cy="7" rx="5.5" ry="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 7v4c0 1.66 2.46 3 5.5 3s5.5-1.34 5.5-3V7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3.5 11v4c0 1.66 2.46 3 5.5 3 2.4 0 4.44-.84 5.16-2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <ellipse cx="16.2" cy="14.3" rx="4.3" ry="2.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11.9 14.3v2.9c0 1.33 1.93 2.4 4.3 2.4s4.3-1.07 4.3-2.4v-2.9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ArcadionIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3C7.8 3 5 6.3 5 10.4V16c0 2.6 3 4.6 7 4.6s7-2 7-4.6v-5.6C19 6.3 16.2 3 12 3Z"
        fill="currentColor"
        opacity="0.16"
      />
      <path
        d="M12 3C7.8 3 5 6.3 5 10.4V16c0 2.6 3 4.6 7 4.6s7-2 7-4.6v-5.6C19 6.3 16.2 3 12 3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M9 12.6 10.6 11l1.6 1.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.8 12.6 15.4 11 17 12.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 19V10M11 19V5M17 19v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.6 9.2c0-.6-.05-1.2-.16-1.75H9v3.3h4.8a4.1 4.1 0 0 1-1.78 2.7v2.2h2.9c1.68-1.55 2.66-3.83 2.66-6.45Z" />
      <path fill="#34A853" d="M9 18c2.4 0 4.42-.8 5.9-2.15l-2.9-2.2c-.8.55-1.84.87-3 .87-2.3 0-4.26-1.56-4.96-3.63H1.05v2.28A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M4.04 10.9a5.4 5.4 0 0 1 0-3.8V4.83H1.05a9 9 0 0 0 0 8.34l2.99-2.27Z" />
      <path fill="#EA4335" d="M9 3.58c1.3 0 2.47.45 3.4 1.33l2.55-2.55C13.4.86 11.4 0 9 0A9 9 0 0 0 1.05 4.83L4.04 7.1C4.74 5.04 6.7 3.58 9 3.58Z" />
    </svg>
  );
}

/* ===========================================================
   GAME BREAKDOWN — placeholder rows only.

   No per-game score, games played or highest score exists yet because no game
   records do. The rows stay listed so the future game systems have their
   surface, and every value renders as an empty state instead of a number that
   was never earned. XP progression is independent of this section.
   =========================================================== */

type GameBreakdownRow = {
  id: string;
  name: string;
  icon: ReactNode;
};

const DEFAULT_GAME_BREAKDOWN: GameBreakdownRow[] = [
  { id: "ludo", name: "Ludo", icon: <span className="mpm-game-emoji">🎲</span> },
  { id: "tic-tac-toe", name: "Tic Tac Toe", icon: <span className="mpm-game-emoji mpm-game-emoji-text">#</span> },
  { id: "rock-paper-scissors", name: "Rock Paper Scissors", icon: <span className="mpm-game-emoji">✌️</span> },
  { id: "snake-ladder", name: "Snake & Ladder", icon: <span className="mpm-game-emoji">🐍</span> },
  { id: "memory", name: "Memory", icon: <span className="mpm-game-emoji">🎴</span> },
];

/* Rotating icon-chip colors so the table/stat cards don't read as one
   flat wash of purple — cycled by index, not tied to any specific game. */
const CHIP_TONES = ["violet", "sky", "rose", "emerald", "amber"] as const;
type ChipTone = (typeof CHIP_TONES)[number];

/* ===========================================================
   PROPS

   `profile` is the account profile as returned by the backend, so every visible
   value here is a persisted value rather than local state.

   My Profile is informational. It has no draft state and no action row: the
   username is edited and persisted entirely inside the Username Modal, and the
   avatar is chosen and persisted entirely inside the Avatar Modal.

   `onSaveUsername` persists a username through the existing account profile
   write, and `onSaveAvatar` does the same for an avatar. Both resolve only
   once the backend has confirmed the change, and a rejection keeps the child
   modal open with its warning.
   =========================================================== */

type MyProfileModalProps = {
  profile: AccountProfileUser;
  onClose: () => void;
  loadError?: string | null;
  /**
   * Global leaderboard rank. It is a future backend-owned value, so it is only
   * rendered when the backend actually provides one; nothing is invented here.
   */
  globalRank?: number | null;
  onSaveUsername: (username: string) => Promise<unknown>;
  onSaveAvatar: (avatar: AuthAvatar) => Promise<unknown>;
  gameBreakdown?: GameBreakdownRow[];
};

const DEFAULT_STATS: GamingStatsSummary = {
  gamesPlayed: 0,
  gamesWon: 0,
  totalScore: 0,
  bestScore: 0,
  currentStreak: 0,
  winRatePercent: 0,
};

/*
 * Multiplayer is not built yet, so the "Played with Arcadion" block keeps its
 * neutral zero state and is not part of any XP calculation.
 */
const DEFAULT_ARCADION = {
  totalMatches: 0,
  totalWins: 0,
  winRatioPercent: 0,
  bestScore: 0,
};

function MyProfileModal({
  profile,
  onClose,
  loadError = null,
  globalRank = null,
  onSaveUsername,
  onSaveAvatar,
  gameBreakdown = DEFAULT_GAME_BREAKDOWN,
}: MyProfileModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  const [isUsernameModalOpen, setIsUsernameModalOpen] = useState(false);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);

  /*
   * The badge and the level avatars are decided from the same authoritative
   * progression, so they can never disagree. Rookie additionally needs a
   * completed match, and until the backend records one it is shown in the
   * neutral unearned state rather than as an earned bronze badge.
   */
  const { progression, completedMatches } = readEligibilitySource(profile);
  const badge = getBadgeDisplay(progression, completedMatches);

  const stats = profile.gamingStats ?? DEFAULT_STATS;

  /*
   * Account Info, all read from the account profile the backend returned.
   *
   * Playtime is the one value the backend does not track yet, so it renders the
   * neutral placeholder until real gameplay tracking populates
   * gamingStats.totalMinutesPlayed. Nothing is estimated to fill it in.
   */
  const totalMinutesPlayed = stats.totalMinutesPlayed;
  const hasPlaytime = typeof totalMinutesPlayed === "number"
    && Number.isFinite(totalMinutesPlayed);
  const hoursPlayed = formatHoursPlayed(totalMinutesPlayed);
  const joinedDate = formatJoinedDate(profile.createdAt);
  const isGoogleAccount = profile.authProvider === "GOOGLE";
  const loginMethod = getLoginMethodWithEmail(profile.authProvider, profile.email);
  const accountStatus = getAccountStatusLabel(profile.status);
  const accountStatusTone = profile.status === "ACTIVE" ? "active" : "inactive";

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      /*
       * Escape belongs to the topmost layer only. While a child layer is open
       * it handles its own Escape, so this must not close My Profile as well.
       */
      if (isAvatarModalOpen || isUsernameModalOpen) return;
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isAvatarModalOpen, isUsernameModalOpen, onClose]);

  /*
   * The username flow, entirely inside the Username Modal.
   *
   * The backend is asked whether the name is free first, then the name is
   * persisted through the existing account profile write. A name the backend
   * refuses leaves everything untouched: AuthContext, the database and the
   * displayed username all keep their current values, the modal stays open and
   * the returned warning is shown in it.
   *
   * The modal is closed only after the write succeeded, and the value it then
   * displays comes from the profile the backend returned, so there is no local
   * copy that could drift.
   */
  async function handleUsernameSubmit(candidate: string): Promise<string | null> {
    setIsCheckingUsername(true);
    try {
      const availability = await checkUsernameAvailable(candidate, profile.username);
      if (!availability.available) {
        return availability.warning ?? USERNAME_TAKEN_MESSAGE;
      }

      await onSaveUsername(candidate);
      setIsUsernameModalOpen(false);
      return null;
    } catch (error) {
      return getAuthErrorMessage(error, USERNAME_SAVE_FAILED_MESSAGE);
    } finally {
      setIsCheckingUsername(false);
    }
  }

  return createPortal(
    /*
     * This dialog is a layer above the Profile Popup, not a replacement for it.
     * Both the backdrop click and the X are a back action: they clear only this
     * dialog, and the popup that opened it stays open underneath. Propagation
     * is stopped so a close here can never reach an ancestor dismiss handler.
     */
    <div
      className="mpm-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        ref={modalRef}
        className={`mpm-modal${isUsernameModalOpen || isAvatarModalOpen ? " mpm-modal--blurred" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mpm-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="mpm-header">
          <div className="mpm-header-title">
            <span className="mpm-header-icon"><PersonIcon /></span>
            <h2 id="mpm-title">My Profile</h2>
          </div>

          <div className="mpm-header-right">
            <button
              type="button"
              className="mpm-close"
              aria-label="Back to profile menu"
              title="Back to profile menu"
              onClick={(event) => {
                event.stopPropagation();
                onClose();
              }}
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        <div className="mpm-body">
        {/* A save failure is reported inside the Username Modal, which is where
            the edit is made. This notice is only for a failed profile load. */}
        {loadError && (
          <p className="mpm-notice" role="alert">{loadError}</p>
        )}

        {/* Identity: the Arcadia username and the permanent Player ID.
            The Google fetched name is deliberately not shown here; the Google
            identity data itself is untouched and is still used for
            authentication and for the trusted Google avatar. */}
        <div className="mpm-identity">
          <div className="mpm-avatar-wrap">
            <AvatarPreview user={profile} className="mpm-avatar" />
            {/*
              The avatar pencil opens the Avatar Modal as a child layer. My
              Profile stays mounted underneath and is only blurred, so the X and
              Back of that layer return here rather than leaving the profile.
            */}
            <button
              type="button"
              className="mpm-avatar-edit"
              aria-label="Edit avatar"
              title="Edit avatar"
              onClick={() => setIsAvatarModalOpen(true)}
            >
              <PencilIcon />
            </button>
          </div>

          <div className="mpm-identity-main">
            {/*
              The identity hierarchy, most permanent identifier first:

                PLAYER ID
                ARC-XXXXXXXX

                <username>
                <progression title>

              The username is the account's visible name, so it is rendered as
              the main identity text with no label above it, and the badge title
              sits directly underneath. The title is the existing progression
              value, never a value chosen here.
            */}
            <div className="mpm-identity-player">
              <span className="mpm-identity-label">Player ID</span>
              <span className="mpm-identity-value-row">
                <span
                  data-field="playerId"
                  className="mpm-identity-value mpm-identity-value--player"
                >
                  {profile.playerId ?? "—"}
                </span>
                <CopyButton
                  value={profile.playerId ?? ""}
                  label="Copy player ID"
                  copiedLabel="Player ID copied"
                />
              </span>
            </div>

            <div className="mpm-identity-name-row">
              {/* The persisted username. It is edited and saved inside the
                  Username Modal, so there is no unsaved draft here. */}
              <span data-field="username" className="mpm-identity-value mpm-identity-value--name">
                {profile.username ?? ""}
              </span>
              <CopyButton
                value={profile.username ?? ""}
                label="Copy username"
                copiedLabel="Username copied"
              />
              <button
                type="button"
                className="mpm-edit-btn"
                aria-label="Edit username"
                onClick={() => setIsUsernameModalOpen(true)}
              >
                <PencilIcon />
              </button>
            </div>

            {/*
              The badge follows the same eligibility rule as the level avatars.
              Before a tier is earned it renders in the neutral unearned theme,
              so an unearned Rookie is never presented as an awarded badge.
            */}
            <span
              className={`mpm-identity-title mpm-identity-title--${badge.themeKey}`}
              data-field="progressionTitle"
              data-badge={progression.badgeKey}
              data-earned={badge.isEarned ? "true" : "false"}
            >
              {badge.title}
            </span>

            {globalRank != null && (
              <span className="mpm-rank-pill">
                <TrophyIcon />
                #{globalRank}
                <span className="mpm-rank-label">Global Rank</span>
              </span>
            )}
          </div>
        </div>

        {/* Level — every value is derived on the backend from total Arcadion XP. */}
        <div
          className={`mpm-level-card mpm-level-card--${badge.themeKey}${badge.isEarned && progression.isAnimated ? " mpm-level-card--animated" : ""}`}
          data-badge={progression.badgeKey}
          data-earned={badge.isEarned ? "true" : "false"}
        >
          <div className="mpm-level-badge-wrap">
            <div className="mpm-level-badge">{progression.levelDigits}</div>
          </div>
          <div className="mpm-level-body">
            <div className="mpm-level-top">
              <span className="mpm-level-title">{progression.levelLabel}</span>
              <span className="mpm-level-xp">{progression.xpLabel}</span>
            </div>
            {/* An unearned tier says so, rather than reading as an award. */}
            <p className="mpm-level-sub">
              {badge.isEarned ? badge.title : `${badge.title} — unearned`}
            </p>
            <div
              className="mpm-progress-track"
              role="progressbar"
              aria-label={`${progression.title} progress to Level ${progression.level + 1}`}
              aria-valuemin={0}
              aria-valuemax={progression.nextLevelXp}
              aria-valuenow={progression.currentLevelXp}
            >
              <div className="mpm-progress-fill" style={{ width: `${progression.progressPercent}%` }} />
            </div>
          </div>
        </div>

        {/* Gaming stats — neutral values from the backend until the games exist. */}
        <section className="mpm-section">
          <h3 className="mpm-section-title"><ControllerIcon />Gaming Stats</h3>
          <div className="mpm-stat-grid mpm-stat-grid--5">
            <div className="mpm-stat-card">
              <span className="mpm-stat-icon mpm-tone-violet"><ControllerIcon /></span>
              <span className="mpm-stat-value">{stats.gamesPlayed}</span>
              <span className="mpm-stat-label">Games Played</span>
            </div>
            <div className="mpm-stat-card">
              <span className="mpm-stat-icon mpm-tone-amber"><TrophyIcon /></span>
              <span className="mpm-stat-value">{stats.gamesWon}</span>
              <span className="mpm-stat-label">Games Won</span>
            </div>
            <div className="mpm-stat-card">
              <span className="mpm-stat-icon mpm-tone-rose"><CoinsIcon /></span>
              <span className="mpm-stat-value">{stats.totalScore}</span>
              <span className="mpm-stat-label">Total Score</span>
            </div>
            <div className="mpm-stat-card">
              <span className="mpm-stat-icon mpm-tone-sky"><StarIcon /></span>
              <span className="mpm-stat-value">{stats.bestScore}</span>
              <span className="mpm-stat-label">Best Score</span>
            </div>
            <div className="mpm-stat-card">
              <span className="mpm-stat-icon mpm-tone-emerald"><PercentIcon /></span>
              <span className="mpm-stat-value">{stats.winRatePercent}%</span>
              <span className="mpm-stat-label">Win Rate</span>
            </div>
          </div>
        </section>

        {/* Played with Arcadion — neutral placeholders for the future
            multiplayer system, independent of XP progression. */}
        <section className="mpm-section">
          <h3 className="mpm-section-title"><ArcadionIcon />Played with Arcadion</h3>
          <div className="mpm-stat-grid">
            <div className="mpm-stat-card">
              <span className="mpm-stat-icon mpm-tone-violet"><ControllerIcon /></span>
              <span className="mpm-stat-value">{DEFAULT_ARCADION.totalMatches}</span>
              <span className="mpm-stat-label">Total Matches</span>
            </div>
            <div className="mpm-stat-card">
              <span className="mpm-stat-icon mpm-tone-amber"><TrophyIcon /></span>
              <span className="mpm-stat-value">{DEFAULT_ARCADION.totalWins}</span>
              <span className="mpm-stat-label">Total Wins</span>
            </div>
            <div className="mpm-stat-card">
              <span className="mpm-stat-icon mpm-tone-emerald"><PercentIcon /></span>
              <span className="mpm-stat-value">{DEFAULT_ARCADION.winRatioPercent}%</span>
              <span className="mpm-stat-label">Win Ratio</span>
            </div>
            <div className="mpm-stat-card">
              <span className="mpm-stat-icon mpm-tone-rose"><StarIcon /></span>
              <span className="mpm-stat-value">{DEFAULT_ARCADION.bestScore}</span>
              <span className="mpm-stat-label">Best Score</span>
            </div>
          </div>
        </section>

        {/* Game breakdown — empty state until the game systems record results. */}
        <section className="mpm-section mpm-section--highlight">
          <h3 className="mpm-section-title"><ChartIcon />Game Breakdown</h3>
          <div className="mpm-table-scroll">
            <table className="mpm-table">
              <thead>
                <tr>
                  <th className="mpm-table-game-col">Game</th>
                  <th>Total Score</th>
                  <th>Games Played</th>
                  <th>Highest Score</th>
                </tr>
              </thead>
              <tbody>
                {gameBreakdown.map((game, index) => {
                  const tone: ChipTone = CHIP_TONES[index % CHIP_TONES.length];
                  return (
                    <tr key={game.id}>
                      <td className="mpm-table-game-col">
                        <span className={`mpm-table-icon mpm-tone-${tone}`}>{game.icon}</span>
                        {game.name}
                      </td>
                      <td>—</td>
                      <td>—</td>
                      <td>—</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/*
          Account info. Informational only, so it carries no controls and no
          save action of its own: the existing Save Changes above is still the
          single way an edit is persisted.
        */}
        <section className="mpm-section mpm-section--account">
          <h3 className="mpm-section-title"><PersonIcon />Account Info</h3>
          <div className="mpm-info-grid">
            <div className="mpm-info-card">
              <span className="mpm-info-icon mpm-tone-violet"><ClockIcon /></span>
              <span className="mpm-info-label">Total Hours Played</span>
              <span className="mpm-info-value" data-field="hoursPlayed">
                {hoursPlayed}
              </span>
              <span className="mpm-info-hint">
                {hasPlaytime ? "Total gameplay time" : "Not tracked yet"}
              </span>
            </div>

            <div className="mpm-info-card">
              <span className="mpm-info-icon mpm-tone-sky"><CalendarIcon /></span>
              <span className="mpm-info-label">Joined Date</span>
              <span className="mpm-info-value" data-field="joinedDate">
                {joinedDate}
              </span>
              <span className="mpm-info-hint">Arcadia member since</span>
            </div>

            <div className="mpm-info-card">
              <span className="mpm-info-icon mpm-tone-amber">
                {isGoogleAccount ? <GoogleIcon /> : <PersonIcon />}
              </span>
              <span className="mpm-info-label">Login Method</span>
              {/*
                The authentication method and the address that account signs in
                with, as one field: `Google · ankit@gmail.com` for a Google
                account and `Email · ankit@example.com` for a password account.
                Both halves are data the backend already returned. A Google
                account is never labelled as a password account, the Google
                display name stays out of the profile, and no OAuth token is
                exposed anywhere.
              */}
              <span className="mpm-info-value" data-field="loginMethod">
                {loginMethod}
              </span>
              <span className="mpm-info-hint">
                {isGoogleAccount ? "Google account" : "Email and password"}
              </span>
            </div>

            <div className="mpm-info-card">
              <span
                className={`mpm-info-icon ${profile.status === "ACTIVE" ? "mpm-tone-emerald" : "mpm-tone-rose"}`}
              >
                <ShieldIcon />
              </span>
              <span className="mpm-info-label">Account Status</span>
              <span
                className={`mpm-info-value mpm-info-value--${accountStatusTone}`}
                data-field="accountStatus"
              >
                {accountStatus}
              </span>
              <span className="mpm-info-hint">Current account standing</span>
            </div>
          </div>
        </section>
        </div>
      </div>

      {isUsernameModalOpen && (
        <UsernameModal
          mode="edit"
          initialUsername={profile.username ?? ""}
          maxLength={USERNAME_MAX_LENGTH}
          isSubmitting={isCheckingUsername}
          onClose={() => setIsUsernameModalOpen(false)}
          onSubmit={handleUsernameSubmit}
        />
      )}

      {/*
        The Avatar Modal is a child layer. It is rendered as a sibling while
        this dialog stays mounted and blurred, so its X and Back return to My
        Profile instead of closing it. It is rendered after the Username Modal
        so the two layers are never open at the same time, and its backdrop
        stops propagation so nothing here can reach this dialog's handlers.
      */}
      {isAvatarModalOpen && (
        <AvatarsModal
          profile={profile}
          onClose={() => setIsAvatarModalOpen(false)}
          onSaveAvatar={onSaveAvatar}
        />
      )}
    </div>,
    document.body,
  );
}

export default MyProfileModal;