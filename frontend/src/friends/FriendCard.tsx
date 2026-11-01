import type { Friend } from "./friendsTypes";
import FriendAvatar from "./FriendAvatar";
import OnlineStatusIndicator from "./OnlineStatusIndicator";

type FriendCardProps = {
  friend: Friend;
  onOpen: (friend: Friend) => void;
};

function FriendCard({ friend, onOpen }: FriendCardProps) {
  const friendsSince = friend.friendsSince ? new Date(friend.friendsSince) : null;
  const friendsSinceLabel = friendsSince && !Number.isNaN(friendsSince.getTime())
    ? friendsSince.toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : null;
  const statusLabel = friend.online
    ? "Online"
    : friendsSinceLabel
      ? `Offline · Friends since ${friendsSinceLabel}`
      : "Offline";

  return (
    <article className="friends-card">
      <button
        type="button"
        className="friends-card-main"
        onClick={() => onOpen(friend)}
        aria-label={`Open ${friend.username}'s profile`}
      >
        <FriendAvatar player={friend} className="friends-card-avatar" />
        <span className="friends-card-identity">
          <span className="friends-card-name-row">
            <span className="friends-card-name">{friend.username}</span>
            <OnlineStatusIndicator online={friend.online} />
          </span>
          <span className="friends-card-player-id">{friend.playerId ?? "Player ID unavailable"}</span>
          <span className="friends-card-meta">{statusLabel}</span>
        </span>
      </button>
    </article>
  );
}

export default FriendCard;
