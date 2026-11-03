import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Game } from "../../../types/game";
import GameLogo from "./GameLogo";
import arcadionFull from "../../../assets/ArcadionFull.png";
import heroBg from "../../../assets/HeroBg.webp";

type WeeklyTrendingProps = {
  games: Game[];
};

const dicePipMap: Record<number, Array<[number, number]>> = {
  1: [[2, 2]],
  2: [[1, 1], [3, 3]],
  3: [[1, 1], [2, 2], [3, 3]],
  4: [[1, 1], [1, 3], [3, 1], [3, 3]],
  5: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]],
  6: [[1, 1], [2, 1], [3, 1], [1, 3], [2, 3], [3, 3]],
};

function renderDiceFace(face: number, className: string) {
  return (
    <span className={`dice-face ${className}`}>
      {dicePipMap[face].map(([row, col], index) => (
        <span
          key={`${face}-${index}`}
          className="dice-pip"
          style={{ gridRow: row, gridColumn: col }}
        />
      ))}
    </span>
  );
}

const LADDER_COIL_BEADS = Array.from({ length: 9 });

function WeeklyTrending({ games }: WeeklyTrendingProps) {
  const [topGameIndex, setTopGameIndex] = useState(0);

  // Dev-only calibrator: open the page with ?arcadion-debug and click Arcadion's hand.
  const [calibrating] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("arcadion-debug"),
  );
  const [calibration, setCalibration] = useState("");
  const stageRef = useRef<HTMLElement>(null);
  const figureRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!calibrating) return;
    const stage = stageRef.current;
    const figure = figureRef.current;
    const layout = stage?.closest<HTMLElement>(".games-browser-layout");
    if (!stage || !figure || !layout) return;

    const handleClick = (event: MouseEvent) => {
      const box = figure.getBoundingClientRect();
      const x = (((event.clientX - box.left) / box.width) * 100).toFixed(1);
      const y = (((event.clientY - box.top) / box.height) * 100).toFixed(1);
      layout.style.setProperty("--hand-x", `${x}%`);
      layout.style.setProperty("--hand-y", `${y}%`);
      setCalibration(`--hand-x: ${x}%;\n--hand-y: ${y}%;`);
    };

    stage.addEventListener("click", handleClick);
    return () => stage.removeEventListener("click", handleClick);
  }, [calibrating]);

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

  const getIconClassName = (gameName: string) =>
    `weekly-icon-${gameName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  const renderGameMark = (gameName: string) => {
    switch (gameName) {
      case "Ludo":
        return (
          <span className="dice-cube-scene" aria-hidden="true">
            <span className="dice-cube">
              {renderDiceFace(1, "dice-face-front")}
              {renderDiceFace(6, "dice-face-back")}
              {renderDiceFace(2, "dice-face-right")}
              {renderDiceFace(5, "dice-face-left")}
              {renderDiceFace(3, "dice-face-top")}
              {renderDiceFace(4, "dice-face-bottom")}
            </span>
          </span>
        );
      case "Snake":
        return (
          <span className="game-mark snake-mark" aria-hidden="true">
            <span className="snake-segment snake-segment-one" />
            <span className="snake-segment snake-segment-two" />
            <span className="snake-segment snake-segment-three" />
            <span className="snake-segment snake-segment-four" />
            <span className="snake-segment snake-segment-five" />
            <span className="snake-head"><span className="snake-eye" /></span>
          </span>
        );
      case "Tic Tac Toe":
        return (
          <svg className="game-logo tic-tac-logo" viewBox="0 0 48 48" aria-hidden="true">
            <path
              className="tic-tac-logo-grid"
              d="M18 6v36M31 6v36M6 18h36M6 31h36"
              pathLength={1}
            />
            <path className="tic-tac-logo-x tic-tac-logo-x1" d="M5 5l8 8M13 5l-8 8" pathLength={1} />
            <path className="tic-tac-logo-x tic-tac-logo-x2" d="M20.5 20.5l8 8M28.5 20.5l-8 8" pathLength={1} />
            <path className="tic-tac-logo-x tic-tac-logo-x3" d="M36 36l8 8M44 36l-8 8" pathLength={1} />
            <path className="tic-tac-logo-winline" d="M4 4 44 44" pathLength={1} />
          </svg>
        );
      case "Rock Paper Scissors":
        return <GameLogo gameName={gameName} />;
      case "Snake & Ladder":
        return (
          <span className="ladder-3d-wrap" aria-hidden="true">
            <svg className="game-logo ladder-logo" viewBox="0 0 48 48" aria-hidden="true">
              <g className="ladder-logo-shape">
                <path d="M15 5v38M33 5v38" />
                <path d="M15 12h18M15 20h18M15 28h18M15 36h18" />
              </g>
            </svg>
            <span className="ladder-coil-3d">
              {LADDER_COIL_BEADS.map((_, index) => (
                <span
                  key={index}
                  className="ladder-coil-bead"
                  style={{ "--i": index } as CSSProperties}
                />
              ))}
              <span
                className="ladder-coil-head"
                style={{ "--i": LADDER_COIL_BEADS.length } as CSSProperties}
              >
                <span className="ladder-coil-eye ladder-coil-eye-left" />
                <span className="ladder-coil-eye ladder-coil-eye-right" />
                <span className="ladder-coil-tongue" />
              </span>
            </span>
          </span>
        );
      default:
        return (
          <svg className="game-logo memory-logo" viewBox="0 0 48 48" aria-hidden="true">
            <g className="memory-card-flip">
              <g className="memory-card-front">
                <rect x="11" y="7" width="26" height="34" rx="6" />
                <path d="M17 16h14M17 23h14M17 30h9" />
              </g>
              <g className="memory-card-back">
                <rect x="11" y="7" width="26" height="34" rx="6" />
                <path
                  className="memory-card-star"
                  d="m24 15 2.6 6.1 6.6.6-5 4.4 1.5 6.5L24 29.3l-5.7 3.3 1.5-6.5-5-4.4 6.6-.6Z"
                />
              </g>
            </g>
          </svg>
        );
    }
  };

  return (
    <>
      {/* Full-bleed blended background (absolute inside .games-browser-layout) */}
      <div className="arcadion-backdrop" aria-hidden="true">
        <img className="arcadion-backdrop-img" src={heroBg} alt="" draggable={false} />
      </div>

      <aside className="weekly-top" aria-label="Weekly top playing games">
        {/* Arcadion is anchored so his palm sits under the floating cards */}
        <img
          className="arcadion-figure"
          src={arcadionFull}
          alt=""
          aria-hidden="true"
          draggable={false}
        />

        <span className="section-label weekly-label">WEEKLY TRENDING</span>

        <div className="weekly-float">
          <div className="weekly-carousel" aria-live="polite">
            {weeklyTopGames.map((game, index) => {
              const position = getCarouselPosition(index);
              const isActive = position === "is-active";

              return (
                <div key={game.name} className={`weekly-game-card ${position}`}>
                  {/* Stretched button: clicking anywhere on a card brings it to the front */}
                  <button
                    type="button"
                    className="weekly-card-select"
                    onClick={() => setTopGameIndex(index)}
                    aria-label={`Show ${game.name}`}
                    tabIndex={position === "is-hidden" ? -1 : 0}
                  />

                  <span className="weekly-game-category">{game.category}</span>

                  <span className={`weekly-game-icon ${getIconClassName(game.name)}`}>
                    {renderGameMark(game.name)}
                  </span>

                  <div className="weekly-game-details">
                    <h4>{game.name}</h4>
                    <span className="weekly-plays-label">
                      {game.plays.toLocaleString()} PLAYS THIS WEEK
                    </span>
                    <button
                      type="button"
                      className="weekly-play"
                      tabIndex={isActive ? 0 : -1}
                    >
                      <svg className="weekly-play-icon" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M7 4.5v15l12-7.5-12-7.5Z" />
                      </svg>
                      Play now
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Soft energy backlight behind Arcadion's hand */}
        <span className="weekly-aura" aria-hidden="true" />
      </aside>
    </>
  );
}

export default WeeklyTrending;