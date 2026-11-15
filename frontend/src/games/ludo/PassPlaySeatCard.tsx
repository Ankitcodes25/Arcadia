import { Bot, Lock, X } from "lucide-react";
import type { CSSProperties } from "react";
import FriendAvatar from "../../friends/FriendAvatar";
import LudoToken from "./LudoToken";
import type { PassPlaySlot } from "./ludoSetupState";
import { LUDO_COLOUR_META } from "./types";

type PassPlaySeatCardProps = {
  slot: PassPlaySlot;
  index: number;
  active: boolean;
  invalid: boolean;
  canAddBot: boolean;
  onNameChange: (value: string) => void;
  onAddBot: () => void;
  onRemoveBot: () => void;
  onRemoveFriend: () => void;
};

function PassPlaySeatCard({
  slot,
  index,
  active,
  invalid,
  canAddBot,
  onNameChange,
  onAddBot,
  onRemoveBot,
  onRemoveFriend,
}: PassPlaySeatCardProps) {
  const meta = LUDO_COLOUR_META[slot.colour];
  const isBot = slot.type === "ARCADION";
  const isFriend = slot.type === "FRIEND" && Boolean(slot.friend);
  const isHuman = slot.type === "HUMAN";
  const canRemoveBot = active && isBot;
  const addBotDisabled = !active || (!canAddBot && !isBot);

  return (
    <article
      className={[
        "ludo-seat",
        `is-${slot.colour.toLowerCase()}`,
        active ? "is-active" : "is-locked",
        invalid ? "has-error" : "",
        isBot ? "is-bot" : "",
        isFriend ? "is-friend" : "",
      ].filter(Boolean).join(" ")}
      style={{ "--seat-color": meta.hex } as CSSProperties}
    >
      <div className="ludo-seat-top">
        <LudoToken colour={slot.colour} size="sm" dimmed={!active} />
        <div className="ludo-seat-copy">
          <span className="ludo-seat-colour">{meta.label}</span>
        </div>
      </div>

      {!active ? (
        <div className="ludo-seat-locked">
          <Lock aria-hidden="true" />
          <span>Locked</span>
        </div>
      ) : (
        <>
          {isFriend && slot.friend ? (
            <div className="ludo-seat-person">
              <FriendAvatar player={slot.friend} className="ludo-seat-avatar" />
              <span className="ludo-seat-person-name" title={slot.friend.username}>
                {slot.friend.username}
              </span>
              <button
                type="button"
                className="ludo-seat-remove"
                onClick={onRemoveFriend}
                aria-label={`Remove ${slot.friend.username} from the ${meta.label} seat`}
                title="Remove friend"
              >
                <X aria-hidden="true" />
              </button>
            </div>
          ) : isBot ? (
            <div className="ludo-seat-person">
              <span className="ludo-seat-bot-icon" aria-hidden="true"><Bot /></span>
              <span className="ludo-seat-person-name">Arcadion</span>
            </div>
          ) : (
            <input
              type="text"
              className="ludo-seat-input"
              value={slot.displayName}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder={`Player ${index + 1}`}
              maxLength={24}
              aria-label={`${meta.label} seat player name`}
              aria-invalid={invalid}
              disabled={!isHuman}
            />
          )}

          <div className="ludo-seat-actions">
            <button
              type="button"
              className={`ludo-seat-action ludo-seat-action--bot${isBot ? " is-active" : ""}`}
              onClick={canRemoveBot ? onRemoveBot : onAddBot}
              disabled={addBotDisabled}
              aria-pressed={isBot}
              title={
                isBot
                  ? `Remove Arcadion from the ${meta.label} seat`
                  : canAddBot
                    ? `Add Arcadion to the ${meta.label} seat`
                    : "Clear the player name or remove the friend first"
              }
            >
              <Bot aria-hidden="true" />
              {isBot ? "Remove" : "Add Arcadion"}
            </button>
          </div>
        </>
      )}
    </article>
  );
}

export default PassPlaySeatCard;
