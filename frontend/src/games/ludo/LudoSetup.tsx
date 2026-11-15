import { ChartNoAxesColumn, Palette, UserRound, UsersRound } from "lucide-react";
import ArcadionOverview from "./LudoOverview";
import DifficultySelector from "./DifficultySelector";
import LudoColourSelector from "./LudoColourSelector";
import PlayerCountTabs from "./PlayerCountTabs";
import type { LudoSetupController } from "./useLudoSetup";

type ArcadionSetupProps = {
  setup: LudoSetupController;
};

function ArcadionSetup({ setup }: ArcadionSetupProps) {
  const {
    state,
    arcadionSeats,
    changeArcadionPlayerCount,
    changeArcadionColour,
    changeArcadionDifficulty,
  } = setup;

  return (
    <div className="ludo-panel ludo-panel--arcadion">
      <div className="ludo-split">
        <section className="ludo-section" aria-labelledby="ludo-arcadion-players">
          <div className="ludo-section-title">
            <UsersRound aria-hidden="true" />
            <span className="ludo-label" id="ludo-arcadion-players">Number of players</span>
          </div>
          <PlayerCountTabs
            value={state.arcadion.playerCount}
            onChange={changeArcadionPlayerCount}
            label="Number of Arcadion players"
          />
        </section>

        <section className="ludo-section" aria-labelledby="ludo-arcadion-colour">
          <div className="ludo-section-title">
            <Palette aria-hidden="true" />
            <span className="ludo-label" id="ludo-arcadion-colour">Choose your token colour</span>
          </div>
          <LudoColourSelector
            selected={state.arcadion.selectedColour}
            onSelect={changeArcadionColour}
            label="Choose your token colour"
          />
        </section>
      </div>

      <section className="ludo-section" aria-labelledby="ludo-arcadion-difficulty">
        <div className="ludo-section-title">
          <ChartNoAxesColumn aria-hidden="true" />
          <span className="ludo-label" id="ludo-arcadion-difficulty">Choose difficulty</span>
        </div>
        <DifficultySelector
          value={state.arcadion.difficulty}
          onChange={changeArcadionDifficulty}
        />
      </section>

      <section className="ludo-section" aria-labelledby="ludo-arcadion-overview">
        <div className="ludo-section-title">
          <UserRound aria-hidden="true" />
          <span className="ludo-label" id="ludo-arcadion-overview">Player overview</span>
        </div>
        <ArcadionOverview seats={arcadionSeats} />
      </section>
    </div>
  );
}

export default ArcadionSetup;
