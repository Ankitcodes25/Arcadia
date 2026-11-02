import { UserCheck } from "lucide-react";
import type { BlockedPlayer } from "./friendsTypes";
import FriendAvatar from "./FriendAvatar";

type BlockedPlayerCardProps = {
  player: BlockedPlayer;
  busy: boolean;
  disabled: boolean;
  onUnblock: (player: BlockedPlayer) => void;
};

/*
 * Reuses the Friends card geometry and avatar so a blocked player reads as a
 * player row, not a separate design. The only action is Unblock; blocked
 * players cannot be opened, chatted with or re-blocked from this list.
 */
function BlockedPlayerCard({
  player,
  busy,
  disabled,
  onUnblock,
}: BlockedPlayerCardProps) {
  const blockedAt = player.blockedAt ? new Date(player.blockedAt) : null;
  const blockedAtLabel = blockedAt && !Number.isNaN(blockedAt.getTime())
    ? blockedAt.toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : null;

  return (
    <article className="friends-card friends-blocked-card">
      <div className="friends-card-main friends-blocked-main">
        <FriendAvatar player={player} className="friends-card-avatar" />
        <span className="friends-card-identity">
          <span className="friends-card-name-row">
            <span className="friends-card-name">{player.username}</span>
          </span>
          <span className="friends-card-player-id">{player.playerId ?? "Player ID unavailable"}</span>
          <span className="friends-card-meta">
            {blockedAtLabel ? `Blocked · ${blockedAtLabel}` : "Blocked player"}
          </span>
        </span>
      </div>
      <div className="friends-card-actions">
        <button
          type="button"
          className="friends-action-button friends-action-button--quiet friends-unblock-button"
          onClick={() => onUnblock(player)}
          disabled={disabled}
          aria-busy={busy}
          aria-label={`Unblock ${player.username}`}
        >
          {busy
            ? <span className="friends-inline-spinner" aria-hidden="true" />
            : <UserCheck aria-hidden="true" />}
          <span>{busy ? "Unblocking…" : "Unblock"}</span>
        </button>
      </div>
    </article>
  );
}

export default BlockedPlayerCard;
