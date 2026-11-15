import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { Game } from "../../../types/game";
import { navigateTo } from "../../../lib/navigation";
import { isLudoGame, requestLudoLaunch } from "../../../games/ludo/ludoLaunch";
import GameLogo from "../../Allgames/Sections/GameLogo";

type ChallengeArcadionProps = {
  games: Game[];
};

/* ---------------------------------------------------------
   Rotation: 4 cards at a time, new set every 12 hours
   (switches at 12:00 AM and 12:00 PM, user's local time)
--------------------------------------------------------- */
const ROTATION_MS = 12 * 60 * 60 * 1000;
const CARDS_PER_BATCH = 4;

function getLocalMs() {
  return Date.now() - new Date().getTimezoneOffset() * 60 * 1000;
}

function getSlot() {
  return Math.floor(getLocalMs() / ROTATION_MS);
}

// Re-renders exactly when the 12 hour slot changes, no refresh needed.
function useRotationSlot() {
  const [slot, setSlot] = useState(getSlot);

  useEffect(() => {
    let timer = 0;

    const schedule = () => {
      const localMs = getLocalMs();
      const wait = (Math.floor(localMs / ROTATION_MS) + 1) * ROTATION_MS - localMs;

      timer = window.setTimeout(() => {
        setSlot(getSlot());
        schedule();
      }, wait + 50);
    };

    const sync = () => setSlot(getSlot());

    schedule();
    document.addEventListener("visibilitychange", sync);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return slot;
}

// Games 1-4, then 5-8, then 9-12 ... and back to the start.
// If the last group is short, it is filled from the beginning.
function pickBatch(games: Game[], slot: number): Game[] {
  if (games.length <= CARDS_PER_BATCH) return games;

  const batchCount = Math.ceil(games.length / CARDS_PER_BATCH);
  const start = (slot % batchCount) * CARDS_PER_BATCH;

  return Array.from(
    { length: CARDS_PER_BATCH },
    (_, i) => games[(start + i) % games.length],
  );
}

/* ---------------------------------------------------------
   Only real 1v1 games can face Arcadion.
   Solo games (Snake, Memory) are filtered out.
--------------------------------------------------------- */
function toKey(gameName: string) {
  return gameName.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSoloGame(gameName: string) {
  const key = toKey(gameName);
  return key === "snake" || key.startsWith("memory");
}

/* ---------------------------------------------------------
   Arcadion's taunts (key = game name, lowercase, letters only)
--------------------------------------------------------- */
const ARCADION_TAUNTS: Record<string, string> = {
  ludo: "Roll all you want. The dice answer to me.",
  tictactoe: "Perfect play is the only way you draw.",
  rockpaperscissors: "I already know what you'll pick.",
  snakesandladders: "Climb every ladder. I'll be waiting at the snake.",
  snakeandladder: "Climb every ladder. I'll be waiting at the snake.",
  snakeladder: "Climb every ladder. I'll be waiting at the snake.",
  connect4: "Four in a row? I'll block you in three.",
  chess: "I've already seen your next five moves.",
  checkers: "Every jump you make, I've planned for.",
  "2048": "Your tiles will run out before my patience does.",
  hangman: "One wrong letter and it's over.",
};

// Used for any game that has no line above, so no card is ever empty.
const FALLBACK_TAUNTS = [
  "Think you can win? Try me.",
  "I don't lose. I wait for you to.",
  "Go on. Make your first mistake.",
  "You're already one step behind.",
  "Bring your best. It won't be enough.",
  "I've beaten better. Much better.",
];

function getTaunt(gameName: string) {
  const key = toKey(gameName);

  if (ARCADION_TAUNTS[key]) return ARCADION_TAUNTS[key];

  // same game always gets the same fallback line
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) % 997;

  return FALLBACK_TAUNTS[hash % FALLBACK_TAUNTS.length];
}

function ChallengeArcadion({ games }: ChallengeArcadionProps) {
  const slot = useRotationSlot();
  const versusGames = games.filter((game) => !isSoloGame(game.name));
  const battleGames = pickBatch(versusGames, slot);

  return (
    <section className="challenge-arcadion" id="challenge-arcadion">
      <div className="challenge-arcadion-header">
        <span className="challenge-arcadion-label">
          SELECT YOUR BATTLEFIELD
        </span>

        <h2>
          CHALLENGE <span data-text="ARCADION">ARCADION</span>
        </h2>

        <div className="challenge-arcadion-divider" aria-hidden="true">
          <span>⚔</span>
        </div>

        <figure className="challenge-arcadion-quote">
          <blockquote>
            <span className="challenge-quote-mark open" aria-hidden="true">
              “
            </span>
            Think you can beat <em>me</em>? Pick a game and step into{" "}
            <em>my arena</em>.
            <span className="challenge-quote-mark close" aria-hidden="true">
              ”
            </span>
          </blockquote>

          <figcaption>
            <span className="challenge-quote-eyes" aria-hidden="true" />
            ARCADION
          </figcaption>
        </figure>
      </div>

      <div className="challenge-arcadion-games">
        {battleGames.map((game, index) => (
          <article
            className="challenge-game-card"
            key={`${slot}-${game.name}`}
            style={
              {
                "--card-delay": `${index * 0.08}s`,
              } as CSSProperties
            }
          >
            <span className="challenge-game-glow" aria-hidden="true" />

            <div className="challenge-game-top">
              <span className="challenge-vs">1V1 BATTLE</span>
              <span className="challenge-vs-badge">VS ARCADION</span>
            </div>

            <div className="challenge-game-main">
              <div className="challenge-game-art">
                <GameLogo gameName={game.name} />
              </div>

              <div className="challenge-game-info">
                <h3>{game.name}</h3>
              </div>
            </div>

            <div className="challenge-taunt">
              <span className="challenge-taunt-label">ARCADION SAYS</span>
              <p>“{getTaunt(game.name)}”</p>
            </div>

            {/* TODO: start the 1v1 match vs Arcadion (no route yet) */}
            <button
              type="button"
              className="challenge-battle-button"
              onClick={() => {
                if (isLudoGame(game.name)) requestLudoLaunch(game.name);
              }}
            >
              <span className="battle-cross">⚔</span>
              <span>CHALLENGE</span>
              <span className="battle-arrow">→</span>
            </button>
          </article>
        ))}
      </div>

      <div className="challenge-all-wrap">
        <button
          type="button"
          className="view-all"
          onClick={(event) => {
            navigateTo("/games#arcadion-picks", event);
          }}
        >
          View all challenges <span>→</span>
        </button>
      </div>
    </section>
  );
}

export default ChallengeArcadion;