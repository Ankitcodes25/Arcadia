import { useEffect, useState, type CSSProperties } from "react";
import GameLogo from "../../Allgames/Sections/GameLogo";

type ContinueGame = {
  name: string;
  category: string;
  description: string;
  progress: number;
};

type StoredProgress = Record<string, number>;

const STORAGE_KEY = "arcadia:continue-playing";
const PROGRESS_KEY = "arcadia:game-progress";

const defaultGames: ContinueGame[] = [
  {
    name: "Ludo",
    category: "BOARD GAME",
    description: "Pick up where you left off.",
    progress: 72,
  },
  {
    name: "Snake",
    category: "ARCADE",
    description: "Keep growing and beat your score.",
    progress: 41,
  },
  {
    name: "Tic Tac Toe",
    category: "CLASSIC",
    description: "The classic X and O battle.",
    progress: 35,
  },
  {
    name: "Rock Paper Scissors",
    category: "ARCADE",
    description: "Make your move and beat the opponent.",
    progress: 58,
  },
  {
    name: "Snake & Ladder",
    category: "BOARD GAME",
    description: "Climb ladders and avoid the snakes.",
    progress: 64,
  },
  {
    name: "Memory",
    category: "PUZZLE",
    description: "Match the cards and test your memory.",
    progress: 47,
  },
];

function loadContinueGames(): ContinueGame[] {
  if (typeof window === "undefined") {
    return defaultGames.slice(0, 2);
  }

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      return defaultGames.slice(0, 2);
    }

    const parsed: unknown = JSON.parse(saved);

    if (!Array.isArray(parsed)) {
      return defaultGames.slice(0, 2);
    }

    const validGames = parsed.filter(
      (game): game is ContinueGame =>
        typeof game === "object" &&
        game !== null &&
        "name" in game &&
        typeof game.name === "string"
    );

    return validGames.slice(0, 2);
  } catch {
    return defaultGames.slice(0, 2);
  }
}

function loadProgress(): StoredProgress {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const saved = window.localStorage.getItem(PROGRESS_KEY);

    if (!saved) {
      return {};
    }

    const parsed: unknown = JSON.parse(saved);

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return {};
    }

    return parsed as StoredProgress;
  } catch {
    return {};
  }
}

function saveContinueGames(games: ContinueGame[]) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(games.slice(0, 2))
    );
  } catch {
    // Ignore storage errors.
  }
}

function ContinuePlaying() {
  const [games, setGames] = useState<ContinueGame[]>(() =>
    loadContinueGames()
  );

  const [progress, setProgress] = useState<StoredProgress>(() =>
    loadProgress()
  );

  useEffect(() => {
    const handleGameOpened = (event: Event) => {
      const customEvent = event as CustomEvent<{
        gameName?: string;
      }>;

      const gameName = customEvent.detail?.gameName;

      if (!gameName) {
        return;
      }

      const playedGame =
        defaultGames.find(
          (game) => game.name === gameName
        );

      if (!playedGame) {
        return;
      }

      setGames((currentGames) => {
        const existingGame = currentGames.find(
          (game) => game.name === gameName
        );

        const gameToAdd = existingGame ?? playedGame;

        const updatedGames = [
          gameToAdd,
          ...currentGames.filter(
            (game) => game.name !== gameName
          ),
        ].slice(0, 2);

        saveContinueGames(updatedGames);

        return updatedGames;
      });

      setProgress(loadProgress());
    };

    window.addEventListener(
      "arcadia:game-opened",
      handleGameOpened
    );

    return () => {
      window.removeEventListener(
        "arcadia:game-opened",
        handleGameOpened
      );
    };
  }, []);

  const getGameProgress = (game: ContinueGame) => {
    const storedProgress = progress[game.name];

    if (typeof storedProgress === "number") {
      return Math.min(
        100,
        Math.max(0, storedProgress)
      );
    }

    return Math.min(
      100,
      Math.max(0, game.progress)
    );
  };

  const handleContinue = (game: ContinueGame) => {
    window.dispatchEvent(
      new CustomEvent("arcadia:game-opened", {
        detail: {
          gameName: game.name,
        },
      })
    );
  };

  return (
    <section
      className="continue-playing"
      id="continue-playing"
    >
      <div className="continue-playing-heading">
        <div>
          <span className="continue-playing-label">
            JUMP BACK IN
          </span>

          <h2>Continue playing</h2>
        </div>
      </div>

      <div className="continue-playing-grid">
        {games.map((game, index) => {
          const gameProgress =
            getGameProgress(game);

          return (
            <article
              className="continue-game-card"
              key={game.name}
              style={
                {
                  "--continue-delay": `${index * 90}ms`,
                } as CSSProperties
              }
            >
              <div className="continue-game-glow" />

              <div className="continue-game-top">
                <span className="continue-game-category">
                  {game.category}
                </span>

                <span className="continue-game-status">
                  Recently played
                </span>
              </div>

              <div className="continue-game-main">
                <div className="continue-game-art unified-game-logo">
                  <GameLogo gameName={game.name} />
                </div>

                <div className="continue-game-info">
                  <h3>{game.name}</h3>

                  <p>{game.description}</p>
                </div>
              </div>

              <div className="continue-game-progress">
                <div className="continue-progress-track">
                  <span
                    className="continue-progress-fill"
                    style={{
                      width: `${gameProgress}%`,
                    }}
                  />
                </div>
              </div>

              <div className="continue-game-footer">
                <button
                  type="button"
                  className="continue-game-button"
                  onClick={() =>
                    handleContinue(game)
                  }
                >
                  Continue
                  <span>→</span>
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default ContinuePlaying;