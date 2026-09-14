import { useEffect, useMemo, useState } from "react";
import type { Game } from "../gameData";
import GameLogo from "../../Allgames/Sections/GameLogo";

type DailyChallengeProps = { games: Game[] };

function getDailyGame(games: Game[]): Game | null {
	if (games.length === 0) return null;
	const dayIndex = Math.floor(Date.now() / 86400000);
	return games[dayIndex % games.length];
}

function getTimeLeftToday() {
	const now = new Date();
	const midnight = new Date(now);
	midnight.setHours(24, 0, 0, 0);
	const diff = Math.max(0, midnight.getTime() - now.getTime());

	return {
		hours: Math.floor(diff / 3_600_000),
		minutes: Math.floor((diff % 3_600_000) / 60_000),
		seconds: Math.floor((diff % 60_000) / 1_000),
	};
}

function pad(value: number) {
	return value.toString().padStart(2, "0");
}

function DailyChallenge({ games }: DailyChallengeProps) {
	const dailyGame = useMemo(() => getDailyGame(games), [games]);
	const [timeLeft, setTimeLeft] = useState(getTimeLeftToday);

	useEffect(() => {
		const timer = setInterval(() => setTimeLeft(getTimeLeftToday()), 1000);
		return () => clearInterval(timer);
	}, []);

	const handlePlay = () => {
		if (!dailyGame) return;
		window.dispatchEvent(
			new CustomEvent("arcadia:game-opened", { detail: { gameName: dailyGame.name } })
		);
	};

	if (!dailyGame) return null;

	return (
		<section className="daily-challenge" id="daily-challenge">
			<div className="daily-challenge-heading">
				<span className="daily-challenge-kicker">TODAY'S PICK</span>
				<h2>Daily Challenges</h2>
			</div>

			<div className="daily-challenge-card">
				<div className="daily-challenge-glow" />

				<div className="daily-challenge-top">
					<span className="daily-challenge-badge">DAILY CHALLENGE</span>
					<span className="daily-challenge-timer">
						<span className="daily-challenge-timer-icon" aria-hidden="true">⏳</span>
						Resets in
						<span className="daily-challenge-timer-value">
							{pad(timeLeft.hours)}:{pad(timeLeft.minutes)}:{pad(timeLeft.seconds)}
						</span>
					</span>
				</div>

				<div className="daily-challenge-main">
					<div className="daily-challenge-art unified-game-logo">
						<GameLogo gameName={dailyGame.name} />
					</div>

					<div className="daily-challenge-info">
						<span className="daily-challenge-category">{dailyGame.category}</span>
						<h3>{dailyGame.name}</h3>
						<p>{dailyGame.description}</p>
					</div>

					<button type="button" className="daily-challenge-button" onClick={handlePlay}>
						Play Challenge
						<span>→</span>
					</button>
				</div>
			</div>
		</section>
	);
}

export default DailyChallenge;