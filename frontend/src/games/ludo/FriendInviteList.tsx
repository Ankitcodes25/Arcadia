import { ChevronLeft, ChevronRight, Clock3, RefreshCw, UserPlus, Wifi, WifiOff, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import FriendAvatar from "../../friends/FriendAvatar";
import OnlineStatusIndicator from "../../friends/OnlineStatusIndicator";
import { FRIENDS_CHANGED_EVENT, friendsApi, hasAuthToken } from "../../friends/friendsApi";
import type { Friend } from "../../friends/friendsTypes";
import { getInviteEligibility } from "./ludoPermissions";
import { LUDO_COLOUR_META, type LudoColour, type LudoLobbyState } from "./types";

type FriendInviteListProps = {
  colour: LudoColour;
  mode: "PASS_PLAY" | "ONLINE_FRIENDS";
  title?: string;
  subtitle?: string;
  showAll?: boolean;
  inline?: boolean;
  hasOpenSeat?: boolean;
  lobby?: LudoLobbyState | null;
  unavailableIds?: readonly string[];
  onInvite: (friend: Friend) => void;
  onClose?: () => void;
};

const PAGE_SIZE = 4;

function FriendInviteList({
  colour,
  mode,
  title,
  subtitle,
  showAll = false,
  inline = false,
  hasOpenSeat = true,
  lobby = null,
  unavailableIds = [],
  onInvite,
  onClose,
}: FriendInviteListProps) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const meta = LUDO_COLOUR_META[colour];

  const loadFriends = useCallback(async () => {
    if (!hasAuthToken()) {
      setFriends([]);
      setIsLoading(false);
      setError("Sign in to invite your friends.");
      return;
    }

    setError(null);
    try {
      const response = await friendsApi.listFriends();
      setFriends(response.friends);
    } catch {
      setError("Your friends list could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFriends();
    const reload = () => { void loadFriends(); };
    window.addEventListener(FRIENDS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(FRIENDS_CHANGED_EVENT, reload);
  }, [loadFriends]);

  useEffect(() => {
    setPage(0);
  }, [colour, mode]);

  const sortedFriends = useMemo(() => [...friends].sort((left, right) => {
    if (left.online !== right.online) return left.online ? -1 : 1;
    return left.username.localeCompare(right.username, "en", { sensitivity: "base" });
  }), [friends]);

  const onlineCount = sortedFriends.filter((friend) => friend.online).length;
  const pageCount = Math.max(1, Math.ceil(sortedFriends.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const friendSubtitle = subtitle
    ?? (mode === "ONLINE_FRIENDS" ? "Online friends can join this seat." : "Choose a friend for this seat.");
  const visibleFriends = showAll
    ? sortedFriends
    : sortedFriends.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <section
      className={`ludo-friend-picker${inline ? " ludo-friend-picker--inline" : ""}`}
      aria-labelledby="ludo-friend-picker-title"
    >
      <header className="ludo-friend-head">
        <div>
          <div className="ludo-section-title">
            {mode === "ONLINE_FRIENDS" && <UserPlus aria-hidden="true" />}
            <span className="ludo-label" id="ludo-friend-picker-title">
              {title ?? `Invite to ${meta.label}`}
            </span>
          </div>
          {friendSubtitle && <span className="ludo-friend-sub">{friendSubtitle}</span>}
        </div>
        <span className="ludo-friend-online">
          <Wifi aria-hidden="true" />
          {onlineCount} online
        </span>
        {onClose && (
          <button
            type="button"
            className="ludo-icon-button"
            onClick={onClose}
            aria-label="Close friends list"
            title="Close friends list"
          >
            <X aria-hidden="true" />
          </button>
        )}
      </header>

      {isLoading && (
        <div className="ludo-friend-loading" aria-live="polite">
          <span className="ludo-friend-skeleton" />
          <span className="ludo-friend-skeleton" />
          <span className="ludo-friend-skeleton" />
        </div>
      )}

      {!isLoading && error && (
        <div className="ludo-friend-empty" role="alert">
          <WifiOff aria-hidden="true" />
          <span>{error}</span>
          <button
            type="button"
            className="ludo-inline-button"
            onClick={() => { setIsLoading(true); void loadFriends(); }}
          >
            <RefreshCw aria-hidden="true" /> Retry
          </button>
        </div>
      )}

      {!isLoading && !error && sortedFriends.length === 0 && (
        <div className="ludo-friend-empty">
          <UserPlus aria-hidden="true" />
          <span>No friends yet. Add friends from the Friends panel first.</span>
        </div>
      )}

      {!isLoading && !error && visibleFriends.length > 0 && (
        <ul className="ludo-friend-list">
          {visibleFriends.map((friend) => {
            const isSeated = unavailableIds.includes(friend.id);
            const eligibility = mode === "ONLINE_FRIENDS"
              ? getInviteEligibility(friend, lobby, lobby?.pendingInviteeIds ?? [])
              : (isSeated ? "ALREADY_IN_LOBBY" : "ELIGIBLE");
            const canInvite = !isSeated
              && hasOpenSeat
              && (mode === "PASS_PLAY" || eligibility === "ELIGIBLE");

            return (
              <li key={friend.id} className={`ludo-friend-row${friend.online ? " is-online" : " is-offline"}`}>
                <FriendAvatar player={friend} className="ludo-friend-avatar" />
                <span className="ludo-friend-identity">
                  <span className="ludo-friend-name-row">
                    <span className="ludo-friend-name">{friend.username}</span>
                    <OnlineStatusIndicator online={friend.online} />
                  </span>
                  <span className="ludo-friend-meta">
                    {friend.online ? "Online now" : "Offline"}
                    {friend.playerId ? ` · ${friend.playerId}` : ""}
                  </span>
                </span>
                <button
                  type="button"
                  className="ludo-friend-button"
                  onClick={() => onInvite(friend)}
                  disabled={!canInvite}
                  title={
                    canInvite
                      ? `Invite ${friend.username}${hasOpenSeat ? ` to the ${meta.label} seat` : ""}`
                      : isSeated
                        ? "Already assigned to a seat"
                        : !hasOpenSeat
                          ? "No open seat available"
                        : eligibility === "OFFLINE"
                          ? "This friend is offline"
                          : undefined
                  }
                >
                  {isSeated && <Clock3 aria-hidden="true" />}
                  {canInvite ? "Invite" : isSeated ? "Seated" : !hasOpenSeat ? "Full" : eligibility === "OFFLINE" ? "Offline" : "Invited"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!showAll && !isLoading && !error && sortedFriends.length > PAGE_SIZE && (
        <div className="ludo-friend-pager">
          <button
            type="button"
            className="ludo-icon-button"
            onClick={() => setPage(Math.max(0, safePage - 1))}
            disabled={safePage === 0}
            aria-label="Previous friends"
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <span>{safePage + 1} / {pageCount}</span>
          <button
            type="button"
            className="ludo-icon-button"
            onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
            disabled={safePage >= pageCount - 1}
            aria-label="More friends"
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}

export default memo(FriendInviteList);
