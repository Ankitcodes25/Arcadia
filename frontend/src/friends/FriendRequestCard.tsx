import { Ban, Check, Clock3, X } from "lucide-react";
import type { FriendRequestItem } from "./friendsTypes";
import FriendAvatar from "./FriendAvatar";
import OnlineStatusIndicator from "./OnlineStatusIndicator";
import { formatRequestTime } from "./friendsFormat";

type FriendRequestCardProps = {
  request: FriendRequestItem;
  direction: "incoming" | "outgoing";
  busy: boolean;
  disabled?: boolean;
  onOpen: (request: FriendRequestItem) => void;
  onAccept: (request: FriendRequestItem) => void;
  onReject: (request: FriendRequestItem) => void;
  onBlock: (request: FriendRequestItem) => void;
  onCancel: (request: FriendRequestItem) => void;
};

function FriendRequestCard({
  request,
  direction,
  busy,
  disabled = false,
  onOpen,
  onAccept,
  onReject,
  onBlock,
  onCancel,
}: FriendRequestCardProps) {
  const actionsDisabled = busy || disabled;
  const sentAt = formatRequestTime(request.createdAt);

  return (
    <article className="friends-request-card">
      <button
        type="button"
        className="friends-card-main friends-request-main"
        onClick={() => onOpen(request)}
        aria-label={`Open ${request.user.username}'s profile`}
      >
        <FriendAvatar player={request.user} className="friends-card-avatar" />
        <span className="friends-card-identity">
          <span className="friends-card-name-row">
            <span className="friends-card-name">{request.user.username}</span>
            <OnlineStatusIndicator online={request.user.online} />
          </span>
          <span className="friends-card-player-id">{request.user.playerId ?? "Player ID unavailable"}</span>
          <span className="friends-card-meta">
            {direction === "incoming" ? "Wants to be friends" : "Request Sent"}
            {sentAt ? ` · ${sentAt}` : ""}
          </span>
        </span>
      </button>

      <div className="friends-request-actions">
        {direction === "incoming" ? (
          <>
            <button
              type="button"
              className="friends-action-button friends-action-button--accept"
              disabled={actionsDisabled}
              onClick={() => onAccept(request)}
            >
              {busy ? <span className="friends-inline-spinner" aria-hidden="true" /> : <Check aria-hidden="true" />}
              <span>Accept</span>
            </button>
            <button
              type="button"
              className="friends-action-button friends-action-button--quiet"
              disabled={actionsDisabled}
              onClick={() => onReject(request)}
            >
              <X aria-hidden="true" />
              <span>Reject</span>
            </button>
            <button
              type="button"
              className="friends-action-button friends-action-button--danger"
              disabled={actionsDisabled}
              onClick={() => onBlock(request)}
            >
              <Ban aria-hidden="true" />
              <span>Block</span>
            </button>
          </>
        ) : (
          <>
            <span className="friends-request-status">
              <Clock3 aria-hidden="true" />
              Request Sent
            </span>
            <button
              type="button"
              className="friends-action-button friends-action-button--quiet"
              disabled={actionsDisabled}
              onClick={() => onCancel(request)}
            >
              <X aria-hidden="true" />
              <span>Cancel Request</span>
            </button>
          </>
        )}
      </div>
    </article>
  );
}

export default FriendRequestCard;
