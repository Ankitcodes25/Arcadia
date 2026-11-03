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
let LeaderboardHome;
let AuthContext;
let authApi;
let AuthApiError;
let navigation;
let pushedPaths;
let profileLookups;

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
  window.matchMedia = window.matchMedia || ((media) => ({
    matches: media.includes("prefers-reduced-motion"),
    media,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return false; },
  }));
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  /*
    jsdom does not implement requestAnimationFrame unless it is asked to pretend
    to be visual, and the app's navigation helper calls it. Without this the
    navigation throws partway through and the assertions after it measure nothing.
  */
  globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
  globalThis.cancelAnimationFrame = (handle) => clearTimeout(handle);
  window.requestAnimationFrame = globalThis.requestAnimationFrame;
  window.cancelAnimationFrame = globalThis.cancelAnimationFrame;
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
  LeaderboardHome = (await vite.ssrLoadModule("/src/pages/Landingpage/Sections/LeaderboardHome.tsx")).default;
  AuthContext = (await vite.ssrLoadModule("/src/auth/AuthContext.tsx")).default;
  ({ authApi, AuthApiError } = await vite.ssrLoadModule("/src/auth/authApi.ts"));
  navigation = await vite.ssrLoadModule("/src/lib/navigation.ts");
});

after(async () => {
  await vite?.close();
  console.error = originalConsoleError;
});

beforeEach(() => {
  pushedPaths = [];
  profileLookups = [];

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
  authApi.getPublicPlayerProfile = async (identifier) => {
    profileLookups.push(identifier);
    const id = "playerId" in identifier ? identifier.playerId : `resolved-${identifier.username}`;
    const usernames = {
      "player-1": "PodiumPlayer",
      "player-2": "Beta",
      "player-4": "TargetPlayer",
    };
    return {
      profile: {
        id,
        username: usernames[id]
          ?? ("username" in identifier ? identifier.username : `Player-${id}`),
        playerId: null,
        avatar: { type: "local", value: "avatar-01" },
        avatarUrl: null,
        progression: progression({ totalXp: 100, level: 1, currentLevelXp: 0 }),
        completedMatches: 0,
        createdAt: "2024-03-15T08:00:00.000Z",
      },
    };
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
function renderPage(user = navbarUser(), returnPath = "/", entries) {
  return renderRoot(React.createElement(
    AuthContext.Provider,
    { value: authValue(user) },
    React.createElement(Leaderboard, { returnPath, entries }),
  ));
}

function renderLeaderboardHome(user = navbarUser()) {
  return renderRoot(React.createElement(
    AuthContext.Provider,
    { value: authValue(user) },
    React.createElement(LeaderboardHome),
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
  assert.ok(q(".leaderboard-podium"), "and the podium rankings");

  // Nothing about a modal survives: no backdrop, no dialog role, no X.
  assert.equal(q('[role="dialog"]') === null, true, "nothing claims to be a dialog");
  assert.equal(q(".profile-popup") === null, true, "and the Profile Popup is not on this page");
  await unmount();
});

/* ==================================================================
   2. The hero
   ================================================================== */

test("the hero presents the competition headline and copy", async () => {
  const unmount = await renderPage();

  assert.match(
    q(".leaderboard-hero-kicker").textContent,
    /Compete · Climb · Conquer/,
    "the kicker is present",
  );
  assert.equal(
    q(".leaderboard-hero-heading h1").textContent,
    "LEADERBOARD",
    "the heading is present",
  );
  assert.match(
    q(".leaderboard-hero-heading p").textContent,
    /Rise through the ranks/,
    "with the competition copy",
  );

  await unmount();
});

test("the hero visual uses the ranking card and Arcadion artwork", async () => {
  const unmount = await renderPage();

  const cards = qa(".leaderboard-hero-card");
  assert.equal(cards.length, 3, "three ranking cards");
  for (const card of cards) {
    assert.match(card.getAttribute("src"), /lead[123]\.png/, "each card uses its real artwork");
  }

  const arcadion = q(".leaderboard-hero-character");
  assert.ok(arcadion, "the Arcadion artwork is present");
  assert.match(arcadion.getAttribute("src"), /leadArc\.png/, "using its real artwork");

  assert.match(q(".leaderboard-hero-note").textContent, /Only one.*wears.*the crown/, "the crown note");
  await unmount();
});

test("the rankings are reachable on the same page as the hero", async () => {
  const unmount = await renderPage();

  assert.ok(q(".leaderboard-hero"), "the hero is rendered");
  assert.ok(q(".leaderboard-filters"), "the filters follow it");
  assert.ok(q(".leaderboard-table"), "and the ranking table is on the same page");
  await unmount();
});

/* ==================================================================
   3. The rankings section
   ================================================================== */

test("the default rankings come from the centralized development fixtures", async () => {
  const unmount = await renderPage();

  const notice = q(".leaderboard-demo-note");
  assert.ok(notice, "the development demo notice is shown");
  assert.match(notice.textContent, /development demo/i, "and says the data is demo-only");

  // The podium is the top three by XP from the single fixture file.
  assert.equal(q(".leaderboard-slot-1 .leaderboard-card-player").textContent, "SolarisPrime");
  assert.equal(q(".leaderboard-slot-2 .leaderboard-card-player").textContent, "AstralFox");
  assert.equal(q(".leaderboard-slot-3 .leaderboard-card-player").textContent, "Crownless");

  // The table continues from rank 4, so no fixture is duplicated.
  assert.ok(q(".leaderboard-table"), "the ranking table is rendered");
  assert.deepEqual(
    qa(".leaderboard-cell-name").map((node) => node.textContent),
    ["TitanVale", "PixelSage", "EchoWarden", "LudoLynx", "QuasarKid", "ByteBard", "NovaRider"],
    "the table continues the same fixture order",
  );

  // None of the old scattered demo names survive anywhere on the page.
  for (const invented of ["PlayerOne", "ShadowX", "PixelRogue", "GhostByte"]) {
    assert.equal(document.body.textContent.includes(invented), false,
      `no old scattered player "${invented}"`);
  }
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
  await click(q(".avatar-button"));
  assert.equal(q(".profile-popup") === null, false, "the popup starts open");
  await click(q(".leaderboard-return"));
  assert.equal(q(".profile-popup") === null, false, "the popup came back once");

  // The reader dismisses the popup again, then navigates somewhere unrelated.
  await pointerDown(q(".leaderboard-hero-kicker"));
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

test("a real leaderboard row opens and closes the read-only player profile without losing filters", async () => {
  const entries = [
    { id: "player-1", name: "Alpha", level: 8, xp: 800, wins: 20 },
    { id: "player-2", name: "Beta", level: 7, xp: 700, wins: 18 },
    { id: "player-3", name: "Gamma", level: 6, xp: 600, wins: 14 },
    { id: "player-4", name: "TargetPlayer", level: 5, xp: 500, wins: 11 },
  ];
  const unmount = await renderPage(navbarUser(), "/", entries);
  const search = q(".leaderboard-search input");

  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(search, "TargetPlayer");
    search.dispatchEvent(new window.Event("input", { bubbles: true }));
  });

  await click(q(".leaderboard-profile-trigger"));
  assert.deepEqual(profileLookups.at(-1), { playerId: "player-4" });
  assert.equal(q('[role="dialog"]')?.getAttribute("aria-labelledby"), "player-profile-title");
  assert.match(q(".player-profile-username").textContent, /TargetPlayer/);
  assert.equal(q(".player-profile-friend-button").disabled, true);
  assert.equal(q(".player-profile-friend-unavailable"), null);
  assert.equal(q(".player-profile-player-id-value").textContent, "—");
  assert.match(q(".player-profile-member-since").textContent, /Member since/);
  assert.match(q(".player-profile-rank-pill").textContent, /#4.*Global Rank/);
  assert.ok(q(".mpm-identity-name-row .copy-field-button"));
  assert.equal(q(".mpm-stat-card .mpm-stat-value").textContent, "—");
  assert.equal(q(".mpm-table tbody tr:first-child td:nth-child(2)").textContent, "—");
  assert.equal(q("[role=progressbar]"), null, "profile level has no progress bar");

  await click(q(".player-profile-close"));
  assert.equal(q('[role="dialog"]'), null);
  assert.equal(q(".leaderboard-search input").value, "TargetPlayer");
  assert.match(q(".leaderboard-cell-name").textContent, /TargetPlayer/);

  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(search, "Beta");
    search.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  await click(q(".leaderboard-profile-trigger"));
  assert.deepEqual(profileLookups.at(-1), { playerId: "player-2" });
  assert.match(q(".player-profile-username").textContent, /Beta/);
  await click(q(".player-profile-close"));

  await click(q(".leaderboard-row-body .leaderboard-col-level"));
  assert.deepEqual(profileLookups.at(-1), { playerId: "player-2" });
  assert.match(q(".player-profile-username").textContent, /Beta/);
  await click(q(".player-profile-close"));
  await unmount();
});

test("clicking anywhere on a leaderboard podium card opens that player's profile", async () => {
  const unmount = await renderPage(navbarUser(), "/", [
    { id: "player-1", name: "PodiumPlayer", level: 8, xp: 800, wins: 20 },
    { id: "player-2", name: "SecondPlayer", level: 7, xp: 700, wins: 18 },
    { id: "player-3", name: "ThirdPlayer", level: 6, xp: 600, wins: 14 },
  ]);
  const podiumCard = qa(".leaderboard-card").find((card) => card.textContent.includes("PodiumPlayer"));

  assert.ok(podiumCard);
  await click(podiumCard.querySelector(".leaderboard-card-score"));
  assert.deepEqual(profileLookups.at(-1), { playerId: "player-1" });
  assert.match(q(".player-profile-username").textContent, /PodiumPlayer/);
  await click(q(".player-profile-close"));
  assert.equal(q('[role="dialog"]'), null);

  const secondCard = qa(".leaderboard-card").find((card) => card.textContent.includes("SecondPlayer"));
  await click(secondCard);
  assert.deepEqual(profileLookups.at(-1), { playerId: "player-2" });
  assert.match(q(".player-profile-username").textContent, /Beta/);
  await act(async () => {
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  assert.equal(q('[role="dialog"]'), null);
  await unmount();
});

test("default leaderboard preview cards open profiles by authorized username lookup", async () => {
  const unmount = await renderPage();
  const firstCard = q(".leaderboard-card.is-first");

  assert.ok(firstCard);
  await click(firstCard.querySelector(".leaderboard-card-rank"));
  assert.deepEqual(profileLookups.at(-1), { username: "SolarisPrime" });
  assert.equal(q('[role="dialog"]')?.getAttribute("aria-labelledby"), "player-profile-title");
  assert.match(q(".player-profile-username").textContent, /SolarisPrime/);

  await click(q(".player-profile-close"));
  assert.equal(q('[role="dialog"]'), null);
  await unmount();
});

test("clicking anywhere on Home Top 10 cards opens the corresponding public profiles", async () => {
  const unmount = await renderLeaderboardHome();
  const cards = qa(".leaderboard-home-profile-card");

  assert.equal(cards.length, 10, "the centralized fixture fills the whole Top 10");
  assert.match(q(".leaderboard-home-demo").textContent, /development demo/i);

  await click(cards[0].querySelector(".leaderboard-home-score"));
  assert.deepEqual(profileLookups.at(-1), { username: "SolarisPrime" });
  assert.match(q(".player-profile-username").textContent, /SolarisPrime/);
  await click(q(".player-profile-close"));

  await click(cards[1]);
  assert.deepEqual(profileLookups.at(-1), { username: "AstralFox" });
  assert.match(q(".player-profile-username").textContent, /AstralFox/);
  await click(q(".player-profile-close"));

  await unmount();
});

test("unresolved preview players receive the complete centralized development profile", async () => {
  authApi.getPublicPlayerProfile = async () => {
    throw new AuthApiError("Player profile not found", 404);
  };
  const unmount = await renderLeaderboardHome();

  await click(q(".leaderboard-home-profile-card .leaderboard-home-score"));
  assert.match(q(".player-profile-username").textContent, /SolarisPrime/);
  assert.match(q(".player-profile-demo-note").textContent, /development demo/i);
  assert.equal(q(".player-profile-player-id-value").textContent, "ARC-0F9V4K7M");
  assert.deepEqual(
    [...q(".player-profile-progression-badges").children].map((badge) => badge.textContent.trim().replace(/\s+/g, " ")),
    ["Arcadia Supreme", "LEVEL 40", "51,000 XP"],
  );
  assert.equal(q(".mpm-level-card"), null);
  assert.equal(q(".player-profile-member-since").textContent.includes("19 July 2024"), true);
  assert.match(q(".player-profile-rank-pill").textContent, /#1/);
  assert.equal(qa(".mpm-stat-card").length, 9);
  assert.deepEqual(
    [...qa(".mpm-section")[1].querySelectorAll(".mpm-stat-label")].map((node) => node.textContent),
    ["Total Matches", "Total Wins", "Best Score", "Win Rate"],
  );
  assert.equal(q(".mpm-stat-card .mpm-stat-value").textContent, "612");
  assert.equal(q(".mpm-table tbody tr:first-child td:nth-child(2)").textContent, "168,000");
  await click(q(".player-profile-report-button"));
  assert.equal(q(".report-player-target-identity strong").textContent, "SolarisPrime");
  assert.equal(q(".report-player-target-identity > span").textContent, "Player ID: ARC-0F9V4K7M");
  await click(q(".report-player-cancel"));
  assert.ok(q(".player-profile-modal"), "cancel reveals the still-open preview profile");
  assert.ok(q(".player-profile-report-button"), "Report Player remains available on the profile");
  assert.equal(q(".player-profile-friend-button").disabled, true);
  assert.equal(q(".player-profile-friend-unavailable"), null);
  assert.equal(q(".player-profile-state"), null);
  await click(q(".player-profile-close"));
  assert.equal(q('[role="dialog"]'), null);
  await unmount();
});

test("real profile restores the level, XP and Rookie badges and places actions correctly", async () => {
  authApi.getPublicPlayerProfile = async () => ({
    profile: {
      id: "profile-player",
      username: "PlayerOne",
      playerId: "ARC-TEST0001",
      avatar: { type: "local", value: "avatar-01" },
      avatarUrl: null,
      progression: progression(),
      completedMatches: 1,
      createdAt: "2024-03-15T08:00:00.000Z",
    },
  });
  const unmount = await renderLeaderboardHome();

  await click(q(".leaderboard-home-profile-card"));
  const progressionBadges = [...q(".player-profile-progression-badges").children];
  assert.deepEqual(
    progressionBadges.map((item) => item.textContent.trim().replace(/\s+/g, " ")),
    ["Arcadia Rookie", "LEVEL 00", "0 XP"],
  );
  assert.equal(progressionBadges[0].dataset.earned, "true");
  assert.equal(q(".mpm-level-card"), null);
  assert.deepEqual(
    [...qa(".mpm-section")[1].querySelectorAll(".mpm-stat-label")].map((node) => node.textContent),
    ["Total Matches", "Total Wins", "Best Score", "Win Rate"],
  );

  const avatarColumn = q(".player-profile-avatar-column");
  assert.ok(avatarColumn.contains(q(".player-profile-friend-button")));
  assert.equal(q(".player-profile-header .player-profile-friend-button"), null);
  const reportButton = q(".player-profile-body > .player-profile-report-button");
  assert.ok(reportButton);
  assert.equal(q(".player-profile-header .player-profile-report-button"), null);
  await click(reportButton);
  const reportDialog = q(".report-player-modal");
  assert.ok(reportDialog);
  assert.equal(q(".player-profile-modal").classList.contains("player-profile-modal--report-open"), true);
  assert.equal(q(".player-profile-modal").hasAttribute("inert"), true);
  assert.ok(q(".player-profile-close").classList.contains("arcadia-modal-close"));
  assert.match(reportDialog.querySelector("#report-player-title").textContent, /Report Player/);
  assert.ok(reportDialog.querySelector(".report-player-heading-icon").classList.contains("mpm-header-icon"));
  assert.match(reportDialog.querySelector("#report-player-subtitle").textContent, /Help keep Arcadia safe and fair/);
  assert.equal(reportDialog.querySelector(".report-player-target-identity strong").textContent, "PlayerOne");
  assert.equal(reportDialog.querySelector(".report-player-target-identity > span").textContent, "Player ID: ARC-TEST0001");
  assert.equal(reportDialog.querySelector("#report-player-reason").getAttribute("aria-required"), "true");
  assert.equal(reportDialog.querySelector("#report-player-reason").getAttribute("aria-haspopup"), "listbox");
  assert.equal(reportDialog.querySelector("#report-player-details").maxLength, 100);
  assert.ok(reportDialog.querySelector(".report-player-close").classList.contains("mpm-close"));
  assert.ok(reportDialog.querySelector(".report-player-close").classList.contains("arcadia-modal-close"));
  assert.equal(reportDialog.querySelector(".report-player-submit").disabled, true);

  await click(reportDialog.querySelector(".report-player-cancel"));
  assert.equal(q(".report-player-modal"), null);
  assert.equal(q(".player-profile-modal").classList.contains("player-profile-modal--report-open"), false);

  await click(reportButton);
  const reopenedReport = q(".report-player-modal");
  await click(reopenedReport.querySelector("#report-player-reason"));
  const reasonList = q("#report-player-reason-listbox");
  assert.equal(reasonList.getAttribute("role"), "listbox");
  assert.equal(qa("#report-player-reason-listbox [role='option']").length, 6);
  assert.equal(reasonList.style.maxHeight, "", "the complete options list is not scroll-limited");
  await act(async () => {
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  assert.equal(q("#report-player-reason-listbox"), null, "Escape first closes the open reason list");
  assert.ok(q(".report-player-modal"), "closing the list leaves the report modal open");
  await click(reopenedReport.querySelector("#report-player-reason"));
  await click(q("#report-player-reason-option-0"));
  assert.equal(reopenedReport.querySelector("#report-player-reason").textContent.trim(), "Harassment or bullying");

  await act(async () => {
    const details = reopenedReport.querySelector("#report-player-details");
    const detailsSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    detailsSetter.call(details, "A test report");
    details.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  assert.equal(reopenedReport.querySelector(".report-player-submit").disabled, false);
  await click(reopenedReport.querySelector(".report-player-submit"));
  assert.match(q(".report-player-error").textContent, /not available yet\. No report was submitted/);
  assert.equal(q("#report-player-reason").textContent.trim(), "Harassment or bullying");
  assert.equal(q("#report-player-details").value, "A test report");

  await act(async () => {
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  assert.equal(q(".report-player-modal"), null, "Escape closes only the topmost modal");
  assert.ok(q(".player-profile-modal"), "the Player Profile remains open");

  await click(reportButton);
  await click(q(".report-player-close"));
  assert.equal(q(".report-player-modal"), null, "X closes only the report modal");
  assert.ok(q(".player-profile-modal"));

  await click(reportButton);
  await act(async () => {
    const backdrop = q(".report-player-backdrop");
    backdrop.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true }));
  });
  assert.equal(q(".report-player-modal"), null, "the report backdrop closes the report modal");
  assert.ok(q(".player-profile-modal"), "backdrop close preserves the profile modal");

  assert.equal(q(".mpm-stat-card .mpm-stat-value").textContent, "—");
  assert.match(q(".player-profile-rank-pill").textContent.replace(/\s+/g, " ").trim(), /^#1\s*Global Rank$/);
  await click(q(".player-profile-close"));
  assert.equal(q('[role="dialog"]'), null);
  await unmount();
});

test("private profiles show a clear privacy state and never fall back to preview data", async () => {
  authApi.getPublicPlayerProfile = async () => {
    throw new AuthApiError("This profile is private", 403);
  };
  const unmount = await renderLeaderboardHome();
  await click(q(".leaderboard-home-profile-card"));

  assert.match(q(".player-profile-state").textContent, /This profile is private/);
  assert.equal(q(".player-profile-username").textContent, "SolarisPrime");
  assert.equal(q(".mpm-stat-card"), null);
  assert.equal(q(".player-profile-friend-button"), null);
  await unmount();
});

test("own leaderboard entries cannot open a friend-enabled player profile", async () => {
  const ownUser = navbarUser();
  const unmount = await renderPage(ownUser, "/", [
    { id: ownUser.id, name: ownUser.username, level: 1, xp: 0, wins: 0 },
    { id: "player-2", name: "Other", level: 2, xp: 10, wins: 1 },
    { id: "player-3", name: "Another", level: 3, xp: 20, wins: 2 },
  ]);

  const ownCard = qa(".leaderboard-card").find((card) => card.textContent.includes(ownUser.username));
  assert.ok(ownCard);
  assert.equal(ownCard.getAttribute("role"), null);
  await click(ownCard);
  assert.equal(q('[role="dialog"]'), null);
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
    assert.ok(q(".leaderboard-podium"), "and the rankings");
    assert.equal(q(".profile-popup") === null, true, "no popup on a direct visit");
    await unmount();
  } finally {
    dom.reconfigure({ url: "https://arcadia.test/" });
  }
});
