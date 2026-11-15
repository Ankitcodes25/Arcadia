import { UsersRound } from "lucide-react";
import ArcadionPowerSelector from "./ArcadionPowerSelector";
import PassPlaySeatCard from "./PassPlaySeatCard";
import PlayerCountTabs from "./PlayerCountTabs";
import {
  canAddPassPlayBot,
  isPassPlaySeatActive,
} from "./ludoSetupState";
import type { LudoSetupController } from "./useLudoSetup";

type PassAndPlaySetupProps = {
  setup: LudoSetupController;
};

function PassAndPlaySetup({ setup }: PassAndPlaySetupProps) {
  const {
    state,
    validation,
    passPlayHasBot,
    changePassPlayPlayerCount,
    changePassPlayName,
    addPassPlaySeatBot,
    removePassPlaySeatBot,
    removePassPlaySeatFriend,
    changePassPlayPower,
  } = setup;
  const { slots, playerCount } = state.passPlay;

  return (
    <div className="ludo-panel ludo-panel--pass-play">
      <section className="ludo-section ludo-pass-player-count" aria-labelledby="ludo-pass-players">
        <div className="ludo-section-title">
          <UsersRound aria-hidden="true" />
          <span className="ludo-label" id="ludo-pass-players">Number of players</span>
        </div>
        <PlayerCountTabs
          value={playerCount}
          onChange={changePassPlayPlayerCount}
          label="Number of Pass and Play players"
        />
      </section>

      <section className="ludo-section" aria-labelledby="ludo-pass-seats">
        <span className="ludo-label" id="ludo-pass-seats">Player seats</span>
        <div className="ludo-seat-row">
          {slots.map((slot, index) => {
            const active = isPassPlaySeatActive(state, slot.colour);
            const invalid = validation.invalidColours.includes(slot.colour);

            return (
              <PassPlaySeatCard
                key={slot.colour}
                slot={slot}
                index={index}
                active={active}
                invalid={invalid}
                canAddBot={canAddPassPlayBot(state, slot.colour)}
                onNameChange={(value) => changePassPlayName(slot.colour, value)}
                onAddBot={() => addPassPlaySeatBot(slot.colour)}
                onRemoveBot={() => removePassPlaySeatBot(slot.colour)}
                onRemoveFriend={() => removePassPlaySeatFriend(slot.colour)}
              />
            );
          })}
        </div>
      </section>

      <section
        className={`ludo-section ludo-pass-power${passPlayHasBot ? "" : " is-reserved"}`}
        aria-labelledby="ludo-pass-power"
        aria-hidden={!passPlayHasBot}
        inert={!passPlayHasBot}
      >
        <div className="ludo-section-title">
          <span className="ludo-label" id="ludo-pass-power">Choose Arcadion Power</span>
        </div>
        <ArcadionPowerSelector
          value={state.passPlay.arcadionPower}
          onChange={changePassPlayPower}
          disabled={!passPlayHasBot}
        />
      </section>
    </div>
  );
}

export default PassAndPlaySetup;
