import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authApi } from "../../auth/authApi";
import { getAuthErrorMessage } from "../../auth/authUtils";
import type {
  MatchHistoryFilters,
  MatchOpponentType,
  MatchRecord,
  MatchResult,
} from "../../auth/authTypes";
import { useAuth } from "../../auth/AuthContext";
import {
  navigateTo,
  rememberReturningToProfilePopup,
} from "../../lib/navigation";
import MatchHistoryCalendar from "./MatchHistoryCalendar";
import matchHistoryBannerArt from "../../assets/ArcadionHistory.png";
import matchHistoryRingBg from "../../assets/ArcadionpickBG.png";
import {
  OPPONENT_TYPE_OPTIONS,
  RESULT_OPTIONS,
  formatCompletedAt,
  formatDuration,
  getEarliestDate,
  getOpponentTypeLabel,
  getRangeError,
  getResultLabel,
  getResultTone,
  getTimezoneOffsetMinutes,
  getToday,
  toCalendarDateString,
} from "./matchHistoryFormat";
import type { CalendarDate } from "./matchHistoryFormat";
import "./MatchHistory.css";

/* ===========================================================
   MATCH HISTORY

   A full page, not a modal. It is reached from the Profile Popup through the
   normal navigation helper, and Return goes back to that popup.

   The list is read through the existing authenticated account API. There is no
   create path anywhere in this component or that API, so nothing here can report
   a match result: the rows come from genuine completed matches recorded on the
   server, and an account with no records sees an empty state rather than a
   fabricated one.
   =========================================================== */

const MATCH_HISTORY_FAILED_MESSAGE =
  "Your match history could not be loaded. Please try again.";

const PAGE_SIZE = 25;

type FilterState = {
  date: CalendarDate | null;
  opponentType: MatchOpponentType | "ALL";
  result: MatchResult | "ALL";
};

const NO_FILTERS: FilterState = {
  date: null,
  opponentType: "ALL",
  result: "ALL",
};

/*
 * A single-day display for the Date trigger. This intentionally does not reuse
 * formatRangeLabel (which formats a whole start–end pair as one string) — the
 * trigger shows just the chosen day.
 */
function formatSingleCalendarDate(date: CalendarDate | null): string {
  if (!date) return "Select date";
  const parsed = new Date(`${toCalendarDateString(date)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "Select date";
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* ===========================================================
   ICONS
   =========================================================== */

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3.6 12a8.4 8.4 0 1 0 2.6-6.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path d="M3.4 4.2v4.2h4.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 7.6V12l3 1.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.5c.6 3.8 2.2 5.4 6 6-3.8.6-5.4 2.2-6 6-.6-3.8-2.2-5.4-6-6 3.8-.6 5.4-2.2 6-6Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19 12H5.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M11 5.4 4.4 12l6.6 6.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.5 9.5h17M8 3.4v3.2M16 3.4v3.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 9.5 12 15.5l6-6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function OpponentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9.4" cy="8.6" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.6 18.6c.8-3 2.9-4.6 5.8-4.6 1.1 0 2.1.25 2.9.7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M15.4 6.1a3.2 3.2 0 0 1 0 5.1M17.2 14.4c1.7.7 2.8 2.2 3.2 4.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 4.5h8v4.2a4 4 0 0 1-8 0V4.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M8 6.2H5.6v1.4A3 3 0 0 0 8.4 10.6M16 6.2h2.4v1.4a3 3 0 0 1-2.8 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 12.8v3.4M9 19.2h6M10.2 16.2h3.6l.6 3H9.6l.6-3Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FunnelIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6.5h16M7 12h10M10 17.5h4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

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

function ResetIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M4.2 3.8v4.6h4.6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ===========================================================
   A themed dropdown.

   A real button with a real listbox, rather than a styled <select>, so the
   control matches the page while keeping the keyboard and screen reader
   behaviour a native select already gets right.
   =========================================================== */

type DropdownProps = {
  id: string;
  label: string;
  value: string;
  display: string;
  options: readonly { value: string; label: string }[];
  Icon: () => React.JSX.Element;
  onSelect: (value: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  dataDropdown?: string;
  rootRef?: (node: HTMLDivElement | null) => void;
};

function FilterDropdown({
  id,
  label,
  value,
  display,
  options,
  Icon,
  onSelect,
  isOpen,
  onToggle,
  onClose,
  dataDropdown,
  rootRef,
}: DropdownProps) {
  return (
    <div ref={rootRef} className="mhf-field" data-dropdown={dataDropdown ?? id}>
      <span className="mhf-label" id={`${id}-label`}>{label}</span>
      <div className="mhf-control">
        <span className="mhf-control-icon" aria-hidden="true"><Icon /></span>

        <button
          type="button"
          id={id}
          className={`mhf-trigger${isOpen ? " mhf-trigger--open" : ""}${value !== "ALL" ? " mhf-trigger--active" : ""}`}
          aria-haspopup="listbox"
          aria-controls={`${id}-panel`}
          aria-expanded={isOpen}
          aria-labelledby={`${id}-label ${id}`}
          onClick={onToggle}
        >
          <span className="mhf-value">{display}</span>
          <span className="mhf-chevron" aria-hidden="true"><ChevronDownIcon /></span>
        </button>

        {isOpen && (
          <ul id={`${id}-panel`} className="mhf-menu" role="listbox" aria-labelledby={`${id}-label`}>
            {options.map((option) => (
              <li key={option.value} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  className={`mhf-option${option.value === value ? " mhf-option--selected" : ""}`}
                  onClick={() => {
                    onSelect(option.value);
                    onClose();
                  }}
                >
                  {option.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ===========================================================
   PAGE
   =========================================================== */

type MatchHistoryProps = {
  /**
   * Where Return goes. The Profile Popup records the page it was opened from, so
   * returning lands the reader back where they actually were rather than on a
   * hard-coded guess.
   */
  returnPath: string;
};

function MatchHistory({ returnPath }: MatchHistoryProps) {
  const { user } = useAuth();

  const [draft, setDraft] = useState<FilterState>(NO_FILTERS);
  const [applied, setApplied] = useState<FilterState>(NO_FILTERS);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<"date" | "opponent" | "result" | null>(null);
  const [requestId, setRequestId] = useState(0);
  const dropdownRoots = useRef<Record<"date" | "opponent" | "result", HTMLDivElement | null>>({
    date: null,
    opponent: null,
    result: null,
  });

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /*
   * The account creation date is the real earliest bound for the calendar, down
   * to the exact start day: the calendar opens on that month and disables every
   * day before it. If it is missing the calendar falls back to the current
   * month, which still works but cannot scroll back to an older first month.
   */
  const today = useMemo(() => getToday(), []);
  const accountCreatedAt = user?.createdAt ?? null;
  const earliest = useMemo(
    () => getEarliestDate(accountCreatedAt),
    [accountCreatedAt],
  );

  const buildFilters = useCallback(
    (state: FilterState, offset: number): MatchHistoryFilters => {
      const filters: MatchHistoryFilters = {
        tzOffsetMinutes: getTimezoneOffsetMinutes(),
        limit: PAGE_SIZE,
        offset,
      };
      if (state.date) {
        const dateString = toCalendarDateString(state.date);
        filters.from = dateString;
        filters.to = dateString;
      }
      if (state.opponentType !== "ALL") filters.opponentType = state.opponentType;
      if (state.result !== "ALL") filters.result = state.result;
      return filters;
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    authApi.getMatchHistory(buildFilters(applied, 0))
      .then((response) => {
        if (cancelled || !isMountedRef.current) return;
        setMatches(response.matches);
        setTotal(response.total);
        setHasMore(response.hasMore);
      })
      .catch((error) => {
        if (cancelled || !isMountedRef.current) return;
        // Only a safe, user-facing message is ever shown.
        setLoadError(getAuthErrorMessage(error, MATCH_HISTORY_FAILED_MESSAGE));
        setMatches([]);
        setTotal(0);
        setHasMore(false);
      })
      .finally(() => {
        if (cancelled || !isMountedRef.current) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [applied, buildFilters, requestId]);

  /*
   * Loads the next page and appends it. The sort is stable in the backend, so
   * appending a later page cannot reorder or duplicate what is already shown.
   */
  const handleLoadMore = useCallback(async () => {
    setIsLoadingMore(true);
    try {
      const response = await authApi.getMatchHistory(buildFilters(applied, matches.length));
      if (!isMountedRef.current) return;
      setMatches((current) => [...current, ...response.matches]);
      setTotal(response.total);
      setHasMore(response.hasMore);
    } catch (error) {
      if (!isMountedRef.current) return;
      setLoadError(getAuthErrorMessage(error, MATCH_HISTORY_FAILED_MESSAGE));
    } finally {
      if (isMountedRef.current) setIsLoadingMore(false);
    }
  }, [applied, buildFilters, matches.length]);

  useEffect(() => {
    if (!openDropdown) return;

    const handlePointerDown = (event: PointerEvent) => {
      const root = dropdownRoots.current[openDropdown];
      if (root && root.contains(event.target as Node)) return;
      setOpenDropdown(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [openDropdown]);

  useEffect(() => {
    if (!openDropdown) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpenDropdown(null);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openDropdown]);

  const hasActiveFilters = applied.date !== null
    || applied.opponentType !== "ALL"
    || applied.result !== "ALL";

  const handleClearFilters = useCallback(() => {
    const next = NO_FILTERS;
    setDraft(next);
    setApplied(next);
    setOpenDropdown(null);
  }, []);

  const handleRetry = useCallback(() => {
    setLoadError(null);
    setIsLoading(true);
    setRequestId((id) => id + 1);
  }, []);

  /*
   * Return goes back through the normal navigation helper.
   *
   * Arming the marker is done HERE and nowhere else, immediately before the
   * navigation the Navbar is about to observe. It is deliberately not armed when
   * the page merely opens: a marker left standing by an ordinary visit would be
   * picked up by whatever navigation happened next and reopen the popup when the
   * reader never asked to come back.
   */
  const handleReturn = useCallback(() => {
    rememberReturningToProfilePopup();
    navigateTo(returnPath);
  }, [returnPath]);

  return (
    <main className="mh-page app">
      <div className="mh-page-inner">
        <button type="button" className="mh-return" onClick={handleReturn} aria-label="Back to Profile" title="Back to Profile">
          <span className="mh-return-icon" aria-hidden="true"><ArrowLeftIcon /></span>
        </button>

        {/* ---------------- Hero (same layout as Arcadion Picks) ----------------
            Heading on the left, Arcadion + spinning ring on the right, and the
            filter panel sits over his hand where the pick cards sit on the
            home page. */}
        <section className="mh-hero" aria-labelledby="mh-hero-title">
          <div className="mh-hero-stage" aria-hidden="true">
            <div className="mh-hero-ring">
              <img src={matchHistoryRingBg} alt="" draggable={false} />
            </div>
            <div className="mh-hero-character-glow" />
            {/* dark silhouette: stops the ring showing through Arcadion */}
            <img
              className="mh-hero-character-shadow"
              src={matchHistoryBannerArt}
              alt=""
              draggable={false}
            />
            <img
              className="mh-hero-character"
              src={matchHistoryBannerArt}
              alt=""
              draggable={false}
            />
          </div>

          <div className="mh-hero-note" aria-hidden="true">
            <CrownIcon className="mh-hero-note-crown" />
            <span>
              Every
              <br />
              battle
              <br />
              counts
            </span>
            <svg viewBox="0 0 60 60" className="mh-hero-note-arrow">
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

          <div className="mh-hero-heading">
            <span className="mh-hero-kicker">YOUR BATTLE LOG</span>

            <h1 id="mh-hero-title">
              MATCH <span data-text="HISTORY">HISTORY</span>
            </h1>

            <p>Every win, loss and draw. Arcadion remembers them all.</p>
          </div>
        </section>

        {/* ---------------- Filters ----------------
            One row: Date, Played with, Result, Apply, Clear Filters. It wraps
            below the desktop width rather than clipping or overflowing. */}

        <section className="mhf" aria-label="Match history filters">
          <span className="mhf-heading">
            <FunnelIcon />
            Filters
          </span>

          <div className="mhf-row">
            <div
              className="mhf-field"
              data-dropdown="date"
              ref={(node) => {
                dropdownRoots.current.date = node;
              }}
            >
              <span className="mhf-label" id="mh-filter-date-label">Date</span>
              <div className="mhf-control">
                <span className="mhf-control-icon" aria-hidden="true"><CalendarIcon /></span>
                <button
                  type="button"
                  id="mh-filter-date"
                  className={`mhf-trigger${openDropdown === "date" ? " mhf-trigger--open" : ""}${draft.date ? " mhf-trigger--active" : ""}`}
                  aria-haspopup="dialog"
                  aria-expanded={openDropdown === "date"}
                  aria-labelledby="mh-filter-date-label mh-filter-date"
                  onClick={() => setOpenDropdown((current) => current === "date" ? null : "date")}
                >
                  <span className="mhf-value">{draft.date ? formatSingleCalendarDate(draft.date) : "All time"}</span>
                  <span className="mhf-chevron" aria-hidden="true"><ChevronDownIcon /></span>
                </button>
              </div>

              {openDropdown === "date" && (
                <div className="mhf-calendar-wrap">
                  <MatchHistoryCalendar
                    selected={draft.date}
                    earliest={earliest}
                    latest={today}
                    today={today}
                    onSelect={(selected) => {
                      const next = { ...draft, date: selected };
                      setDraft(next);
                      setApplied(next);
                      setOpenDropdown(null);
                    }}
                    onDismiss={() => setOpenDropdown(null)}
                  />
                </div>
              )}
            </div>

            <FilterDropdown
              id="mh-filter-opponent"
              label="Played with"
              value={draft.opponentType}
              display={draft.opponentType === "ALL"
                ? "All"
                : OPPONENT_TYPE_OPTIONS.find((option) => option.value === draft.opponentType)?.label ?? "All"}
              options={[{ value: "ALL", label: "All" }, ...OPPONENT_TYPE_OPTIONS]}
              Icon={OpponentIcon}
              isOpen={openDropdown === "opponent"}
              onToggle={() => setOpenDropdown((current) => current === "opponent" ? null : "opponent")}
              onClose={() => setOpenDropdown(null)}
              onSelect={(value) => {
                const next = { ...draft, opponentType: value as FilterState["opponentType"] };
                setDraft(next);
                setApplied(next);
              }}
              dataDropdown="opponent"
              rootRef={(node) => {
                dropdownRoots.current.opponent = node;
              }}
            />

            <FilterDropdown
              id="mh-filter-result"
              label="Result"
              value={draft.result}
              display={draft.result === "ALL"
                ? "All"
                : RESULT_OPTIONS.find((option) => option.value === draft.result)?.label ?? "All"}
              options={[{ value: "ALL", label: "All" }, ...RESULT_OPTIONS]}
              Icon={TrophyIcon}
              isOpen={openDropdown === "result"}
              onToggle={() => setOpenDropdown((current) => current === "result" ? null : "result")}
              onClose={() => setOpenDropdown(null)}
              onSelect={(value) => {
                const next = { ...draft, result: value as FilterState["result"] };
                setDraft(next);
                setApplied(next);
              }}
              dataDropdown="result"
              rootRef={(node) => {
                dropdownRoots.current.result = node;
              }}
            />

            <div className="mhf-actions">
              <button
                type="button"
                className="mhf-clear"
                onClick={handleClearFilters}
                disabled={draft.date === null
                  && draft.opponentType === "ALL"
                  && draft.result === "ALL"}
              >
                <span className="mhf-clear-icon" aria-hidden="true"><ResetIcon /></span>
                Clear Filters
              </button>
            </div>
          </div>
        </section>

        {/* ---------------- Full history ---------------- */}

        <section className="mh-section" aria-label="Full history">
          {!isLoading && !loadError && matches.length > 0 && (
            <div className="mh-section-head">
              <p className="mh-section-count">
                {hasMore
                  ? `Showing the newest ${matches.length} of ${total}`
                  : `${total} ${total === 1 ? "match" : "matches"}`}
              </p>
            </div>
          )}

          {isLoading ? (
            <div className="mh-state" role="status" aria-live="polite">
              <span className="mh-spinner" aria-hidden="true" />
              <p className="mh-state-title">Loading match history…</p>
            </div>
          ) : loadError ? (
            <div className="mh-state mh-state--error" role="alert">
              <p className="mh-state-title">We could not load your match history</p>
              <p className="mh-state-body">{loadError}</p>
              <button type="button" className="mh-retry" onClick={handleRetry}>Retry</button>
            </div>
          ) : matches.length === 0 ? (
            hasActiveFilters ? (
              <div className="mh-state">
                <HistoryIcon />
                <p className="mh-state-title">No matches found</p>
                <p className="mh-state-body">Try adjusting or clearing your filters above.</p>
              </div>
            ) : (
              <div className="mh-state">
                <HistoryIcon />
                <p className="mh-state-title">No matches yet</p>
                <p className="mh-state-body">Your completed games will appear here.</p>
              </div>
            )
          ) : (
            <>
              <ul className="mh-list">
                {matches.map((match) => (
                  <li key={match.matchId} className={`mh-row mh-row--${getResultTone(match.result)}`}>
                    <div className="mh-row-main">
                      <span className="mh-row-game" data-field="game">{match.game}</span>
                      <span className="mh-row-meta">
                        <span data-field="opponentType">
                          Played with: {getOpponentTypeLabel(match.opponentType)}
                        </span>
                        {match.opponentName && (
                          <span className="mh-row-opponent-name">vs {match.opponentName}</span>
                        )}
                        <span>Duration: {formatDuration(match.durationMinutes)}</span>
                      </span>
                    </div>

                    <div className="mh-row-side">
                      <span
                        className={`mh-result mh-result--${getResultTone(match.result)}`}
                        data-field="result"
                      >
                        {getResultLabel(match.result)}
                      </span>
                      <time
                        className="mh-row-date"
                        data-field="completedAt"
                        dateTime={match.completedAt}
                      >
                        {formatCompletedAt(match.completedAt)}
                      </time>
                    </div>
                  </li>
                ))}
              </ul>

              {hasMore && (
                <div className="mh-more">
                  <button
                    type="button"
                    className="mh-load-more"
                    onClick={() => void handleLoadMore()}
                    disabled={isLoadingMore}
                  >
                    {isLoadingMore ? "Loading…" : `Load ${Math.min(PAGE_SIZE, total - matches.length)} more`}
                  </button>
                  <p className="mh-more-note">
                    Showing {matches.length} of {total}. The rest are not loaded yet.
                  </p>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}

export default MatchHistory;