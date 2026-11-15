import { Check } from "lucide-react";
import LudoToken from "./LudoToken";
import {
  LUDO_COLOUR_DISPLAY_ORDER,
  LUDO_COLOUR_META,
  type LudoColour,
} from "./types";

type LudoColourSelectorProps = {
  selected: LudoColour;
  onSelect: (colour: LudoColour) => void;
  disabledColours?: readonly LudoColour[];
  label?: string;
};

function LudoColourSelector({
  selected,
  onSelect,
  disabledColours = [],
  label = "Choose your token colour",
}: LudoColourSelectorProps) {
  return (
    <div className="ludo-colour-grid" role="group" aria-label={label}>
      {LUDO_COLOUR_DISPLAY_ORDER.map((colour) => {
        const meta = LUDO_COLOUR_META[colour];
        const disabled = disabledColours.includes(colour);
        const isSelected = selected === colour;

        return (
          <button
            key={colour}
            type="button"
            className={[
              "ludo-colour-option",
              isSelected ? "is-selected" : "",
              disabled ? "is-disabled" : "",
            ].filter(Boolean).join(" ")}
            onClick={() => onSelect(colour)}
            disabled={disabled}
            aria-pressed={isSelected}
            aria-label={`${meta.label}${isSelected ? ", selected" : ""}${disabled ? ", unavailable" : ""}`}
            title={disabled ? `${meta.label} is already taken` : meta.label}
            style={{ "--seat-color": meta.hex } as React.CSSProperties}
          >
            <LudoToken
              colour={colour}
              size="sm"
              selected={isSelected}
              dimmed={disabled}
            />
            <span className="ludo-colour-name">{meta.label}</span>
            {isSelected && (
              <span className="ludo-colour-selected-mark" aria-hidden="true">
                <Check />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default LudoColourSelector;
