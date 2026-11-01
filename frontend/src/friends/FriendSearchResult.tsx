import type { FriendSearchResult } from "./friendsTypes";
import FriendAvatar from "./FriendAvatar";
import FriendStatusButton from "./FriendStatusButton";
import OnlineStatusIndicator from "./OnlineStatusIndicator";

type FriendSearchResultProps = {
  result: FriendSearchResult;
  busy: boolean;
  onOpen: (result: FriendSearchResult) => void;
  onSend: (result: FriendSearchResult) => void;
  onAccept: (result: FriendSearchResult) => void;
};

function FriendSearchResultCard({
  result,
  busy,
  onOpen,
  onSend,
  onAccept,
}: FriendSearchResultProps) {
  return (
    <article className="friends-search-result">
      <button
        type="button"
        className="friends-card-main"
        onClick={() => onOpen(result)}
        aria-label={`Open ${result.username}'s profile`}
      >
        <FriendAvatar player={result} className="friends-card-avatar" />
        <span className="friends-card-identity">
          <span className="friends-card-name-row">
            <span className="friends-card-name">{result.username}</span>
            {result.online && <OnlineStatusIndicator online />}
          </span>
          <span className="friends-card-player-id">{result.playerId ?? "Player ID unavailable"}</span>
          <span className="friends-card-meta">{result.online ? "Online now" : "Offline"}</span>
        </span>
      </button>

      <FriendStatusButton
        relationship={result.relationship}
        busy={busy}
        onSend={() => onSend(result)}
        onAccept={() => onAccept(result)}
      />
    </article>
  );
}

export default FriendSearchResultCard;
