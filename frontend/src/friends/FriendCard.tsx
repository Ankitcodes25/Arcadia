import { Ban, MessageSquare, UserMinus } from "lucide-react";
import type { Friend } from "./friendsTypes";
import FriendAvatar from "./FriendAvatar";
import OnlineStatusIndicator from "./OnlineStatusIndicator";

type FriendCardProps = {
  friend: Friend;
  unreadCount?: number;
  /** This friend asked to clear the chat for both and is waiting for an answer. */
  clearRequestPending?: boolean;
  /** A Remove or Block for any friend is in flight. */
  actionsDisabled?: boolean;
  onOpen: (friend: Friend) => void;
  onChat: (friend: Friend) => void;
  onRemove: (friend: Friend) => void;
  onBlock: (friend: Friend) => void;
};

function FriendCard({
  friend,
  unreadCount = 0,
  clearRequestPending = false,
  actionsDisabled = false,
  onOpen,
  onChat,
  onRemove,
  onBlock,
}: FriendCardProps) {
  const friendsSince = friend.friendsSince ? new Date(friend.friendsSince) : null;
  const friendsSinceLabel = friendsSince && !Number.isNaN(friendsSince.getTime())
    ? friendsSince.toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : null;
  const statusLabel = friend.online
    ? "Online"
    : friendsSinceLabel
      ? `Offline · Friends since ${friendsSinceLabel}`
      : "Offline";
  const chatLabel = [
    `Chat with ${friend.username}`,
    unreadCount > 0 ? `${unreadCount} unread message${unreadCount === 1 ? "" : "s"}` : null,
    clearRequestPending ? "Clear Chat Request waiting for your answer" : null,
  ].filter(Boolean).join(", ");

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
      <div className="friends-card-actions">
        <button
          type="button"
          className="friends-chat-button"
          onClick={() => onChat(friend)}
          aria-label={chatLabel}
          title={clearRequestPending ? `${friend.username} sent a Clear Chat Request` : `Chat with ${friend.username}`}
        >
          <MessageSquare aria-hidden="true" />
          {clearRequestPending && <span className="friends-chat-request-dot" aria-hidden="true" />}
          {unreadCount > 0 && (
            <span className="friends-chat-unread" aria-hidden="true">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
        <button
          type="button"
          className="friends-card-icon-button friends-card-icon-button--remove"
          onClick={() => onRemove(friend)}
          disabled={actionsDisabled}
          aria-label={`Remove ${friend.username} from friends`}
          title="Remove Friend"
        >
          <UserMinus aria-hidden="true" />
        </button>
        <button
          type="button"
          className="friends-card-icon-button friends-card-icon-button--block"
          onClick={() => onBlock(friend)}
          disabled={actionsDisabled}
          aria-label={`Block ${friend.username}`}
          title="Block"
        >
          <Ban aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

export default FriendCard;
