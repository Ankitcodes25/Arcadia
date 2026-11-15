import { Bot, CirclePlus, UserRound } from "lucide-react";
import type { CSSProperties } from "react";
import LudoToken from "./LudoToken";
import { LUDO_COLOUR_META, type LudoSeat } from "./types";

type ArcadionOverviewProps = {
  seats: LudoSeat[];
};

function ArcadionOverview({ seats }: ArcadionOverviewProps) {
  return (
    <div className="ludo-overview" aria-label="Player overview">
      {seats.map((seat) => {
        const meta = LUDO_COLOUR_META[seat.colour];
        const isBot = seat.type === "ARCADION";
        const isEmpty = seat.type === "EMPTY";
        const isSelected = seat.type === "HUMAN";

        return (
          <article
            key={seat.colour}
            className={[
              "ludo-overview-card",
              `is-${seat.colour.toLowerCase()}`,
              isEmpty ? "is-empty" : "",
              isBot ? "is-bot" : "",
              isSelected ? "is-selected" : "",
            ].filter(Boolean).join(" ")}
            style={{ "--seat-color": meta.hex } as CSSProperties}
          >
            {isEmpty ? (
              <CirclePlus className="ludo-open-seat-icon" aria-hidden="true" />
            ) : (
              <LudoToken colour={seat.colour} size="sm" />
            )}
            <span className="ludo-overview-name">
              {isEmpty ? "Open Seat" : seat.displayName || (isBot ? "Arcadion" : "You")}
            </span>
            <span className="ludo-overview-role">
              {isBot
                ? <><Bot aria-hidden="true" /> Bot</>
                : isEmpty
                  ? "Available"
                  : <><UserRound aria-hidden="true" /> You</>}
            </span>
          </article>
        );
      })}
    </div>
  );
}

export default ArcadionOverview;
