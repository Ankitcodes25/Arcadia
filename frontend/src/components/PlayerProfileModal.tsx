import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Ban,
  ChartNoAxesColumn,
  CalendarDays,
  Check,
  CircleAlert,
  Clock3,
  Gamepad2,
  Percent,
  RefreshCw,
  Star,
  Trophy,
  UserCheck,
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
import {
  DUMMY_PLAYERS_ENABLED,
  getDummyPlayerByUsername,
  getDummyPlayerForPublicProfile,
  toDummyPublicProfile,
} from "../data/development/dummyPlayers";
import { friendsApi, notifyFriendsChanged } from "../friends/friendsApi";
import type { FriendRelationship } from "../friends/friendsTypes";
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
  onRelationshipChange?: (playerId: string, relationship: FriendRelationship) => void;
};

const SUPPORTED_GAMES = [
  { id: "ludo", name: "Ludo", emoji: "🎲" },
  { id: "tic-tac-toe", name: "Tic Tac Toe", emoji: "#" },
  { id: "rock-paper-scissors", name: "Rock Paper Scissors", emoji: "✂️" },
  { id: "snake-ladder", name: "Snake & Ladder", emoji: "🐍" },
  { id: "memory", name: "Memory", emoji: "🧠" },
] as const;

function formatPercent(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? `${value.toFixed(1)}%`
    : "—";
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
  onRelationshipChange,
}: PlayerProfileProps) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [profile, setProfile] = useState<PublicPlayerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [relationship, setRelationship] = useState<FriendRelationship | null>(null);
  const [relationshipLoading, setRelationshipLoading] = useState(false);
  const [relationshipError, setRelationshipError] = useState<string | null>(null);
  const [friendAction, setFriendAction] = useState<"send" | "accept" | "decline" | null>(null);
  const requestGeneration = useRef(0);
  const relationshipGeneration = useRef(0);
  const lookupPlayerId = playerId?.trim() || null;
  const lookupUsername = username?.trim() || null;

  const loadProfile = useCallback(async () => {
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    relationshipGeneration.current += 1;
    setIsLoading(true);
    setLoadError(null);
    setIsPrivate(false);
    setRelationship(null);
    setRelationshipError(null);
    setRelationshipLoading(false);
    setFriendAction(null);

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
        const dummyPlayer =
          demoFallback && DUMMY_PLAYERS_ENABLED && lookupUsername
            ? getDummyPlayerByUsername(lookupUsername)
            : null;
        if (dummyPlayer) {
          setProfile(toDummyPublicProfile(dummyPlayer));
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

  const loadRelationship = useCallback(async () => {
    const target = profile;
    if (
      !target
      || !currentUserId
      || target.id === currentUserId
      || getDummyPlayerForPublicProfile(target)
    ) {
      relationshipGeneration.current += 1;
      setRelationship(null);
      setRelationshipError(null);
      setRelationshipLoading(false);
      return;
    }

    const generation = relationshipGeneration.current + 1;
    relationshipGeneration.current = generation;
    setRelationshipLoading(true);
    setRelationshipError(null);
    try {
      const response = await friendsApi.getRelationship(target.id);
      if (generation !== relationshipGeneration.current) return;
      setRelationship(response.relationship);
    } catch (error) {
      if (generation !== relationshipGeneration.current) return;
      setRelationship(null);
      setRelationshipError(getAuthErrorMessage(error, "Friend status is unavailable."));
    } finally {
      if (generation === relationshipGeneration.current) setRelationshipLoading(false);
    }
  }, [currentUserId, profile]);

  useEffect(() => {
    if (
      !profile
      || !currentUserId
      || profile.id === currentUserId
      || getDummyPlayerForPublicProfile(profile)
    ) {
      relationshipGeneration.current += 1;
      setRelationship(null);
      setRelationshipError(null);
      setRelationshipLoading(false);
      return undefined;
    }

    void loadRelationship();
    return () => {
      relationshipGeneration.current += 1;
    };
  }, [currentUserId, loadRelationship, profile]);

  const handleFriendAction = useCallback(async (action: "send" | "accept" | "decline") => {
    const target = profile;
    if (!target || friendAction !== null) return;

    setFriendAction(action);
    setRelationshipError(null);
    try {
      let response: { relationship: FriendRelationship };
      if (action === "send") {
        response = await friendsApi.sendRequest(target.id);
      } else {
        const requestId = relationship?.requestId;
        if (!requestId) throw new Error("Friend request is unavailable.");
        response = action === "accept"
          ? await friendsApi.acceptRequest(requestId)
          : await friendsApi.rejectRequest(requestId);
      }

      setRelationship(response.relationship);
      notifyFriendsChanged("profile");
      onRelationshipChange?.(target.id, response.relationship);
    } catch (error) {
      setRelationshipError(getAuthErrorMessage(
        error,
        action === "send"
          ? "Unable to send the friend request."
          : action === "accept"
            ? "Unable to accept the friend request."
            : "Unable to decline the friend request.",
      ));
    } finally {
      setFriendAction(null);
    }
  }, [friendAction, onRelationshipChange, profile, relationship]);

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
  const previewPlayer = getDummyPlayerForPublicProfile(profile);
  const previewStats = previewPlayer?.stats ?? null;
  const isPreviewProfile = previewStats !== null;
  const shownUsername = profile?.username ?? username ?? "Player";
  const googleAvatarUrl = profile?.avatar.type === "google"
    ? getSafeGoogleAvatarUrl(profile.avatarUrl)
    : null;
  const localAvatar = profile?.avatar.type === "local"
    ? getLocalAvatarOption(profile.avatar.value)
    : null;
  const avatarUrl = googleAvatarUrl && !avatarFailed ? googleAvatarUrl : null;

  const friendControls = (() => {
    if (!profile || !currentUserId || profile.id === currentUserId) return null;
    if (isPreviewProfile) {
      return (
        <button
          type="button"
          className="player-profile-friend-button player-profile-friend-button--muted"
          disabled
          title="Development demo profiles cannot send or receive friend requests"
        >
          <UserPlus aria-hidden="true" />
          Demo profile
        </button>
      );
    }

    if (relationshipLoading) {
      return (
        <button
          type="button"
          className="player-profile-friend-button player-profile-friend-button--muted"
          disabled
        >
          <span className="player-profile-friend-spinner" aria-hidden="true" />
          Checking…
        </button>
      );
    }

    if (relationshipError) {
      return (
        <div className="player-profile-friend-action player-profile-friend-action--stack">
          <button
            type="button"
            className="player-profile-friend-button player-profile-friend-button--retry"
            onClick={() => void loadRelationship()}
            title={relationshipError}
          >
            <RefreshCw aria-hidden="true" />
            Retry
          </button>
          <span className="player-profile-friend-error" role="alert">{relationshipError}</span>
        </div>
      );
    }

    const status = relationship?.status ?? "NONE";

    if (status === "INCOMING_PENDING") {
      return (
        <div className="player-profile-friend-action player-profile-friend-action--stack">
          <div className="player-profile-friend-button-row">
            <button
              type="button"
              className="player-profile-friend-button player-profile-friend-button--accept"
              disabled={friendAction !== null}
              onClick={() => void handleFriendAction("accept")}
            >
              {friendAction === "accept"
                ? <span className="player-profile-friend-spinner" aria-hidden="true" />
                : <UserCheck aria-hidden="true" />}
              {friendAction === "accept" ? "Accepting…" : "Accept"}
            </button>
            <button
              type="button"
              className="player-profile-friend-button player-profile-friend-button--decline"
              disabled={friendAction !== null}
              onClick={() => void handleFriendAction("decline")}
            >
              {friendAction === "decline"
                ? <span className="player-profile-friend-spinner" aria-hidden="true" />
                : <X aria-hidden="true" />}
              {friendAction === "decline" ? "Declining…" : "Decline"}
            </button>
          </div>
        </div>
      );
    }

    if (status === "OUTGOING_PENDING") {
      return (
        <button
          type="button"
          className="player-profile-friend-button player-profile-friend-button--muted"
          disabled
          title="Friend request sent"
        >
          <Clock3 aria-hidden="true" />
          Friend Request Sent
        </button>
      );
    }

    if (status === "FRIENDS") {
      return (
        <button
          type="button"
          className="player-profile-friend-button player-profile-friend-button--friends"
          disabled
          title="Already friends"
        >
          <Check aria-hidden="true" />
          Friends ✓
        </button>
      );
    }

    if (status === "BLOCKED") {
      return (
        <button
          type="button"
          className="player-profile-friend-button player-profile-friend-button--blocked"
          disabled
          title={relationship?.blockedByMe ? "You blocked this player" : "Friend request unavailable"}
        >
          <Ban aria-hidden="true" />
          Blocked
        </button>
      );
    }

    return (
      <button
        type="button"
        className="player-profile-friend-button"
        disabled={friendAction !== null}
        onClick={() => void handleFriendAction("send")}
      >
        {friendAction === "send"
          ? <span className="player-profile-friend-spinner" aria-hidden="true" />
          : <UserPlus aria-hidden="true" />}
        {friendAction === "send" ? "Sending…" : "Add Friend"}
      </button>
    );
  })();

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
          {isPreviewProfile && (
            <p className="player-profile-demo-note" role="note">
              Development demo profile — sample data only, not a real account.
            </p>
          )}
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
              {friendControls && (
                <div className="player-profile-header-friend">
                  {friendControls}
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
                  <StatCard Icon={Gamepad2} tone="mpm-tone-violet" label="Games Played" value={displayNumber(previewStats?.gamesPlayed)} />
                  <StatCard Icon={Trophy} tone="mpm-tone-amber" label="Games Won" value={displayNumber(previewStats?.wins)} />
                  <StatCard Icon={ChartNoAxesColumn} tone="mpm-tone-rose" label="Total Score" value={displayNumber(previewStats?.totalScore)} />
                  <StatCard Icon={Star} tone="mpm-tone-sky" label="Best Score" value={displayNumber(previewStats?.bestScore)} />
                  <StatCard Icon={Percent} tone="mpm-tone-emerald" label="Win Rate" value={formatPercent(previewStats?.winRatePercent)} />
                </div>
              </section>

              <section className="mpm-section">
                <h3 className="mpm-section-title"><Trophy aria-hidden="true" />Played with Arcadion</h3>
                <div className="mpm-stat-grid">
                  <StatCard Icon={Gamepad2} tone="mpm-tone-violet" label="Total Matches" value={displayNumber(previewStats?.arcadion.matches)} />
                  <StatCard Icon={Trophy} tone="mpm-tone-amber" label="Total Wins" value={displayNumber(previewStats?.arcadion.wins)} />
                  <StatCard Icon={Star} tone="mpm-tone-rose" label="Best Score" value={displayNumber(previewStats?.arcadion.bestScore)} />
                  <StatCard Icon={Percent} tone="mpm-tone-emerald" label="Win Rate" value={formatPercent(previewStats?.arcadion.winRatePercent)} />
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
                        const stats = previewStats?.games[game.id] ?? null;
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