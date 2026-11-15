import { Bot } from "lucide-react";
import type { ArcadionPower } from "./types";

type ArcadionPowerSelectorProps = {
  value: ArcadionPower;
  onChange: (value: ArcadionPower) => void;
  disabled?: boolean;
  compact?: boolean;
};

const POWERS: Array<{ value: ArcadionPower; label: string; hint: string }> = [
  { value: "LOW", label: "Low", hint: "Gentle decisions" },
  { value: "MEDIUM", label: "Medium", hint: "Balanced play" },
  { value: "HIGH", label: "High", hint: "Sharper tactics" },
];

function ArcadionPowerSelector({
  value,
  onChange,
  disabled = false,
  compact = false,
}: ArcadionPowerSelectorProps) {
  return (
    <div className={`ludo-power-block${compact ? " is-compact" : ""}`}>
      <div className="ludo-choices" role="group" aria-label={compact ? "Choose difficulty" : "Choose Arcadion power"}>
        {POWERS.map((power) => {
          const strength = power.value === "LOW" ? 1 : power.value === "MEDIUM" ? 2 : 3;

          return (
            <button
              key={power.value}
              type="button"
              className={`ludo-choice${value === power.value ? " is-selected" : ""}`}
              onClick={() => onChange(power.value)}
              aria-pressed={value === power.value}
              disabled={disabled}
              title={power.hint}
            >
              {!compact && (
                <span className="ludo-power-rate" aria-hidden="true">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <i key={index} className={index < strength ? "is-on" : ""} />
                  ))}
                </span>
              )}
              <span>{power.label}</span>
            </button>
          );
        })}
      </div>
      {!compact && <p className="ludo-note">
        <Bot aria-hidden="true" />
        Applies to every Arcadion bot in this match.
      </p>}
    </div>
  );
}

export default ArcadionPowerSelector;
