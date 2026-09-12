import { useEffect, useRef, useState } from "react";
import type { Game } from "../gameData";
import { navigateTo } from "../../../navigation";
import GameLogo from "../../Allgames/Sections/GameLogo";

type HeroSectionProps = {
  games: Game[];
};

const CARD_ANIMATION_TIME = 700;
const AUTO_PLAY_TIME = 5000;

function HeroSection({ games }: HeroSectionProps) {
  const [typedText, setTypedText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState<"left" | "right">("right");
  const [isAnimating, setIsAnimating] = useState(false);
  const animationTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const text = "WELCOME TO ARCADIA";
    let index = 0;
    let deleting = false;
    let pauseTicks = 0;
    const timer = setInterval(() => {
      if (pauseTicks > 0) {
        pauseTicks -= 1;
        return;
      }

      if (!deleting) {
        index += 1;
        setTypedText(text.slice(0, index));
        if (index >= text.length) {
          deleting = true;
          pauseTicks = 10;
        }
      } else {
        index -= 1;
        if (index <= 1) {
          index = 1;
          deleting = false;
        }
        setTypedText(text.slice(0, index));
      }
    }, 200);
    return () => clearInterval(timer);
  }, []);

  const getIndex = (index: number) => (index + games.length) % games.length;
  const previousIndex = getIndex(currentIndex - 1);
  const nextIndex = getIndex(currentIndex + 1);
  const secondNextIndex = getIndex(currentIndex + 2);

  const goToGame = (newIndex: number, newDirection: "left" | "right") => {
    if (isAnimating) return;
    setDirection(newDirection);
    setIsAnimating(true);
    animationTimeout.current = setTimeout(() => {
      setCurrentIndex(newIndex);
      requestAnimationFrame(() => setIsAnimating(false));
    }, CARD_ANIMATION_TIME);
  };

  const nextGame = () => goToGame(nextIndex, "right");
  const previousGame = () => goToGame(previousIndex, "left");

  useEffect(() => {
    if (isAnimating) return;
    const timer = setTimeout(nextGame, AUTO_PLAY_TIME);
    return () => clearTimeout(timer);
  }, [currentIndex, isAnimating]);

  useEffect(() => () => {
    if (animationTimeout.current) clearTimeout(animationTimeout.current);
  }, []);

  const currentGame = games[currentIndex];
  const nextGameData = games[nextIndex];
  const secondNextGameData = games[secondNextIndex];

  return (
    <section className="hero">
      <div className="hero-content">
        <div className="eyebrow"><span className="typewriter">{typedText}</span><span className="cursor">|</span></div>
        <h1>Your little world<br /><span>of games.</span></h1>
        <p>Take a break, pick a game and have some fun. No accounts. No waiting. Just play.</p>
        <div className="hero-buttons">
          <button type="button" className="primary-button" onClick={() => navigateTo("/games")}>Explore Games <span>→</span></button>
          <button className="secondary-button"><span className="gamepad-icon">🎮</span> Quick Play</button>
        </div>
      </div>

      <div className="hero-visual">
        <div className="carousel-stage">
          <div className="carousel-card far-card"><div className="back-card-content"><span>{secondNextGameData.category}</span><div className="back-card-icon unified-game-logo"><GameLogo gameName={secondNextGameData.name} /></div><strong>{secondNextGameData.name}</strong><p>{secondNextGameData.description}</p></div></div>
          <div className="carousel-card next-card"><div className="back-card-content"><span>{nextGameData.category}</span><div className="back-card-icon unified-game-logo"><GameLogo gameName={nextGameData.name} /></div><strong>{nextGameData.name}</strong><p>{nextGameData.description}</p></div></div>
          <div key={`${currentIndex}-${direction}`} className={`carousel-card front-card ${isAnimating ? direction === "right" ? "front-exit-right" : "front-exit-left" : "front-enter"}`}>
            <div className="front-card-icon unified-game-logo"><GameLogo gameName={currentGame.name} /></div>
            <div className="front-card-info"><span>{currentGame.category}</span><h2>{currentGame.name}</h2><p>{currentGame.description}</p></div>
            <button className="play-button">PLAY <span>→</span></button>
          </div>
          <button className="carousel-arrow carousel-arrow-left" onClick={previousGame} disabled={isAnimating} aria-label="Previous game"><span>‹</span></button>
          <button className="carousel-arrow carousel-arrow-right" onClick={nextGame} disabled={isAnimating} aria-label="Next game"><span>›</span></button>
          <div className="carousel-dots">{games.map((game, index) => <button key={game.name} className={index === currentIndex ? "active" : ""} onClick={() => index !== currentIndex && goToGame(index, index > currentIndex ? "right" : "left")} aria-label={`Go to ${game.name}`} />)}</div>
        </div>
      </div>
    </section>
  );
}

export default HeroSection;
