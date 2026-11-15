import { useId, type CSSProperties } from "react";
import { LUDO_COLOUR_META, type LudoColour } from "./types";

type LudoTokenProps = {
  colour: LudoColour;
  size?: "sm" | "md" | "lg";
  selected?: boolean;
  dimmed?: boolean;
  className?: string;
};

/**
 * The generated goti used everywhere in the setup flow. The gradient id is
 * per-instance so a row of four tokens never shares one definition.
 */
function LudoToken({
  colour,
  size = "md",
  selected = false,
  dimmed = false,
  className = "",
}: LudoTokenProps) {
  const gradientId = useId().replace(/:/g, "");
  const meta = LUDO_COLOUR_META[colour];

  return (
    <span
      className={[
        "ludo-token",
        `ludo-token--${size}`,
        selected ? "is-selected" : "",
        dimmed ? "is-dimmed" : "",
        className,
      ].filter(Boolean).join(" ")}
      style={{
        "--ludo-token-color": meta.hex,
        "--ludo-token-light": meta.light,
        "--ludo-token-deep": meta.deep,
        "--ludo-token-glow": meta.glow,
      } as CSSProperties}
      aria-hidden="true"
    >
      <span className="ludo-token-halo" />
      <svg className="ludo-token-art" viewBox="0 0 48 48" focusable="false">
        <defs>
          <radialGradient id={`${gradientId}-body`} cx="38%" cy="26%" r="74%">
            <stop offset="0%" stopColor={meta.light} />
            <stop offset="48%" stopColor={meta.hex} />
            <stop offset="100%" stopColor={meta.deep} />
          </radialGradient>
        </defs>
        <ellipse className="ludo-token-shadow" cx="24" cy="42" rx="12.5" ry="3.4" />
        <ellipse className="ludo-token-base" cx="24" cy="37.5" rx="12" ry="4.8" />
        <path
          className="ludo-token-body"
          d="M24 6.5c5.8 0 10.2 4.4 10.2 9.9 0 3.9-2.1 6.5-4.3 9.6-1.6 2.3-2.3 4.2-2.6 6.7h-6.6c-.3-2.5-1-4.4-2.6-6.7-2.2-3.1-4.3-5.7-4.3-9.6 0-5.5 4.4-9.9 10.2-9.9Z"
          fill={`url(#${gradientId}-body)`}
        />
        <ellipse className="ludo-token-shine" cx="20" cy="13" rx="3.4" ry="2.4" />
        <path className="ludo-token-collar" d="M15.5 30.5h17" />
      </svg>
    </span>
  );
}

export default LudoToken;
