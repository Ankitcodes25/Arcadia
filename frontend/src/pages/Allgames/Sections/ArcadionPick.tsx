import type { Game } from "../../../types/game";
import { navigateTo } from "../../../lib/navigation";
import { isLudoGame, requestLudoLaunch } from "../../../games/ludo/ludoLaunch";
import GameLogo from "./GameLogo";

import arcadionPick from "../../../assets/Arcadionpick.png";
import arcadionPickBg from "../../../assets/ArcadionpickBG.png";

type ArcadionPickProps = {
  games: Game[];
};

function CrownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5L3 8z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SwordsIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 5l16 16" />
        <path d="M26 5L10 21" />
        <path d="M19 24l5-5" />
        <path d="M13 24l-5-5" />
        <path d="M22 21l3 3" />
        <path d="M10 21l-3 3" />
      </g>
    </svg>
  );
}

/* Sirf 1v1 games — single-player games yahan nahi dikhenge.
   Aur koi game hatana ho to uska naam is list me jod do. */
const SINGLE_PLAYER_GAMES = ["Snake"];

function ArcadionPick({ games }: ArcadionPickProps) {
  const picks = games
    .filter((game) => !SINGLE_PLAYER_GAMES.includes(game.name))
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 3);

  return (
    <section
      id="arcadion-picks"
      className="arcadion-picks"
      aria-labelledby="arcadion-picks-title"
    >
      {/* Divider — upar ke cards ke baad, phir gap, phir section */}
      <div className="arcadion-picks-divider" aria-hidden="true">
        <span className="arcadion-picks-divider-line" />
        <span className="arcadion-picks-divider-badge">
          <SwordsIcon />
        </span>
        <span className="arcadion-picks-divider-line arcadion-picks-divider-line-r" />
      </div>

      {/* Stage: ring (peeche) + Arcadion (aage), dono ek hi center pe */}
      <div className="arcadion-picks-stage" aria-hidden="true">
        <div className="arcadion-picks-ring">
          <img src={arcadionPickBg} alt="" draggable={false} />
        </div>
        <div className="arcadion-picks-character-glow" />
        {/* dark silhouette: ring ko Arcadion ke andar se dikhne se rokta hai */}
        <img
          className="arcadion-picks-character-shadow"
          src={arcadionPick}
          alt=""
          draggable={false}
        />
        <img
          className="arcadion-picks-character"
          src={arcadionPick}
          alt=""
          draggable={false}
        />
      </div>

      {/* Handwritten note */}
      <div className="arcadion-picks-note" aria-hidden="true">
        <CrownIcon className="arcadion-picks-note-crown" />
        <span>
          Play
          <br />
          what I
          <br />
          picked
        </span>
        <svg viewBox="0 0 60 60" className="arcadion-picks-note-arrow">
          <path
            d="M44 4c2 20-10 34-32 44m0 0l14-2m-14 2l4-13"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Heading — same style as "Continue Playing" */}
      <div className="arcadion-picks-heading">
        <span className="arcadion-picks-kicker">CHOSEN BY THE GAME MASTER</span>

        <h2 id="arcadion-picks-title">
          ARCADION <span data-text="PICKS">PICKS</span>
        </h2>

        <p>
         Enter the game. Impress the Game Master.
        </p>
      </div>

      {/* Cards */}
      <div className="arcadion-picks-list">
        {picks.map((game, index) => (
          <article
            className={`arcadion-pick-card library-card arcadion-pick-card-${index + 1}`}
            key={game.name}
          >
            <div className="arcadion-pick-top">
              <span className="arcadion-pick-tag">{game.category}</span>
              {index === 0 && <CrownIcon className="arcadion-pick-crown" />}
            </div>

            <div className="arcadion-pick-body">
              <div className="arcadion-pick-icon">
                <GameLogo gameName={game.name} />
              </div>

              <div className="arcadion-pick-info">
                <h3>{game.name}</h3>
                <p>{game.description}</p>
              </div>
            </div>

            <div className="arcadion-pick-bottom">

              <button
                type="button"
                className="arcadion-pick-button"
                onClick={(event) => {
                  if (isLudoGame(game.name)) {
                    requestLudoLaunch(game.name);
                    return;
                  }
                  navigateTo("/games", event);
                }}
              >
                PLAY NOW
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default ArcadionPick;