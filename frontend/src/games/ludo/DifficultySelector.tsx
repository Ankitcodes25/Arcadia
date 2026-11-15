import { Flame, Shield, Swords, type LucideIcon } from "lucide-react";
import type { LudoDifficulty } from "./types";

type DifficultySelectorProps = {
  value: LudoDifficulty;
  onChange: (value: LudoDifficulty) => void;
};

const DIFFICULTIES: Array<{
  value: LudoDifficulty;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { value: "EASY", label: "Easy", description: "A relaxed opponent.", icon: Shield },
  { value: "MEDIUM", label: "Medium", description: "A balanced challenge.", icon: Swords },
  { value: "HARD", label: "Hard", description: "A stronger strategic opponent.", icon: Flame },
];

function DifficultySelector({ value, onChange }: DifficultySelectorProps) {
  return (
    <div className="ludo-choices" role="group" aria-label="Choose difficulty">
      {DIFFICULTIES.map((difficulty) => {
        const Icon = difficulty.icon;
        const selected = value === difficulty.value;

        return (
          <button
            key={difficulty.value}
            type="button"
            className={`ludo-choice${selected ? " is-selected" : ""}`}
            onClick={() => onChange(difficulty.value)}
            aria-pressed={selected}
            title={difficulty.description}
          >
            <Icon aria-hidden="true" />
            <span>{difficulty.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default DifficultySelector;
