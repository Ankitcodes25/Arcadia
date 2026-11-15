import { Bot, Gamepad2, Globe2, Users, type LucideIcon } from "lucide-react";
import { LUDO_MODE_META, type LudoMode } from "./types";

type GameModeSelectorProps = {
  mode: LudoMode;
  onChange: (mode: LudoMode) => void;
};

const MODE_ICONS: Record<LudoMode, LucideIcon> = {
  ARCADION: Bot,
  PASS_PLAY: Users,
  ONLINE_FRIENDS: Globe2,
};

const MODES: LudoMode[] = ["ARCADION", "PASS_PLAY", "ONLINE_FRIENDS"];
const MODE_TAGLINES: Record<LudoMode, string> = {
  ARCADION: "Classic & fast",
  PASS_PLAY: "Share the device",
  ONLINE_FRIENDS: "Play with friends",
};

function GameModeSelector({ mode, onChange }: GameModeSelectorProps) {
  return (
    <section className="ludo-mode" aria-labelledby="ludo-mode-label">
      <div className="ludo-section-title">
        <Gamepad2 aria-hidden="true" />
        <span className="ludo-label" id="ludo-mode-label">Game mode</span>
      </div>
      <div className="ludo-mode-tabs" role="group" aria-label="Ludo game mode">
        {MODES.map((option) => {
          const Icon = MODE_ICONS[option];
          const selected = option === mode;
          const meta = LUDO_MODE_META[option];

          return (
            <button
              key={option}
              type="button"
              className={`ludo-mode-tab${selected ? " is-selected" : ""}`}
              onClick={() => onChange(option)}
              aria-pressed={selected}
              title={meta.description}
            >
              <Icon aria-hidden="true" />
              <span className="ludo-mode-copy">
                <span>{meta.label}</span>
                <small>{MODE_TAGLINES[option]}</small>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default GameModeSelector;
