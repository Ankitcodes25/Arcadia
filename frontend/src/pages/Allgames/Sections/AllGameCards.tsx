import { useEffect, useState } from "react";
import type { Game } from "../../Landingpage/gameData";
import GameLogo from "./GameLogo";

type AllGameCardsProps = {
  games: Game[];
  heading: string;
};

function AllGameCards({ games, heading }: AllGameCardsProps) {
  const [visibleHeading, setVisibleHeading] = useState(heading);
  const [previousHeading, setPreviousHeading] = useState<string | null>(null);
  const [isHeadingChanging, setIsHeadingChanging] = useState(false);
  const [visibleGames, setVisibleGames] = useState(games);
  const [previousGames, setPreviousGames] = useState<Game[] | null>(null);
  const [areCardsChanging, setAreCardsChanging] = useState(false);
  const gamesSignature = games.map((game) => game.name).join("|");

  useEffect(() => {
    if (heading === visibleHeading) return;

    setPreviousHeading(visibleHeading);
    setVisibleHeading(heading);
    setIsHeadingChanging(true);

    const timer = setTimeout(() => {
      setPreviousHeading(null);
      setIsHeadingChanging(false);
    }, 450);

    return () => clearTimeout(timer);
  }, [heading]);

  useEffect(() => {
    const visibleGamesSignature = visibleGames.map((game) => game.name).join("|");
    if (gamesSignature === visibleGamesSignature) return;

    setPreviousGames(visibleGames);
    setVisibleGames(games);
    setAreCardsChanging(true);

    const timer = setTimeout(() => {
      setPreviousGames(null);
      setAreCardsChanging(false);
    }, 450);

    return () => clearTimeout(timer);
  }, [gamesSignature]);

  const renderGames = (gamesToRender: Game[]) => (
    gamesToRender.length > 0 ? (
      <div className="library-grid">
        {gamesToRender.map((game) => (
          <article className="library-card" key={game.name}>
            <div className="library-card-top">
              <span className="game-category">{game.category}</span>
            </div>
            <div className="library-icon unified-game-logo"><GameLogo gameName={game.name} /></div>
            <h3>{game.name}</h3>
            <p>{game.description}</p>
            <button type="button" className="library-play">Play now</button>
          </article>
        ))}
      </div>
    ) : (
      <div className="empty-games-state">
        <span>⌕</span>
        <h3>No games found</h3>
        <p>Try another search or choose a different category.</p>
      </div>
    )
  );

  return (
    <>
      <div className="games-browser-grid-heading" id="all-games">
        <div className="all-games-heading-stage" aria-live="polite">
          {previousHeading && (
            <span className="section-label all-games-label all-games-heading-exit">{previousHeading}</span>
          )}
          <span className={`section-label all-games-label ${isHeadingChanging ? "all-games-heading-enter" : ""}`}>
            {visibleHeading}
          </span>
        </div>
      </div>

      <div className="all-games-cards-stage" aria-live="polite">
        {previousGames && (
          <div className="all-games-cards-layer all-games-cards-exit">
            {renderGames(previousGames)}
          </div>
        )}
        <div className={`all-games-cards-layer ${areCardsChanging ? "all-games-cards-enter" : ""}`}>
          {renderGames(visibleGames)}
        </div>
      </div>
    </>
  );
}

export default AllGameCards;
