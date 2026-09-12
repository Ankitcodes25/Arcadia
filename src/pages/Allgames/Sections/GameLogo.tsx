import type { CSSProperties } from "react";
import "../Allgames.css";

type GameLogoProps = {
  gameName: string;
};

const dicePipMap: Record<number, Array<[number, number]>> = {
  1: [[2, 2]],
  2: [[1, 1], [3, 3]],
  3: [[1, 1], [2, 2], [3, 3]],
  4: [[1, 1], [1, 3], [3, 1], [3, 3]],
  5: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]],
  6: [[1, 1], [2, 1], [3, 1], [1, 3], [2, 3], [3, 3]],
};

const LADDER_COIL_BEADS = Array.from({ length: 9 });

function renderDiceFace(face: number, className: string) {
  return (
    <span className={`dice-face ${className}`}>
      {dicePipMap[face].map(([row, col], index) => (
        <span key={`${face}-${index}`} className="dice-pip" style={{ gridRow: row, gridColumn: col }} />
      ))}
    </span>
  );
}

function GameLogo({ gameName }: GameLogoProps) {
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
          <path className="tic-tac-logo-grid" d="M18 6v36M31 6v36M6 18h36M6 31h36" pathLength={1} />
          <path className="tic-tac-logo-x tic-tac-logo-x1" d="M5 5l8 8M13 5l-8 8" pathLength={1} />
          <path className="tic-tac-logo-x tic-tac-logo-x2" d="M20.5 20.5l8 8M28.5 20.5l-8 8" pathLength={1} />
          <path className="tic-tac-logo-x tic-tac-logo-x3" d="M36 36l8 8M44 36l-8 8" pathLength={1} />
          <path className="tic-tac-logo-winline" d="M4 4 44 44" pathLength={1} />
        </svg>
      );
    case "Rock Paper Scissors":
      return (
        <span className="rps-emoji-logo" aria-hidden="true">
          <span className="rps-emoji-fist">✊</span>
          <span className="rps-emoji-paper">🖐</span>
          <span className="rps-emoji-scissors">✌</span>
        </span>
      );
    case "Snake & Ladder":
      return (
        <span className="ladder-3d-wrap" aria-hidden="true">
          <svg className="game-logo ladder-logo" viewBox="0 0 48 48" aria-hidden="true"><g className="ladder-logo-shape"><path d="M15 5v38M33 5v38" /><path d="M15 12h18M15 20h18M15 28h18M15 36h18" /></g></svg>
          <span className="ladder-coil-3d">
            {LADDER_COIL_BEADS.map((_, index) => <span key={index} className="ladder-coil-bead" style={{ "--i": index } as CSSProperties} />)}
            <span className="ladder-coil-head" style={{ "--i": LADDER_COIL_BEADS.length } as CSSProperties}><span className="ladder-coil-eye ladder-coil-eye-left" /><span className="ladder-coil-eye ladder-coil-eye-right" /><span className="ladder-coil-tongue" /></span>
          </span>
        </span>
      );
    default:
      return (
        <svg className="game-logo memory-logo" viewBox="0 0 48 48" aria-hidden="true">
          <g className="memory-card-flip"><g className="memory-card-front"><rect x="11" y="7" width="26" height="34" rx="6" /><path d="M17 16h14M17 23h14M17 30h9" /></g><g className="memory-card-back"><rect x="11" y="7" width="26" height="34" rx="6" /><path className="memory-card-star" d="m24 15 2.6 6.1 6.6.6-5 4.4 1.5 6.5L24 29.3l-5.7 3.3 1.5-6.5-5-4.4 6.6-.6Z" /></g></g>
        </svg>
      );
  }
}

export default GameLogo;