import type { CSSProperties } from "react";
import ArcadionBanner from "../Assets/ArcadionBanner.png";
import ArcadionLogo from "../Assets/Arcadianlogo.png";

type SmokeParticleStyle = CSSProperties & { "--drift"?: string };

const smokeParticles: SmokeParticleStyle[] = Array.from({ length: 14 }, (_, index) => {
	const offset = index - 7;
	const mod4 = index % 4;
	const mod5 = index % 5;

	return {
		left: `calc(50% + ${offset * 28}px)`,
		bottom: `${15 + mod4 * 12}px`,
		width: `${38 + mod4 * 15}px`,
		height: `${35 + mod5 * 13}px`,
		animationDuration: `${3.8 + mod4 * 0.55}s`,
		animationDelay: `${index * -0.42}s`,
		"--drift": `${offset * 9}px`,
	};
});

const energyParticles: SmokeParticleStyle[] = Array.from({ length: 12 }, (_, index) => {
	const offset = index - 6;
	const mod5 = index % 5;
	const mod3 = index % 3;
	const mod4 = index % 4;
	const size = 2 + mod3;

	return {
		left: `calc(50% + ${offset * 62}px)`,
		top: `calc(50% + ${(mod5 - 2) * 21}px)`,
		width: `${size}px`,
		height: `${size}px`,
		animationDuration: `${3 + mod4 * 0.5}s`,
		animationDelay: `${index * -0.45}s`,
		"--drift": `${offset * 4}px`,
	};
});

function Arcadion() {
	return (
		<section className="arcadion-banner" aria-label="Arcadion">

			{/* Inset dark card -- the thin gap between this and the
			    section's own background is what reads as the glowing
			    chamfered border */}
			<div className="arcadion-banner-fill">

				{/* Background atmosphere */}
				<div className="arcadion-atmosphere" />

				<div className="arcadion-noise" />

				{/* Moving smoke behind Arcadion */}
				<div className="arcadion-smoke" aria-hidden="true">
					{smokeParticles.map((style, index) => (
						<span key={`smoke-${index}`} className="arcadion-smoke-particle" style={style} />
					))}
				</div>

				{/* Floating purple particles */}
				<div className="arcadion-particles" aria-hidden="true">
					{energyParticles.map((style, index) => (
						<span key={`particle-${index}`} className="arcadion-energy-particle" style={style} />
					))}
				</div>

				{/* Left content */}
				<div className="arcadion-copy">

					<div className="arcadion-emblem">
						<img
							src={ArcadionLogo}
							alt=""
							className="arcadion-emblem-mark"
							aria-hidden="true"
						/>
					</div>

					<div className="arcadion-copy-divider" />

					<div className="arcadion-copy-text">
						<h2 className="arcadion-waiting-text">
							<span>ARCADION IS WAITING</span>
						</h2>

						<p>Play well&hellip; he&apos;s always one step ahead.</p>
					</div>

				</div>

				{/* Character */}
				<div className="arcadion-character">

					<div className="arcadion-character-aura" />

					<div className="arcadion-character-smoke-back">
						<span />
						<span />
						<span />
						<span />
					</div>

					<img
						src={ArcadionBanner}
						alt="Arcadion"
						className="arcadion-character-image"
					/>

					{/* Eye glow overlay */}
					<div className="arcadion-eyes" aria-hidden="true">
						<span className="arcadion-eye arcadion-eye-left" />
						<span className="arcadion-eye arcadion-eye-right" />
					</div>

					{/* Character energy */}
					<div className="arcadion-character-energy" aria-hidden="true">
						<span />
						<span />
						<span />
					</div>

				</div>

				{/* Right branding */}
				<div className="arcadion-brand">

					<span className="arcadion-brand-line" />

					<span className="arcadion-brand-name">ARCADION</span>

					<span className="arcadion-brand-line" />

				</div>

				{/* Bottom scanning light */}
				<div className="arcadion-scan-line" />

			</div>

		</section>
	);
}

export default Arcadion;