import type { LudoPlayerCount } from "./types";

type PlayerCountTabsProps = {
  value: LudoPlayerCount;
  onChange: (count: LudoPlayerCount) => void;
  disabled?: boolean;
  disabledCounts?: readonly LudoPlayerCount[];
  label?: string;
};

const COUNTS: LudoPlayerCount[] = [2, 3, 4];

function PlayerCountTabs({
  value,
  onChange,
  disabled = false,
  disabledCounts = [],
  label = "Number of players",
}: PlayerCountTabsProps) {
  return (
    <div className="ludo-count-tabs" role="group" aria-label={label}>
      {COUNTS.map((count) => {
        const selected = value === count;
        const unavailable = disabled || disabledCounts.includes(count);

        return (
          <button
            key={count}
            type="button"
            className={`ludo-count-tab${selected ? " is-selected" : ""}`}
            onClick={() => onChange(count)}
            aria-pressed={selected}
            disabled={unavailable}
            title={
              disabledCounts.includes(count)
                ? "Remove seated or invited players before choosing this size."
                : `${count} players`
            }
          >
            {count}
          </button>
        );
      })}
    </div>
  );
}

export default PlayerCountTabs;
