import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  MONTH_NAMES,
  WEEKDAY_INITIALS,
  compareCalendarDates,
  formatRangeLabel,
  getDayState,
  getMonthGrid,
  toCalendarDateString,
} from "./matchHistoryFormat";
import type { CalendarDate, DayState } from "./matchHistoryFormat";
import "./MatchHistoryCalendar.css";

/*
 * The date calendar.
 *
 * A popover with month controls and the month and year on show. It is bounded by the account's
 * own start day: the month it was created is the first month it can show, and
 * every day before that start day is disabled. Forward is unbounded, so future
 * months and years stay visible and navigable, with their days disabled until
 * they actually arrive.
 *
 * One click chooses one day, and that day is sent to the API the moment it is
 * chosen.
 *
 * Every day is a plain year/month/day, never an instant, so a day the reader
 * selects is the same day that is sent to the API. Nothing here reads the clock
 * to decide what "today" is beyond the bounds it is given.
 */

/* How much clear space is left under the calendar after the reveal scroll. */
const REVEAL_GAP = 28;

/*
 * Extra height the reveal scroll adds to the bottom of the page so the calendar
 * can be scrolled fully into view on a short page.
 *
 * It must NOT be taken away the moment the calendar closes: removing it shrinks
 * the document, and the browser then clamps the scroll position, which makes the
 * page jump back up. So it is kept after closing, and only released once it can
 * no longer move the page: when the reader scrolls so the viewport no longer
 * reaches the added space, or when they leave the page.
 */
let stopLingeringPadding: (() => void) | null = null;

function releaseLingeringWatch() {
  stopLingeringPadding?.();
}

function keepPaddingUntilSafe(anchor: HTMLElement) {
  releaseLingeringWatch();

  const check = () => {
    const extra = parseFloat(document.body.style.paddingBottom) || 0;
    if (extra <= 0) {
      stop();
      return;
    }
    // The reader left the page: there is no scroll position left to protect.
    if (!anchor.isConnected) {
      document.body.style.paddingBottom = "";
      stop();
      return;
    }
    // Removing the space cannot move the page while the viewport stays above it.
    const contentHeight = document.documentElement.scrollHeight - extra;
    if (window.scrollY + window.innerHeight <= contentHeight) {
      document.body.style.paddingBottom = "";
      stop();
    }
  };

  const timer = window.setInterval(check, 400);
  const stop = () => {
    window.clearInterval(timer);
    window.removeEventListener("scroll", check);
    if (stopLingeringPadding === stop) stopLingeringPadding = null;
  };

  window.addEventListener("scroll", check, { passive: true });
  stopLingeringPadding = stop;
  check();
}

type MatchHistoryCalendarProps = {
  /** The one chosen day, or null for "All time". */
  selected: CalendarDate | null;
  /** The first selectable day, taken from the account creation date. */
  earliest: CalendarDate;
  /** The last selectable day, which is today. */
  latest: CalendarDate;
  /** Today, so it can be outlined. Always the same day as `latest`. */
  today: CalendarDate;
  onSelect: (date: CalendarDate) => void;
  onDismiss: () => void;
};

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={direction === "left" ? "M14.5 5.5 8 12l6.5 6.5" : "M9.5 5.5 16 12l-6.5 6.5"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5.5 5.5 18.5 18.5M18.5 5.5 5.5 18.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function MatchHistoryCalendar({
  selected,
  earliest,
  latest,
  today,
  onSelect,
  onDismiss,
}: MatchHistoryCalendarProps) {
  // The month on screen. It opens on the account's start month, so the reader
  // lands on the first month the account could have played in.
  const [view, setView] = useState(() => ({
    year: earliest.year,
    month: earliest.month,
  }));

  const popoverRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // The bounds are expressed as months, so only those two numbers matter here.
  const canGoBack = compareCalendarDates(
    { year: view.year, month: view.month, day: 1 },
    { year: earliest.year, month: earliest.month, day: 1 },
  ) > 0;

  const shiftMonth = useCallback((delta: number) => {
    setView((current) => {
      const zeroBased = current.month - 1 + delta;
      const year = current.year + Math.floor(zeroBased / 12);
      const month = ((zeroBased % 12) + 12) % 12 + 1;
      return { year, month };
    });
  }, []);

  /*
   * One click chooses one day. There is no range to complete and no second click
   * to wait for, so the caller can filter the moment this returns.
   *
   * A disabled day is a real `disabled` button, so it can never be clicked,
   * focused or activated by keyboard. This guard is the second line of defence:
   * even a direct state change must not be able to select a day outside the
   * account's own range.
   */
  const handleSelect = useCallback((date: CalendarDate) => {
    if (getDayState(date, selected, { earliest, latest, today }) === "disabled") return;
    onSelect(date);
  }, [earliest, latest, onSelect, selected, today]);

  /*
   * Keyboard month and year navigation on the grid itself, so arrow keys and
   * PageUp/PageDown move through the months without needing a pointer. The
   * account start month is respected; forward is unbounded, so a reader can
   * always look ahead into future months.
   */
  const handleGridKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowLeft: -1,
      PageUp: -1,
      ArrowRight: 1,
      PageDown: 1,
    };
    const delta = moves[event.key];
    if (delta === undefined) return;

    event.preventDefault();
    if (delta < 0 && !canGoBack) return;
    shiftMonth(delta);
  }, [canGoBack, shiftMonth]);

  /*
    Escape closes the calendar. Clicking outside is NOT handled here: the page
    owns that, because it has to treat the Date trigger as part of the open
    dropdown. A listener in here could only see the popover, so a press on the
    trigger would dismiss on pointerdown and then the trigger's own click would
    open it again, which is what made the trigger look unresponsive. The page's
    single listener covers the trigger and the popover together, so this one only
    needs to handle the key.
  */
  useEffect(() => {
    // A native listener, so it sees the document level Escape that React's
    // synthetic events would not deliver from here.
    const handleDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // The page's own Escape handling must not also fire for this dismissal.
      event.stopPropagation();
      onDismiss();
    };

    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [onDismiss]);

  // Moving focus into the grid means a keyboard user lands on the calendar
  // rather than having to Tab past the whole filter row again. preventScroll
  // keeps the browser from scrolling the focused grid into view first — the
  // page uses smooth scrolling, so that focus scroll would animate and fight
  // the reveal scroll below, leaving the calendar short of its target.
  useEffect(() => {
    gridRef.current?.focus({ preventScroll: true });
  }, []);

  /*
   * Closing plays the entry animation in reverse.
   *
   * The page removes this component from the tree the instant it wants the
   * calendar gone, whatever the reason (Escape, the X, a picked day, a press
   * outside, the Date trigger), so there is nothing to wait for here. Instead,
   * as the popover is removed, a lookalike copy is left behind in its place and
   * fades and slides out with the reverse of the entry animation, then removes
   * itself. It is inert, so it can never be clicked or focused.
   */
  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!popover) return;

    const mountedAt = performance.now();
    const host: HTMLElement = popover.offsetParent instanceof HTMLElement
      ? popover.offsetParent
      : popover.closest<HTMLElement>(".mhf-field") ?? document.body;

    return () => {
      // Strict Mode mounts, unmounts and re-mounts straight away in development.
      // That is not a real close, so it must not leave a copy behind.
      if (performance.now() - mountedAt < 80) return;
      if (typeof window.matchMedia === "function"
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const ghost = popover.cloneNode(true) as HTMLElement;
      ghost.classList.add("mhc-popover--closing");
      ghost.setAttribute("aria-hidden", "true");
      ghost.removeAttribute("role");
      ghost.removeAttribute("aria-label");
      ghost.querySelectorAll("button, [tabindex]").forEach((node) => {
        node.setAttribute("tabindex", "-1");
      });
      host.appendChild(ghost);

      const remove = () => ghost.remove();
      ghost.addEventListener("animationend", remove, { once: true });
      window.setTimeout(remove, 400);
    };
  }, []);

  /*
   * Reveal the calendar when it opens.
   *
   * The popover hangs under the Date trigger, which can sit low enough on a
   * long history page that the calendar falls below the viewport. Once the
   * popover has rendered — and its entry animation has settled, so the
   * measurement is the final one — scroll the document down by exactly what is
   * needed to leave REVEAL_GAP of clear space below the calendar. The document is the scroll
   * container here: the page is overflow visible, so window.scrollBy is the
   * right call. A single smooth scroll stops at the calculated position; when
   * the calendar is already fully visible with at least REVEAL_GAP to spare, nothing
   * happens.
   */
  useEffect(() => {
    const popover = popoverRef.current;
    if (!popover) return;

    let observer: ResizeObserver | null = null;
    let lastOverflow = -1;
    const mountedAt = performance.now();
    const anchor = popover.closest<HTMLElement>(".mh-page") ?? document.body;

    // A calendar opening again takes over from a previous close that is still
    // holding its extra space, so the two never fight over it.
    releaseLingeringWatch();

    const scrollReveal = () => {
      const rect = popover.getBoundingClientRect();
      const overflow = rect.bottom + REVEAL_GAP - window.innerHeight;
      if (overflow <= 0) return;
      if (overflow === lastOverflow) return;
      lastOverflow = overflow;
      if (typeof window.scrollBy !== "function") return;
      const reduceMotion = typeof window.matchMedia === "function"
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const behavior = reduceMotion ? "instant" : "smooth";

      /*
       * The popover is absolutely positioned, so it does not expand the
       * document. On a short page the document may not scroll far enough to
       * reveal it, so give the body the height needed to make the scroll
       * reachable. The padding is computed against the content height (the
       * scroll height minus any padding already applied), so repeated calls
       * stay idempotent and the padding never accumulates.
       */
      const currentPadding = parseFloat(document.body.style.paddingBottom) || 0;
      const contentHeight = document.documentElement.scrollHeight - currentPadding;
      const paddingNeeded = Math.max(0, window.scrollY + rect.bottom + REVEAL_GAP - contentHeight);
      document.body.style.paddingBottom = paddingNeeded > 0 ? `${paddingNeeded}px` : "";

      window.scrollBy({ top: overflow, behavior });
    };

    const reveal = () => {
      scrollReveal();
      /*
       * Month navigation can change the grid height, which resizes the
       * popover. Watch for that now, after the initial measurement —
       * registering here avoids the observer's own initial fire, which would
       * happen before the entry animation has settled.
       */
      if (typeof ResizeObserver === "function" && !observer) {
        observer = new ResizeObserver(() => scrollReveal());
        observer.observe(popover);
      }
    };

    /*
     * The entry animation slides the popover 6px downward. Measuring before it
     * ends would under-scroll by up to that much, so wait for it — unless the
     * animation is disabled (reduced motion), in which case measure at once.
     */
    if (window.getComputedStyle(popover).animationName === "none") {
      reveal();
    } else {
      popover.addEventListener("animationend", reveal, { once: true });
    }

    return () => {
      observer?.disconnect();
      popover.removeEventListener("animationend", reveal);

      // Strict Mode's instant re-run in development is not a real close.
      if (performance.now() - mountedAt < 80) return;

      /*
       * Closing leaves the page exactly where it is. A reveal scroll that is
       * still gliding is stopped where it stands, and the extra bottom space is
       * kept (not removed) so the document does not shrink and pull the page
       * back up. It is released later, once that can no longer move anything.
       */
      window.scrollTo({ top: window.scrollY, left: window.scrollX, behavior: "instant" });
      keepPaddingUntilSafe(anchor);
    };
  }, []);

  const grid = useMemo(() => getMonthGrid(view), [view]);

  return (
    <div
      ref={popoverRef}
      className="mhc-popover"
      role="dialog"
      aria-label="Choose a date"
      aria-modal="false"
    >
      <div className="mhc-header">
        <button
          type="button"
          className="mhc-nav"
          onClick={() => shiftMonth(-1)}
          disabled={!canGoBack}
          aria-label="Previous month"
        >
          <ChevronIcon direction="left" />
        </button>

        {/* Month and year, always on show. */}
        <div className="mhc-title" aria-live="polite">
          <span className="mhc-month">{MONTH_NAMES[view.month - 1]}</span>
          <span className="mhc-year">{view.year}</span>
        </div>

        <button
          type="button"
          className="mhc-nav"
          onClick={() => shiftMonth(1)}
          aria-label="Next month"
        >
          <ChevronIcon direction="right" />
        </button>

        <button
          type="button"
          className="mhc-close arcadia-modal-close"
          onClick={onDismiss}
          aria-label="Close calendar"
        >
          <CloseIcon />
        </button>
      </div>

      {/*
        * The available range in one quiet line above the day grid: the account's
        * start day through today. A plain caption, not a card or banner.
        */}
      <p className="mhc-range">{formatRangeLabel(earliest, today)}</p>

      <div className="mhc-weekdays" aria-hidden="true">
        {WEEKDAY_INITIALS.map((initial, index) => (
          <span key={`${initial}-${index}`} className="mhc-weekday">
            {initial}
          </span>
        ))}
      </div>

      <div
        ref={gridRef}
        className="mhc-grid"
        role="grid"
        tabIndex={0}
        onKeyDown={handleGridKeyDown}
        aria-label={`${MONTH_NAMES[view.month - 1]} ${view.year}. Use the arrow keys to change month.`}
      >
        {grid.map((date, index) => {
          // A leading or trailing blank keeps the real days on their weekday.
          if (!date) {
            return <span key={`blank-${index}`} className="mhc-day mhc-day--blank" aria-hidden="true" />;
          }

          const state: DayState = getDayState(date, selected, { earliest, latest, today });
          const isDisabled = state === "disabled";
          // A full spoken label, so the day is never announced as a bare number.
          const spokenLabel = `${date.day} ${MONTH_NAMES[view.month - 1]} ${date.year}`;

          return (
            <button
              key={toCalendarDateString(date)}
              type="button"
              className={`mhc-day mhc-day--${state}`}
              disabled={isDisabled}
              aria-label={spokenLabel}
              aria-pressed={state === "selected"}
              onClick={() => handleSelect(date)}
            >
              {date.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default MatchHistoryCalendar;