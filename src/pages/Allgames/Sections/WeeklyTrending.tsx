import { useEffect, useState } from "react";
import type { Game } from "../../Landingpage/gameData";

type WeeklyTrendingProps = {
  games: Game[];
};

function WeeklyTrending({ games }: WeeklyTrendingProps) {
  const [topGameIndex, setTopGameIndex] = useState(0);
  const weeklyTopGames = [...games]
    .sort((firstGame, secondGame) => secondGame.plays - firstGame.plays)
    .slice(0, 5);

  useEffect(() => {
    if (weeklyTopGames.length < 2) return;

    const timer = setInterval(() => {
      setTopGameIndex((index) => (index + 1) % weeklyTopGames.length);
    }, 3000);

    return () => clearInterval(timer);
  }, [weeklyTopGames.length]);

  const getCarouselPosition = (index: number) => {
    const offset = (index - topGameIndex + weeklyTopGames.length) % weeklyTopGames.length;
    if (offset === 0) return "is-active";
    if (offset === 1) return "is-next";
    if (offset === weeklyTopGames.length - 1) return "is-previous";
    return "is-hidden";
  };

  const activeTopGame = weeklyTopGames[topGameIndex];

  return (
    <aside className="weekly-top" aria-label="Weekly top playing games">
      <span className="section-label weekly-label">WEEKLY TRENDING</span>
      <div className="weekly-carousel" aria-live="polite">
        {weeklyTopGames.map((game, index) => (
          <button
            type="button"
            key={game.name}
            className={`weekly-game-card ${getCarouselPosition(index)}`}
            onClick={() => setTopGameIndex(index)}
            aria-label={`Show ${game.name}`}
          >
            <span className="weekly-game-icon">{game.icon}</span>
            <span className="weekly-game-category">{game.category}</span>
          </button>
        ))}
      </div>
      {activeTopGame && (
        <div className="weekly-game-details" key={activeTopGame.name}>
          <h4>{activeTopGame.name}</h4>
          <span className="weekly-plays-label">
            {activeTopGame.plays.toLocaleString()} PLAYS THIS WEEK
          </span>
          <button type="button" className="weekly-play">Play now</button>
        </div>
      )}
    </aside>
  );
}

export default WeeklyTrending;
