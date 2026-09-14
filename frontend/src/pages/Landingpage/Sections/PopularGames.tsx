import type { Game } from "../gameData";
import { navigateTo } from "../../../navigation";
import GameLogo from "../../Allgames/Sections/GameLogo";

type PopularGamesProps = { games: Game[] };

function PopularGames({ games }: PopularGamesProps) {
  const popularGames = [...games].sort((firstGame, secondGame) => secondGame.plays - firstGame.plays).slice(0, 3);

  return (
    <section className="section" id="popular">
      <div className="section-heading"><div><span className="section-label">DISCOVER</span><h2>Popular games</h2></div><a className="view-all" href="/games#all-games" onClick={(event) => navigateTo("/games#all-games", event)}>View more <span>→</span></a></div>
      <div className="featured-games">
        {popularGames.map((game) => <article className="big-game-card" key={game.name}>
          <div className="big-game-icon unified-game-logo"><GameLogo gameName={game.name} /></div>
          <div className="big-game-content"><span>{game.category}</span><h3>{game.name}</h3><p>{game.description}</p><button className="card-play">Play now</button></div>
        </article>)}
      </div>
    </section>
  );
}

export default PopularGames;