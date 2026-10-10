import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

/*
 * Match History, as a full page reached from the Profile Popup.
 *
 * The page is driven for real: only the network call and the location are
 * stubbed, so the layout, the calendar, the filter row and every state rendered
 * here are the ones a reader actually gets.
 */
const frontendRoot = fileURLToPath(new URL("../", import.meta.url));
const originalConsoleError = console.error;

let dom;
let vite;
let React;
let act;
let createRoot;
let root;
let Navbar;
let MatchHistory;
let AuthContext;
let authApi;
let format;
let navigation;
let matchHistoryCalls;
let nextResponse;
let nextError;
let pushedPaths;

function installDom() {
  dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://arcadia.test/",
  });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  for (const key of [
    "HTMLElement", "HTMLInputElement", "HTMLButtonElement", "HTMLSelectElement",
    "Element", "Node", "Event", "MouseEvent", "KeyboardEvent", "CustomEvent",
    "MutationObserver",
  ]) {
    globalThis[key] = window[key];
  }
  Object.defineProperty(globalThis, "navigator", {
    value: window.navigator,
    configurable: true,
  });
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  /*
    jsdom does not implement requestAnimationFrame unless it is asked to pretend
    to be visual, and the app's navigation helper calls it. Without this the
    navigation throws partway through and the assertions after it measure nothing.
  */
  globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
  globalThis.cancelAnimationFrame = (handle) => clearTimeout(handle);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
}

before(async () => {
  console.error = (...args) => {
    if (typeof args[0] === "string" && args[0].includes("not wrapped in act")) return;
    originalConsoleError(...args);
  };
  installDom();

  React = (await import("react")).default;
  ({ act } = await import("react"));
  ({ createRoot } = await import("react-dom/client"));

  vite = await createServer({
    root: frontendRoot,
    logLevel: "silent",
    server: { middlewareMode: true },
    appType: "custom",
  });
  Navbar = (await vite.ssrLoadModule("/src/components/Navbar.tsx")).default;
  MatchHistory = (await vite.ssrLoadModule("/src/pages/MatchHistory/MatchHistory.tsx")).default;
  AuthContext = (await vite.ssrLoadModule("/src/auth/AuthContext.tsx")).default;
  ({ authApi } = await vite.ssrLoadModule("/src/auth/authApi.ts"));
  format = await vite.ssrLoadModule("/src/pages/MatchHistory/matchHistoryFormat.ts");
  navigation = await vite.ssrLoadModule("/src/lib/navigation.ts");
});

after(async () => {
  await vite?.close();
  console.error = originalConsoleError;
});

beforeEach(() => {
  matchHistoryCalls = [];
  pushedPaths = [];
  nextResponse = emptyResponse();
  nextError = null;

  // The navigation markers are module state that outlives a test, so they are
  // cleared between tests. This is also the honest assertion that merely opening
  // the page does not arm the marker.
  navigation.consumeProfilePopupReopenRequest();
  navigation.rememberMatchHistoryReturnPath("/");

  // Only the network is stubbed, so the request the page builds is the real one.
  authApi.getMatchHistory = async (filters) => {
    matchHistoryCalls.push(filters);
    if (nextError) throw nextError;
    return nextResponse;
  };

  // Navigation is recorded rather than performed, so a test can assert where the
  // page wanted to go without leaving jsdom's URL in a strange state.
  window.history.pushState = (state, title, path) => {
    pushedPaths.push(path);
  };
  window.history.back = () => {
    pushedPaths.push("__back__");
  };
  window.scrollTo = () => {};
});

/* ------------------------------------------------------------------
   Fixtures
   ------------------------------------------------------------------ */

function emptyResponse() {
  return {
    matches: [],
    total: 0,
    limit: 25,
    offset: 0,
    hasMore: false,
    filters: { from: null, to: null, opponentType: null, result: null },
  };
}

function pageResponse(matches, overrides = {}) {
  return {
    matches,
    total: matches.length,
    limit: 25,
    offset: 0,
    hasMore: false,
    filters: { from: null, to: null, opponentType: null, result: null },
    ...overrides,
  };
}

function progression(overrides = {}) {
  return {
    totalXp: 0, level: 0, currentLevelXp: 0, nextLevelXp: 100, progressPercent: 0,
    title: "Arcadia Rookie", badgeKey: "bronze", themeKey: "bronze", ...overrides,
  };
}

function navbarUser(overrides = {}) {
  return {
    id: "user-1",
    name: "",
    username: "Ankit10",
    usernameSetupRequired: false,
    playerId: "ARC-7K4M2P9Q",
    displayName: "Ankit Das",
    avatar: { type: "local", value: "avatar-01" },
    avatarSource: "local",
    googleAvatarAvailable: false,
    googleAvatarUrl: null,
    authProvider: "PASSWORD",
    email: "user@example.com",
    progression: progression(),
    role: "USER",
    status: "ACTIVE",
    createdAt: "2024-03-15T08:00:00.000Z",
    updatedAt: null,
    lastLoginAt: null,
    ...overrides,
  };
}

function match(overrides = {}) {
  return {
    matchId: "6".repeat(24),
    game: "arcadion",
    opponentType: "ARCADION",
    opponentName: null,
    result: "WIN",
    completedAt: "2026-06-20T18:30:00.000Z",
    durationMinutes: 9,
    ...overrides,
  };
}

function authValue(user) {
  return {
    user,
    isAuthenticated: true,
    isLoading: false,
    isSubmitting: false,
    authError: null,
    authErrorKind: null,
    authMode: null,
    accountAction: null,
    openAuthMode: () => {},
    closeAuthMode: () => {},
    clearError: () => {},
    dismissAccountAction: () => {},
    updateUser: () => {},
    updateProfile: async () => ({ ok: true, message: null, status: null, user }),
    login: async () => true,
    register: async () => true,
    forgotPassword: async () => "sent",
    submitPasswordReset: async () => true,
    changePassword: async () => ({ success: true, message: "" }),
    revokeSession: async () => ({ current: false, message: "" }),
    logoutOtherSessions: async () => ({ revokedCount: 0, message: "" }),
    loginWithGoogle: () => {},
    logout: async () => ({ success: true }),
    logoutAll: async () => ({ success: true }),
    refresh: async () => null,
  };
}

async function renderRoot(element) {
  await act(async () => { root?.unmount(); });
  document.body.innerHTML = "";
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(element); });
  return () => act(async () => root.unmount());
}

function renderNavbar(user = navbarUser()) {
  return renderRoot(React.createElement(
    AuthContext.Provider,
    { value: authValue(user) },
    React.createElement(Navbar),
  ));
}

/** The Match History page on its own, which is how a reader lands on it. */
function renderPage(user = navbarUser(), returnPath = "/") {
  return renderRoot(React.createElement(
    AuthContext.Provider,
    { value: authValue(user) },
    React.createElement(MatchHistory, { returnPath }),
  ));
}

/**
 * Renders the Navbar and the Match History page side by side under one auth
 * provider, which is the shape App uses: the Navbar outlives the page, and its
 * navigation listener is what restores the popup.
 */
function renderNavbarWithPage(user = navbarUser(), returnPath = "/") {
  return renderRoot(React.createElement(
    AuthContext.Provider,
    { value: authValue(user) },
    React.createElement(
      React.Fragment,
      null,
      React.createElement(Navbar),
      React.createElement(MatchHistory, { returnPath }),
    ),
  ));
}

function q(selector) { return document.querySelector(selector); }
function qa(selector) { return [...document.querySelectorAll(selector)]; }

function click(node) {
  return act(async () => {
    node.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function pressKey(node, key) {
  return act(async () => {
    node.dispatchEvent(new window.KeyboardEvent("keydown", {
      key, bubbles: true, cancelable: true,
    }));
  });
}

function pointerDown(node) {
  return act(async () => {
    node.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
  });
}

/**
 * A real press: pointerdown then click, in the order a browser sends them.
 *
 * The dropdown dismissal listens for pointerdown, so a test that only sends click
 * would never exercise it. Firing both keeps these tests honest about ordering,
 * which is exactly where the original bug lived.
 */
function press(node) {
  return act(async () => {
    node.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
    node.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

/** Whether a dropdown's list is currently on screen. */
function isDropdownOpen(id) {
  return qa(`#${id}-panel`).length === 1;
}

/** A press on empty page space, well away from any filter control. */
function pressPageBackground() {
  return press(q(".mh-page-title"));
}

/* ==================================================================
   1. It is a page, not a modal
   ================================================================== */

test("Match History is a full page, not a modal or overlay", async () => {
  const unmount = await renderPage();

  assert.ok(q(".mh-page"), "the page container is rendered");
  assert.ok(q(".mh-page-inner"), "with a page-width inner column");
  assert.match(q("main").className, /\bmh-page\b/, "it is a main landmark");

  // Nothing about a modal survives: no backdrop, no dialog role, no X.
  assert.equal(q(".mh-backdrop") === null, true, "there is no backdrop");
  assert.equal(q(".mh-modal") === null, true, "there is no modal panel");
  assert.equal(q('[role="dialog"]') === null, true, "nothing claims to be a dialog");
  assert.equal(q('button[aria-label="Close match history"]') === null, true, "the modal X is gone");
  assert.equal(q(".profile-popup") === null, true, "and the Profile Popup is not on this page");
  await unmount();
});

test("the page is not portaled into the body and does not lock scrolling", async () => {
  const unmount = await renderPage();
  const container = document.body.lastElementChild;

  assert.ok(container.querySelector(".mh-page"), "the page lives in the normal tree");
  assert.equal(document.documentElement.style.overflow, "", "no scroll lock is applied");
  await unmount();
});

/* ==================================================================
   2. Heading and Return
   ================================================================== */

test("the heading uses a history icon and not the Arcadia logo", async () => {
  const unmount = await renderPage();

  assert.equal(q(".mh-page-title").textContent, "Match History", "the heading is present");

  const icon = q(".mh-page-icon");
  assert.ok(icon, "a history icon sits beside the heading");
  assert.ok(icon.querySelector("svg"), "and it is the drawn history icon");

  // The brand mark is deliberately not used on this page.
  assert.equal(icon.querySelector("img"), null, "the icon is not an image");
  const headings = q(".mh-page-header");
  assert.equal(headings.querySelector("img"), null, "no logo anywhere in the heading");
  assert.equal(q(".mh-header-logo") === null, true, "the old modal logo class is gone");
  await unmount();
});

test("the back button shows only a left arrow, with an accessible label", async () => {
  const unmount = await renderPage();

  const button = q(".mh-return");
  assert.ok(button, "the back button is rendered");
  assert.equal(button.tagName, "BUTTON", "it is a real button");

  // Icon only: no visible text at all, and specifically not the word Back.
  assert.equal(button.textContent.trim(), "", "it carries no visible text");
  assert.doesNotMatch(button.textContent, /back/i, "and not the word Back");
  assert.ok(button.querySelector("svg"), "just the icon");

  // The meaning is carried for anyone who cannot see the icon, and the native
  // title is the tooltip this project uses.
  assert.equal(button.getAttribute("aria-label"), "Back to Profile", "labelled for screen readers");
  assert.equal(button.getAttribute("title"), "Back to Profile", "with a tooltip");

  // The arrow really points left: the stem runs from right to left, and the
  // head is the second path, drawn on the left of the stem.
  const paths = [...button.querySelectorAll("path")].map((n) => n.getAttribute("d"));
  assert.ok(paths.length >= 2, "the icon has a stem and a head");
  assert.match(paths[0], /^M19 12H5/, "the stem runs from right to left");
  assert.match(paths[1], /M11 5\.4 4\.4 12/, "and the head starts on the left of the stem");
  assert.match(paths[1], /l6\.6 6\.6/, "returning to the stem, which points left");

  // Above the heading in the document, not after it.
  const order = [...document.querySelectorAll(".mh-return, .mh-page-header")]
    .map((node) => (node.classList.contains("mh-return") ? "return" : "heading"));
  assert.deepEqual(order, ["return", "heading"], "Return comes before the heading");
  await unmount();
});

/* ==================================================================
   3. Navigation out and back
   ================================================================== */

test("the Profile Popup opens Match History by navigating, not by opening a layer", async () => {
  const unmount = await renderNavbar();
  await click(q(".avatar-button"));

  // NOTE: assertions here compare strings and counts, never DOM nodes. A failing
  // assert.equal on a node makes node:assert try to diff a jsdom element, which
  // exhausts memory and kills the process instead of reporting the failure.
  assert.equal(q(".profile-popup") === null, false, "the popup is open");

  const item = qa(".profile-popup-item")
    .find((n) => n.textContent.includes("Match History"));
  assert.equal(item === undefined, false, "the Match History option is present");

  await click(item);

  assert.deepEqual(pushedPaths, [navigation.MATCH_HISTORY_PATH],
    "it goes through the normal navigation helper to the page");
  assert.equal(q(".profile-popup") === null, true, "and the popup closes, so no two menus exist");
  await unmount();
});

test("the Match History icon survives in the Profile Popup menu", async () => {
  const unmount = await renderNavbar();
  await click(q(".avatar-button"));

  const item = qa(".profile-popup-item").find((n) => n.textContent.includes("Match History"));
  assert.ok(item.querySelector(".profile-popup-icon svg"), "the option keeps its icon");
  await unmount();
});

test("Return navigates back to the page the reader came from", async () => {
  const unmount = await renderPage(navbarUser(), "/games");

  await click(q(".mh-return"));

  assert.deepEqual(pushedPaths, ["/games"], "it returns to the recorded page, not a guess");
  assert.equal(pushedPaths.includes("__back__"), false, "and it does not rely on history.back()");
  await unmount();
});

test("Return restores the Profile Popup through a transient, once-only marker", async () => {
  // The Navbar and the page are mounted together, exactly as App mounts them.
  const unmount = await renderNavbarWithPage(navbarUser(), "/games");
  await click(q(".avatar-button"));
  assert.equal(q(".profile-popup") === null, false, "the popup starts open");

  await click(q(".mh-return"));

  // The return navigation is what brings the popup back, not a timer.
  assert.deepEqual(pushedPaths, ["/games"], "Return navigated back to the recorded page");
  assert.equal(q(".profile-popup") === null, false,
    "and the Profile Popup is restored, without a close-then-reopen wait");
  assert.match(q(".profile-popup").textContent, /Match History/, "in its normal state");
  assert.equal(q(".mh-return") === null, false, "and the page was not torn down by the navbar");
  await unmount();
});

test("the restored popup does not appear again on an unrelated navigation", async () => {
  const unmount = await renderNavbarWithPage(navbarUser(), "/games");
  await click(q(".mh-return"));
  assert.equal(q(".profile-popup") === null, false, "the popup came back once");

  // The reader dismisses the popup again, then navigates somewhere unrelated.
  await pointerDown(q(".mh-page-title"));
  assert.equal(q(".profile-popup") === null, true, "the popup was dismissed");

  await act(async () => {
    window.dispatchEvent(new window.Event("arcadia:navigate"));
  });

  assert.equal(q(".profile-popup") === null, true,
    "the marker was already consumed, so the popup stays dismissed");
  await unmount();
});

test("merely opening the page does not arm the reopen marker", async () => {
  const unmount = await renderPage();
  await act(async () => {});

  // Only an actual Return click may set it, so an ordinary visit cannot cause a
  // later, unrelated navigation to bring the popup back.
  assert.equal(navigation.consumeProfilePopupReopenRequest(), false,
    "opening the page leaves no marker behind");
  await unmount();
});

test("the reopen marker is transient and fires at most once", async () => {
  // Nothing is written to either store by the navigation bookkeeping.
  navigation.rememberReturningToProfilePopup();
  assert.equal(window.localStorage.length, 0, "no localStorage entry");
  assert.equal(window.sessionStorage.length, 0, "no sessionStorage entry");

  assert.equal(navigation.consumeProfilePopupReopenRequest(), true, "the first read gets it");
  assert.equal(
    navigation.consumeProfilePopupReopenRequest(),
    false,
    "a second read does not, so a later navigation cannot reopen it",
  );

  const source = await readFile(
    new URL("../src/lib/navigation.ts", import.meta.url),
    "utf8",
  );
  const markerBlock = source.slice(source.indexOf("let shouldReopenProfilePopup"));
  assert.doesNotMatch(markerBlock, /localStorage|sessionStorage/, "the marker is in memory only");
});

/* ==================================================================
   4. The three filters and Clear Filters
   ================================================================== */

test("the filter row has exactly the three filters and Clear Filters", async () => {
  const unmount = await renderPage();

  const labels = qa(".mhf-label").map((n) => n.textContent);
  assert.deepEqual(labels, ["Date", "Played with", "Result"], "the three filters");

  const buttons = qa(".mhf-actions button").map((n) => n.textContent);
  assert.deepEqual(buttons, ["Clear Filters"], "Clear Filters is the only button");

  // Apply is gone, with no layout space left behind for it.
  assert.equal(q(".mhf-apply") === null, true, "no Apply button");
  assert.equal(document.body.textContent.includes("Apply"), false, "and the word is nowhere");
  assert.doesNotMatch(await readFile(
    new URL("../src/pages/MatchHistory/MatchHistory.tsx", import.meta.url), "utf8",
  ), /mhf-apply/, "and no Apply class remains in the component");

  // Nothing else lives in the filter row.
  assert.equal(qa(".mhf-row button").length, 4, "three triggers plus Clear Filters");
  for (const name of ["Back", "Reset", "Load more"]) {
    assert.equal(qa(`.mhf-row button`).some((n) => n.textContent.includes(name)), false,
      `no ${name} button in the filter row`);
  }
  await unmount();
});

test("the custom dropdowns are themed, not native selects", async () => {
  const unmount = await renderPage();

  assert.equal(qa(".mhf-row select").length, 0, "no native select is used");
  const triggers = qa(".mhf-trigger");
  assert.equal(triggers.length, 3, "three custom dropdown triggers");

  for (const trigger of triggers) {
    assert.equal(trigger.tagName, "BUTTON", "each is a real button");
    assert.ok(trigger.getAttribute("aria-haspopup"), "that declares what it opens");
    assert.ok(trigger.getAttribute("aria-labelledby"), "and is labelled by its own text");
  }

  // The two list filters open a listbox; the Date control opens the calendar.
  assert.equal(q("#mh-filter-opponent").getAttribute("aria-haspopup"), "listbox");
  assert.equal(q("#mh-filter-result").getAttribute("aria-haspopup"), "listbox");
  assert.equal(q("#mh-filter-date").getAttribute("aria-haspopup"), "dialog",
    "and the Date control opens a dialog, the calendar");

  assert.equal(qa(".mhf-control-icon").length, 3, "each filter has an icon");
  assert.equal(qa(".mhf-trigger").filter((n) => n.className.includes("mhf-trigger--active")).length, 0,
    "no filter is active to begin with");
  await unmount();
});

test("Played with offers All, Arcadion, Online Friend and Local", async () => {
  const unmount = await renderPage();

  await click(q("#mh-filter-opponent"));
  const options = qa(".mhf-menu [role='option']").map((n) => n.textContent);
  assert.deepEqual(options, ["All", "Arcadion", "Online Friend", "Local Play"]);

  await click(qa(".mhf-menu [role='option']").find((n) => n.textContent === "Online Friend"));

  await click(q("#mh-filter-opponent"));
  assert.equal(
    qa(".mhf-menu [role='option']").find((n) => n.textContent === "Online Friend")
      .getAttribute("aria-selected"),
    "true",
    "the choice is marked as selected",
  );
  await unmount();
});

test("Played with filters on the stored opponent type, not on a display name", async () => {
  const unmount = await renderPage();

  for (const [label, expected] of [
    ["Arcadion", "ARCADION"],
    ["Online Friend", "ONLINE_FRIEND"],
    ["Local Play", "LOCAL"],
  ]) {
    await click(q("#mh-filter-opponent"));
    await click(qa(".mhf-menu [role='option']").find((n) => n.textContent === label));

    const last = matchHistoryCalls[matchHistoryCalls.length - 1];
    assert.equal(last.opponentType, expected, `${label} is sent as ${expected}`);
    assert.equal(last.opponentName, undefined, "never inferred from opponent text");
  }
  await unmount();
});

test("Result offers All, Win, Lost and Draw, and maps the labels to the stored values", async () => {
  const unmount = await renderPage();

  await click(q("#mh-filter-result"));
  const options = qa(".mhf-menu [role='option']").map((n) => n.textContent);
  assert.deepEqual(options, ["All", "Win", "Lost", "Draw"], "the reader-facing labels");

  await click(qa(".mhf-menu [role='option']").find((n) => n.textContent === "Draw"));

  // The label is "Draw" but the value that is filtered on is the stored DRAW.
  const last = matchHistoryCalls[matchHistoryCalls.length - 1];
  assert.equal(last.result, "DRAW", "Draw is sent as the stored DRAW");
  assert.equal(format.getResultLabel("DRAW"), "Draw", "and displayed as Draw");
  await unmount();
});

test("the Result filter sends the stored value for Win and Lost", async () => {
  const unmount = await renderPage();

  for (const [label, expected] of [["Win", "WIN"], ["Lost", "LOSS"]]) {
    await click(q("#mh-filter-result"));
    await click(qa(".mhf-menu [role='option']").find((n) => n.textContent === label));

    assert.equal(matchHistoryCalls[matchHistoryCalls.length - 1].result, expected);
  }
  await unmount();
});

test("an applied filter is shown as active", async () => {
  const unmount = await renderPage();

  await click(q("#mh-filter-result"));
  await click(qa(".mhf-menu [role='option']").find((n) => n.textContent === "Win"));

  assert.ok(
    q("#mh-filter-result").className.includes("mhf-trigger--active"),
    "the active filter is called out",
  );
  assert.match(q("#mh-filter-result").textContent, /Win/, "and shows the chosen value");
  await unmount();
});

test("Clear Filters resets all three and restores the full history", async () => {
  nextResponse = pageResponse([match()]);
  const unmount = await renderPage();

  await click(q("#mh-filter-result"));
  await click(qa(".mhf-menu [role='option']").find((n) => n.textContent === "Lost"));
  await click(q("#mh-filter-opponent"));
  await click(qa(".mhf-menu [role='option']").find((n) => n.textContent === "Local Play"));
  assert.ok(matchHistoryCalls[matchHistoryCalls.length - 1].result, "filters were applied");

  await click(q(".mhf-clear"));

  const last = matchHistoryCalls[matchHistoryCalls.length - 1];
  assert.equal(last.result, undefined, "the result filter is cleared");
  assert.equal(last.opponentType, undefined, "the opponent filter is cleared");
  assert.equal(last.from, undefined, "the date filter is cleared");
  assert.equal(last.to, undefined, "both date bounds are cleared");
  assert.equal(last.offset, 0, "and paging restarts at the newest match");

  assert.match(q("#mh-filter-result").textContent, /All/, "the control shows All again");
  assert.match(q("#mh-filter-opponent").textContent, /All/);
  assert.equal(qa(".mh-row").length, 1, "the full history is showing again");
  await unmount();
});

test("Clear Filters is disabled when there is nothing to clear", async () => {
  const unmount = await renderPage();
  assert.equal(q(".mhf-clear").disabled, true, "it starts disabled with no filters");

  await click(q("#mh-filter-result"));
  await click(qa(".mhf-menu [role='option']").find((n) => n.textContent === "Win"));
  assert.equal(q(".mhf-clear").disabled, false, "and becomes usable once a filter is chosen");
  await unmount();
});

/* ==================================================================
   5. The calendar
   ================================================================== */

test("the Date dropdown opens a calendar popover beneath it", async () => {
  const unmount = await renderPage();

  assert.equal(q(".mhc-popover") === null, true, "no calendar to begin with");
  await click(q("#mh-filter-date"));

  const popover = q(".mhc-popover");
  assert.ok(popover, "the calendar opened");
  assert.equal(popover.getAttribute("role"), "dialog", "as a dialog");
  assert.equal(q("#mh-filter-date").getAttribute("aria-expanded"), "true", "the trigger says so");

  // Beneath the dropdown, not beside it: the same positioned control.
  assert.ok(q(".mhf-control .mhc-popover"), "it is anchored inside the Date control");
  assert.equal(qa('.mh-filters input[type="date"]').length, 0, "there is no From/To input");
  await unmount();
});

test("the calendar shows visible month and year controls", async () => {
  const unmount = await renderPage();
  await click(q("#mh-filter-date"));

  assert.ok(q(".mhc-month"), "the month name is visible");
  assert.ok(q(".mhc-year"), "the year is visible");
  assert.match(q(".mhc-year").textContent, /^\d{4}$/, "as a four digit year");

  for (const label of ["Previous month", "Next month", "Previous year", "Next year"]) {
    assert.ok(qa(`.mhc-nav[aria-label="${label}"]`).length === 1, `${label} is a real control`);
  }
  assert.ok(q('button[aria-label="Close calendar"]'), "and there is a close control");
  await unmount();
});

test("month and year navigation moves through the months and respects the bounds", async () => {
  // The account was created in March 2024 and today is well past it.
  const unmount = await renderPage(navbarUser({ createdAt: "2024-03-15T08:00:00.000Z" }));
  await click(q("#mh-filter-date"));

  const today = format.getToday();
  assert.equal(q(".mhc-month").textContent, "March", "it opens on the account start month");
  assert.equal(q(".mhc-year").textContent, "2024");

  // Walking back to the earliest month and then past it.
  const totalMonths = (today.year - 2024) * 12 + (today.month - 3);
  for (let i = 0; i < totalMonths; i += 1) {
    await click(q('.mhc-nav[aria-label="Previous month"]'));
  }

  assert.equal(q(".mhc-month").textContent, "March", "it reaches the account creation month");
  assert.equal(q(".mhc-year").textContent, "2024");
  assert.equal(q('.mhc-nav[aria-label="Previous month"]').disabled, true,
    "and cannot go before it");

  // Forward again: the current month is reachable, and it is NOT the last one.
  for (let i = 0; i < totalMonths; i += 1) {
    await click(q('.mhc-nav[aria-label="Next month"]'));
  }
  assert.equal(q(".mhc-month").textContent, format.MONTH_NAMES[today.month - 1],
    "it reaches the current month again");
  assert.equal(q('.mhc-nav[aria-label="Next month"]').disabled, false,
    "and forward navigation is not clamped there");
  await unmount();
});

test("year buttons jump a year at a time and are clamped behind only", async () => {
  const unmount = await renderPage(navbarUser({ createdAt: "2024-03-15T08:00:00.000Z" }));
  await click(q("#mh-filter-date"));

  // The calendar opens on the account start month, where the back controls
  // are clamped: step forward first so a backward step can be measured.
  await click(q('.mhc-nav[aria-label="Next year"]'));
  const startYear = Number(q(".mhc-year").textContent);
  await click(q('.mhc-nav[aria-label="Previous year"]'));
  assert.equal(Number(q(".mhc-year").textContent), startYear - 1, "it steps back a year");

  // The year button is clamped at the account's creation year.
  for (let i = 0; i < 40; i += 1) {
    const button = q('.mhc-nav[aria-label="Previous year"]');
    if (button.disabled) break;
    await click(button);
  }
  assert.equal(q(".mhc-year").textContent, "2024", "it never goes before the account existed");

  // Forward a year is never clamped: future years stay navigable.
  for (let i = 0; i < 40; i += 1) {
    const button = q('.mhc-nav[aria-label="Next year"]');
    if (button.disabled) break;
    await click(button);
  }
  assert.ok(Number(q(".mhc-year").textContent) > 2024, "it steps forward through the years");
  assert.equal(q('.mhc-nav[aria-label="Next year"]').disabled, false,
    "and the control stays enabled");
  await unmount();
});

test("the keyboard can change month from the grid", async () => {
  const unmount = await renderPage();
  await click(q("#mh-filter-date"));

  // The calendar opens on the account start month, so ArrowLeft is clamped there.
  const startMonth = q(".mhc-month").textContent;
  await pressKey(q(".mhc-grid"), "ArrowLeft");
  assert.equal(q(".mhc-month").textContent, startMonth, "ArrowLeft cannot leave the start month");

  await pressKey(q(".mhc-grid"), "ArrowRight");
  assert.notEqual(q(".mhc-month").textContent, startMonth, "ArrowRight moves a month forward");

  await pressKey(q(".mhc-grid"), "ArrowLeft");
  assert.equal(q(".mhc-month").textContent, startMonth, "and ArrowLeft returns to it");
  await unmount();
});

test("dates before account creation and in the future are disabled", async () => {
  // The account was created earlier this month, so the calendar opens on the
  // current month and the days before the start day are out of bounds.
  const now = format.getToday();
  const unmount = await renderPage(navbarUser({
    createdAt: new Date(now.year, now.month - 1, 1, 8).toISOString(),
  }));
  await click(q("#mh-filter-date"));

  assert.equal(q(".mhc-month").textContent, format.MONTH_NAMES[now.month - 1],
    "it opens on the account start month, which is this one");

  const daysInMonth = format.getDaysInMonth(now.year, now.month);
  const cells = qa(".mhc-day").filter((n) => !n.className.includes("blank"));

  // Every real day of the month is rendered exactly once.
  assert.equal(cells.length, daysInMonth, `all ${daysInMonth} days are rendered`);

  const byDay = (day) => {
    const found = cells.filter((n) => n.textContent === String(day));
    assert.equal(found.length, 1, `day ${day} is rendered once`);
    return found[0];
  };

  for (let day = 1; day <= daysInMonth; day += 1) {
    const cell = byDay(day);
    if (day > now.day) {
      assert.equal(cell.disabled, true, `${day} of this month is in the future`);
    } else {
      assert.equal(cell.disabled, false, `${day} of this month is selectable`);
    }
  }
  await unmount();
});

test("a month before the account was created cannot be reached at all", async () => {
  // The account was created this month, so the calendar cannot go back past it.
  const now = format.getToday();
  const unmount = await renderPage(navbarUser({
    createdAt: new Date(now.year, now.month - 1, 15, 8).toISOString(),
  }));
  await click(q("#mh-filter-date"));

  assert.equal(
    q('.mhc-nav[aria-label="Previous month"]').disabled,
    true,
    "the creation month is the earliest, so it cannot go before",
  );
  assert.equal(q(".mhc-month").textContent, format.MONTH_NAMES[now.month - 1],
    "and it opens on the current month");
  await unmount();
});

/* ==================================================================
   Account start bounds, future navigation and the range label
   ================================================================== */

test("the calendar opens on the account start month and cannot navigate before it", async () => {
  const unmount = await renderPage(navbarUser({ createdAt: "2024-03-15T08:00:00.000Z" }));
  await click(q("#mh-filter-date"));

  assert.equal(q(".mhc-month").textContent, "March", "it opens on the account start month");
  assert.equal(q(".mhc-year").textContent, "2024", "and start year");
  assert.equal(q('.mhc-nav[aria-label="Previous month"]').disabled, true,
    "the month before the account existed is unreachable");
  assert.equal(q('.mhc-nav[aria-label="Previous year"]').disabled, true,
    "and so is the year before");

  // Days before the exact start day in the start month are disabled too.
  const cells = qa(".mhc-day").filter((n) => !n.className.includes("blank"));
  assert.equal(cells.length, 31, "the whole start month is rendered");
  for (const cell of cells) {
    const day = Number(cell.textContent);
    assert.equal(cell.disabled, day < 15,
      `March ${day} is ${day < 15 ? "before the account existed" : "selectable"}`);
  }
  await unmount();
});

test("the start month disables every day before the exact start day", async () => {
  // The account was created on the 25th of last month, so days 1–24 of that
  // month predate the account, while the 25th onward are all in the past.
  const now = format.getToday();
  const unmount = await renderPage(navbarUser({
    createdAt: new Date(now.year, now.month - 2, 25, 12).toISOString(),
  }));
  await click(q("#mh-filter-date"));

  const startMonth = new Date(now.year, now.month - 2, 1);
  const startYear = startMonth.getFullYear();
  const startMonthNumber = startMonth.getMonth() + 1;
  assert.equal(q(".mhc-month").textContent, format.MONTH_NAMES[startMonthNumber - 1],
    "it opens on the account start month");
  assert.equal(q(".mhc-year").textContent, String(startYear));

  const daysInStartMonth = format.getDaysInMonth(startYear, startMonthNumber);
  const cells = qa(".mhc-day").filter((n) => !n.className.includes("blank"));
  assert.equal(cells.length, daysInStartMonth, "the whole start month is rendered");
  for (const cell of cells) {
    const day = Number(cell.textContent);
    assert.equal(cell.disabled, day < 25,
      `day ${day} is ${day < 25 ? "before the account existed" : "selectable"}`);
  }
  await unmount();
});

test("future months and years stay navigable, with every day disabled until it arrives", async () => {
  const unmount = await renderPage(navbarUser({ createdAt: "2024-03-15T08:00:00.000Z" }));
  await click(q("#mh-filter-date"));

  const today = format.getToday();

  // Walk forward past the current month: two months beyond today.
  const totalMonths = (today.year - 2024) * 12 + (today.month - 3) + 2;
  for (let i = 0; i < totalMonths; i += 1) {
    await click(q('.mhc-nav[aria-label="Next month"]'));
  }

  const viewMonth = today.month + 2 > 12 ? today.month - 10 : today.month + 2;
  const viewYear = today.month + 2 > 12 ? today.year + 1 : today.year;
  assert.equal(q(".mhc-month").textContent, format.MONTH_NAMES[viewMonth - 1],
    "it reached a future month");
  assert.equal(q(".mhc-year").textContent, String(viewYear));
  assert.equal(q('.mhc-nav[aria-label="Next month"]').disabled, false,
    "and forward navigation is never clamped");

  // That future month is fully rendered, with every day disabled.
  const cells = qa(".mhc-day").filter((n) => !n.className.includes("blank"));
  assert.equal(cells.length, format.getDaysInMonth(viewYear, viewMonth),
    "the future month is not hidden");
  for (const cell of cells) {
    assert.equal(cell.disabled, true, `${cell.textContent} is in the future`);
  }

  // Stepping forward a year works too, and is not clamped either.
  await click(q('.mhc-nav[aria-label="Next year"]'));
  assert.equal(Number(q(".mhc-year").textContent), viewYear + 1, "it stepped another year ahead");
  assert.equal(q('.mhc-nav[aria-label="Next year"]').disabled, false, "and stays enabled");
  await unmount();
});

test("the range label shows the account start date through today", async () => {
  const now = format.getToday();
  const created = new Date(now.year, now.month - 2, 25, 12).toISOString();
  const unmount = await renderPage(navbarUser({ createdAt: created }));
  await click(q("#mh-filter-date"));

  const expected = format.formatRangeLabel(format.getEarliestDate(created), now);
  const label = q(".mhc-range");
  assert.ok(label, "the range label is rendered");
  assert.equal(label.textContent, expected, "it runs from the account start day through today");

  // It is a quiet line inside the popover, above the day grid — not a card.
  assert.equal(label.tagName, "P", "it is a plain paragraph");
  assert.ok(q(".mhc-popover .mhc-range"), "inside the calendar");
  const popoverChildren = [...q(".mhc-popover").children].map((n) => n.className);
  assert.ok(popoverChildren.indexOf("mhc-range") < popoverChildren.indexOf("mhc-grid"),
    "and it sits above the day grid");
  await unmount();
});

test("disabled days show no prohibited cursor and no red indicator", async () => {
  const calCss = await readFile(
    new URL("../src/pages/MatchHistory/MatchHistoryCalendar.css", import.meta.url),
    "utf8",
  );
  const rules = calCss.replace(/\/\*[\s\S]*?\*\//g, "");
  const block = cssBlock(rules, ".mhc-day--disabled");

  // The normal default cursor, on the day itself and therefore on hover too:
  // no hover rule may apply to a disabled day.
  assert.match(block, /cursor:\s*default/, "the cursor is the normal default");
  assert.doesNotMatch(block, /not-allowed/, "never the prohibited cursor");
  assert.doesNotMatch(block, /rgb\(2\d\d|#e[0-9a-f]{5}|red/i, "and no red indicator");

  assert.match(rules, /\.mhc-day:hover:not\(:disabled\)\s*\{[^}]*background/,
    "the hover fill rule is scoped to enabled days only");
});

/* ==================================================================
   Calendar reveal scroll
   ================================================================== */

/**
 * Stubs the layout-dependent APIs the calendar's reveal scroll uses, so a
 * test can place the popover anywhere in the viewport and record the scroll.
 *
 * jsdom neither lays out nor scrolls anything, so the popover's rect is fixed
 * at the given bottom edge, window.scrollBy is replaced with a recorder and
 * window.matchMedia (which jsdom does not implement) with a mock.
 */
function stubCalendarLayout({ bottom, reducedMotion = false }) {
  const originalRect = window.Element.prototype.getBoundingClientRect;
  const originalScrollBy = window.scrollBy;
  const hadMatchMedia = "matchMedia" in window;
  const originalMatchMedia = window.matchMedia;
  const scrollCalls = [];

  window.Element.prototype.getBoundingClientRect = function () {
    return {
      x: 0, y: 0, left: 0, right: 0, top: 0,
      bottom, width: 300, height: bottom,
      toJSON() { return this; },
    };
  };
  window.scrollBy = (options) => { scrollCalls.push(options); };
  window.matchMedia = () => ({ matches: reducedMotion });

  return {
    scrollCalls,
    restore() {
      window.Element.prototype.getBoundingClientRect = originalRect;
      window.scrollBy = originalScrollBy;
      if (hadMatchMedia) {
        window.matchMedia = originalMatchMedia;
      } else {
        delete window.matchMedia;
      }
    },
  };
}

test("opening the calendar scrolls it into view when it hangs below the viewport", async () => {
  const unmount = await renderPage();
  // The popover bottom sits 100px below the viewport's lower edge.
  const stub = stubCalendarLayout({ bottom: window.innerHeight + 100 });

  try {
    await press(q("#mh-filter-date"));

    assert.equal(stub.scrollCalls.length, 1, "it scrolled exactly once");
    assert.deepEqual(stub.scrollCalls[0], { top: 106, behavior: "smooth" },
      "by exactly what was needed to leave 6px below the calendar");
  } finally {
    stub.restore();
  }
  await unmount();
});

test("a partially clipped calendar scrolls by exactly the clipped amount", async () => {
  const unmount = await renderPage();
  const stub = stubCalendarLayout({ bottom: window.innerHeight + 40 });

  try {
    await press(q("#mh-filter-date"));

    assert.deepEqual(stub.scrollCalls, [{ top: 46, behavior: "smooth" }]);
  } finally {
    stub.restore();
  }
  await unmount();
});

test("the calendar does not scroll when it already has 6px of space below it", async () => {
  const unmount = await renderPage();
  // Exactly 6px of space below the popover: the reveal margin, so no scroll.
  const stub = stubCalendarLayout({ bottom: window.innerHeight - 6 });

  try {
    await press(q("#mh-filter-date"));

    assert.equal(stub.scrollCalls.length, 0, "no scroll was needed");
  } finally {
    stub.restore();
  }
  await unmount();
});

test("the reveal scroll is instant when the reader prefers reduced motion", async () => {
  const unmount = await renderPage();
  const stub = stubCalendarLayout({ bottom: window.innerHeight + 100, reducedMotion: true });

  try {
    await press(q("#mh-filter-date"));

    assert.deepEqual(stub.scrollCalls, [{ top: 106, behavior: "instant" }]);
  } finally {
    stub.restore();
  }
  await unmount();
});

test("the reveal scroll does not close the calendar or block selection", async () => {
  const unmount = await renderPage();
  const stub = stubCalendarLayout({ bottom: window.innerHeight + 100 });

  try {
    await press(q("#mh-filter-date"));
    assert.ok(q(".mhc-popover") !== null, "the calendar stayed open");

    // The default account started 15 March 2024, so the 20th is selectable.
    const before = matchHistoryCalls.length;
    await press(qa(".mhc-day").find((n) => !n.disabled && n.textContent === "20"));
    assert.equal(matchHistoryCalls.length, before + 1, "a day can still be chosen");
    assert.equal(q(".mhc-popover") === null, true, "and choosing it closes the calendar");
  } finally {
    stub.restore();
  }
  await unmount();
});

test("a short document is padded so the reveal scroll can reach the calendar", async () => {
  const unmount = await renderPage();
  // jsdom's scrollHeight is 0, so the document is always "too short" here:
  // the reveal must pad the body by the shortfall rather than leave the
  // calendar clipped.
  const stub = stubCalendarLayout({ bottom: window.innerHeight + 100 });

  try {
    await press(q("#mh-filter-date"));

    assert.deepEqual(stub.scrollCalls, [{ top: 106, behavior: "smooth" }]);
    assert.equal(document.body.style.paddingBottom, `${window.innerHeight + 106}px`,
      "the body was padded by exactly the shortfall");
  } finally {
    stub.restore();
  }
  await unmount();
});

test("the reveal scroll does not pad the document when it can already reach", async () => {
  const unmount = await renderPage();
  const stub = stubCalendarLayout({ bottom: window.innerHeight + 100 });
  // Simulate a document tall enough to scroll the full amount.
  Object.defineProperty(document.documentElement, "scrollHeight", {
    value: window.innerHeight * 3,
    configurable: true,
  });

  try {
    await press(q("#mh-filter-date"));

    assert.deepEqual(stub.scrollCalls, [{ top: 106, behavior: "smooth" }]);
    assert.equal(document.body.style.paddingBottom, "", "no padding was needed");
  } finally {
    delete document.documentElement.scrollHeight;
    stub.restore();
  }
  await unmount();
});



test("Escape dismisses the calendar without applying", async () => {
  const unmount = await renderPage();
  await click(q("#mh-filter-date"));
  const before = matchHistoryCalls.length;

  await act(async () => {
    document.dispatchEvent(new window.KeyboardEvent("keydown", {
      key: "Escape", bubbles: true, cancelable: true,
    }));
  });

  assert.equal(q(".mhc-popover") === null, true, "Escape closes it");
  assert.equal(matchHistoryCalls.length, before, "and applies nothing");
  await unmount();
});

test("a click outside the calendar dismisses it", async () => {
  const unmount = await renderPage();
  await click(q("#mh-filter-date"));

  await pointerDown(q(".mh-page-title"));
  assert.equal(q(".mhc-popover") === null, true, "an outside press closes it");
  await unmount();
});

/* ==================================================================
   6. Date range filtering
   ================================================================== */



test("the whole end date is included on the server, including its last moment", async () => {
  // Read straight from the real service so the boundary itself is pinned.
  const { readFileSync } = await import("node:fs");
  const servicePath = fileURLToPath(
    new URL("../../backend/services/matchHistoryService.js", import.meta.url),
  );
  const source = readFileSync(servicePath, "utf8");

  assert.match(source, /endOfDay/, "the end date is resolved as a whole day");
  assert.match(
    source,
    /MILLISECONDS_PER_DAY\s*-\s*1/,
    "and runs to its final millisecond, so a late match is not dropped",
  );
});

test("there are no From and To inputs in the filter row", async () => {
  const unmount = await renderPage();
  assert.equal(qa('input[type="date"]').length, 0, "no date inputs at all");
  assert.equal(qa(".mh-filters").length, 0, "the old filter block is gone");
  await unmount();
});

/* ==================================================================
   7. All three filters together
   ================================================================== */

test("all three filters are sent as one request", async () => {
  const unmount = await renderPage();
  await chooseDay(20);

  await click(q("#mh-filter-opponent"));
  await click(qa(".mhf-menu [role='option']").find((n) => n.textContent === "Local Play"));
  await click(q("#mh-filter-result"));
  await click(qa(".mhf-menu [role='option']").find((n) => n.textContent === "Draw"));

  const last = matchHistoryCalls[matchHistoryCalls.length - 1];
  assert.equal(last.opponentType, "LOCAL", "the opponent type is included");
  assert.equal(last.result, "DRAW", "the result is included");
  assert.ok(last.from && last.to, "and so is the date range");
  assert.equal(matchHistoryCalls.length, 4,
    "one request on load plus one per change, each carrying the combined filters");
  await unmount();
});


/* ==================================================================
   8. The list
   ================================================================== */

test("a completed match shows game, played with, result and local date", async () => {
  nextResponse = pageResponse([match({
    game: "ludo",
    opponentType: "ONLINE_FRIEND",
    opponentName: "Ravi",
    result: "DRAW",
    completedAt: "2026-03-05T20:15:00.000Z",
    durationMinutes: 12,
  })]);

  const unmount = await renderPage();
  const row = q(".mh-row");

  assert.equal(row.querySelector('[data-field="game"]').textContent, "ludo");
  assert.equal(
    row.querySelector('[data-field="opponentType"]').textContent,
    "Played with: Online Friend",
  );
  assert.equal(row.querySelector('[data-field="result"]').textContent, "Draw",
    "a stored DRAW is shown as Draw");
  assert.ok(row.querySelector("time").textContent.length > 0, "the date and time are shown");
  assert.ok(row.className.includes("mh-row--draw"), "and it is styled as a tie");
  await unmount();
});

test("the three opponent kinds use their own labels and are never mixed up", async () => {
  nextResponse = pageResponse([
    match({ matchId: "a".repeat(24), opponentType: "ARCADION", result: "WIN" }),
    match({ matchId: "b".repeat(24), opponentType: "ONLINE_FRIEND", opponentName: "Sam", result: "LOSS" }),
    match({ matchId: "c".repeat(24), opponentType: "LOCAL", opponentName: "Guest", result: "DRAW" }),
  ]);

  const unmount = await renderPage();
  const labels = qa('[data-field="opponentType"]').map((n) => n.textContent);

  assert.deepEqual(labels, [
    "Played with: Arcadion",
    "Played with: Online Friend",
    "Played with: Local Play",
  ]);
  assert.equal(labels.filter((l) => l === "Played with: Arcadion").length, 1,
    "a human or local match is never reported as Arcadion");
  await unmount();
});

test("each result is visually distinct and accessibly labelled", async () => {
  nextResponse = pageResponse([
    match({ matchId: "a".repeat(24), result: "WIN" }),
    match({ matchId: "b".repeat(24), result: "LOSS" }),
    match({ matchId: "c".repeat(24), result: "DRAW" }),
  ]);

  const unmount = await renderPage();
  const results = qa('[data-field="result"]');

  assert.deepEqual(results.map((n) => n.textContent), ["Win", "Lost", "Draw"]);
  assert.deepEqual(
    results.map((n) => n.className),
    ["mh-result mh-result--win", "mh-result mh-result--loss", "mh-result mh-result--draw"],
    "each result has its own styling",
  );
  await unmount();
});

test("an opponent name is shown only when one exists", async () => {
  nextResponse = pageResponse([
    match({ matchId: "a".repeat(24), opponentName: null }),
    match({ matchId: "b".repeat(24), opponentName: "Ravi" }),
  ]);

  const unmount = await renderPage();
  const rows = qa(".mh-row");
  assert.equal(rows[0].querySelector(".mh-row-opponent-name") === null, true,
    "no name is invented for an Arcadion match");
  assert.equal(rows[1].querySelector(".mh-row-opponent-name").textContent, "vs Ravi");
  await unmount();
});

test("the list renders newest first, in the order the backend returned", async () => {
  nextResponse = pageResponse([
    match({ matchId: "c".repeat(24), game: "newest", completedAt: "2026-06-20T18:30:00.000Z" }),
    match({ matchId: "b".repeat(24), game: "middle", completedAt: "2026-03-05T20:15:00.000Z" }),
    match({ matchId: "a".repeat(24), game: "oldest", completedAt: "2026-01-10T09:00:00.000Z" }),
  ]);

  const unmount = await renderPage();
  assert.deepEqual(
    qa('[data-field="game"]').map((n) => n.textContent),
    ["newest", "middle", "oldest"],
    "newest at the top, oldest at the bottom",
  );
  await unmount();
});

test("a filtered list stays newest first", async () => {
  nextResponse = pageResponse([
    match({ matchId: "c".repeat(24), game: "newest", completedAt: "2026-06-20T18:30:00.000Z" }),
    match({ matchId: "a".repeat(24), game: "oldest", completedAt: "2026-01-10T09:00:00.000Z" }),
  ]);

  const unmount = await renderPage();
  await click(q("#mh-filter-opponent"));
  await click(qa(".mhf-menu [role='option']").find((n) => n.textContent === "Arcadion"));

  const dates = qa(".mh-row time").map((n) => n.getAttribute("dateTime"));
  assert.deepEqual(dates, [...dates].sort().reverse(), "still newest first after filtering");
  await unmount();
});

test("no private field ever reaches the list", async () => {
  nextResponse = pageResponse([match()]);
  const unmount = await renderPage();

  const text = q(".mh-section").textContent;
  for (const forbidden of [/user@example\.com/, /@/, /Bearer/i, /password/i, /ObjectId/i]) {
    assert.doesNotMatch(text, forbidden, `no ${forbidden} is rendered`);
  }

  const source = await readFile(
    new URL("../src/pages/MatchHistory/MatchHistory.tsx", import.meta.url),
    "utf8",
  );
  // The page reads the public record only.
  assert.doesNotMatch(source, /match\._id|match\.userId/, "it never reaches for a private field");
  await unmount();
});

/* ==================================================================
   9. Paging, so nothing is silently omitted
   ================================================================== */

test("the page says how much is loaded and loads the rest on request", async () => {
  const firstPage = Array.from({ length: 25 }, (_, index) => match({
    matchId: String(index).padStart(24, "0"),
    game: `m${index}`,
    completedAt: new Date(Date.UTC(2026, 5, 20, 0, index)).toISOString(),
  }));
  nextResponse = pageResponse(firstPage, { total: 31, hasMore: true });

  const unmount = await renderPage();

  assert.equal(qa(".mh-row").length, 25, "the first page is shown");
  assert.match(q(".mh-section-count").textContent, /newest 25 of 31/i,
    "and the count is honest about what is loaded");
  assert.match(q(".mh-more-note").textContent, /25 of 31/, "with a plain note too");
  assert.ok(q(".mh-load-more"), "and a control to get the rest");

  // The next page appends rather than replacing.
  const older = [match({ matchId: "z".repeat(24), game: "older" })];
  nextResponse = pageResponse(older, { total: 31, offset: 25, hasMore: false });
  await click(q(".mh-load-more"));

  assert.equal(qa(".mh-row").length, 26, "the next page is appended");
  assert.equal(matchHistoryCalls[matchHistoryCalls.length - 1].offset, 25,
    "it asked for the records after the ones it had");
  assert.equal(q(".mh-load-more") === null, true, "and there is nothing more to load");
  assert.match(q(".mh-section-count").textContent, /31 matches/, "so the full total is shown");
  await unmount();
});

test("a complete history is never described as a page", async () => {
  nextResponse = pageResponse([match()], { total: 1, hasMore: false });
  const unmount = await renderPage();
  assert.match(q(".mh-section-count").textContent, /^1 match$/, "a single match reads as one");
  assert.equal(q(".mh-more") === null, true, "and there is no paging control at all");
  await unmount();
});

/* ==================================================================
   10. Loading, empty, filtered empty, error and retry
   ================================================================== */

test("a loading state is shown while fetching, with no fabricated rows", async () => {
  let release;
  authApi.getMatchHistory = () => new Promise((resolve) => {
    matchHistoryCalls.push({});
    release = () => resolve(emptyResponse());
  });

  const unmount = await renderPage();

  assert.match(q(".mh-section").textContent, /Loading match history/, "a loading state is shown");
  assert.equal(qa(".mh-row").length, 0, "and no invented rows appear");
  assert.ok(q(".mh-spinner"), "with a compact indicator");

  await act(async () => { release(); });
  await unmount();
});

test("an account with no completed matches sees the empty state", async () => {
  const unmount = await renderPage();
  const text = q(".mh-section").textContent;

  assert.match(text, /No matches yet/, "the heading is right");
  assert.match(text, /Your completed games will appear here/, "with the expected sentence");
  assert.equal(qa(".mh-row").length, 0, "no rows are invented");
  await unmount();
});

test("filters that match nothing give a distinct message", async () => {
  const unmount = await renderPage();

  await click(q("#mh-filter-result"));
  await click(qa(".mhf-menu [role='option']").find((n) => n.textContent === "Lost"));

  const text = q(".mh-section").textContent;
  assert.match(text, /No matches found/, "the filtered empty state is distinct");
  assert.match(text, /Try adjusting or clearing your filters/, "and says what to do");
  assert.doesNotMatch(text, /Your completed games will appear here/,
    "it does not claim there are no matches at all");
  assert.ok(q(".mh-section .mh-retry"), "and it offers to clear the filters");
  await unmount();
});

test("a failure is reported safely and Retry refetches", async () => {
  const { AuthApiError } = await vite.ssrLoadModule("/src/auth/authApi.ts");
  nextError = new AuthApiError("We could not reach the server", 500);

  const unmount = await renderPage();
  const text = q(".mh-section").textContent;

  assert.match(text, /could not load your match history/i, "a friendly message is shown");
  assert.match(text, /We could not reach the server/, "with the server's safe message");
  assert.doesNotMatch(text, /stack|Mongo|ObjectId|at Object|\.js:\d+|node_modules/i,
    "no stack trace or internal error is exposed");
  assert.equal(qa(".mh-row").length, 0, "no rows are shown after a failure");

  nextError = null;
  nextResponse = pageResponse([match()]);
  const before = matchHistoryCalls.length;
  await click(q(".mh-section .mh-retry"));

  assert.ok(matchHistoryCalls.length > before, "retrying refetches");
  assert.equal(qa(".mh-row").length, 1, "and the list renders");
  await unmount();
});

/* ==================================================================
   11. Dates
   ================================================================== */

test("a missing or invalid timestamp never renders Invalid Date", () => {
  for (const value of ["", "   ", null, undefined, "not-a-date", "2026-13-45T99:99:99Z"]) {
    assert.equal(format.formatCompletedAt(value), "—",
      `${JSON.stringify(value)} becomes the neutral placeholder`);
  }
  assert.doesNotMatch(format.formatCompletedAt("2026-06-20T18:30:00.000Z"), /Invalid|NaN|undefined/);
});

test("dates render in the reader's own timezone", () => {
  const iso = "2026-06-20T18:30:00.000Z";
  const date = new Date(iso);
  const expected = `${date.getDate()} ${format.MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;

  assert.ok(format.formatCompletedAt(iso).startsWith(expected), "the day is the reader's own");
  assert.match(format.formatCompletedAt(iso), / at \d{2}:\d{2}$/, "and the time is shown");
});

test("a record with a bad timestamp still renders a safe row", async () => {
  nextResponse = pageResponse([match({ completedAt: "not-a-real-date" })]);
  const unmount = await renderPage();

  assert.equal(qa(".mh-row").length, 1, "the row still renders");
  assert.doesNotMatch(q(".mh-list").textContent, /Invalid Date/, "with no Invalid Date");
  await unmount();
});

/* ==================================================================
   12. Calendar arithmetic, pinned directly
   ================================================================== */

test("leap years and month lengths are handled", () => {
  assert.equal(format.getDaysInMonth(2024, 2), 29, "2024 is a leap year");
  assert.equal(format.getDaysInMonth(2025, 2), 28, "2025 is not");
  assert.equal(format.getDaysInMonth(2000, 2), 29, "2000 is a leap year");
  assert.equal(format.getDaysInMonth(1900, 2), 28, "1900 is not, despite being divisible by 4");
  assert.equal(format.getDaysInMonth(2026, 1), 31, "January has 31");
  assert.equal(format.getDaysInMonth(2026, 4), 30, "April has 30");

  assert.equal(format.isRealCalendarDate({ year: 2026, month: 2, day: 29 }), false,
    "29 February 2026 does not exist");
  assert.equal(format.isRealCalendarDate({ year: 2024, month: 2, day: 29 }), true,
    "but it does in 2024");
  assert.equal(format.isRealCalendarDate({ year: 2026, month: 13, day: 1 }), false);
  assert.equal(format.isRealCalendarDate({ year: 2026, month: 0, day: 1 }), false);
  assert.equal(format.isRealCalendarDate({ year: 2026, month: 1, day: 0 }), false);
});

test("the calendar grid puts every day on its real weekday", () => {
  // 1 March 2026 is a Sunday, so a Monday-first grid starts it in column 6.
  const grid = format.getMonthGrid({ year: 2026, month: 3 });
  const firstIndex = grid.findIndex((cell) => cell?.day === 1);
  assert.equal(firstIndex, 6, "1 March 2026 sits in the seventh Monday-first column");

  const days = grid.filter(Boolean);
  assert.equal(days.length, 31, "March 2026 has 31 cells");
  assert.equal(days[0].day, 1, "starting at the 1st");
  assert.equal(days[days.length - 1].day, 31, "and ending at the 31st");
  // The grid is a whole number of weeks, so no row is left ragged.
  assert.equal(grid.length % 7, 0, "the grid is a whole number of weeks");
});

test("a calendar date is a plain calendar value, never an instant", async () => {
  // This is what stops a negative UTC offset shifting a chosen day.
  const date = { year: 2026, month: 7, day: 10 };
  assert.equal(format.toCalendarDateString(date), "2026-07-10");
  assert.deepEqual(format.parseCalendarDateString("2026-07-10"), date);

  assert.equal(format.parseCalendarDateString("2026-7-10"), null, "a loose shape is rejected");
  assert.equal(format.parseCalendarDateString("2026-02-31"), null, "a rolled date is rejected");
  assert.equal(format.parseCalendarDateString(""), null, "an empty string is rejected");

  // Only the SIGN is part of the contract, since that is all callers compare.
  assert.ok(
    format.compareCalendarDates({ year: 2026, month: 1, day: 2 }, { year: 2026, month: 1, day: 10 }) < 0,
    "an earlier day sorts first",
  );
  assert.ok(
    format.compareCalendarDates({ year: 2026, month: 2, day: 1 }, { year: 2026, month: 1, day: 31 }) > 0,
    "a later month sorts after",
  );
  assert.equal(
    format.compareCalendarDates({ year: 2026, month: 1, day: 2 }, { year: 2026, month: 1, day: 2 }),
    0,
    "the same day compares equal",
  );

  // The ordering is a plain comparison of three numbers, so it cannot be
  // influenced by any timezone conversion at all.
  const source = await readFile(
    new URL("../src/pages/MatchHistory/matchHistoryFormat.ts", import.meta.url),
    "utf8",
  );
  const compare = source.slice(
    source.indexOf("export function compareCalendarDates"),
    source.indexOf("export function isSameCalendarDate"),
  );
  assert.doesNotMatch(compare, /new Date|Date\.UTC|getTime/, "no instant is involved in the comparison");
});

test("the earliest month comes from the real account creation date", () => {
  const fromAccount = format.getEarliestMonth("2024-03-15T08:00:00.000Z");
  const created = new Date("2024-03-15T08:00:00.000Z");
  assert.equal(fromAccount.year, created.getFullYear(), "the year is the account's");
  assert.equal(fromAccount.month, created.getMonth() + 1, "and so is the month");
  assert.equal(fromAccount.day, 1, "clamped to the first of that month");

  // With no creation date the calendar still works, falling back to this month.
  const fallback = format.getEarliestMonth(null);
  const today = format.getToday();
  assert.equal(fallback.year, today.year);
  assert.equal(fallback.month, today.month);
});

test("the earliest date keeps the account's exact start day", () => {
  // Built from a local noon, so the calendar day is the same in any timezone.
  const fromAccount = format.getEarliestDate(new Date(2026, 8, 25, 12).toISOString());
  assert.deepEqual(fromAccount, { year: 2026, month: 9, day: 25 },
    "the exact start day is kept, not clamped to the first");

  // With no creation date the calendar still works, falling back to this month.
  const fallback = format.getEarliestDate(null);
  const today = format.getToday();
  assert.equal(fallback.year, today.year);
  assert.equal(fallback.month, today.month);
  assert.equal(fallback.day, 1, "the fallback is still the first of this month");
});

test("the range label reads the start day through today", () => {
  assert.equal(
    format.formatRangeLabel({ year: 2026, month: 9, day: 25 }, { year: 2026, month: 9, day: 28 }),
    "25 Sept 2026 – 28 Sept 2026",
    "a same-month range",
  );
  assert.equal(
    format.formatRangeLabel({ year: 2024, month: 3, day: 15 }, { year: 2026, month: 9, day: 28 }),
    "15 Mar 2024 – 28 Sept 2026",
    "a range spanning years",
  );
  assert.equal(
    format.formatRangeLabel({ year: 2026, month: 12, day: 31 }, { year: 2027, month: 1, day: 1 }),
    "31 Dec 2026 – 1 Jan 2027",
    "a range across the year boundary",
  );
});


/* ==================================================================
   13. The Profile Popup arrow
   ================================================================== */

test("the Profile Popup no longer draws the dark arrow", async () => {
  const css = await readFile(
    new URL("../src/components/ProfilePopupmodal.css", import.meta.url),
    "utf8",
  );

  // Comments are stripped first: this file documents the removed rule, and the
  // assertion is about what the stylesheet still RENDERS, not about prose.
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(rules, /\.profile-popup::before/, "the caret rule is gone");
  assert.doesNotMatch(rules, /rotate\(45deg\)/, "and so is the rotated square it made");
  assert.doesNotMatch(rules, /#2a1440/i, "including its flat dark fill");

  // A pseudo-element cannot be seen in markup, so it is asserted through the
  // stylesheet, which is where the arrow actually lived.
  const unmount = await renderNavbar();
  await click(q(".avatar-button"));

  assert.equal(q(".profile-popup") === null, false, "the popup itself is still rendered");
  assert.ok(qa(".profile-popup-item").length > 0, "and its menu options are still there");
  assert.equal(qa(".profile-popup").length, 1, "there is exactly one popup, not a duplicate");
  await unmount();
});

test("removing the arrow left the popup's controls intact", async () => {
  const unmount = await renderNavbar();
  await click(q(".avatar-button"));

  const labels = qa(".profile-popup-item").map((n) => n.textContent);
  assert.deepEqual(
    labels,
    ["My Profile", "Leaderboards", "Match History", "Settings", "Help & Support", "Logout"],
    "every menu option survives, in order",
  );
  assert.equal(qa(".profile-popup-item").filter((n) => n.querySelector("svg")).length, 6,
    "and every one keeps its icon");
  assert.ok(q(".profile-popup-avatar"), "the avatar is still there");

  // The popup still dismisses the way it always did: an outside press.
  await pointerDown(q(".mh-page") ?? document.body);
  await unmount();
});

/* ==================================================================
   14. LoginSignup transparency
   ================================================================== */

test("the LoginSignup surface matches the profile modal treatment", async () => {
  const loginCss = await readFile(
    new URL("../src/components/LoginSignupModal.css", import.meta.url),
    "utf8",
  );
  const profileCss = await readFile(
    new URL("../src/pages/Myprofile/MyProfileModal.css", import.meta.url),
    "utf8",
  );

  const surface = (css, selector) => {
    const start = css.indexOf(selector);
    const block = css.slice(start, css.indexOf("}", start));
    return {
      background: (block.match(/background:\s*([^;]+);/) || [])[1]?.trim(),
      backdrop: (block.match(/background:\s*(rgba\([^)]*\))/) || [])[1]?.trim(),
    };
  };

  const auth = surface(loginCss, ".auth-modal {");
  const mpm = surface(profileCss, ".mpm-modal {");

  // Same gradient, same opacity, so the two surfaces read as the same panel.
  assert.equal(auth.background, mpm.background,
    "LoginSignup uses the same surface gradient as My Profile");

  const authBackdrop = (loginCss.slice(loginCss.indexOf(".auth-modal-backdrop"))
    .match(/background:\s*(rgba\([^)]*\))/) || [])[1];
  const mpmBackdrop = (profileCss.slice(profileCss.indexOf(".mpm-backdrop"))
    .match(/background:\s*(rgba\([^)]*\))/) || [])[1];
  assert.equal(authBackdrop, mpmBackdrop, "and the same backdrop opacity");

  // The border already matched and must still match.
  const authBorder = (loginCss.slice(loginCss.indexOf(".auth-modal {")).match(/border:\s*([^;]+);/) || [])[1];
  const mpmBorder = (profileCss.slice(profileCss.indexOf(".mpm-modal {")).match(/border:\s*([^;]+);/) || [])[1];
  assert.equal(authBorder, mpmBorder, "the border treatment is unchanged and still shared");
});

/* ==================================================================
   15. Nothing fake, nothing persisted
   ================================================================== */

test("no match history is fabricated or written to browser storage", async () => {
  const unmount = await renderPage();
  await act(async () => {});

  assert.equal(qa(".mh-row").length, 0, "an empty response renders no rows");
  assert.equal(window.localStorage.length, 0, "nothing in localStorage");
  assert.equal(window.sessionStorage.length, 0, "nothing in sessionStorage");
  assert.equal(document.cookie, "", "nothing in a cookie");
  await unmount();
});

test("the API client has no way to create a match", async () => {
  const methods = Object.keys(authApi);
  assert.ok(methods.includes("getMatchHistory"), "reading the history is available");

  for (const name of [
    "createMatch", "addMatch", "reportMatch", "recordMatch", "submitMatch",
    "saveMatch", "updateMatch", "deleteMatch", "createMatchHistory", "postMatch",
  ]) {
    assert.equal(authApi[name], undefined, `${name} must not exist`);
    assert.equal(methods.includes(name), false, `${name} must not be exposed at all`);
  }

  const source = await readFile(
    new URL("../src/auth/authApi.ts", import.meta.url),
    "utf8",
  );
  const start = source.indexOf("getMatchHistory(");
  const body = source.slice(start, source.indexOf("\n  },", start));
  assert.match(body, /\/api\/v1\/account\/matches/, "it targets the read endpoint");
  assert.doesNotMatch(body, /method:\s*["'](POST|PUT|PATCH|DELETE)["']/, "and sends no write method");
});

/* ==================================================================
   16. No duplicate Match History files
   ================================================================== */

test("Match History page code lives only in the Match History folder", async () => {
  const { readdir } = await import("node:fs/promises");
  const pagesDir = new URL("../src/pages/", import.meta.url);

  const folders = await readdir(pagesDir, { withFileTypes: true });
  const withMatchHistory = folders
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => /matchhistory/i.test(name));

  assert.deepEqual(withMatchHistory, ["MatchHistory"], "there is exactly one Match History folder");

  const files = (await readdir(new URL("../src/pages/MatchHistory/", import.meta.url))).sort();
  assert.deepEqual(files, [
    "MatchHistory.css",
    "MatchHistory.tsx",
    "MatchHistoryCalendar.css",
    "MatchHistoryCalendar.tsx",
    "matchHistoryFormat.ts",
  ], "and it holds only the page, its calendar and its helpers");
});
/* ==================================================================
   DROPDOWN CLOSING BEHAVIOUR

   Every dismissal route is exercised with a real press (pointerdown then
   click), because the dismissal listens for pointerdown. A test that only sent
   click would pass even while the press-then-click ordering that caused the
   original bug was broken.

   The regression this pins: the calendar used to treat its own trigger as
   "outside", so a press on the trigger dismissed on pointerdown and the
   trigger's click then opened it again. The dropdown looked stuck and the X
   looked like the only way out.
   ================================================================== */

/* ------------------------------------------------------------------
   1. Clicking the open trigger again closes it
   ------------------------------------------------------------------ */

test("pressing an open dropdown's own trigger closes it", async () => {
  const unmount = await renderPage();

  for (const [id, name] of [
    ["mh-filter-opponent", "Played with"],
    ["mh-filter-result", "Result"],
  ]) {
    await press(q(`#${id}`));
    assert.equal(isDropdownOpen(id), true, `${name} opened`);

    // The regression: this press used to close and immediately reopen.
    await press(q(`#${id}`));
    assert.equal(isDropdownOpen(id), false, `${name} closed when its own trigger was pressed again`);
    assert.equal(q(`#${id}`).getAttribute("aria-expanded"), "false", "and says it is closed");
  }
  await unmount();
});

test("pressing the Date trigger again closes the calendar", async () => {
  const unmount = await renderPage();

  await press(q("#mh-filter-date"));
  assert.ok(q(".mhc-popover") !== null, "the calendar opened");

  await press(q("#mh-filter-date"));
  assert.equal(q(".mhc-popover") === null, true, "the calendar closed on the second press");
  assert.equal(q("#mh-filter-date").getAttribute("aria-expanded"), "false", "and reports closed");
  await unmount();
});

/* ------------------------------------------------------------------
   2. Clicking outside closes it
   ------------------------------------------------------------------ */

test("pressing empty page space closes an open dropdown", async () => {
  const unmount = await renderPage();

  await press(q("#mh-filter-opponent"));
  assert.equal(isDropdownOpen("mh-filter-opponent"), true, "it opened");

  await pressPageBackground();
  assert.equal(isDropdownOpen("mh-filter-opponent"), false, "an outside press closed it");
  await unmount();
});

test("pressing outside closes the calendar too", async () => {
  const unmount = await renderPage();

  await press(q("#mh-filter-date"));
  assert.ok(q(".mhc-popover") !== null, "the calendar opened");

  await pressPageBackground();
  assert.equal(q(".mhc-popover") === null, true, "an outside press closed the calendar");
  await unmount();
});

test("pressing the page heading does not need a second press to close", async () => {
  const unmount = await renderPage();

  // The dismissal is on pointerdown, so the dropdown is already gone by the time
  // the click lands. Two presses here would mean the first one did nothing.
  await press(q("#mh-filter-result"));
  assert.equal(isDropdownOpen("mh-filter-result"), true, "opened");

  await pointerDown(q(".mh-page-title"));
  assert.equal(isDropdownOpen("mh-filter-result"), false, "gone on pointerdown alone");
  await unmount();
});

/* ------------------------------------------------------------------
   3. The close button still closes it
   ------------------------------------------------------------------ */

test("the calendar close button still closes the calendar", async () => {
  const unmount = await renderPage();

  await press(q("#mh-filter-date"));
  assert.ok(q(".mhc-popover") !== null, "the calendar opened");

  await click(q('button[aria-label="Close calendar"]'));
  assert.equal(q(".mhc-popover") === null, true, "the close button closed it");
  await unmount();
});

test("choosing an option closes the list it came from", async () => {
  const unmount = await renderPage();

  await press(q("#mh-filter-result"));
  await click(qa(".mhf-menu [role='option']").find((n) => n.textContent === "Win"));
  assert.equal(isDropdownOpen("mh-filter-result"), false, "the list closed after a choice");
  assert.match(q("#mh-filter-result").textContent, /Win/, "and the choice stuck");
  await unmount();
});

test("Escape closes an open dropdown", async () => {
  const unmount = await renderPage();

  await press(q("#mh-filter-opponent"));
  assert.equal(isDropdownOpen("mh-filter-opponent"), true, "it opened");

  await act(async () => {
    document.dispatchEvent(new window.KeyboardEvent("keydown", {
      key: "Escape", bubbles: true, cancelable: true,
    }));
  });
  assert.equal(isDropdownOpen("mh-filter-opponent"), false, "Escape closed it");
  await unmount();
});

/* ------------------------------------------------------------------
   4. Only one dropdown is open at a time
   ------------------------------------------------------------------ */

test("opening another dropdown closes the one that was open", async () => {
  const unmount = await renderPage();

  const ids = ["mh-filter-opponent", "mh-filter-result"];

  await press(q(`#${ids[0]}`));
  assert.equal(isDropdownOpen(ids[0]), true, "the first opened");

  await press(q(`#${ids[1]}`));
  assert.equal(isDropdownOpen(ids[0]), false, "the first closed when the second opened");
  assert.equal(isDropdownOpen(ids[1]), true, "and the second is the open one");
  await unmount();
});

test("opening the calendar closes an open list dropdown", async () => {
  const unmount = await renderPage();

  await press(q("#mh-filter-result"));
  assert.equal(isDropdownOpen("mh-filter-result"), true, "Result opened");

  await press(q("#mh-filter-date"));
  assert.equal(isDropdownOpen("mh-filter-result"), false, "Result closed");
  assert.ok(q(".mhc-popover") !== null, "and the calendar is the open one");
  await unmount();
});

test("opening a list dropdown closes the calendar", async () => {
  const unmount = await renderPage();

  await press(q("#mh-filter-date"));
  assert.ok(q(".mhc-popover") !== null, "the calendar opened");

  await press(q("#mh-filter-opponent"));
  assert.equal(q(".mhc-popover") === null, true, "the calendar closed");
  assert.equal(isDropdownOpen("mh-filter-opponent"), true, "and the list is the open one");
  await unmount();
});

test("never more than one dropdown is open, in any order", async () => {
  const unmount = await renderPage();
  const ids = ["mh-filter-date", "mh-filter-opponent", "mh-filter-result"];
  const isOpen = () => ids.filter((id) => {
    if (id === "mh-filter-date") return q(".mhc-popover") !== null;
    return isDropdownOpen(id);
  });

  for (const id of [...ids, ...ids.slice().reverse()]) {
    await press(q(`#${id}`));
    assert.ok(isOpen().length <= 1, `at most one dropdown is open after pressing ${id}`);
  }
  await unmount();
});

/* ------------------------------------------------------------------
   5. Pressing inside must not close anything
   ------------------------------------------------------------------ */

test("pressing inside the open dropdown does not close it", async () => {
  const unmount = await renderPage();

  await press(q("#mh-filter-opponent"));
  assert.equal(isDropdownOpen("mh-filter-opponent"), true, "it opened");

  // A press that lands on the menu itself, and one on the trigger's own label.
  await pointerDown(qa(".mhf-menu")[0]);
  assert.equal(isDropdownOpen("mh-filter-opponent"), true, "a press on the menu itself leaves it open");

  await pointerDown(q(".mhf-field[data-dropdown='opponent'] .mhf-label"));
  assert.equal(isDropdownOpen("mh-filter-opponent"), true, "a press on its label leaves it open");
  await unmount();
});

test("using the calendar month navigation does not close the calendar", async () => {
  const unmount = await renderPage();

  await press(q("#mh-filter-date"));
  const before = q(".mhc-month").textContent;

  // The calendar opens on the account start month, so go forward first: the
  // back control is clamped there.
  await press(q('.mhc-nav[aria-label="Next month"]'));
  assert.ok(q(".mhc-popover") !== null, "still open after going forward a month");
  assert.notEqual(q(".mhc-month").textContent, before, "and the month actually changed");

  await press(q('.mhc-nav[aria-label="Previous month"]'));
  assert.ok(q(".mhc-popover") !== null, "still open after going back again");
  assert.equal(q(".mhc-month").textContent, before, "and it returned to the start month");
  await unmount();
});

/* ------------------------------------------------------------------
   6. Apply and Clear
   ------------------------------------------------------------------ */

/* ------------------------------------------------------------------
   7. The listeners are cleaned up
   ------------------------------------------------------------------ */

test("the outside-click listener is only attached while a dropdown is open", async () => {
  const added = [];
  const removed = [];
  const realAdd = document.addEventListener.bind(document);
  const realRemove = document.removeEventListener.bind(document);

  document.addEventListener = (type, listener, options) => {
    if (type === "pointerdown") added.push(listener);
    return realAdd(type, listener, options);
  };
  document.removeEventListener = (type, listener, options) => {
    if (type === "pointerdown") removed.push(listener);
    return realRemove(type, listener, options);
  };

  try {
    const unmount = await renderPage();
    assert.equal(added.length, 0, "nothing is attached while every dropdown is closed");

    await press(q("#mh-filter-opponent"));
    assert.equal(added.length, 1, "exactly one listener is attached when one opens");
    assert.equal(removed.length, 0, "and none has been removed yet");

    await press(q("#mh-filter-opponent"));
    assert.equal(removed.length, 1, "it is removed when the dropdown closes");
    assert.equal(added[0], removed[0], "the same listener function is torn down");

    await press(q("#mh-filter-result"));
    assert.equal(added.length, 2, "a fresh one is attached for the next dropdown");
    await pressPageBackground();
    assert.equal(removed.length, 2, "and torn down again on an outside press");

    await unmount();
  } finally {
    document.addEventListener = realAdd;
    document.removeEventListener = realRemove;
  }
});

/* ------------------------------------------------------------------
   8. The wiring, pinned in the source
   ------------------------------------------------------------------ */

test("the dropdown open state is owned by the page, not by each dropdown", async () => {
  const source = await readFile(
    new URL("../src/pages/MatchHistory/MatchHistory.tsx", import.meta.url),
    "utf8",
  );

  // One shared value is what makes "only one open" structural rather than a
  // chain of close-the-other calls that can drift out of step.
  assert.match(source, /const \[openDropdown, setOpenDropdown\] = useState/, "one shared open value");
  assert.doesNotMatch(
    source,
    /const \[isOpen, setIsOpen\] = useState/,
    "and no per-dropdown open flag",
  );

  // Exactly one document level pointer listener, judged against the open
  // dropdown's own root so its trigger, its list and its calendar count as inside.
  assert.match(source, /addEventListener\("pointerdown"/, "a document level pointer listener");
  assert.match(source, /dropdownRoots\.current\[openDropdown\]/, "that checks the open dropdown's root");
  assert.match(
    source,
    /removeEventListener\("pointerdown"/,
    "and is removed again on close",
  );

  // The calendar must not keep its own pointer listener, which is what fought
  // the trigger toggle.
  const calendarSource = await readFile(
    new URL("../src/pages/MatchHistory/MatchHistoryCalendar.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    calendarSource,
    /addEventListener\("pointerdown"/,
    "the calendar no longer listens for outside presses itself",
  );
  assert.match(calendarSource, /addEventListener\("keydown"/, "it still handles Escape");
});
/* ==================================================================
   PAGE SHELL: BACKGROUND, NAVBAR AND BUTTON PARITY
   ================================================================== */

test("the Navbar is not displayed on this page but is still mounted", async () => {
  const { default: App } = await vite.ssrLoadModule("/src/App.tsx");

  const source = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(source, /<Navbar isVisible=\{!isMatchHistoryPage\} \/>/,
    "the bar is told to hide on this page");

  // Hidden, not unmounted: it still owns the Profile Popup state and the
  // navigation listener the back button depends on.
  const navbarCss = await readFile(
    new URL("../src/components/Navbar.css", import.meta.url),
    "utf8",
  );
  const rules = navbarCss.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(rules, /\.navbar--hidden\s*\{[^}]*visibility:\s*hidden/,
    "it is hidden with visibility, so it keeps its box and stays in the document");
  assert.doesNotMatch(rules, /\.navbar--hidden\s*\{[^}]*display:\s*none/,
    "and is not display:none, which would drop it from the layout entirely");

  void App;
});

test("the page reserves no space for a Navbar it does not show", async () => {
  const pageCss = await readFile(
    new URL("../src/pages/MatchHistory/MatchHistory.css", import.meta.url),
    "utf8",
  );
  const rules = pageCss.replace(/\/\*[\s\S]*?\*\//g, "");

  // 60px is the Navbar's height; padding the page by that much would leave an
  // empty band at the top now that the bar is hidden.
  assert.doesNotMatch(rules, /\.mh-page\s*\{[^}]*padding-top:\s*[^;]*\b6\dpx/,
    "no top padding sized to the Navbar");
  assert.match(rules, /\.mh-page\s*\{[^}]*min-height:\s*100vh/,
    "and the page uses the full viewport height instead");
});

/* ==================================================================
   THE DATE RANGE MESSAGE
   ================================================================== */

test("the single Date control replaced the From and To pair", async () => {
  const unmount = await renderPage();

  assert.equal(qa('.mhf-field[data-dropdown="date"]').length, 1, "there is one Date control");
  assert.equal(q("#mh-filter-date") === null, false, "labelled Date");
  assert.equal(q("#mh-filter-date-from") === null, true, "no From control");
  assert.equal(q("#mh-filter-date-to") === null, true, "and no To control");

  // The filter row still holds exactly the three filters and two buttons.
  assert.deepEqual(
    qa(".mhf-label").map((n) => n.textContent),
    ["Date", "Played with", "Result"],
    "the three confirmed filter labels",
  );
  assert.deepEqual(
    qa(".mhf-actions button").map((n) => n.textContent),
    ["Clear Filters"],
    "and the one confirmed button",
  );
  await unmount();
});
/* ==================================================================
   BACKGROUND, OVERFLOW, HEADINGS AND BUTTON PARITY
   ================================================================== */

/**
 * The declaration block of a standalone CSS selector.
 *
 * Comments are stripped FIRST and deliberately: these stylesheets discuss
 * `overflow: hidden` and the other very properties in prose, and a scanner that
 * does not strip comments reads that prose as a declaration.
 */
function cssBlock(cssSource, selector) {
  const css = cssSource.replace(/\/\*[\s\S]*?\*\//g, "");
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?:^|\\n)[ \\t]*${escaped}[ \\t]*\\{`, "g");

  let match = pattern.exec(css);
  while (match) {
    // Skip a selector that is only the tail of a comma list, and skip a
    // compound selector that is not the base rule.
    const before = css.slice(0, match.index).trimEnd();
    if (!before.endsWith(",")) {
      const start = match.index + match[0].length;
      return css.slice(start, css.indexOf("}", start));
    }
    match = pattern.exec(css);
  }
  return null;
}

/** Just the `background` value of a block, up to the next property. */
function backgroundValue(blockText) {
  if (!blockText) return "";
  const at = blockText.indexOf("background:");
  if (at === -1) return "";
  const rest = blockText.slice(at + "background:".length);
  // The next property may be on the following line, so any run of whitespace
  // separates the two declarations.
  const end = rest.search(/;(?=\s*[a-z-]+:)/);
  return (end === -1 ? rest : rest.slice(0, end))
    .replace(/\s+/g, " ")
    // The Landing rule is the last declaration in its block, so its slice keeps
    // a trailing semicolon while a value followed by another property does not.
    // The punctuation is not part of the value being compared.
    .replace(/;\s*$/, "")
    .trim();
}

test("the page background is the Landing Page gradient, stop for stop", async () => {
  const pageCss = await readFile(
    new URL("../src/pages/MatchHistory/MatchHistory.css", import.meta.url),
    "utf8",
  );
  const landingCss = await readFile(
    new URL("../src/pages/Landingpage/Landingpage.css", import.meta.url),
    "utf8",
  );

  const page = backgroundValue(cssBlock(pageCss, ".mh-page"));
  const landing = backgroundValue(cssBlock(landingCss, ".app"));

  assert.ok(page.length > 0, ".mh-page declares a background");
  assert.ok(landing.length > 0, ".app declares a background");

  // Compared whole and in order, so a near miss is impossible: every colour,
  // every percentage, the order and the direction all have to agree. The
  // "too bluish" report is exactly a mismatch of this declaration.
  assert.equal(page, landing, "the two pages paint the identical gradient");

  for (const stop of [
    "circle at 78% 22%",
    "rgba(103, 31, 211, 0.24)",
    "circle at 92% 65%",
    "rgba(96, 25, 202, 0.18)",
    "circle at 5% 60%",
    "rgba(76, 22, 145, 0.15)",
    "135deg",
    "#05010b 0%",
    "#0c0218 40%",
    "#140326 75%",
    "#140326 100%",
  ]) {
    assert.ok(page.includes(stop), `the page uses the Landing Page's ${stop}`);
  }

  // The page keeps the Landing wrapper class, so it also keeps the three glows
  // that warm the upper right.
  const unmount = await renderPage();
  assert.match(q("main").className, /\bapp\b/, "the app wrapper class is still on the page");
  assert.equal(qa(".background-glow").length, 3, "with the Landing Page's three glows");
  await unmount();
});

test("the background covers the whole page and cannot be widened by the glows", async () => {
  const pageCss = await readFile(
    new URL("../src/pages/MatchHistory/MatchHistory.css", import.meta.url),
    "utf8",
  );
  const block = cssBlock(pageCss, ".mh-page");

  // The gradient paints this element's own box, so the box has to be the page.
  assert.match(block, /min-height:\s*100vh/, "the page is at least a viewport tall");
  assert.match(block, /max-width:\s*100%/, "and never wider than its parent");

  // `.glow-one` sits at `right: -260px` and `.glow-two` at `left: -300px` on the
  // Landing Page, which its own `overflow: hidden` contains. Lifting that to
  // `visible` here let them widen the document, which exposed the darker `body`
  // background beside the page and produced the dark band and the scrollbar.
  // `clip` contains them without turning the page into a scroll container.
  assert.match(block, /overflow-x:\s*clip/, "the decorative glows are clipped horizontally");
  assert.doesNotMatch(block, /overflow-x:\s*hidden/,
    "and not with hidden, which would force a vertical scrollbar");

  // Vertical overflow must stay readable, or a long list could not be scrolled.
  const overflowIndex = block.indexOf("overflow:");
  const clipIndex = block.indexOf("overflow-x:");
  assert.ok(overflowIndex >= 0 && clipIndex > overflowIndex,
    "the vertical overflow rule comes first and stays visible");
  assert.match(block.slice(overflowIndex, clipIndex), /overflow:\s*visible/,
    "vertical overflow is visible so the list can be read");

  // The inner column can never outgrow the page.
  const inner = cssBlock(pageCss, ".mh-page-inner");
  assert.match(inner, /width:\s*min\(1300px, 100%\)/, "the column is a share of the page");
  assert.match(inner, /max-width:\s*100%/);
});

test("the calendar cannot widen the page", async () => {
  const calCss = await readFile(
    new URL("../src/pages/MatchHistory/MatchHistoryCalendar.css", import.meta.url),
    "utf8",
  );
  const block = cssBlock(calCss, ".mhc-popover");

  // `max-content` sized the popover to its widest possible child, which could
  // push past the viewport when the Date control sat near the right edge.
  assert.doesNotMatch(block, /width:\s*max-content/, "the popover is not max-content sized");
  assert.match(block, /width:\s*300px/, "it has a definite width");
  assert.match(block, /max-width:\s*min\(94vw, 300px\)/, "capped against the viewport");

  // `1fr` is `minmax(auto, 1fr)`, so a track can be pushed wider than its share.
  assert.doesNotMatch(calCss, /repeat\(7, 1fr\)/, "no grid uses a bare 1fr track");
  assert.ok(calCss.includes("repeat(7, minmax(0, 1fr))"),
    "both the weekday row and the day grid use a zero minimum");
});

test("the page keeps its heading and shows no extra section heading", async () => {
  const unmount = await renderPage();

  assert.equal(q(".mh-page-title").textContent, "Match History", "the page title is kept");

  // "All Matches" is gone, and nothing replaced it.
  assert.equal(q(".mh-section-title") === null, true, "no All Matches heading");
  assert.doesNotMatch(q(".mh-page").textContent, /All Matches/,
    "and the words are nowhere on the page");

  // The date information bar is gone too, with no replacement banner.
  assert.equal(q(".mhf-message") === null, true, "no date information bar");
  assert.doesNotMatch(q(".mh-page").textContent, /No date range selected/,
    "and its text is nowhere either");

  const source = await readFile(
    new URL("../src/pages/MatchHistory/MatchHistory.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /mh-section-title/, "no such heading remains in the component");
  assert.doesNotMatch(source, /mhf-message/, "and no such bar remains either");
  await unmount();
});

test("the calendar shows no date-range summary card", async () => {
  const calCss = await readFile(
    new URL("../src/pages/MatchHistory/MatchHistoryCalendar.css", import.meta.url),
    "utf8",
  );
  const calSource = await readFile(
    new URL("../src/pages/MatchHistory/MatchHistoryCalendar.tsx", import.meta.url),
    "utf8",
  );

  // The footer carried the range text, a CLEAR control and a duration/month
  // summary. All three are gone from the stylesheet and the component.
  for (const gone of ["mhc-footer", "mhc-selection", "mhc-clear", "mhc-awaiting", "mhc-bounds"]) {
    assert.doesNotMatch(calCss, new RegExp(`\\.${gone}\\b`), `${gone} is not styled any more`);
    assert.doesNotMatch(calSource, new RegExp(gone), `${gone} is not rendered any more`);
  }

  const unmount = await renderPage();
  await press(q("#mh-filter-date"));
  assert.ok(q(".mhc-popover") !== null, "the calendar still opens");

  // Nothing inside it describes a range, a duration or a month summary.
  const text = q(".mhc-popover").textContent;
  assert.doesNotMatch(text, /Pick a start date|now pick the end date|days/i,
    "no range prompt, no duration or month summary");
  assert.equal(q(".mhc-clear") === null, true, "and no Clear control inside the calendar");
  assert.equal(q(".mhc-bounds") === null, true, "and no bounds summary");
  await unmount();
});

test("Clear Filters uses the All Games clear button style", async () => {
  const pageCss = await readFile(
    new URL("../src/pages/MatchHistory/MatchHistory.css", import.meta.url),
    "utf8",
  );
  const allGamesCss = await readFile(
    new URL("../src/pages/Allgames/Allgames.css", import.meta.url),
    "utf8",
  );

  const clearPage = cssBlock(pageCss, ".mhf-clear");
  const clearSource = cssBlock(allGamesCss, ".category-filter-pills-primary .clear-filters");

  // Every value is compared against the All Games source, so a near-miss colour,
  // shadow or gradient cannot pass.
  for (const value of [
    "linear-gradient(135deg, #7d286d 0%, #321341 100%)",
    "1px solid rgba(255, 145, 190, 0.72)",
    "#ffe8f2",
    "0 4px 14px rgba(15, 4, 36, 0.5)",
    "0 1px 0 rgba(255, 255, 255, 0.1)",
  ]) {
    assert.ok(clearPage.includes(value), `Clear matches the All Games clear button: ${value}`);
    assert.ok(clearSource.includes(value), `and the All Games source really declares ${value}`);
  }

  // The hover state too, not just the resting state.
  const clearHover = cssBlock(pageCss, ".mhf-clear:hover:not(:disabled)");
  const sourceHover = cssBlock(
    allGamesCss,
    ".category-filter-pills-primary .clear-filters:hover:not(:disabled)",
  );
  for (const value of [
    "linear-gradient(135deg, #a13c88 0%, #4a1a59 100%)",
    "rgba(255, 190, 220, 1)",
    "0 0 18px rgba(139, 69, 231, 0.45)",
  ]) {
    assert.ok(clearHover.includes(value), `Clear hover matches All Games: ${value}`);
    assert.ok(sourceHover.includes(value), `and that source really declares ${value}`);
  }

  assert.ok(clearHover.includes("translateY(-2px)"), "it lifts by the same 2px on hover");
  assert.ok(
    clearPage.includes("transition: background 0.22s ease, border-color 0.22s ease"),
    "with the same 0.22s transition",
  );
  assert.match(pageCss, /\.mhf-clear:focus-visible\s*\{[^}]*outline:/, "focus is visible");

  const unmount = await renderPage();
  assert.equal(q(".mhf-clear").textContent, "Clear Filters", "the label is this page's own");
  await unmount();
});
/* ==================================================================
   SINGLE-DATE SELECTION AND IMMEDIATE FILTERING
   ================================================================== */

/**
 * Opens the calendar and clicks one enabled day.
 *
 * The calendar opens on the account start month, where the chosen day may be
 * disabled or absent, so the helper walks forward month by month until the day
 * is both present and selectable.
 */
async function chooseDay(day) {
  await press(q("#mh-filter-date"));
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const cell = qa(".mhc-day").find((n) => n.textContent === String(day) && !n.disabled);
    if (cell) {
      await press(cell);
      return;
    }
    await press(q('.mhc-nav[aria-label="Next month"]'));
  }
  throw new Error(`No enabled day ${day} in the calendar`);
}

test("the calendar selects one day in a single click", async () => {
  const unmount = await renderPage();
  const before = matchHistoryCalls.length;

  await chooseDay(4);

  // One click, one request: there is no second click to complete anything.
  assert.equal(matchHistoryCalls.length, before + 1, "the list refetched immediately");
  const last = matchHistoryCalls[matchHistoryCalls.length - 1];
  assert.equal(last.from, last.to, "one day is sent as a single-day window");
  assert.match(last.from, /^\d{4}-\d{2}-\d{2}$/, "as a calendar date");
  await unmount();
});

test("choosing a date filters to that day and closes the calendar", async () => {
  const unmount = await renderPage();

  await chooseDay(4);

  assert.equal(q(".mhc-popover") === null, true, "the calendar closed on the single click");
  assert.match(q("#mh-filter-date").textContent, /\d{4}/, "and the Date control shows the day");
  await unmount();
});

test("the whole chosen day is included, not just its midnight", async () => {
  // Read from the real service, so the boundary itself is pinned: the end bound
  // has to run to the last millisecond of that day.
  const { readFileSync } = await import("node:fs");
  const service = readFileSync(
    fileURLToPath(new URL("../../backend/services/matchHistoryService.js", import.meta.url)),
    "utf8",
  );
  assert.match(service, /endOfDay/, "the end date is resolved as a whole day");
  assert.match(service, /MILLISECONDS_PER_DAY\s*-\s*1/,
    "and runs to its final millisecond, so a late match is not dropped");

  const unmount = await renderPage();
  await chooseDay(9);
  const last = matchHistoryCalls[matchHistoryCalls.length - 1];
  assert.equal(last.from, last.to, "the same day bounds the window on both sides");
  assert.equal(typeof last.tzOffsetMinutes, "number",
    "and the reader's own offset travels with it, so the day is theirs");
  await unmount();
});

test("there is no range, no From/To and no multi-day selection", async () => {
  const unmount = await renderPage();

  await press(q("#mh-filter-date"));

  assert.equal(q("#mh-filter-date-from") === null, true, "no From control");
  assert.equal(q("#mh-filter-date-to") === null, true, "and no To control");
  assert.equal(qa('input[type="date"]').length, 0, "no date inputs at all");

  // The only dash in the calendar is the bounds label's separator, which shows
  // the available range above the grid; nothing else reads as a range to pick.
  const dashes = q(".mhc-popover").textContent.match(/[–—]/g) || [];
  assert.equal(dashes.length, 1, "exactly one dash, in the bounds label");
  assert.equal(q(".mhc-range") === null, false, "and it belongs to the range label");
  assert.match(q(".mhc-range").textContent, /^\d{1,2} \w{3,4} \d{4} – \d{1,2} \w{3,4} \d{4}$/,
    "which reads start day through today");

  // The range states are gone from the stylesheet too.
  const calCss = await readFile(
    new URL("../src/pages/MatchHistory/MatchHistoryCalendar.css", import.meta.url),
    "utf8",
  );
  for (const gone of ["selected-start", "selected-end", "in-range"]) {
    assert.doesNotMatch(calCss, new RegExp(`mhc-day--${gone}`), `${gone} is gone`);
  }
  await unmount();
});

test("today is an outline-only marker, and a selected day is the only filled one", async () => {
  // The account was created this month, so the calendar opens on the current
  // month and today is in the grid without navigating.
  const now = format.getToday();
  const unmount = await renderPage(navbarUser({
    createdAt: new Date(now.year, now.month - 1, 1, 8).toISOString(),
  }));
  await press(q("#mh-filter-date"));

  const today = format.getToday();
  const todayCell = qa(".mhc-day").find(
    (n) => n.textContent === String(today.day)
      && n.getAttribute("aria-label").includes(String(today.year)),
  );
  assert.ok(todayCell !== undefined, "today is in the grid");
  assert.match(todayCell.className, /mhc-day--today/, "and marked as today");
  assert.doesNotMatch(todayCell.className, /mhc-day--selected/, "not as selected");

  const calCss = await readFile(
    new URL("../src/pages/MatchHistory/MatchHistoryCalendar.css", import.meta.url),
    "utf8",
  );
  const todayRule = cssBlock(calCss, ".mhc-day--today");
  const selectedRule = cssBlock(calCss, ".mhc-day--selected");

  // Outline only: a visible border and a transparent background.
  assert.match(todayRule, /border-color:\s*rgba\(224, 105, 255, 0\.85\)/, "today has a visible border");
  assert.match(todayRule, /background:\s*transparent/, "and no fill");

  // The selected day is the only one with a fill, so a fill always means
  // "this is the day you picked".
  assert.match(selectedRule, /background:\s*linear-gradient/, "the chosen day is filled");
  const filledStates = calCss.match(/\.mhc-day--[a-z-]+\s*\{[^}]*background:\s*linear-gradient/g) || [];
  assert.equal(filledStates.length, 1, "exactly one day state carries a gradient fill");

  // When today is chosen it is the selected day, and still the filled one.
  await press(todayCell);
  await press(q("#mh-filter-date"));
  const nowSelected = qa(".mhc-day").find(
    (n) => n.textContent === String(today.day)
      && n.getAttribute("aria-label").includes(String(today.year)),
  );
  assert.match(nowSelected.className, /mhc-day--selected/, "today is now the selected day");
  assert.doesNotMatch(nowSelected.className, /mhc-day--today/,
    "and the two states do not stack");
  await unmount();
});

test("getDayState gives four mutually exclusive states", () => {
  const today = { year: 2026, month: 6, day: 15 };
  const bounds = { earliest: { year: 2026, month: 1, day: 1 }, latest: today, today };
  const day = (d) => ({ year: 2026, month: 6, day: d });

  assert.equal(format.getDayState(day(15), null, bounds), "today", "today when nothing is chosen");
  assert.equal(format.getDayState(day(15), day(15), bounds), "selected",
    "selected wins when today is the chosen day");
  assert.equal(format.getDayState(day(10), null, bounds), "selectable", "an ordinary day");
  assert.equal(format.getDayState(day(16), null, bounds), "disabled", "the future is disabled");
  assert.equal(format.getDayState({ year: 2025, month: 12, day: 31 }, null, bounds), "disabled",
    "before the earliest month is disabled");
  assert.equal(format.getDayState({ year: 2027, month: 1, day: 1 }, day(1), bounds), "disabled",
    "a disabled day is never shown as selected, even if it is the chosen one");
});

test("disabled days and the future still cannot be selected", async () => {
  // The account was created this month, so the calendar opens on the current month.
  const now = format.getToday();
  const unmount = await renderPage(navbarUser({
    createdAt: new Date(now.year, now.month - 1, 1, 8).toISOString(),
  }));
  await press(q("#mh-filter-date"));

  const today = format.getToday();
  const daysInMonth = format.getDaysInMonth(today.year, today.month);
  const cells = qa(".mhc-day").filter((n) => !n.className.includes("blank"));
  assert.equal(cells.length, daysInMonth, `all ${daysInMonth} days are rendered`);

  for (let day = 1; day <= daysInMonth; day += 1) {
    const cell = cells.filter((n) => n.textContent === String(day));
    assert.equal(cell.length, 1, `day ${day} is rendered once`);
    assert.equal(
      cell[0].disabled,
      day > today.day,
      day > today.day ? `${day} is in the future and disabled` : `${day} is selectable`,
    );
  }

  // A press on a disabled day changes nothing at all.
  const disabled = cells.find((n) => n.disabled);
  if (disabled) {
    await press(disabled);
    assert.ok(q(".mhc-popover") !== null, "the calendar stays open");
    assert.equal(matchHistoryCalls.length, 1, "and nothing was fetched");
  }

  // Every day of next month is disabled too, and equally unselectable.
  await press(q('.mhc-nav[aria-label="Next month"]'));
  const nextCells = qa(".mhc-day").filter((n) => !n.className.includes("blank"));
  const nextMonth = today.month % 12 + 1;
  const nextYear = today.month === 12 ? today.year + 1 : today.year;
  assert.equal(nextCells.length, format.getDaysInMonth(nextYear, nextMonth),
    "the future month is fully rendered");
  for (const cell of nextCells) {
    assert.equal(cell.disabled, true, `${cell.textContent} is in the future and disabled`);
  }

  const before = matchHistoryCalls.length;
  await press(nextCells[0]);
  assert.ok(q(".mhc-popover") !== null, "the calendar stays open");
  assert.equal(matchHistoryCalls.length, before, "and a future day selects nothing");
  await unmount();
});

test("leap years and month boundaries still hold in the single-day grid", () => {
  assert.equal(format.getDaysInMonth(2024, 2), 29, "2024 is a leap year");
  assert.equal(format.getDaysInMonth(2025, 2), 28, "2025 is not");
  assert.equal(format.getDaysInMonth(2000, 2), 29, "2000 is a leap year");
  assert.equal(format.getDaysInMonth(1900, 2), 28, "1900 is not");
  assert.equal(format.getDaysInMonth(2026, 4), 30, "April has 30");
  assert.equal(format.isRealCalendarDate({ year: 2026, month: 2, day: 29 }), false);
  assert.equal(format.isRealCalendarDate({ year: 2024, month: 2, day: 29 }), true);

  // 1 March 2026 is a Sunday, so a Monday-first grid starts it in column 6.
  const grid = format.getMonthGrid({ year: 2026, month: 3 });
  assert.equal(grid.findIndex((cell) => cell?.day === 1), 6, "1 March 2026 is in the 7th column");
  assert.equal(grid.length % 7, 0, "the grid is a whole number of weeks");

  // A chosen day is a plain calendar value, so no offset can shift it.
  assert.equal(format.toCalendarDateString({ year: 2026, month: 7, day: 10 }), "2026-07-10");
  assert.equal(format.parseCalendarDateString("2026-02-31"), null, "a rolled date is rejected");
});

/* ------------------------------------------------------------------
   Immediate filtering
   ------------------------------------------------------------------ */

test("changing Played with filters immediately, with no Apply step", async () => {
  const unmount = await renderPage();
  const before = matchHistoryCalls.length;

  await press(q("#mh-filter-opponent"));
  await press(qa(".mhf-menu [role='option']").find((n) => n.textContent === "Local Play"));

  assert.equal(matchHistoryCalls.length, before + 1, "one request, straight from the choice");
  const last = matchHistoryCalls[matchHistoryCalls.length - 1];
  assert.equal(last.opponentType, "LOCAL", "the stored type was sent");
  assert.equal(last.opponentName, undefined, "never inferred from opponent text");
  await unmount();
});

test("changing Result filters immediately", async () => {
  const unmount = await renderPage();
  const before = matchHistoryCalls.length;

  await press(q("#mh-filter-result"));
  await press(qa(".mhf-menu [role='option']").find((n) => n.textContent === "Draw"));

  assert.equal(matchHistoryCalls.length, before + 1, "one request");
  assert.equal(matchHistoryCalls[matchHistoryCalls.length - 1].result, "DRAW",
    "the stored DRAW was sent, not a renamed value");
  await unmount();
});

test("filters combine, and changing one preserves the others", async () => {
  const unmount = await renderPage();

  await press(q("#mh-filter-opponent"));
  await press(qa(".mhf-menu [role='option']").find((n) => n.textContent === "Arcadion"));
  assert.equal(matchHistoryCalls[matchHistoryCalls.length - 1].opponentType, "ARCADION",
    "the opponent is applied on its own");

  await press(q("#mh-filter-result"));
  await press(qa(".mhf-menu [role='option']").find((n) => n.textContent === "Lost"));
  const afterResult = matchHistoryCalls[matchHistoryCalls.length - 1];
  assert.equal(afterResult.result, "LOSS", "the result is added");
  assert.equal(afterResult.opponentType, "ARCADION", "and the opponent survived the change");

  await chooseDay(12);
  const afterDate = matchHistoryCalls[matchHistoryCalls.length - 1];
  assert.ok(afterDate.from, "the date is added");
  assert.equal(afterDate.result, "LOSS", "with the result still applied");
  assert.equal(afterDate.opponentType, "ARCADION", "and the opponent still applied");
  await unmount();
});

test("Clear Filters resets everything and shows the full history again", async () => {
  nextResponse = pageResponse([match()]);
  const unmount = await renderPage();

  await press(q("#mh-filter-opponent"));
  await press(qa(".mhf-menu [role='option']").find((n) => n.textContent === "Local Play"));
  await press(q("#mh-filter-result"));
  await press(qa(".mhf-menu [role='option']").find((n) => n.textContent === "Lost"));
  await chooseDay(4);

  const filtered = matchHistoryCalls[matchHistoryCalls.length - 1];
  assert.ok(filtered.from && filtered.result && filtered.opponentType, "all three are set");

  await click(q(".mhf-clear"));

  const last = matchHistoryCalls[matchHistoryCalls.length - 1];
  assert.equal(last.from, undefined, "the date is cleared");
  assert.equal(last.to, undefined, "including both bounds");
  assert.equal(last.result, undefined, "the result is cleared");
  assert.equal(last.opponentType, undefined, "the opponent is cleared");
  assert.equal(last.offset, 0, "and paging restarts at the newest match");
  assert.match(q("#mh-filter-date").textContent, /All time/, "the Date control is back to All time");
  assert.match(q("#mh-filter-result").textContent, /All/, "the result is back to All");
  assert.match(q("#mh-filter-opponent").textContent, /All/, "and so is the opponent");
  await unmount();
});

test("Clear Filters is only enabled once something is chosen", async () => {
  const unmount = await renderPage();
  assert.equal(q(".mhf-clear").disabled, true, "disabled with no filters");

  await press(q("#mh-filter-result"));
  await press(qa(".mhf-menu [role='option']").find((n) => n.textContent === "Win"));
  assert.equal(q(".mhf-clear").disabled, false, "enabled once a filter is chosen");

  await click(q(".mhf-clear"));
  assert.equal(q(".mhf-clear").disabled, true, "and disabled again after clearing");
  await unmount();
});

test("an active filter is marked, and the controls combine with the date", async () => {
  const unmount = await renderPage();

  await press(q("#mh-filter-result"));
  await press(qa(".mhf-menu [role='option']").find((n) => n.textContent === "Win"));
  assert.ok(q("#mh-filter-result").className.includes("mhf-trigger--active"),
    "the chosen filter is called out");
  assert.match(q("#mh-filter-result").textContent, /Win/, "and shows the chosen value");

  await chooseDay(20);
  assert.ok(q("#mh-filter-date").className.includes("mhf-trigger--active"),
    "the date is marked active too");
  await unmount();
});

/* ------------------------------------------------------------------
   Dropdowns still close correctly around the new behaviour
   ------------------------------------------------------------------ */

test("interacting with the calendar never closes it mid-gesture", async () => {
  const unmount = await renderPage();

  await press(q("#mh-filter-date"));

  // The calendar opens on the account start month, where going back is clamped.
  const before = q(".mhc-month").textContent;
  assert.equal(q('.mhc-nav[aria-label="Previous month"]').disabled, true,
    "the back control is disabled on the start month");

  await press(q('.mhc-nav[aria-label="Next month"]'));
  assert.ok(q(".mhc-popover") !== null, "still open after going forward");
  assert.notEqual(q(".mhc-month").textContent, before, "and the month changed");

  await press(q('.mhc-nav[aria-label="Previous month"]'));
  assert.ok(q(".mhc-popover") !== null, "still open after going back");
  assert.equal(q(".mhc-month").textContent, before, "and it returned to the start month");

  await press(q('.mhc-nav[aria-label="Next year"]'));
  assert.ok(q(".mhc-popover") !== null, "still open after stepping forward a year");

  // Only a real choice closes it, because that is the end of the interaction.
  await press(qa(".mhc-day").find((n) => !n.disabled && n.textContent === "6"));
  assert.equal(q(".mhc-popover") === null, true, "and a chosen day closes it");
  await unmount();
});

test("pressing the open Date trigger again still closes the calendar", async () => {
  const unmount = await renderPage();

  await press(q("#mh-filter-date"));
  assert.ok(q(".mhc-popover") !== null, "the calendar opened");

  await press(q("#mh-filter-date"));
  assert.equal(q(".mhc-popover") === null, true, "the second press closed it");
  assert.equal(q("#mh-filter-date").getAttribute("aria-expanded"), "false", "and it says so");
  await unmount();
});

test("choosing an option still closes the list it came from", async () => {
  const unmount = await renderPage();

  await press(q("#mh-filter-result"));
  await press(qa(".mhf-menu [role='option']").find((n) => n.textContent === "Win"));
  assert.equal(isDropdownOpen("mh-filter-result"), false, "the list closed after the choice");
  assert.match(q("#mh-filter-result").textContent, /Win/, "and the choice stuck");
  await unmount();
});

test("opening another dropdown still closes the open one", async () => {
  const unmount = await renderPage();

  await press(q("#mh-filter-opponent"));
  assert.equal(isDropdownOpen("mh-filter-opponent"), true, "the first opened");

  await press(q("#mh-filter-result"));
  assert.equal(isDropdownOpen("mh-filter-opponent"), false, "the first closed");
  assert.equal(isDropdownOpen("mh-filter-result"), true, "and the second is open");

  await press(q("#mh-filter-date"));
  assert.equal(isDropdownOpen("mh-filter-result"), false, "the list closed");
  assert.ok(q(".mhc-popover") !== null, "and the calendar is the open one");
  await unmount();
});
