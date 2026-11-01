import { Ban, Check, Clock3, UserCheck, UserPlus } from "lucide-react";
import type { FriendRelationship } from "./friendsTypes";

type FriendStatusButtonProps = {
  relationship: FriendRelationship;
  busy?: boolean;
  onSend: () => void;
  onAccept: () => void;
};

/*
 * The one relationship action used by search results. It only ever renders the
 * state the backend reported, and every action resolves before the parent
 * updates that state.
 */
function FriendStatusButton({
  relationship,
  busy = false,
  onSend,
  onAccept,
}: FriendStatusButtonProps) {
  const disabled = busy || relationship.status !== "NONE";

  if (relationship.status === "INCOMING_PENDING") {
    return (
      <button
        type="button"
        className="friends-status-button friends-status-button--accept"
        disabled={busy}
        onClick={(event) => {
          event.stopPropagation();
          onAccept();
        }}
        aria-label="Accept friend request"
      >
        {busy ? <span className="friends-inline-spinner" aria-hidden="true" /> : <UserCheck aria-hidden="true" />}
        <span>{busy ? "Accepting…" : "Accept"}</span>
      </button>
    );
  }

  if (relationship.status === "OUTGOING_PENDING") {
    return (
      <button
        type="button"
        className="friends-status-button friends-status-button--muted"
        disabled
        title="Friend request sent"
      >
        <Clock3 aria-hidden="true" />
        <span>Request Sent</span>
      </button>
    );
  }

  if (relationship.status === "FRIENDS") {
    return (
      <button
        type="button"
        className="friends-status-button friends-status-button--friends"
        disabled
        title="Already friends"
      >
        <Check aria-hidden="true" />
        <span>Friends ✓</span>
      </button>
    );
  }

  if (relationship.status === "BLOCKED") {
    return (
      <button
        type="button"
        className="friends-status-button friends-status-button--blocked"
        disabled
        title={relationship.blockedByMe ? "You blocked this player" : "Friend request unavailable"}
      >
        <Ban aria-hidden="true" />
        <span>Blocked</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="friends-status-button"
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onSend();
      }}
      aria-label="Send friend request"
    >
      {busy ? <span className="friends-inline-spinner" aria-hidden="true" /> : <UserPlus aria-hidden="true" />}
      <span>{busy ? "Sending…" : "Add Friend"}</span>
    </button>
  );
}

export default FriendStatusButton;
