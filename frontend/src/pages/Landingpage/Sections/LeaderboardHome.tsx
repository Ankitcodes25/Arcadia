import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { ArrowLeft, ArrowRight, Crown, Star } from "lucide-react";
import { useAuth } from "../../../auth/AuthContext";
import { getLocalAvatarOption } from "../../../auth/avatarCatalog";
import {
  DUMMY_PLAYERS_BY_SCORE,
  DUMMY_PLAYERS_ENABLED,
  DUMMY_PLAYER_DATA_NOTICE,
  type DummyPlayer,
} from "../../../data/development/dummyPlayers";
import PlayerProfile from "../../../components/PlayerProfileModal";
import {
  LEADERBOARD_PATH,
  navigateTo,
  rememberLeaderboardOrigin,
  rememberLeaderboardReturnPath,
} from "../../../lib/navigation";

/*
 * The Home Top 10 reads the same centralized development fixtures as the full
 * leaderboard, so the two surfaces can never drift apart. In a production build
 * the flag is off and the section renders no dummy cards.
 */
const PLAYERS: readonly DummyPlayer[] = DUMMY_PLAYERS_ENABLED ? DUMMY_PLAYERS_BY_SCORE : [];

/* armed   = section abhi screen par nahi aaya (cards hidden, score 0)
   shown   = screen par aaya -> cards ek-ek karke aate hain, score count-up
   instant = animation nahi (reduced motion / no IntersectionObserver) */
type RevealState = "armed" | "shown" | "instant";

const COUNT_UP_MS = 1400;
const STAGGER_MS = 70;

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function getRankClass(rank: number) {
  if (rank === 1) return "is-first";
  if (rank === 2) return "is-second";
  if (rank === 3) return "is-third";

  return "";
}

function getInitialReveal(): RevealState {
  if (
    typeof window === "undefined" ||
    typeof IntersectionObserver === "undefined" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return "instant";
  }

  return "armed";
}

type CountUpProps = {
  value: number;
  reveal: RevealState;
  delay: number;
};

function CountUp({ value, reveal, delay }: CountUpProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (reveal !== "shown") return;

    let frame = 0;
    let startedAt = 0;

    const timer = window.setTimeout(() => {
      const tick = (now: number) => {
        if (!startedAt) startedAt = now;

        const t = Math.min((now - startedAt) / COUNT_UP_MS, 1);

        setProgress(1 - Math.pow(1 - t, 3));

        if (t < 1) frame = window.requestAnimationFrame(tick);
      };

      frame = window.requestAnimationFrame(tick);
    }, delay);

    return () => {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
    };
  }, [reveal, delay]);

  const current =
    reveal === "instant"
      ? value
      : reveal === "armed"
        ? 0
        : Math.round(value * progress);

  return (
    <span className="leaderboard-home-count">
      <span className="leaderboard-home-sr">
        {formatNumber(value)} points
      </span>

      {/* ghost = final width reserve, taaki number badhte waqt box hile nahi */}
      <span className="leaderboard-home-count-ghost" aria-hidden="true">
        {formatNumber(value)}
      </span>

      <span className="leaderboard-home-count-live" aria-hidden="true">
        {formatNumber(current)}
      </span>
    </span>
  );
}

export default function LeaderboardHome() {
  const { user, isAuthenticated } = useAuth();
  const sectionRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const [reveal, setReveal] = useState<RevealState>(getInitialReveal);
  const [canGoPrevious, setCanGoPrevious] = useState(false);
  const [canGoNext, setCanGoNext] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<{ username: string; rank: number } | null>(null);

  const updateArrowState = useCallback(() => {
    const grid = gridRef.current;

    if (!grid) return;

    const maxScrollLeft = grid.scrollWidth - grid.clientWidth;

    setCanGoPrevious(grid.scrollLeft > 5);
    setCanGoNext(grid.scrollLeft < maxScrollLeft - 5);
  }, []);

  /* arrows (ab header me): mount par aur resize par bhi check karo
     (agar saare cards fit ho jayein to dono arrows disabled) */
  useEffect(() => {
    updateArrowState();

    window.addEventListener("resize", updateArrowState);

    return () => window.removeEventListener("resize", updateArrowState);
  }, [updateArrowState]);

  /* section screen par aate hi entrance + count-up start */
  useEffect(() => {
    const section = sectionRef.current;

    if (!section || reveal !== "armed") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setReveal("shown");
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );

    observer.observe(section);

    return () => observer.disconnect();
  }, [reveal]);

  const handleViewAll = () => {
    if (!isAuthenticated) {
      window.dispatchEvent(new Event("arcadia:open-login"));
      return;
    }

    /*
     * Leaderboard is its own page now, so the button opens it directly.
     * The return path is parked first, exactly the way the Navbar does it, so
     * the page's back arrow lands here again instead of wherever it was last
     * opened from.
     *
     * The origin is written as "landing" on purpose: this visit did not come
     * from the Profile Popup, so coming back must just land here without
     * reopening it. That also overwrites anything an earlier popup visit left.
     */
    rememberLeaderboardReturnPath(
      `${window.location.pathname}${window.location.search}${window.location.hash}`
    );
    rememberLeaderboardOrigin("landing");
    navigateTo(LEADERBOARD_PATH);
  };

  const handlePlayerProfile = (player: DummyPlayer) => {
    if (!isAuthenticated) {
      window.dispatchEvent(new Event("arcadia:open-login"));
      return;
    }
    if (player.username.toLowerCase() === user?.username?.trim().toLowerCase()) return;
    setSelectedPlayer({ username: player.username, rank: PLAYERS.indexOf(player) + 1 });
  };

  const scrollCards = (direction: "previous" | "next") => {
    const grid = gridRef.current;

    if (!grid) return;

    const card = grid.querySelector<HTMLElement>(".leaderboard-home-card");

    if (!card) return;

    const cardWidth = card.getBoundingClientRect().width;

    const styles = window.getComputedStyle(grid);
    const gap = parseFloat(styles.columnGap || styles.gap || "0");

    const scrollAmount = cardWidth + gap;

    grid.scrollBy({
      left: direction === "next" ? scrollAmount : -scrollAmount,
      behavior: "smooth",
    });
  };

  return (
    <section
      ref={sectionRef}
      className="leaderboard-home"
      data-reveal={reveal}
      aria-labelledby="leaderboard-home-title"
    >
      <div className="leaderboard-home-ambient" aria-hidden="true" />

      <div className="leaderboard-home-header">
        <div className="leaderboard-home-copy">
          <span className="leaderboard-home-kicker">Leaderboard</span>

          <h2
            id="leaderboard-home-title"
            className="leaderboard-home-title"
          >
            Top 10 Players
          </h2>

          <p className="leaderboard-home-subtitle">
            Arcadia&apos;s best, ranked. Score big and claim your throne.
          </p>

          {PLAYERS.length > 0 && (
            <p className="leaderboard-home-demo" role="note">
              {DUMMY_PLAYER_DATA_NOTICE}
            </p>
          )}
        </div>

        {/* arrows + View all ek saath, header ke right side me */}
        <div className="leaderboard-home-actions">
          <div
            className="leaderboard-home-nav"
            role="group"
            aria-label="Scroll players"
          >
            <button
              type="button"
              className="leaderboard-home-arrow leaderboard-home-arrow-left"
              onClick={() => scrollCards("previous")}
              disabled={!canGoPrevious}
              aria-label="Previous players"
            >
              <ArrowLeft aria-hidden="true" />
            </button>

            <button
              type="button"
              className="leaderboard-home-arrow leaderboard-home-arrow-right"
              onClick={() => scrollCards("next")}
              disabled={!canGoNext}
              aria-label="Next players"
            >
              <ArrowRight aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            className="view-all leaderboard-home-viewall"
            onClick={handleViewAll}
          >
            View all <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>

      <div className="leaderboard-home-board">
        <div className="leaderboard-home-carousel">
          <div
            ref={gridRef}
            className="leaderboard-home-grid"
            role="group"
            aria-label="Top 10 Arcadia players"
            tabIndex={0}
            onScroll={updateArrowState}
          >
            {PLAYERS.map((player, index) => {
              const rank = index + 1;
              const isPodium = rank <= 3;
              const avatar = getLocalAvatarOption(player.avatarId);

              return (
                <article
                  key={player.id}
                  className={`leaderboard-home-card leaderboard-home-profile-card ${getRankClass(rank)}`}
                  style={{ "--i": index } as CSSProperties}
                  role="button"
                  tabIndex={0}
                  aria-label={`View ${player.username}'s profile`}
                  onClick={() => handlePlayerProfile(player)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handlePlayerProfile(player);
                    }
                  }}
                >
                  <div className="leaderboard-home-badge">
                    {isPodium && (
                      <Crown
                        className="leaderboard-home-crown"
                        aria-hidden="true"
                      />
                    )}

                    <div
                      className="leaderboard-home-avatar leaderboard-home-profile-trigger"
                      aria-hidden="true"
                      style={{ background: avatar.background }}
                    >
                      {player.username.slice(0, 1).toUpperCase()}
                    </div>

                    <span className="leaderboard-home-rank">
                      #{rank}
                    </span>
                  </div>

                  <div
                    className="leaderboard-home-player leaderboard-home-profile-name"
                  >
                    {player.username}
                  </div>

                  <div className="leaderboard-home-score">
                    <Star aria-hidden="true" />

                    <CountUp
                      value={player.stats.totalScore}
                      reveal={reveal}
                      delay={index * STAGGER_MS + 250}
                    />

                    <em aria-hidden="true">PTS</em>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
      {selectedPlayer && (
        <PlayerProfile
          username={selectedPlayer.username}
          globalRank={selectedPlayer.rank}
          currentUserId={user?.id ?? null}
          demoFallback
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </section>
  );
}