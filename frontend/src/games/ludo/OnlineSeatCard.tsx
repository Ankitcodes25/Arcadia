import { Bot, Clock3, Crown, LogOut, UserPlus, UserRound, X } from "lucide-react";
import type { CSSProperties } from "react";
import FriendAvatar from "../../friends/FriendAvatar";
import LudoToken from "./LudoToken";
import {
  LUDO_COLOUR_META,
  type LudoChatBubble,
  type LudoColour,
  type LudoPendingInvite,
  type LudoSeat,
} from "./types";

type OnlineSeatCardProps = {
  seat: LudoSeat;
  isSelf: boolean;
  hostControls: boolean;
  inactive?: boolean;
  pendingInvite?: LudoPendingInvite | null;
  bubbles?: LudoChatBubble[];
  onInvite: (colour: LudoColour) => void;
  onToggleBot: (colour: LudoColour) => void;
  onRemovePlayer: (playerId: string) => void;
  onLeave: () => void;
};

function OnlineSeatCard({
  seat,
  isSelf,
  hostControls,
  inactive = false,
  pendingInvite = null,
  bubbles = [],
  onInvite,
  onToggleBot,
  onRemovePlayer,
  onLeave,
}: OnlineSeatCardProps) {
  const meta = LUDO_COLOUR_META[seat.colour];
  const isBot = seat.type === "ARCADION";
  const isEmpty = seat.type === "EMPTY";
  const isReserved = isEmpty && Boolean(pendingInvite);
  const seatBubbles = bubbles.filter((bubble) => bubble.colour === seat.colour);

  return (
    <article
      className={[
        "ludo-seat",
        `is-${seat.colour.toLowerCase()}`,
        isEmpty ? "is-empty" : "",
        isBot ? "is-bot" : "",
        isSelf ? "is-self" : "",
        seat.isHost ? "is-host" : "",
        inactive ? "is-inactive" : "",
      ].filter(Boolean).join(" ")}
      style={{ "--seat-color": meta.hex } as CSSProperties}
    >
      {seatBubbles.length > 0 && (
        <div className="ludo-seat-bubble-stack" aria-live="polite">
          {seatBubbles.map((bubble) => (
            <span
              key={bubble.id}
              className="ludo-seat-bubble"
              style={{ "--ludo-bubble-tint": LUDO_COLOUR_META[bubble.colour].hex } as CSSProperties}
              title={bubble.text}
            >
              <span className="ludo-seat-bubble-text">{bubble.text}</span>
            </span>
          ))}
        </div>
      )}

      <div className="ludo-seat-top">
        <LudoToken colour={seat.colour} size="sm" dimmed={isEmpty} />
        <div className="ludo-seat-copy">
          <span className="ludo-seat-colour">{meta.label}</span>
          {seat.isHost && (
            <span className="ludo-host-badge">
              <Crown aria-hidden="true" />
              Host
            </span>
          )}
        </div>
      </div>

      {isBot ? (
        <div className="ludo-seat-person-row">
          <div className="ludo-seat-person ludo-seat-person--bot">
            <span className="ludo-seat-bot-icon" aria-hidden="true"><Bot /></span>
            <span className="ludo-seat-person-name">Arcadion</span>
          </div>
          {hostControls && (
            <button
              type="button"
              className="ludo-seat-remove"
              onClick={() => onToggleBot(seat.colour)}
              aria-label={`Remove Arcadion from the ${meta.label} seat`}
              title="Remove Arcadion"
            >
              <X aria-hidden="true" />
            </button>
          )}
        </div>
      ) : isEmpty ? (
        isReserved && pendingInvite ? (
          <div className="ludo-seat-reserved">
            <Clock3 aria-hidden="true" />
            <span title={pendingInvite.displayName}>{pendingInvite.displayName}</span>
            <em>Invited</em>
          </div>
        ) : hostControls ? (
          <div className="ludo-seat-actions">
            <button
              type="button"
              className="ludo-seat-action"
              onClick={() => onInvite(seat.colour)}
              disabled={inactive}
              title={`Invite a friend to the ${meta.label} seat`}
            >
              <UserPlus aria-hidden="true" />
              Invite Player
            </button>
            <button
              type="button"
              className="ludo-seat-action ludo-seat-action--bot-icon"
              onClick={() => onToggleBot(seat.colour)}
              title={`Add Arcadion to the ${meta.label} seat`}
              aria-label={`Add Arcadion to the ${meta.label} seat`}
            >
              <Bot aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className="ludo-seat-locked ludo-seat-locked--open">
            <UserRound aria-hidden="true" />
            <span>Open seat</span>
          </div>
        )
      ) : (
        <>
          <div className="ludo-seat-person-row">
            <div className="ludo-seat-person">
              {seat.avatar ? (
                <FriendAvatar
                  player={{
                    avatar: seat.avatar,
                    avatarUrl: seat.avatarUrl ?? null,
                    username: seat.displayName || "Player",
                  }}
                  className="ludo-seat-avatar"
                />
              ) : (
                <span className="ludo-seat-bot-icon" aria-hidden="true"><UserRound /></span>
              )}
              <span className="ludo-seat-person-name" title={seat.displayName || "Player"}>
                {seat.displayName || "Player"}
              </span>
              <span className="ludo-seat-state">{isSelf ? "You" : "Ready"}</span>
            </div>
            {hostControls && !seat.isHost && seat.playerId && (
              <button
                type="button"
                className="ludo-seat-remove"
                onClick={() => onRemovePlayer(seat.playerId!)}
                aria-label={`Remove ${seat.displayName || "player"} from the lobby`}
                title={`Remove ${seat.displayName || "player"} from the lobby`}
              >
                <X aria-hidden="true" />
              </button>
            )}
          </div>
          {isSelf && !seat.isHost && (
            <button type="button" className="ludo-seat-player-action" onClick={onLeave}>
              <LogOut aria-hidden="true" />
              Leave
            </button>
          )}
        </>
      )}
    </article>
  );
}

export default OnlineSeatCard;
