import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

/*
 * The Leaderboard page, as a full page reached from the Profile Popup.
 *
 * The page is driven for real: only the location and the history are stubbed,
 * so the hero, the rankings section, the Return button and every navigation
 * decision rendered here are the ones a reader actually gets.
 */
const frontendRoot = fileURLToPath(new URL("../", import.meta.url));
const originalConsoleError = console.error;

let dom;
let vite;
let React;
let act;
let createRoot;
let root;
let App;
let Navbar;
let Leaderboard;
let AuthContext;
let authApi;
let navigation;
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
  /*
    jsdom has no scrolling at all, and the hero's View rankings button calls
    scrollIntoView. The stub keeps that click honest without a layout engine.
  */
  window.HTMLElement.prototype.scrollIntoView = function () {};
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
  App = (await vite.ssrLoadModule("/src/App.tsx")).default;
  Navbar = (await vite.ssrLoadModule("/src/components/Navbar.tsx")).default;
  Leaderboard = (await vite.ssrLoadModule("/src/pages/Leaderboard/Leaderboard.tsx")).default;
  AuthContext = (await vite.ssrLoadModule("/src/auth/AuthContext.tsx")).default;
  ({ authApi } = await vite.ssrLoadModule("/src/auth/authApi.ts"));
  navigation = await vite.ssrLoadModule("/src/lib/navigation.ts");
});

after(async () => {
  await vite?.close();
  console.error = originalConsoleError;
});

beforeEach(() => {
  pushedPaths = [];

  // The navigation markers are module state that outlives a test, so they are
  // cleared between tests. This is also the honest assertion that merely opening
  // the page does not arm the marker.
  navigation.consumeProfilePopupReopenRequest();
  navigation.rememberLeaderboardReturnPath("/");

  // Navigation is recorded rather than performed, so a test can assert where the
  // page wanted to go without leaving jsdom's URL in a strange state.
  window.history.pushState = (state, title, path) => {
    pushedPaths.push(path);
  };
  window.history.back = () => {
    pushedPaths.push("__back__");
  };
  window.scrollTo = () => {};

  /*
    The AuthProvider bootstraps a session on mount. The network is stubbed, so
    the bootstrap resolves immediately instead of reaching a real server (there
    is none in tests, and a real request would hang the run).
  */
  authApi.refresh = async () => null;
  authApi.me = async () => {
    throw new Error("auth is stubbed in tests");
  };
});

/* ------------------------------------------------------------------
   Fixtures
   ---------------------------------------------------------------- */

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

/** The Leaderboard page on its own, which is how a reader lands on it. */
function renderPage(user = navbarUser(), returnPath = "/") {
  return renderRoot(React.createElement(
    AuthContext.Provider,
    { value: authValue(user) },
    React.createElement(Leaderboard, { returnPath }),
  ));
}

/**
 * Renders the Navbar and the Leaderboard page side by side under one auth
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
      React.createElement(Leaderboard, { returnPath }),
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

function pointerDown(node) {
  return act(async () => {
    node.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
  });
}

/* ==================================================================
   1. It is a page, not a modal
   ================================================================== */

test("the Leaderboard is a full page, not a modal or overlay", async () => {
  const unmount = await renderPage();

  assert.ok(q(".leaderboard-page"), "the page container is rendered");
  assert.match(q("main").className, /\bleaderboard-page\b/, "it is a main landmark");
  assert.ok(q(".leaderboard-hero"), "with the hero section");
  assert.ok(q("#leaderboard-rankings"), "and the rankings section");

  // Nothing about a modal survives: no backdrop, no dialog role, no X.
  assert.equal(q('[role="dialog"]') === null, true, "nothing claims to be a dialog");
  assert.equal(q(".profile-popup") === null, true, "and the Profile Popup is not on this page");
  await unmount();
});

/* ==================================================================
   2. The hero
   ================================================================== */

test("the hero shows the season card and the View rankings button", async () => {
  const unmount = await renderPage();

  assert.equal(
    q(".leaderboard-hero-eyebrow").textContent,
    "COMPETE • CLIMB • CONQUER",
    "the eyebrow is present",
  );
  assert.equal(
    q(".leaderboard-hero-content h1").textContent,
    "Leaderboard.",
    "the heading is present",
  );

  const season = q(".leaderboard-season");
  assert.match(season.textContent, /Season 01/, "the season card names the season");
  assert.match(season.textContent, /Active/, "and its status");

  const button = q(".leaderboard-hero-button");
  assert.ok(button, "the View rankings button is rendered");
  assert.match(button.textContent, /View rankings/, "with its label");

  await unmount();
});

test("the hero visual uses the ranking card and Arcadion artwork", async () => {
  const unmount = await renderPage();

  const cards = qa(".leaderboard-rank-card img");
  assert.equal(cards.length, 3, "three ranking cards");
  for (const card of cards) {
    assert.match(card.getAttribute("src"), /lead[123]\.png/, "each card uses its real artwork");
  }

  const arcadion = q(".leaderboard-arcadion img");
  assert.ok(arcadion, "the Arcadion artwork is present");
  assert.match(arcadion.getAttribute("src"), /leadArc\.png/, "using its real artwork");

  const ranks = qa(".leaderboard-floating-rank").map((n) => n.textContent);
  assert.deepEqual(ranks, ["#1", "#2", "#3"], "the floating rank labels");
  await unmount();
});

test("View rankings scrolls to the rankings section without throwing", async () => {
  const unmount = await renderPage();

  await click(q(".leaderboard-hero-button"));
  assert.ok(q("#leaderboard-rankings"), "the scroll target exists");
  await unmount();
});

/* ==================================================================
   3. The rankings section
   ================================================================== */

test("the rankings section offers an honest empty state, never invented scores", async () => {
  const unmount = await renderPage();

  const section = q("#leaderboard-rankings");
  assert.equal(
    q(".leaderboard-rankings-header h2").textContent,
    "Top Players",
    "the section heading is present",
  );
  assert.match(
    q(".leaderboard-rankings-eyebrow").textContent,
    /Season 01 • Active/,
    "with the season eyebrow",
  );

  const empty = q(".leaderboard-rankings-empty");
  assert.ok(empty, "the empty state is rendered");
  assert.match(empty.textContent, /Rankings are on their way/, "with an honest message");

  // No fabricated rankings: no player rows, no names, no points anywhere.
  assert.equal(qa(".leaderboard-rankings-empty ~ *").length, 0, "nothing follows the empty state");
  for (const invented of ["PlayerOne", "ShadowX", "Nova", "PixelRush", "GhostByte"]) {
    assert.equal(section.textContent.includes(invented), false, `no invented player "${invented}"`);
  }
  assert.equal(/\b\d{1,3}(,\d{3})+\s*(pts|points)/i.test(section.textContent), false,
    "no invented point totals");
  await unmount();
});

/* ==================================================================
   4. Return
   ================================================================== */

test("Return navigates back to the page the reader came from", async () => {
  const unmount = await renderPage(navbarUser(), "/games");

  await click(q(".leaderboard-return"));

  assert.deepEqual(pushedPaths, ["/games"], "it returns to the recorded page, not a guess");
  assert.equal(pushedPaths.includes("__back__"), false, "and it does not rely on history.back()");
  await unmount();
});

test("Return restores the Profile Popup through a transient, once-only marker", async () => {
  // The Navbar and the page are mounted together, exactly as App mounts them.
  const unmount = await renderNavbarWithPage(navbarUser(), "/games");
  await click(q(".avatar-button"));
  assert.equal(q(".profile-popup") === null, false, "the popup starts open");

  await click(q(".leaderboard-return"));

  // The return navigation is what brings the popup back, not a timer.
  assert.deepEqual(pushedPaths, ["/games"], "Return navigated back to the recorded page");
  assert.equal(q(".profile-popup") === null, false,
    "and the Profile Popup is restored, without a close-then-reopen wait");
  assert.match(q(".profile-popup").textContent, /Leaderboards/, "in its normal state");
  await unmount();
});

test("the restored popup does not appear again on an unrelated navigation", async () => {
  const unmount = await renderNavbarWithPage(navbarUser(), "/games");
  await click(q(".leaderboard-return"));
  assert.equal(q(".profile-popup") === null, false, "the popup came back once");

  // The reader dismisses the popup again, then navigates somewhere unrelated.
  await pointerDown(q(".leaderboard-rankings-header h2"));
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

/* ==================================================================
   5. The Profile Popup opens the Leaderboard
   ================================================================== */

test("the Profile Popup opens the Leaderboard by navigating, not by opening a layer", async () => {
  const unmount = await renderNavbar();
  await click(q(".avatar-button"));

  // NOTE: assertions here compare strings and counts, never DOM nodes. A failing
  // assert.equal on a node makes node:assert try to diff a jsdom element, which
  // exhausts memory and kills the process instead of reporting the failure.
  assert.equal(q(".profile-popup") === null, false, "the popup is open");

  const item = qa(".profile-popup-item")
    .find((n) => n.textContent.includes("Leaderboards"));
  assert.equal(item === undefined, false, "the Leaderboards option is present");

  await click(item);

  assert.deepEqual(pushedPaths, [navigation.LEADERBOARD_PATH],
    "it goes through the normal navigation helper to the page");
  assert.equal(q(".profile-popup") === null, true, "and the popup closes, so no two menus exist");
  await unmount();
});

test("the Leaderboards option keeps its trophy icon", async () => {
  const unmount = await renderNavbar();
  await click(q(".avatar-button"));

  const item = qa(".profile-popup-item")
    .find((n) => n.textContent.includes("Leaderboards"));
  assert.ok(item.querySelector(".profile-popup-icon svg"), "the option keeps its icon");
  await unmount();
});

/* ==================================================================
   6. Direct access
   ================================================================== */

test("the page renders standalone, as it does on a direct visit", async () => {
  // A reader who opens the route directly, or refreshes it, lands on the page
  // itself: no popup, no marker, just the page.
  const unmount = await renderPage();

  assert.ok(q(".leaderboard-page"), "the page renders on its own");
  assert.equal(q(".profile-popup") === null, true, "with no popup involved");
  assert.equal(q(".leaderboard-hero") === null, false, "the hero is intact");
  assert.equal(q(".leaderboard-return") === null, false, "and so is the Return button");
  await unmount();
});

test("App renders the Leaderboard for the /leaderboard route", async () => {
  // The route decision App makes on mount is the one a refresh re-runs, so the
  // whole app is rendered with the browser sitting on the route.
  dom.reconfigure({ url: "https://arcadia.test/leaderboard" });
  try {
    const unmount = await renderRoot(React.createElement(
      AuthContext.Provider,
      { value: authValue(null) },
      React.createElement(App),
    ));

    assert.ok(q(".leaderboard-page"), "App renders the Leaderboard page for the route");
    assert.ok(q(".leaderboard-hero"), "with its hero");
    assert.ok(q("#leaderboard-rankings"), "and the rankings section");
    assert.equal(q(".profile-popup") === null, true, "no popup on a direct visit");
    await unmount();
  } finally {
    dom.reconfigure({ url: "https://arcadia.test/" });
  }
});
