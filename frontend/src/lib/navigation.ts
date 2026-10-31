import type { MouseEvent } from "react";

const NAVIGATION_EVENT = "arcadia:navigate";

/** The Match History page, reached from the Profile Popup. */
export const MATCH_HISTORY_PATH = "/match-history";

/** The Leaderboard page, reached from the Profile Popup. */
export const LEADERBOARD_PATH = "/leaderboard";

function scrollToSection(targetId: string) {
  const targetElement = document.getElementById(targetId);
  if (!targetElement) return;

  const navbarHeight = document.querySelector<HTMLElement>(".navbar")?.offsetHeight ?? 60;
  const targetTop = targetElement.getBoundingClientRect().top + window.scrollY - navbarHeight - 11;

  window.scrollTo({
    top: Math.max(0, targetTop),
    behavior: "smooth",
  });
}

export function navigateTo(
  path: string,
  event?: MouseEvent<HTMLElement>
) {
  event?.preventDefault();

  const url = new URL(path, window.location.origin);

  const currentLocation =
    `${window.location.pathname}${window.location.search}${window.location.hash}`;

  const targetLocation =
    `${url.pathname}${url.search}${url.hash}`;

  /* -----------------------------------------
     Same page + hash
  ----------------------------------------- */

  if (
    url.pathname === window.location.pathname &&
    url.search === window.location.search &&
    url.hash
  ) {
    const targetId = url.hash.substring(1);
    scrollToSection(targetId);

    return;
  }

  /* -----------------------------------------
     Completely same location
  ----------------------------------------- */

  if (currentLocation === targetLocation) {
    return;
  }

  /* -----------------------------------------
     Update browser URL
  ----------------------------------------- */

  window.history.pushState({}, "", path);

  window.dispatchEvent(new Event(NAVIGATION_EVENT));

  /* App owns scrolling after the new page has rendered. */
  if (!url.hash) {
    /* -----------------------------------------
       Home / normal page navigation

       This jump has to be instant. `html` carries `scroll-behavior: smooth`
       (Landingpage.css), and "auto" means "use that CSS value" — so "auto"
       starts a smooth scroll that is still running when the page swaps. The new
       page then mounts part-way down and scrolls up through its own entry
       animation, which buries the shared `.page-transition` and reads as a
       missing transition. "instant" lands the swap at scrollY 0 instead.
    ----------------------------------------- */

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "instant",
    });

    requestAnimationFrame(() => {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: "smooth",
      });
    });
  }
}

export function onNavigation(callback: () => void) {
  window.addEventListener(
    NAVIGATION_EVENT,
    callback
  );

  window.addEventListener(
    "popstate",
    callback
  );

  return () => {
    window.removeEventListener(
      NAVIGATION_EVENT,
      callback
    );

    window.removeEventListener(
      "popstate",
      callback
    );
  };
}

/* -----------------------------------------
   Match History, Leaderboard and the Profile Popup

   Match History and the Leaderboard are separate pages, so the Profile Popup is
   unmounted while either is open. Coming back has to put that popup back, and the
   popup cannot do it itself because it is not mounted at the time. So the intent
   is parked here for the length of one navigation.

   These are transient values held in memory only. They are deliberately NOT in
   localStorage or sessionStorage: they describe a single click in a single
   session, so a reload or a new tab must not resurrect a popup the reader never
   asked for.
   ----------------------------------------- */

let shouldReopenProfilePopup = false;
let matchHistoryReturnPath = "/";

/** Parks the intent to bring the Profile Popup back. */
export function rememberReturningToProfilePopup() {
  shouldReopenProfilePopup = true;
}

/**
 * Reads and clears the intent in one step, so it fires exactly once. The clear on
 * read is what stops the popup reappearing on some later, unrelated navigation.
 */
export function consumeProfilePopupReopenRequest(): boolean {
  const requested = shouldReopenProfilePopup;
  shouldReopenProfilePopup = false;
  return requested;
}

/*
   Shared login modal, opened on the next mount

   The Admin Portal has no login page of its own — signing out, or reaching an
   admin page while signed out, lands on the landing page with the ONE existing
   Arcadia login/signup modal opened. The redirect happens first, so by the time
   the Navbar (the modal's host) mounts, the intent has to be parked here for
   the length of one navigation — exactly like the Profile Popup reopen above.

   In-memory only: a reload or a new tab must not resurrect a modal the reader
   never asked for.
   ----------------------------------------- */

let shouldOpenLoginOnNextMount = false;

/** Parks the intent to open the shared login modal once the Navbar mounts. */
export function requestLoginOnNextMount() {
  shouldOpenLoginOnNextMount = true;
}

/**
 * Reads and clears the intent in one step, so it fires exactly once (on the
 * Navbar's first mount after the request).
 */
export function consumeLoginOnNextMount(): boolean {
  const requested = shouldOpenLoginOnNextMount;
  shouldOpenLoginOnNextMount = false;
  return requested;
}

/**
 * Records the page the reader was on when they left for Match History, so Return
 * sends them back to exactly that page rather than to a hard-coded guess.
 */
export function rememberMatchHistoryReturnPath(path: string) {
  matchHistoryReturnPath = path || "/";
}

export function getMatchHistoryReturnPath(): string {
  return matchHistoryReturnPath;
}

let leaderboardReturnPath = "/";

/**
 * Records the page the reader was on when they left for the Leaderboard, so
 * Return sends them back to exactly that page rather than to a hard-coded guess.
 */
export function rememberLeaderboardReturnPath(path: string) {
  leaderboardReturnPath = path || "/";
}

export function getLeaderboardReturnPath(): string {
  return leaderboardReturnPath;
}

/* -----------------------------------------
   Leaderboard ka origin — Profile Popup se, ya Landing ke Top 10 se?

   Profile Popup ke "Leaderboards" wale option se aate hi "profile" likha
   jata hai, aur Landing ke Top 10 wale "View more" se "landing". Navbar ise
   agli navigation par padh kar tay karta hai ki Leaderboard chhodne par
   Profile Popup wapas khulna chahiye ya nahi — uski wajah yahi hai ki reader
   kahan se aaya tha.

   Padhte hi wapas "landing" ho jata hai, taaki ek visit ka marker doosri
   visit me khela na jaye. Ye value sirf memory me rehti hai — uske liye
   koi persistent store nahi.
   ----------------------------------------- */

/** Jahan se reader Leaderboard page par aaya. */
export type LeaderboardOrigin = "profile" | "landing";

let leaderboardOrigin: LeaderboardOrigin = "landing";

/** Records where the reader opened the Leaderboard from. */
export function rememberLeaderboardOrigin(origin: LeaderboardOrigin) {
  leaderboardOrigin = origin === "profile" ? "profile" : "landing";
}

/**
 * Reads the origin once and resets it in the same step, so it can decide the
 * return behaviour at most once and can never leak into a later visit.
 */
export function consumeLeaderboardOrigin(): LeaderboardOrigin {
  const origin = leaderboardOrigin;
  leaderboardOrigin = "landing";
  return origin;
}