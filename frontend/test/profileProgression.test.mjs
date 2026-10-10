import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

const frontendRoot = fileURLToPath(new URL("../", import.meta.url));
const originalConsoleError = console.error;

let dom;
let vite;
let React;
let act;
let createRoot;
let root;
let MyProfileModal;
let MyProfileContainer;
let UsernameOnboarding;
let AuthContext;
let progressionModule;
let authApi;
let AuthApiError;
let originalCheckUsernameAvailability;

/* ------------------------------------------------------------------
   Progression fixtures. Every value is what the backend returns; the
   frontend never computes a level, a title or a badge itself.
   ------------------------------------------------------------------ */

/*
 * The backend tier table, reproduced so a fixture can never claim a title,
 * badge or theme that does not belong to its level. The tier is resolved from
 * the requested level, so a boundary test cannot accidentally disagree with the
 * real mapping.
 */
const BACKEND_TIERS = [
  { maxLevel: 4, title: "Arcadia Rookie", badgeKey: "bronze", themeKey: "bronze" },
  { maxLevel: 9, title: "Arcadia Challenger", badgeKey: "silver", themeKey: "silver" },
  { maxLevel: 14, title: "Arcadia Veteran", badgeKey: "gold", themeKey: "gold" },
  { maxLevel: 19, title: "Arcadia Master", badgeKey: "diamond", themeKey: "diamond" },
  { maxLevel: 29, title: "Arcadia Legend", badgeKey: "crown", themeKey: "crown" },
  { maxLevel: null, title: "Arcadia Supreme", badgeKey: "flame", themeKey: "flame" },
];

function progression(overrides = {}) {
  const level = Number(overrides.level ?? 0);
  const tier = BACKEND_TIERS.find((t) => t.maxLevel === null || level <= t.maxLevel);
  return {
    totalXp: 0,
    level,
    currentLevelXp: 0,
    nextLevelXp: 100,
    progressPercent: 0,
    title: tier.title,
    badgeKey: tier.badgeKey,
    themeKey: tier.themeKey,
    ...overrides,
  };
}

function accountProfile(overrides = {}) {
  return {
    id: "user-1",
    name: "",
    username: "ankitbuilds",
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
    createdAt: "2026-09-14T10:00:00.000Z",
    updatedAt: null,
    lastLoginAt: null,
    gamingStats: {
      gamesPlayed: 0,
      gamesWon: 0,
      totalScore: 0,
      bestScore: 0,
      currentStreak: 0,
      winRatePercent: 0,
    },
    ...overrides,
  };
}

function installDom() {
  // The animation frame loop is intentionally left off: these tests assert
  // markup and state, and the rAF loop starves long real-time waits.
  dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://arcadia.test/",
  });

  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  for (const key of [
    "HTMLElement",
    "HTMLInputElement",
    "HTMLButtonElement",
    "Element",
    "Node",
    "Event",
    "MouseEvent",
    "KeyboardEvent",
    "CustomEvent",
    "MutationObserver",
  ]) {
    globalThis[key] = window[key];
  }
  Object.defineProperty(globalThis, "navigator", {
    value: window.navigator,
    configurable: true,
  });
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  if (window.requestAnimationFrame) {
    globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
    globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
}

before(async () => {
  // Timer driven state updates land while the test is sleeping, so React logs
  // its "not wrapped in act" notice. That warning is expected here; every other
  // console error is still surfaced.
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
  MyProfileModal = (await vite.ssrLoadModule("/src/pages/Myprofile/MyProfileModal.tsx")).default;
  MyProfileContainer = (await vite.ssrLoadModule("/src/pages/Myprofile/MyProfileContainer.tsx")).default;
  UsernameOnboarding = (await vite.ssrLoadModule("/src/auth/UsernameOnboarding.tsx")).default;
  AuthContext = (await vite.ssrLoadModule("/src/auth/AuthContext.tsx")).default;
  progressionModule = await vite.ssrLoadModule("/src/auth/progression.ts");
  ({ authApi, AuthApiError } = await vite.ssrLoadModule("/src/auth/authApi.ts"));
  originalCheckUsernameAvailability = authApi.checkUsernameAvailability.bind(authApi);
  // Every username surface asks the backend before accepting a name, so the
  // shared module is stubbed once here. Tests that care override it.
  authApi.checkUsernameAvailability = async () => ({ available: true });
});

after(async () => {
  if (authApi && originalCheckUsernameAvailability) {
    authApi.checkUsernameAvailability = originalCheckUsernameAvailability;
  }
  await vite?.close();
  console.error = originalConsoleError;
});

/** Makes the shared availability lookup answer available/unavailable. */
function setUsernameAvailable(available) {
  authApi.checkUsernameAvailability = async (username) => {
    availabilityLookups.push(username);
    return { available };
  };
}

const availabilityLookups = [];

/*
 * The shared availability lookup is reset before every test, so one test's
 * answer can never decide another test's outcome. Tests that care about the
 * answer call setUsernameAvailable / setUsernameLookupFailure themselves.
 */
beforeEach(() => {
  authApi.checkUsernameAvailability = async () => ({ available: true });
  availabilityLookups.length = 0;
});

/** Simulates the availability endpoint being unreachable. */
function setUsernameLookupFailure() {
  authApi.checkUsernameAvailability = async () => {
    throw new Error("network unavailable");
  };
}

async function renderRoot(element) {
  await act(async () => {
    root?.unmount();
  });
  document.body.innerHTML = "";

  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root.render(element);
  });

  return () => act(async () => root.unmount());
}

function q(selector) {
  return document.querySelector(selector);
}

/** The username value currently shown in the My Profile identity block. */
function usernameText() {
  return q('[data-field="username"]').textContent;
}

/** The Player ID currently shown in the My Profile identity block. */
function playerIdText() {
  return q('[data-field="playerId"]').textContent;
}

function qa(selector) {
  return [...document.querySelectorAll(selector)];
}

function click(node) {
  act(() => {
    node.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function typeInto(input, value) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

function submitForm() {
  act(() => {
    q(".unm-modal form").dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}

/* ==================================================================
   Progression view: pure, no DOM, no real-time waits
   ================================================================== */

test("the progression view renders Level 0 from the backend payload", () => {
  const view = progressionModule.getProgressionView(progression());

  assert.equal(view.level, 0);
  assert.equal(view.levelLabel, "LEVEL 00");
  assert.equal(view.title, "Arcadia Rookie");
  assert.equal(view.badgeKey, "bronze");
  assert.equal(view.themeKey, "bronze");
  assert.equal(view.isAnimated, false);
  assert.equal(view.currentLevelXp, 0);
  assert.equal(view.nextLevelXp, 100);
  assert.equal(view.progressPercent, 0);
  assert.equal(view.xpLabel, "0 / 100 XP");
});

test("the progression view renders the documented mid-level example", () => {
  // 180 XP banked inside Level 1, which needs 200 more for Level 2.
  const view = progressionModule.getProgressionView(progression({
    totalXp: 280,
    level: 1,
    currentLevelXp: 180,
    nextLevelXp: 200,
    progressPercent: 90,
    title: "Arcadia Rookie",
    badgeKey: "bronze",
    themeKey: "bronze",
  }));

  assert.equal(view.levelLabel, "LEVEL 01");
  assert.equal(view.xpLabel, "180 / 200 XP");
  assert.equal(view.progressPercent, 90);
  assert.equal(view.nextLevelLabel, "200 XP to Level 2");
});

test("the progression view never renders NaN, Infinity or an out of range bar", () => {
  const hostile = [
    undefined,
    null,
    {},
    { level: Number.NaN, currentLevelXp: Number.NaN, nextLevelXp: Number.NaN, progressPercent: Number.NaN },
    { level: Infinity, currentLevelXp: Infinity, nextLevelXp: Infinity, progressPercent: Infinity },
    { level: -5, currentLevelXp: -50, nextLevelXp: -10, progressPercent: -80 },
    { level: 1.5, currentLevelXp: 1.5, nextLevelXp: 1.5, progressPercent: 12.5 },
    { level: 999999, currentLevelXp: 0, nextLevelXp: 0, progressPercent: 0 },
    { level: 3, title: "", badgeKey: "unknown-badge", themeKey: "unknown-theme" },
  ];

  for (const value of hostile) {
    const view = progressionModule.getProgressionView(value);
    assert.ok(Number.isFinite(view.progressPercent), JSON.stringify(value));
    assert.ok(view.progressPercent >= 0 && view.progressPercent <= 100, JSON.stringify(value));
    assert.ok(Number.isInteger(view.level) && view.level >= 0, JSON.stringify(value));
    assert.ok(Number.isFinite(view.currentLevelXp), JSON.stringify(value));
    assert.ok(Number.isFinite(view.nextLevelXp), JSON.stringify(value));
    assert.ok(Number.isFinite(view.totalXp), JSON.stringify(value));
    assert.doesNotMatch(view.xpLabel, /NaN|Infinity|undefined/, JSON.stringify(value));
    assert.doesNotMatch(view.levelLabel, /NaN|Infinity/, JSON.stringify(value));
    assert.ok(view.title.length > 0, JSON.stringify(value));
  }

  // A missing progression object still produces a usable Level 0 view.
  const empty = progressionModule.getProgressionView(undefined);
  assert.equal(empty.level, 0);
  assert.equal(empty.levelLabel, "LEVEL 00");
  assert.equal(empty.progressPercent, 0);
});

test("only the backend badge key decides the animated flame tier", () => {
  // The six tier themes from the backend tier table, each paired with the
  // material it is named after. Only `flame` is the animated top tier.
  const tiers = [
    ["bronze", "bronze", false],
    ["silver", "silver", false],
    ["gold", "gold", false],
    ["diamond", "diamond", false],
    ["crown", "crown", false],
    ["flame", "flame", true],
  ];

  for (const [badgeKey, themeKey, isAnimated] of tiers) {
    const view = progressionModule.getProgressionView(progression({
      level: 30,
      title: "Arcadia Supreme",
      badgeKey,
      themeKey,
    }));
    assert.equal(view.badgeKey, badgeKey);
    assert.equal(view.themeKey, themeKey);
    assert.equal(view.isAnimated, isAnimated, badgeKey);
  }

  // The animation itself is keyed off the badge, never off the theme.
  assert.equal(progressionModule.isAnimatedBadge("flame"), true);
  assert.equal(progressionModule.isAnimatedBadge("gold"), false);
});

test("My Profile leads with the Player ID, then the username, then the badge title", async () => {
  const unmount = await renderRoot(React.createElement(MyProfileModal, {
    profile: accountProfile({
      // The Legend tier exactly as the backend tier table describes it.
    progression: progression({ level: 20, title: "Arcadia Legend", badgeKey: "crown", themeKey: "crown" }),
    }),
    onClose: () => {},
    onSaveUsername: async () => {},
  }));

  const identity = q(".mpm-identity");

  // The order is the hierarchy: Player ID, then username, then badge title.
  const fields = [...identity.querySelectorAll("[data-field]")].map((node) => node.dataset.field);
  assert.deepEqual(
    fields.slice(0, 3),
    ["playerId", "username", "progressionTitle"],
    "Player ID leads, the username is the main text, the title follows",
  );

  // Only the Player ID carries a label; the username is a name, not a field.
  assert.deepEqual(
    qa(".mpm-identity .mpm-identity-label").map((node) => node.textContent),
    ["Player ID"],
    "there is no USERNAME label above the username",
  );
  assert.equal(usernameText(), "ankitbuilds", "the username is the main identity text");
  assert.equal(playerIdText(), "ARC-7K4M2P9Q");
  assert.equal(
    q('[data-field="progressionTitle"]').textContent,
    "Arcadia Legend",
    "the title comes from the progression, not a hardcoded string",
  );
  assert.equal(
    q('[data-field="progressionTitle"]').className,
    "mpm-identity-title mpm-identity-title--crown",
    "the title pill is tinted by the progression theme",
  );

  const playerValue = q('[data-field="playerId"]');
  const nameValue = q('[data-field="username"]');
  // The Player ID stays secondary to the username and remains copyable. The
  // actual type sizes are a stylesheet concern, asserted in myProfileLayout.
  assert.ok(
    playerValue.classList.contains("mpm-identity-value--player"),
    "the Player ID carries the secondary type treatment",
  );
  assert.ok(
    nameValue.classList.contains("mpm-identity-value--name"),
    "the username carries the main type treatment",
  );
  assert.ok(q('button[aria-label="Copy player ID"]'), "the Player ID is still copyable");
  await unmount();
});

test("the badge title follows the progression and never falls back to a hardcoded name", async () => {
  const unmount = await renderRoot(React.createElement(MyProfileModal, {
    profile: accountProfile({ progression: progression({ level: 2, title: "Ember Scout" }) }),
    onClose: () => {},
    onSaveUsername: async () => {},
  }));

  assert.equal(q('[data-field="progressionTitle"]').textContent, "Ember Scout");
  await unmount();

  // A new progression value updates the title without any other change.
  const updated = await renderRoot(React.createElement(MyProfileModal, {
    profile: accountProfile({ progression: progression({ level: 9, title: "Arcadia Sovereign" }) }),
    onClose: () => {},
    onSaveUsername: async () => {},
  }));
  assert.equal(
    q('[data-field="progressionTitle"]').textContent,
    "Arcadia Sovereign",
    "the title is a pure function of the progression the backend sent",
  );
  await updated();
});

test("My Profile shows the username and Player ID, and no Google name in the identity block", async () => {
  const unmount = await renderRoot(React.createElement(MyProfileModal, {
    profile: accountProfile(),
    onClose: () => {},
    onSaveUsername: async () => {},
  }));

  assert.equal(usernameText(), "ankitbuilds");
  assert.equal(playerIdText(), "ARC-7K4M2P9Q");

  // The Google fetched name is not part of the identity block.
  const identity = q(".mpm-identity").textContent;
  assert.doesNotMatch(identity, /Ankit Das/, "the Google display name is not shown");
  assert.equal(q(".mpm-identity-row"), null);

  // The joined date lives in Account Info now, not in the identity block.
  assert.match(
    q('[data-field="joinedDate"]').textContent,
    /^\d{1,2} [A-Z][a-z]+ \d{4}$/,
    "the joined date renders in full",
  );
  assert.equal(q(".mpm-provider-pill"), null, "the header Google badge is gone");

  const googleUnmount = await renderRoot(React.createElement(MyProfileModal, {
    profile: accountProfile({
      authProvider: "GOOGLE",
      avatar: { type: "google", value: "google" },
      avatarSource: "google",
      googleAvatarAvailable: true,
      googleAvatarUrl: "https://lh3.googleusercontent.com/a/test-avatar",
    }),
    onClose: () => {},
    onSaveUsername: async () => {},
  }));

  // Google identity is still represented, under Account Info instead.
  assert.equal(
    q('[data-field="loginMethod"]').textContent,
    "Google · user@example.com",
  );
  assert.equal(playerIdText(), "ARC-7K4M2P9Q", "the Player ID is the same on a Google account");
  assert.doesNotMatch(q(".mpm-identity").textContent, /Ankit Das/);
  await googleUnmount();
  await unmount();
});

test("My Profile shows an em dash when an account has no Player ID yet", async () => {
  const unmount = await renderRoot(React.createElement(MyProfileModal, {
    profile: accountProfile({ playerId: null }),
    onClose: () => {},
    onSaveUsername: async () => {},
  }));

  assert.equal(playerIdText(), "—", "a pending Player ID is not shown as a broken value");
  assert.equal(q('button[aria-label="Copy player ID"]').disabled, true, "nothing to copy");
  assert.equal(q('button[aria-label="Copy username"]').disabled, false);
  await unmount();
});

/* ==================================================================
   My Profile: identity, level, avatar and Save Changes
   ================================================================== */

test("My Profile renders the backend level, title and XP progress", async () => {
  const unmount = await renderRoot(React.createElement(MyProfileModal, {
    profile: accountProfile({
      progression: progression({
        totalXp: 1500,
        level: 5,
        currentLevelXp: 0,
        nextLevelXp: 550,
        progressPercent: 0,
        title: "Arcadia Challenger",
        badgeKey: "silver",
        themeKey: "silver",
      }),
    }),
    onClose: () => {},
    onSaveUsername: async () => {},
  }));

  assert.equal(q(".mpm-level-badge").textContent, "05");
  assert.equal(q(".mpm-level-title").textContent, "LEVEL 05");
  assert.equal(q(".mpm-level-sub").textContent, "Arcadia Challenger");
  assert.equal(q(".mpm-level-xp").textContent, "0 / 550 XP");
  assert.equal(q(".mpm-level-card").dataset.badge, "silver");
  assert.ok(q(".mpm-level-card").classList.contains("mpm-level-card--silver"));
  assert.equal(q(".mpm-progress-fill").style.width, "0%");
  assert.equal(q(".mpm-progress-track").getAttribute("aria-valuemax"), "550");
  await unmount();
});

test("My Profile renders Level 0 and a mid-level progress bar without NaN", async () => {
  const unmount = await renderRoot(React.createElement(MyProfileModal, {
    profile: accountProfile({
      progression: progression({
        totalXp: 280,
        level: 1,
        currentLevelXp: 180,
        nextLevelXp: 200,
        progressPercent: 90,
      }),
    }),
    onClose: () => {},
    onSaveUsername: async () => {},
  }));

  assert.equal(q(".mpm-level-title").textContent, "LEVEL 01");
  assert.equal(q(".mpm-level-xp").textContent, "180 / 200 XP");
  assert.equal(q(".mpm-progress-fill").style.width, "90%");

  const levelZero = await renderRoot(React.createElement(MyProfileModal, {
    profile: accountProfile({
      progression: progression({
        level: Number.NaN,
        currentLevelXp: Number.NaN,
        nextLevelXp: Number.NaN,
        progressPercent: Number.NaN,
      }),
    }),
    onClose: () => {},
    onSaveUsername: async () => {},
  }));

  assert.equal(q(".mpm-level-title").textContent, "LEVEL 00");
  assert.equal(q(".mpm-level-xp").textContent, "0 / 0 XP");
  assert.equal(q(".mpm-progress-fill").style.width, "0%");
  assert.doesNotMatch(document.body.textContent, /NaN|Infinity/);
  await levelZero();
  await unmount();
});

test("My Profile is informational and carries no generic action row", async () => {
  const unmount = await renderRoot(React.createElement(MyProfileModal, {
    profile: accountProfile(),
    onClose: () => {},
    onSaveUsername: async () => {},
  }));

  // The Reset Changes / Save Changes row is gone entirely.
  assert.equal(q(".mpm-actions"), null, "the action row itself is removed");
  assert.equal(q(".mpm-save"), null, "My Profile has no Save Changes button");
  assert.equal(q(".mpm-reset"), null, "My Profile has no Reset Changes button");
  assert.equal(q(".mpm-pending-pill"), null, "nothing can be staged as unsaved");

  // Only the contextual controls that belong to a profile element remain.
  assert.ok(q(".mpm-close"), "the top-right X is still there");
  assert.ok(q('button[aria-label="Edit username"]'), "the username pencil remains");
  assert.ok(q('button[aria-label="Copy username"]'), "the username copy remains");
  assert.ok(q('button[aria-label="Copy player ID"]'), "the Player ID copy remains");
  assert.ok(q('button[aria-label="Edit avatar"]'), "the avatar pencil remains");

  // No generic action label was reintroduced anywhere in the dialog.
  const labels = qa(".mpm-modal button")
    .map((node) => `${node.getAttribute("aria-label") ?? ""} ${node.textContent}`.trim().toLowerCase());
  assert.deepEqual(
    labels.filter((label) => /save changes|reset changes|edit profile|^close$/.test(label)),
    [],
    "no generic action labels remain",
  );
  await unmount();
});

test("the Username Modal saves the username and closes only after the write succeeds", async () => {
  const saves = [];
  let resolveSave;
  const onSaveUsername = (username) => {
    saves.push(username);
    return new Promise((resolve) => {
      resolveSave = resolve;
    });
  };

  const unmount = await renderRoot(React.createElement(MyProfileModal, {
    profile: accountProfile(),
    onClose: () => {},
    onSaveUsername,
  }));

  click(q('button[aria-label="Edit username"]'));
  assert.equal(
    q(".unm-continue").textContent,
    "Save Changes",
    "the username editor's primary action is Save Changes",
  );

  typeInto(q(".unm-input"), "Ankit Renamed");
  await act(async () => {
    q(".unm-modal form").dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );
  });

  // The username is the only thing the modal persists, and it is sent as a bare
  // string rather than as a partial profile object.
  assert.equal(saves.length, 1, "the write was attempted exactly once");
  assert.equal(saves[0], "Ankit Renamed");

  // While the write is in flight the modal stays open and cannot resubmit.
  assert.ok(q(".unm-modal"), "the modal stays open until the backend confirms");
  assert.equal(q(".unm-continue").disabled, true, "a duplicate submission cannot be sent");
  assert.match(q(".unm-continue").textContent, /Saving/);

  await act(async () => {
    resolveSave();
  });

  assert.equal(q(".unm-modal"), null, "the modal closes only after a successful save");
  assert.equal(q(".mpm-save"), null, "there is no later save step to forget");
  await unmount();
});

/* ==================================================================
   The username is checked with the backend before it is persisted, and
   a refused name leaves everything untouched
   ================================================================== */

function editUsernameInModal(value) {
  click(q('button[aria-label="Edit username"]'));
  assert.ok(q(".unm-modal"), "the username editor opened");
  typeInto(q(".unm-input"), value);
  return act(async () => {
    q(".unm-modal form").dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}

test("a taken username keeps the username modal open and changes nothing", async () => {
  const saves = [];
  availabilityLookups.length = 0;
  setUsernameAvailable(false);

  const unmount = await renderRoot(React.createElement(MyProfileModal, {
    profile: accountProfile(),
    onClose: () => {},
    onSaveUsername: async (username) => {
      saves.push(username);
    },
  }));

  await editUsernameInModal("Taken Name");

  // The modal stays open, keeps the entered value and shows the warning.
  assert.ok(q(".unm-modal"), "the username modal is not closed");
  assert.equal(q(".unm-input").value, "Taken Name", "the entered value is kept for editing");
  assert.equal(q(".unm-hint--error").textContent, "Username already taken");
  assert.ok(q(".unm-input-box--error"));

  // Nothing downstream moved: no display change, no profile write.
  assert.equal(usernameText(), "ankitbuilds", "the stored username is unchanged");
  assert.equal(saves.length, 0, "the database was never written");
  assert.deepEqual(availabilityLookups, ["Taken Name"], "the backend was asked");

  // Another username can be entered straight away.
  typeInto(q(".unm-input"), "Free Name");
  assert.equal(q(".unm-hint--error"), null, "typing clears the warning");
  await unmount();
});

test("an available username is persisted by the username modal and nothing else", async () => {
  const saves = [];
  availabilityLookups.length = 0;
  setUsernameAvailable(true);

  const unmount = await renderRoot(React.createElement(MyProfileModal, {
    profile: accountProfile(),
    onClose: () => {},
    onSaveUsername: async (username) => {
      saves.push(username);
    },
  }));

  await editUsernameInModal("Free Name");

  assert.deepEqual(availabilityLookups, ["Free Name"], "the backend was asked first");
  assert.deepEqual(saves, ["Free Name"], "an available name is persisted immediately");
  assert.equal(q(".unm-modal"), null, "the modal closed after the successful write");
  assert.equal(q(".mpm-save"), null, "there is no staged change left behind");

  // The displayed username is the persisted one. The parent re-reads it from the
  // profile it was given, so nothing is held in local state here.
  assert.equal(usernameText(), "ankitbuilds", "the display still reflects the given profile");
  await unmount();
});

test("the username modal persists through the existing account profile write", async () => {
  const writes = [];
  const authState = { username: "ankitbuilds", usernameSetupRequired: false };
  let storedProfile = accountProfile();

  authApi.getProfile = async () => ({ user: storedProfile });

  const contextValue = {
    user: { ...storedProfile, username: authState.username },
    isAuthenticated: true,
    updateProfile: async (changes) => {
      writes.push(changes);
      // The backend is the source of truth: it returns the stored profile.
      storedProfile = accountProfile({ username: changes.username });
      authState.username = storedProfile.username;
      return { ok: true, message: null, status: null, user: storedProfile };
    },
  };

  const unmount = await renderRoot(React.createElement(
    AuthContext.Provider,
    { value: contextValue },
    React.createElement(MyProfileContainer, { onClose: () => {} }),
  ));

  await act(async () => {});
  assert.equal(usernameText(), "ankitbuilds", "loaded from the backend");

  // The username modal performs the one and only write.
  await editUsernameInModal("Persisted Name");

  assert.equal(writes.length, 1, "exactly one profile write");
  assert.deepEqual(writes[0], { username: "Persisted Name" });
  assert.equal(q(".unm-modal"), null, "the modal closed after the write");

  // AuthContext, the stored profile and the display all move together, so the
  // Navbar and the popup read the same value without a second write.
  assert.equal(authState.username, "Persisted Name", "auth state holds the persisted username");
  assert.equal(storedProfile.username, "Persisted Name", "the stored profile holds it too");
  assert.equal(usernameText(), "Persisted Name", "My Profile shows the persisted username");
  assert.equal(writes.length, 1, "the display update did not write again");
  await unmount();
});

test("a username conflict keeps the modal open and the persisted username intact", async () => {
  const writes = [];
  let persisted = accountProfile();
  authApi.getProfile = async () => ({ user: persisted });

  const contextValue = {
    user: persisted,
    isAuthenticated: true,
    updateProfile: async (changes) => {
      writes.push(changes);
      // 409 is what the unique usernameNormalized index produces.
      return {
        ok: false,
        message: "That username is already taken",
        status: 409,
        user: null,
      };
    },
  };

  const unmount = await renderRoot(React.createElement(
    AuthContext.Provider,
    { value: contextValue },
    React.createElement(MyProfileContainer, { onClose: () => {} }),
  ));

  await act(async () => {});
  await editUsernameInModal("Raced Name");

  assert.equal(writes.length, 1, "the write was attempted");
  assert.ok(q(".mpm-modal"), "My Profile stays open");
  assert.ok(q(".unm-modal"), "the username modal stays open so the name can be corrected");

  // A lost race is reported as taken, exactly as the availability lookup would.
  assert.equal(q(".unm-hint--error").textContent, "Username already taken");
  assert.equal(q(".unm-input").value, "Raced Name", "the name is preserved for another attempt");

  // The persisted username never moved.
  assert.equal(contextValue.user.username, "ankitbuilds", "AuthContext is untouched");
  assert.equal(persisted.username, "ankitbuilds", "the stored profile is untouched");
  assert.equal((await authApi.getProfile()).user.username, "ankitbuilds", "the backend still has the old name");
  assert.equal(usernameText(), "ankitbuilds", "My Profile still shows the persisted username");
  assert.equal(q(".mpm-save"), null, "there is no save button to press instead");

  // Retrying is just submitting the modal again.
  await editUsernameInModal("Raced Again");
  assert.equal(writes.length, 2, "retrying sends the request again");
  await unmount();
});

test("a generic username write failure surfaces the server's message in the modal", async () => {
  const writes = [];
  let persisted = accountProfile();
  authApi.getProfile = async () => ({ user: persisted });

  const contextValue = {
    user: persisted,
    isAuthenticated: true,
    updateProfile: async (changes) => {
      writes.push(changes);
      return {
        ok: false,
        message: "Username can be changed once every 60 seconds",
        status: 429,
        user: null,
      };
    },
  };

  const unmount = await renderRoot(React.createElement(
    AuthContext.Provider,
    { value: contextValue },
    React.createElement(MyProfileContainer, { onClose: () => {} }),
  ));

  await act(async () => {});
  await editUsernameInModal("Rate Limited");

  assert.equal(writes.length, 1);
  assert.ok(q(".unm-modal"), "the failure keeps the modal open with the name");
  assert.equal(q(".unm-input").value, "Rate Limited", "the name is still available to edit");
  assert.equal(
    q(".unm-hint--error").textContent,
    "Username can be changed once every 60 seconds",
    "the server's safe message is shown, not a false success",
  );
  assert.equal(contextValue.user.username, "ankitbuilds", "AuthContext is untouched");
  assert.equal(persisted.username, "ankitbuilds", "the stored profile is untouched");
  assert.equal(usernameText(), "ankitbuilds", "My Profile still shows the persisted username");
  await unmount();
});

/* ==================================================================
   Google onboarding: check, then persist, then complete
   ================================================================== */

function googleUserWithoutUsername(overrides = {}) {
  return accountProfile({
    username: null,
    usernameSetupRequired: true,
    authProvider: "GOOGLE",
    avatar: { type: "google", value: "google" },
    avatarSource: "google",
    googleAvatarAvailable: true,
    googleAvatarUrl: "https://lh3.googleusercontent.com/a/test-avatar",
    ...overrides,
  });
}

function renderOnboarding({ updateProfile, user }) {
  const value = {
    user,
    isAuthenticated: true,
    updateProfile,
  };
  return renderRoot(React.createElement(
    AuthContext.Provider,
    { value },
    React.createElement(UsernameOnboarding),
  ));
}

test("a taken username during onboarding keeps the modal open and completes nothing", async () => {
  const writes = [];
  availabilityLookups.length = 0;
  setUsernameAvailable(false);

  const unmount = await renderOnboarding({
    user: googleUserWithoutUsername(),
    updateProfile: async (changes) => {
      writes.push(changes);
      return { ok: true, message: null, status: null, user: googleUserWithoutUsername() };
    },
  });

  typeInto(q(".unm-input"), "Someone Else");
  await act(async () => {
    submitForm();
  });

  assert.deepEqual(availabilityLookups, ["Someone Else"], "the backend was asked");
  assert.equal(writes.length, 0, "the database was never written");
  assert.ok(q(".unm-modal"), "onboarding is not complete and the modal stays open");
  assert.equal(q(".unm-input").value, "Someone Else", "the entered value is kept");
  assert.equal(q(".unm-hint--error").textContent, "Username already taken");
  assert.equal(q(".unm-close"), null, "there is still no way to skip onboarding");

  // Another username can be entered immediately.
  typeInto(q(".unm-input"), "My Own Name");
  assert.equal(q(".unm-hint--error"), null);
  await unmount();
});

test("an available username during onboarding persists and completes setup", async () => {
  const writes = [];
  availabilityLookups.length = 0;
  setUsernameAvailable(true);

  const unmount = await renderOnboarding({
    user: googleUserWithoutUsername(),
    updateProfile: async (changes) => {
      writes.push(changes);
      return {
        ok: true,
        message: null,
        status: null,
        user: accountProfile({ username: changes.username, usernameSetupRequired: false }),
      };
    },
  });

  typeInto(q(".unm-input"), "  Arcadia Player  ");
  await act(async () => {
    submitForm();
  });

  // The availability check runs before the write, and only the exact visible
  // username is sent.
  assert.deepEqual(availabilityLookups, ["Arcadia Player"]);
  assert.deepEqual(writes, [{ username: "Arcadia Player" }]);

  // The persisted username is what the rest of the UI reads. In the real app
  // AuthContext flips usernameSetupRequired, which unmounts this modal.
  assert.equal(writes[0].username, "Arcadia Player");
  await unmount();
});

test("an onboarding write that loses the uniqueness race is reported as taken", async () => {
  const writes = [];
  availabilityLookups.length = 0;
  // The pre-check passes, then another account takes the name first.
  setUsernameAvailable(true);

  const unmount = await renderOnboarding({
    user: googleUserWithoutUsername(),
    updateProfile: async (changes) => {
      writes.push(changes);
      return {
        ok: false,
        message: "That username is already taken",
        status: 409,
        user: null,
      };
    },
  });

  typeInto(q(".unm-input"), "Raced Name");
  await act(async () => {
    submitForm();
  });

  assert.equal(writes.length, 1, "the write was attempted");
  assert.ok(q(".unm-modal"), "the modal stays open, so no false success state");
  assert.equal(q(".unm-hint--error").textContent, "Username already taken");
  assert.equal(q(".unm-input").value, "Raced Name", "the value is kept for another attempt");
  assert.equal(q(".unm-close"), null, "onboarding is still not complete");
  await unmount();
});

test("a non-conflict onboarding failure keeps the modal open with the server message", async () => {
  setUsernameAvailable(true);

  const unmount = await renderOnboarding({
    user: googleUserWithoutUsername(),
    updateProfile: async () => ({
      ok: false,
      message: "Username can be changed once every 60 seconds",
      status: 429,
      user: null,
    }),
  });

  typeInto(q(".unm-input"), "Rate Limited");
  await act(async () => {
    submitForm();
  });

  assert.ok(q(".unm-modal"));
  assert.equal(q(".unm-hint--error").textContent, "Username can be changed once every 60 seconds");
  assert.equal(q(".unm-input").value, "Rate Limited");
  await unmount();
});

test("an unreachable availability lookup never lets an unchecked name through", async () => {
  setUsernameLookupFailure();

  const unmount = await renderOnboarding({
    user: googleUserWithoutUsername(),
    updateProfile: async () => ({ ok: true, message: null, status: null, user: null }),
  });

  typeInto(q(".unm-input"), "Unchecked Name");
  await act(async () => {
    submitForm();
  });

  assert.ok(q(".unm-modal"), "nothing is accepted without a backend answer");
  assert.equal(q(".unm-hint--error").textContent, "Unable to check username availability. Please try again.");
  await unmount();
});

test("a duplicate submission during an in-flight write is refused, not silently saved", async () => {
  const writes = [];
  let releaseWrite;
  const persisted = accountProfile();
  authApi.getProfile = async () => ({ user: persisted });

  const contextValue = {
    user: persisted,
    isAuthenticated: true,
    updateProfile: async (changes) => {
      writes.push(changes);
      // The write hangs, so the rest of the test runs with one write in flight.
      await new Promise((resolve) => {
        releaseWrite = resolve;
      });
      return {
        ok: true,
        message: null,
        status: null,
        user: accountProfile({ username: changes.username }),
      };
    },
  };

  const unmount = await renderRoot(React.createElement(
    AuthContext.Provider,
    { value: contextValue },
    React.createElement(MyProfileContainer, { onClose: () => {} }),
  ));

  await act(async () => {});
  click(q('button[aria-label="Edit username"]'));
  typeInto(q(".unm-input"), "First Name");
  await act(async () => {
    q(".unm-modal form").dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );
  });

  assert.equal(writes.length, 1, "the first write is in flight");
  assert.ok(q(".unm-modal"), "the modal is still open while the write is pending");
  assert.equal(q(".unm-continue").disabled, true, "the primary action is disabled mid-write");

  // Submitting again while the write is pending must not send a second request.
  await act(async () => {
    q(".unm-modal form").dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  assert.equal(writes.length, 1, "a duplicate write is never sent");
  assert.ok(q(".unm-modal"), "and the modal is not closed as a false success");

  await act(async () => {
    releaseWrite();
  });
  assert.equal(q(".unm-modal"), null, "the real write still closes the modal when it lands");
  assert.equal(writes.length, 1, "still exactly one write");
  await unmount();
});

test("keeping your own username is not treated as a conflict", async () => {
  availabilityLookups.length = 0;
  authApi.checkUsernameAvailability = async (username) => {
    availabilityLookups.push(username);
    return { available: false };
  };

  const saves = [];
  const unmount = await renderRoot(React.createElement(MyProfileModal, {
    profile: accountProfile({ username: "AnkitBuilds" }),
    onClose: () => {},
    onSaveUsername: async (username) => {
      saves.push(username);
    },
  }));

  // Same name, and a casing-only change: both are accepted without a lookup,
  // because the account's own record would otherwise answer the question.
  await editUsernameInModal("AnkitBuilds");
  assert.equal(q(".unm-modal"), null, "re-submitting the current name is accepted");
  await editUsernameInModal("ankitbuilds");
  assert.equal(q(".unm-modal"), null, "a case-only change is accepted");
  assert.deepEqual(availabilityLookups, [], "the account's own name is never looked up");
  assert.deepEqual(saves, ["AnkitBuilds", "ankitbuilds"], "both were persisted as entered");
  await unmount();
});

test("the taken-username warning reuses the shared 5 second notice lifecycle", async () => {
  availabilityLookups.length = 0;
  setUsernameAvailable(false);

  const unmount = await renderOnboarding({
    user: googleUserWithoutUsername(),
    updateProfile: async () => ({ ok: true, message: null, status: null, user: null }),
  });

  typeInto(q(".unm-input"), "Someone Else");
  await act(async () => {
    submitForm();
  });

  const hint = q(".unm-hint--error");
  assert.equal(hint.textContent, "Username already taken");
  assert.equal(hint.classList.contains("is-leaving"), false, "it starts fully visible");
  assert.ok(q(".unm-modal"), "the modal is still open while the warning shows");
  await unmount();
});

test("a failed write keeps the modal open, the name and a visible warning", async () => {
  const saves = [];
  const unmount = await renderRoot(React.createElement(MyProfileModal, {
    profile: accountProfile(),
    onClose: () => {},
    onSaveUsername: async (username) => {
      saves.push(username);
      // The container reports a failed write by throwing the same AuthApiError
      // the profile API raises, so the safe server message survives.
      throw new AuthApiError("That username is already taken", 409);
    },
  }));

  await editUsernameInModal("Taken Name");

  assert.deepEqual(saves, ["Taken Name"], "the write was attempted");
  assert.ok(q(".mpm-modal"), "My Profile stays open after a failure");
  assert.ok(q(".unm-modal"), "the username modal stays open so the edit is not lost");
  assert.equal(q(".unm-input").value, "Taken Name", "the name is preserved for the retry");
  assert.equal(q(".unm-hint--error").textContent, "That username is already taken");
  assert.equal(usernameText(), "ankitbuilds", "the display never shows an unpersisted name");

  // Retrying is just submitting the modal again.
  await editUsernameInModal("Taken Name");
  assert.equal(saves.length, 2, "retrying sends the request again");
  await unmount();
});

/* ==================================================================
   Avatar Modal as a child layer of My Profile

   The hierarchy is Profile Popup -> My Profile -> Avatar Modal. My Profile
   stays mounted and blurred while the Avatar Modal is open, and both the X and
   Back of the child return to it rather than closing it.
   ================================================================== */

function renderProfileModal(profile, overrides = {}) {
  return renderRoot(React.createElement(MyProfileModal, {
    profile,
    onClose: () => {},
    onSaveUsername: async () => {},
    onSaveAvatar: async () => {},
    ...overrides,
  }));
}

function avatarPencil() {
  return q('button[aria-label="Edit avatar"]');
}

async function openAvatarModal(profile, overrides = {}) {
  const unmount = await renderProfileModal(profile, overrides);
  click(avatarPencil());
  return unmount;
}

test("the avatar pencil opens the Avatar Modal as a child of My Profile", async () => {
  const saves = [];
  const unmount = await openAvatarModal(accountProfile(), {
    onSaveAvatar: async (avatar) => {
      saves.push(avatar);
    },
  });

  // The child layer opened, and My Profile is still mounted behind it.
  assert.ok(q(".avm-backdrop"), "the Avatar Modal opened");
  assert.ok(q(".avm-modal"), "the avatar dialog is present");
  assert.ok(q(".mpm-modal"), "My Profile is still mounted underneath");
  assert.equal(q("#avm-title").textContent, "Choose Your Avatar");

  // The parent is blurred, but not unmounted.
  assert.ok(
    q(".mpm-modal").classList.contains("mpm-modal--blurred"),
    "My Profile is blurred behind the Avatar Modal",
  );

  // The X is the only way out of this layer, and there is no Back control.
  assert.ok(q('button[aria-label="Close avatar selection"]'), "an X in the top right");
  assert.equal(q(".avm-header .avm-back"), null, "the back button is gone");
  assert.equal(
    qa(".avm-header button").length,
    1,
    "the header holds exactly one control, the X",
  );

  // The existing Arcadia brand mark sits immediately before the heading.
  const logo = q(".avm-header-logo");
  assert.ok(logo, "the Arcadia logo is in the header");
  assert.match(logo.getAttribute("src"), /ArcadialogoA\.[a-z0-9]+$/i, "and is the existing asset");
  const titleRow = q(".avm-header-title");
  assert.equal(
    logo.nextElementSibling,
    q("#avm-title"),
    "the logo sits immediately before the heading, in one row",
  );
  assert.equal(titleRow.children.length, 2, "the row is just the logo and the heading");

  assert.equal(saves.length, 0, "opening the layer writes nothing");
  await unmount();
});

test("every avatar lives in one continuous grid with no section headings", async () => {
  const unmount = await openAvatarModal(accountProfile({
    authProvider: "GOOGLE",
    googleAvatarAvailable: true,
    googleAvatarUrl: "https://lh3.googleusercontent.com/a/test-avatar",
  }));

  // The old per-section headings are gone, so nothing splits the grid.
  assert.equal(q(".avm-section-title"), null, "no section headings remain");
  for (const label of ["Your Avatars", "Level Tiers", "Free Avatars", "Locked Avatars"]) {
    assert.doesNotMatch(q(".avm-body").textContent, new RegExp(label), `${label} is gone`);
  }
  assert.equal(qa(".avm-grid").length, 1, "exactly one grid");

  // Level 0 with no completed match: Rookie is still gated on play, so the
  // order is Google, the six free avatars, then every level tier.
  const names = qa(".avm-grid .avm-tile-name").map((node) => node.textContent);
  assert.deepEqual(names, [
    "Google Photo",
    "Nebula", "Aurora", "Nova", "Eclipse", "Comet", "Pulse",
    "Rookie", "Challenger", "Veteran", "Master", "Legend", "Supreme",
  ]);
  await unmount();
});

test("level avatars always follow the free avatars, unlocked or not", async () => {
  const freeNames = ["Nebula", "Aurora", "Nova", "Eclipse", "Comet", "Pulse"];
  const tierNames = ["Rookie", "Challenger", "Veteran", "Master", "Legend", "Supreme"];

  for (const [level, played] of [[0, 0], [5, 0], [10, 0], [0, 1], [30, 0]]) {
    const unmount = await openAvatarModal(accountProfile({
      progression: progression({ level }),
      gamingStats: { ...accountProfile().gamingStats, gamesPlayed: played },
    }));

    const names = qa(".avm-grid .avm-tile-name").map((node) => node.textContent);

    // The free catalogue is contiguous and always first, straight after Google.
    assert.deepEqual(
      names.slice(0, freeNames.length),
      freeNames,
      `level ${level}, ${played} played: the free avatars come first`,
    );

    // Every tier sits after the last free avatar; none precedes one.
    const firstTier = names.findIndex((name) => tierNames.includes(name));
    assert.ok(firstTier >= freeNames.length, `level ${level}: no tier precedes a free avatar`);
    assert.deepEqual(
      names.slice(0, firstTier),
      freeNames,
      `level ${level}: nothing but free avatars before the first tier`,
    );

    // Unlocked tiers come first inside the tier block, then the locked ones.
    const unlocked = qa(".avm-tile--unavailable .avm-tile-name").map((node) => node.textContent);
    const locked = qa(".avm-tile--locked .avm-tile-name").map((node) => node.textContent);
    assert.deepEqual(
      names.slice(firstTier, firstTier + unlocked.length),
      unlocked,
      `level ${level}: unlocked tiers start the tier block`,
    );
    assert.deepEqual(
      names.slice(firstTier + unlocked.length, firstTier + unlocked.length + locked.length),
      locked,
      `level ${level}: locked tiers follow unlocked ones`,
    );
    assert.equal(
      unlocked.length + locked.length,
      tierNames.length,
      `level ${level}: every tier is still shown exactly once`,
    );
    await unmount();
  }
});

test("a tier moves from the locked group to the unlocked group once it is reached", async () => {
  // Challenger is level gated, so raising the level relocates it.
  const atFive = await openAvatarModal(accountProfile({
    progression: progression({ level: 5 }),
  }));
  assert.equal(
    q(".avm-tile--locked .avm-tile-name").textContent,
    "Rookie",
    "at level 5 with no match, Rookie is still the first locked tier",
  );
  const unlockedAtFive = qa(".avm-tile--unavailable .avm-tile-name").map((node) => node.textContent);
  assert.deepEqual(unlockedAtFive, ["Challenger"], "Challenger is unlocked at level 5");
  const fiveNames = qa(".avm-grid .avm-tile-name").map((node) => node.textContent);
  assert.ok(
    fiveNames.indexOf("Challenger") > fiveNames.indexOf("Pulse"),
    "and it still sits after every free avatar",
  );
  await atFive();

  const atFour = await openAvatarModal(accountProfile({
    progression: progression({ level: 4 }),
  }));
  assert.equal(
    qa(".avm-tile--unavailable").length,
    0,
    "at level 4 no level tier is unlocked yet",
  );
  assert.ok(
    qa(".avm-tile--locked .avm-tile-name").some((node) => node.textContent === "Challenger"),
    "Challenger is still locked",
  );
  await atFour();
});

test("the Avatar Modal X closes only the Avatar Modal", async () => {
  const unmount = await openAvatarModal(accountProfile());

  click(q('button[aria-label="Close avatar selection"]'));

  assert.equal(q(".avm-backdrop"), null, "the Avatar Modal closed");
  assert.ok(q(".mpm-modal"), "My Profile is still open");
  assert.equal(
    q(".mpm-modal").classList.contains("mpm-modal--blurred"),
    false,
    "and it is no longer blurred",
  );
  await unmount();
});

test("the Avatar Modal offers no navigation control other than the X", async () => {
  const unmount = await openAvatarModal(accountProfile());

  // Nothing to go "back" to that the X does not already do, and nothing that
  // could reach the layers underneath.
  assert.equal(qa(".avm-back").length, 0, "no back button is rendered");
  assert.equal(q('button[aria-label="Back to profile"]'), null, "and no back control at all");
  assert.deepEqual(
    qa(".avm-header button").map((node) => node.getAttribute("aria-label")),
    ["Close avatar selection"],
    "the X is the only header control",
  );
  await unmount();
});

test("Escape closes only the Avatar Modal", async () => {
  const unmount = await openAvatarModal(accountProfile());

  await act(async () => {
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });

  assert.equal(q(".avm-backdrop"), null, "the Avatar Modal closed");
  assert.ok(q(".mpm-modal"), "My Profile survived the Escape");
  await unmount();
});

test("My Profile's own X still closes My Profile while no child layer is open", async () => {
  let closed = 0;
  const unmount = await renderProfileModal(accountProfile(), {
    onClose: () => {
      closed += 1;
    },
  });

  click(q(".mpm-close"));
  assert.equal(closed, 1, "the back action still fires");
  await unmount();
});

test("the Avatar Modal opens with the persisted avatar selected", async () => {
  const unmount = await openAvatarModal(accountProfile({
    avatar: { type: "local", value: "avatar-04" },
  }));

  const selected = qa(".avm-tile--selected");
  assert.equal(selected.length, 1, "exactly one tile is selected");
  assert.equal(
    selected[0].querySelector(".avm-tile-name").textContent,
    "Eclipse",
    "and it is the avatar the profile already stores",
  );
  assert.equal(selected[0].getAttribute("aria-pressed"), "true", "the state is exposed");
  await unmount();
});

test("choosing a catalog avatar persists it and returns to My Profile", async () => {
  const writes = [];
  const unmount = await openAvatarModal(accountProfile(), {
    onSaveAvatar: async (avatar) => {
      writes.push(avatar);
    },
  });

  // The profile already stores avatar-01, so pick a genuinely different one.
  const pulse = qa(".avm-tile").find((node) => node.textContent.includes("Pulse"));
  click(pulse);
  assert.ok(
    pulse.classList.contains("avm-tile--selected"),
    "the choice is staged inside the Avatar Modal",
  );
  assert.equal(writes.length, 0, "staging writes nothing");
  assert.equal(q(".avm-confirm").disabled, false, "a real change enables the save");

  await act(async () => {
    q(".avm-confirm").dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });

  assert.deepEqual(writes, [{ type: "local", value: "avatar-06" }], "the exact avatar was sent");
  assert.equal(q(".avm-backdrop"), null, "a successful save closes the Avatar Modal");
  assert.ok(q(".mpm-modal"), "and My Profile is still open");
  await unmount();
});

test("a failed avatar save keeps the Avatar Modal open and reports the reason", async () => {
  const unmount = await openAvatarModal(accountProfile(), {
    onSaveAvatar: async () => {
      throw new AuthApiError("Google profile picture is unavailable", 400);
    },
  });

  click(qa(".avm-tile").find((node) => node.textContent.includes("Aurora")));
  await act(async () => {
    q(".avm-confirm").dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });

  assert.ok(q(".avm-modal"), "the Avatar Modal stays open on a failure");
  assert.equal(
    q(".avm-error").textContent,
    "Google profile picture is unavailable",
    "the backend's safe message is shown, not a false success",
  );
  assert.ok(q(".mpm-modal"), "My Profile is untouched behind it");
  await unmount();
});

/* ==================================================================
   The badge and the level avatars are one state

   My Profile's badge and the Avatar Modal's tiers both read the shared rule in
   `auth/tierEligibility.ts`, so they cannot disagree about whether a tier has
   been earned. These tests drive the real My Profile modal and compare the two.
   ================================================================== */

/** Opens the Avatar Modal on top of My Profile and returns both teardowns. */
async function openAvatarLayer(profile) {
  const writes = [];
  const unmount = await renderProfileModal(profile, {
    onSaveAvatar: async (avatar) => {
      writes.push(avatar);
    },
  });
  click(avatarPencil());
  return { unmount, writes };
}

function badgeEarned() {
  return q('[data-field="progressionTitle"]').dataset.earned === "true";
}

test("the Rookie badge and the Rookie avatar unlock together", async () => {
  const before = await renderProfileModal(accountProfile({
    progression: progression({ level: 0, badgeKey: "bronze", themeKey: "bronze" }),
    gamingStats: { ...accountProfile().gamingStats, gamesPlayed: 0 },
  }));

  // No completed match: the badge is unearned and carries the neutral treatment.
  assert.equal(badgeEarned(), false, "the Rookie badge is not earned without a match");
  assert.match(
    q('[data-field="progressionTitle"]').className,
    /--unearned$/,
    "and it uses the neutral unearned theme, not the earned bronze one",
  );
  await before();

  // One completed match: the badge is earned in the bronze theme.
  const after = await renderProfileModal(accountProfile({
    progression: progression({ level: 0, badgeKey: "bronze", themeKey: "bronze" }),
    gamingStats: { ...accountProfile().gamingStats, gamesPlayed: 1 },
  }));
  assert.equal(badgeEarned(), true, "one completed match earns the Rookie badge");
  assert.match(q('[data-field="progressionTitle"]').className, /--bronze$/);
  await after();
});

test("a level 5 account earns the Challenger badge and the Challenger avatar together", async () => {
  const { unmount } = await openAvatarLayer(accountProfile({
    progression: progression({ level: 5, title: "Arcadia Challenger", badgeKey: "silver", themeKey: "silver" }),
    gamingStats: { ...accountProfile().gamingStats, gamesPlayed: 1 },
  }));

  // The badge in My Profile, behind the Avatar Modal.
  assert.equal(badgeEarned(), true, "the Challenger badge is earned at level 5");
  assert.equal(
    q('[data-field="progressionTitle"]').textContent,
    "Arcadia Challenger",
    "and it is the title the backend sent for that tier",
  );
  assert.match(q('[data-field="progressionTitle"]').className, /--silver$/);

  // The avatar in the Avatar Modal, at the same moment.
  const challenger = qa(".avm-tile").find((node) => node.textContent.startsWith("Challenger"));
  assert.ok(
    challenger.classList.contains("avm-tile--unavailable"),
    "the Challenger avatar is unlocked, so it has no lock",
  );
  assert.equal(challenger.querySelector(".avm-tile-lock"), null, "the lock indicator is gone");
  assert.equal(challenger.querySelector(".avm-tile-req"), null, "the unlock label is gone");

  // And it still sits after every free avatar.
  const names = qa(".avm-grid .avm-tile-name").map((node) => node.textContent);
  assert.ok(
    names.indexOf("Challenger") > names.indexOf("Pulse"),
    "Challenger remains after all free avatars",
  );
  await unmount();
});

test("one level below a boundary keeps both the badge and the avatar unearned", async () => {
  for (const [level, tierName] of [[4, "Challenger"], [9, "Veteran"], [14, "Master"]]) {
    const { unmount } = await openAvatarLayer(accountProfile({
      progression: progression({ level }),
      gamingStats: { ...accountProfile().gamingStats, gamesPlayed: 1 },
    }));

    const tile = qa(".avm-tile").find((node) => node.textContent.startsWith(tierName));
    assert.ok(
      tile.classList.contains("avm-tile--locked"),
      `level ${level}: ${tierName} is still locked`,
    );
    assert.ok(
      tile.querySelector(".avm-tile-req").textContent.startsWith("Unlocks at "),
      `level ${level}: it still states its requirement`,
    );

    // The badge for that level is a different, lower tier.
    assert.equal(
      q('[data-field="progressionTitle"]').textContent.startsWith(tierName),
      false,
      `level ${level}: the badge has not moved to ${tierName}`,
    );
    await unmount();
  }
});

test("the badge and the avatar never disagree across every tier boundary", async () => {
  const boundaries = [
    [0, "Arcadia Rookie", "Rookie"],
    [5, "Arcadia Challenger", "Challenger"],
    [10, "Arcadia Veteran", "Veteran"],
    [15, "Arcadia Master", "Master"],
    [20, "Arcadia Legend", "Legend"],
    [30, "Arcadia Supreme", "Supreme"],
  ];

  for (const [level, badgeTitle, avatarTier] of boundaries) {
    const { unmount } = await openAvatarLayer(accountProfile({
      progression: progression({ level }),
      gamingStats: { ...accountProfile().gamingStats, gamesPlayed: 1 },
    }));

    assert.equal(
      q('[data-field="progressionTitle"]').textContent,
      badgeTitle,
      `level ${level}: the badge title`,
    );
    assert.equal(badgeEarned(), true, `level ${level}: the badge is earned`);

    const unlocked = qa(".avm-tile--unavailable .avm-tile-name").map((node) => node.textContent);
    const locked = qa(".avm-tile--locked .avm-tile-name").map((node) => node.textContent);

    // This account has a completed match, so Rookie is unlocked at every level
    // and each tier at or below the boundary is unlocked too. The two lists
    // together must always account for all six tiers.
    assert.ok(
      unlocked.includes("Rookie"),
      `level ${level}: Rookie is unlocked with a completed match on record`,
    );
    assert.ok(
      unlocked.includes(avatarTier),
      `level ${level}: ${avatarTier} is unlocked at its own boundary`,
    );
    assert.ok(
      !locked.includes(avatarTier),
      `level ${level}: ${avatarTier} is not among the locked tiers`,
    );
    assert.equal(
      unlocked.length + locked.length,
      6,
      `level ${level}: all six tiers are still shown`,
    );
    await unmount();
  }
});

test("a locked tier states its full unlock level and can never be chosen", async () => {
  const writes = [];
  const unmount = await openAvatarModal(accountProfile({
    progression: progression({ level: 3 }),
  }), {
    onSaveAvatar: async (avatar) => {
      writes.push(avatar);
    },
  });

  const locked = qa(".avm-tile--locked");
  // Rookie is gated on a completed match rather than on a level, so at level 3
  // with no match on record all six tiers are still locked.
  assert.equal(locked.length, 6, "every level tier is locked without the required progress");

  for (const tile of locked) {
    // A locked tier is not a button, so it cannot be focused or activated and
    // the browser never paints a prohibited cursor over it.
    assert.equal(tile.tagName, "SPAN", "a locked tier is not an activatable control");
    assert.equal(tile.disabled, undefined, "and carries no disabled state to style");
    assert.match(
      tile.getAttribute("aria-label"),
      /— locked, unlocks at /,
      "the state is still announced",
    );
  }

  // The label is the full sentence naming the real requirement, never a
  // shortened form. Rookie states the match requirement, not a level.
  const labels = qa(".avm-tile--locked .avm-tile-req").map((node) => node.textContent);
  assert.deepEqual(
    labels,
    [
      "Unlocks at 1 completed match",
      "Unlocks at level 5",
      "Unlocks at level 10",
      "Unlocks at level 15",
      "Unlocks at level 20",
      "Unlocks at level 30",
    ],
    "each locked tier states its actual requirement",
  );
  for (const shortened of [/^Level \d+$/, /Unlock at \d+/]) {
    assert.doesNotMatch(q(".avm-body").textContent, shortened, `no shortened form ${shortened}`);
  }

  // Clicking a locked tile does nothing, not even a staged selection.
  const before = q(".avm-tile--selected");
  locked[0].dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.equal(q(".avm-tile--selected"), before, "the selection did not move");
  assert.equal(writes.length, 0, "and nothing was written");
  await unmount();
});

test("Rookie stays locked until one completed match is on record", async () => {
  // A high level alone must not unlock Rookie: it is gated on real play.
  for (const level of [0, 5, 10, 30, 99]) {
    const unmount = await openAvatarModal(accountProfile({
      progression: progression({ level }),
      gamingStats: { ...accountProfile().gamingStats, gamesPlayed: 0 },
    }));

    const rookie = qa(".avm-tile").find((node) => node.textContent.startsWith("Rookie"));
    assert.ok(
      rookie.classList.contains("avm-tile--locked"),
      `level ${level} with no completed match: Rookie stays locked`,
    );
    assert.ok(
      rookie.querySelector(".avm-tile-lock"),
      `level ${level}: Rookie keeps its lock indicator`,
    );
    assert.equal(
      rookie.querySelector(".avm-tile-req").textContent,
      "Unlocks at 1 completed match",
      `level ${level}: Rookie states the match requirement, not a level`,
    );
    await unmount();
  }
});

test("Rookie unlocks once a completed match is recorded, and lands after the free avatars", async () => {
  const played = (n) => ({ ...accountProfile().gamingStats, gamesPlayed: n });

  const stillLocked = await openAvatarModal(accountProfile({
    progression: progression({ level: 0 }),
    gamingStats: played(0),
  }));
  assert.ok(
    qa(".avm-tile").find((n) => n.textContent.startsWith("Rookie")).classList.contains("avm-tile--locked"),
    "zero completed matches leaves Rookie locked",
  );
  await stillLocked();

  const unlocked = await openAvatarModal(accountProfile({
    progression: progression({ level: 0 }),
    gamingStats: played(1),
  }));
  const rookie = qa(".avm-tile").find((n) => n.textContent.startsWith("Rookie"));
  assert.ok(
    rookie.classList.contains("avm-tile--unavailable"),
    "one completed match unlocks Rookie",
  );
  assert.equal(rookie.querySelector(".avm-tile-lock"), null, "the lock indicator is gone");
  assert.equal(rookie.querySelector(".avm-tile-req"), null, "the unlock label is gone");

  // It moved into the unlocked group, which still follows every free avatar.
  const names = qa(".avm-grid .avm-tile-name").map((node) => node.textContent);
  assert.ok(names.indexOf("Rookie") > names.indexOf("Pulse"), "Rookie sits after the free avatars");
  assert.equal(
    names[names.indexOf("Rookie") + 1],
    "Challenger",
    "and the still-locked tiers follow it",
  );
  await unlocked();
});

test("a missing gamesPlayed never unlocks Rookie", async () => {
  // Absent, null and non-numeric values all mean "no match on record".
  for (const gamesPlayed of [null, undefined, Number.NaN, -3]) {
    const unmount = await openAvatarModal(accountProfile({
      gamingStats: { ...accountProfile().gamingStats, gamesPlayed },
    }));
    assert.ok(
      qa(".avm-tile").find((n) => n.textContent.startsWith("Rookie")).classList.contains("avm-tile--locked"),
      `gamesPlayed=${String(gamesPlayed)}: Rookie stays locked`,
    );
    await unmount();
  }
});

test("the username edit pencil opens the Username Modal over My Profile", async () => {
  const unmount = await renderProfileModal(accountProfile());

  assert.equal(q(".unm-modal"), null, "no username editor to begin with");
  click(q('button[aria-label="Edit username"]'));

  // The editor is a child layer: it opened, and My Profile is still behind it.
  assert.ok(q(".unm-modal"), "the Username Modal opened");
  assert.equal(q(".unm-input").value, "ankitbuilds", "it shows the current username");
  assert.ok(
    q(".mpm-modal").classList.contains("mpm-modal--blurred"),
    "My Profile is blurred behind it",
  );

  // The editor keeps the existing controls: the code-point counter, the save
  // action and a close control (which edit mode has and onboarding does not).
  assert.equal(q(".unm-continue").textContent.trim(), "Save Changes");
  assert.ok(q(".unm-counter"), "the code-point counter is present");
  assert.ok(q(".unm-close"), "it can be closed again");
  assert.equal(q(".unm-input").getAttribute("maxlength"), null, "no native maxlength cap");
  await unmount();
});

test("closing the Username Modal returns to My Profile without closing its parents", async () => {
  const unmount = await renderProfileModal(accountProfile());
  click(q('button[aria-label="Edit username"]'));
  assert.ok(q(".unm-modal"), "the editor is open");

  click(q(".unm-close"));

  assert.equal(q(".unm-modal"), null, "only the Username Modal closed");
  assert.ok(q(".mpm-modal"), "My Profile is still open");
  assert.equal(
    q(".mpm-modal").classList.contains("mpm-modal--blurred"),
    false,
    "and no longer blurred",
  );
  await unmount();
});

test("opening a child layer does not rewrite the parent dialog's geometry", async () => {
  // The parent is a fixed, centred dialog. Hiding the document overflow removes
  // the scrollbar, which narrows the space it is centred in and would nudge it
  // sideways. The shared lock reserves the gutter, so the width is identical
  // either side of the lock, and it is reference counted so a child never locks
  // or unlocks the document a second time.
  const unmount = await renderProfileModal(accountProfile());
  assert.equal(
    document.documentElement.classList.contains("has-modal-scroll-lock"),
    false,
    "no modal is locking the document yet",
  );
  assert.equal(document.body.style.overflow, "", "and the document is free to scroll");

  click(q('button[aria-label="Edit username"]'));
  assert.ok(q(".unm-modal"), "the child layer opened");

  // The lock is engaged and the gutter reserved, which is what keeps the width
  // (and therefore the centred parent) identical.
  assert.equal(
    document.documentElement.classList.contains("has-modal-scroll-lock"),
    true,
    "the scrollbar gutter is reserved while a layer holds the lock",
  );
  assert.equal(document.body.style.overflow, "hidden", "the page behind cannot scroll");

  // No geometry-affecting inline style is ever written to the parent.
  const modal = q(".mpm-modal");
  assert.equal(modal.style.transform, "", "the parent is not transformed");
  assert.equal(modal.style.width, "", "the parent's width is not rewritten");
  assert.equal(modal.style.left, "", "the parent's position is not rewritten");
  assert.equal(modal.style.marginLeft, "", "and it is not nudged with a margin");

  // Closing releases the lock and the gutter in one step.
  click(q(".unm-close"));
  assert.equal(
    document.documentElement.classList.contains("has-modal-scroll-lock"),
    false,
    "the gutter is released",
  );
  assert.equal(document.body.style.overflow, "", "and the document scrolls again");
  await unmount();
});

test("the scroll lock is released exactly once when the hierarchy unwinds", async () => {
  const unmount = await renderProfileModal(accountProfile());

  click(q('button[aria-label="Edit username"]'));
  assert.equal(document.body.style.overflow, "hidden", "the child layer holds the lock");

  // Closing the child must not leave the document locked, and must not unlock
  // and immediately re-lock it either.
  click(q(".unm-close"));
  assert.equal(document.body.style.overflow, "", "released when the last holder closed");
  assert.equal(
    document.documentElement.classList.contains("has-modal-scroll-lock"),
    false,
    "and the gutter went with it",
  );
  await unmount();
});

test("a locked or unreached tier never takes the blocking cursor", async () => {
  const unmount = await openAvatarModal(accountProfile({
    progression: progression({ level: 3 }),
  }));

  // Both kinds of unavailable tile are plain spans, so there is no disabled
  // button for the browser to mark as prohibited.
  for (const tile of qa(".avm-tile--locked, .avm-tile--unavailable")) {
    assert.equal(tile.tagName, "SPAN", "unavailable tiles are not buttons");
    assert.equal(tile.getAttribute("aria-disabled"), null, "no disabled styling hook");
  }
  await unmount();
});

test("a Google account is offered its trusted picture", async () => {
  const unmount = await openAvatarModal(accountProfile({
    authProvider: "GOOGLE",
    avatar: { type: "google", value: "google" },
    avatarSource: "google",
    googleAvatarAvailable: true,
    googleAvatarUrl: "https://lh3.googleusercontent.com/a/test-avatar",
  }));

  const googleTile = qa(".avm-tile").find((node) => node.textContent.includes("Google Photo"));
  assert.ok(googleTile, "the Google option is offered to a Google account");
  assert.ok(
    googleTile.classList.contains("avm-tile--selected"),
    "and it is selected because the account already uses it",
  );

  // The tile renders the real, already trusted picture through AvatarPreview.
  const image = googleTile.querySelector("img.avatar-preview-image");
  assert.ok(image, "the Google tile renders the trusted picture");
  assert.equal(image.getAttribute("src"), "https://lh3.googleusercontent.com/a/test-avatar");
  assert.equal(image.getAttribute("referrerpolicy"), "no-referrer");
  await unmount();
});

test("a password account is never offered a Google avatar", async () => {
  const unmount = await openAvatarModal(accountProfile({
    authProvider: "PASSWORD",
    googleAvatarAvailable: false,
    googleAvatarUrl: null,
  }));

  assert.equal(
    qa(".avm-tile").some((node) => node.textContent.includes("Google Photo")),
    false,
    "a password account is not offered a Google avatar",
  );
  await unmount();
});

test("a Google account with an untrusted picture URL gets no Google option", async () => {
  // The shared catalogue rules reject a non-Google host or a non-https scheme,
  // so no untrusted image can reach an <img> and no Google tile is invented.
  for (const url of [
    "http://lh3.googleusercontent.com/a/insecure",
    "https://evil.example.com/a/forged",
    "not a url",
    null,
  ]) {
    const unmount = await openAvatarModal(accountProfile({
      authProvider: "GOOGLE",
      googleAvatarAvailable: true,
      googleAvatarUrl: url,
    }));

    assert.equal(
      qa(".avm-tile").some((node) => node.textContent.includes("Google Photo")),
      false,
      `no Google option for ${JSON.stringify(url)}`,
    );
    // The safe local avatar fallback is what renders instead.
    assert.ok(q(".avm-tile .avatar-preview-placeholder"), "the safe fallback avatar is used");
    assert.equal(q("img.avatar-preview-image"), null, "no broken or untrusted image is rendered");
    await unmount();
  }
});

test("the Avatar Modal offers the six catalogue ids the backend accepts", async () => {
  const unmount = await openAvatarModal(accountProfile());

  for (const label of ["Nebula", "Aurora", "Nova", "Eclipse", "Comet", "Pulse"]) {
    assert.ok(
      qa(".avm-tile").some((node) => node.textContent.includes(label)),
      `${label} is offered`,
    );
  }

  // The only activatable tiles are the six catalogue avatars. A tier is never a
  // button, reached or not, because the backend has no id to store one under.
  const activatable = qa(".avm-grid button.avm-tile");
  assert.equal(activatable.length, 6, "exactly the six catalogue avatars are choosable");
  for (const tile of activatable) {
    assert.ok(
      ["Nebula", "Aurora", "Nova", "Eclipse", "Comet", "Pulse"]
        .some((label) => tile.textContent.includes(label)),
      "and each is a catalogue avatar",
    );
  }
  await unmount();
});

test("a Google account reports its login method in Account Info", async () => {
  // Avatar editing is not implemented, so the picker is gone; the Google identity
  // data it used is untouched and still describes the account.
  const withGoogle = await renderRoot(React.createElement(MyProfileModal, {
    profile: accountProfile({
      authProvider: "GOOGLE",
      avatar: { type: "google", value: "google" },
      avatarSource: "google",
      googleAvatarAvailable: true,
      googleAvatarUrl: "https://lh3.googleusercontent.com/a/test-avatar",
    }),
    onClose: () => {},
    onSaveUsername: async () => {},
  }));

  assert.ok(q(".mpm-avatar"), "the avatar is rendered");
  assert.equal(
    q('[data-field="loginMethod"]').textContent,
    "Google · user@example.com",
    "the Google identity and its verified address are reported in Account Info",
  );
  assert.equal(
    q(".mpm-info-grid").textContent.includes("Signed in with Google"),
    false,
    "the old badge is not duplicated anywhere",
  );
  await withGoogle();

  // Without a Google identity there is nothing to report as Google.
  const withoutGoogle = await renderRoot(React.createElement(MyProfileModal, {
    profile: accountProfile({ authProvider: "PASSWORD" }),
    onClose: () => {},
    onSaveUsername: async () => {},
  }));
  assert.equal(
    q('[data-field="loginMethod"]').textContent,
    "Email · user@example.com",
    "a password account reports its own method and address",
  );
  await withoutGoogle();
});

test("gaming stats and the game breakdown stay neutral empty states", async () => {
  const unmount = await renderRoot(React.createElement(MyProfileModal, {
    profile: accountProfile(),
    onClose: () => {},
    onSaveUsername: async () => {},
  }));

  const statValues = qa(".mpm-stat-value").map((node) => node.textContent);
  assert.deepEqual(statValues.slice(0, 5), ["0", "0", "0", "0", "0%"]);

  // No game records exist, so the breakdown shows no invented numbers.
  const rows = qa(".mpm-table tbody tr");
  assert.equal(rows.length, 5);
  for (const row of rows) {
    const cells = [...row.querySelectorAll("td")].slice(1).map((cell) => cell.textContent);
    assert.deepEqual(cells, ["—", "—", "—"]);
  }
  await unmount();
});

/* ==================================================================
   Google onboarding: the modal itself
   ================================================================== */

test("username onboarding opens for a Google account with no username and cannot be skipped", async () => {
  const unmount = await renderOnboarding({
    user: googleUserWithoutUsername(),
    updateProfile: async () => ({ ok: true, message: null, status: null, user: null }),
  });

  assert.ok(q(".unm-modal"), "the existing onboarding modal is open");
  assert.equal(q(".unm-title").textContent, "Enter Your Username");
  assert.equal(q(".unm-close"), null, "onboarding has no close button");
  assert.ok(q(".unm-continue"), "the only way forward is Continue");
  await unmount();
});

test("username onboarding renders nothing once the username is stored", async () => {
  const unmount = await renderOnboarding({
    user: accountProfile({ authProvider: "GOOGLE" }),
    updateProfile: async () => ({ ok: true, message: null, status: null, user: null }),
  });

  assert.equal(q(".unm-modal"), null, "a Google account with a username is not onboarded again");
  await unmount();
});

test("username onboarding blocks duplicate submissions while saving", async () => {
  const writes = [];
  availabilityLookups.length = 0;
  setUsernameAvailable(true);
  let resolveWrite;
  const unmount = await renderOnboarding({
    user: googleUserWithoutUsername(),
    updateProfile: (changes) => {
      writes.push(changes);
      return new Promise((resolve) => {
        resolveWrite = () => resolve({
          ok: true,
          message: null,
          status: null,
          user: accountProfile({ username: changes.username }),
        });
      });
    },
  });

  typeInto(q(".unm-input"), "Arcadia Player");
  await act(async () => {
    submitForm();
  });
  assert.equal(writes.length, 1);
  assert.equal(q(".unm-continue").disabled, true, "Continue is disabled while saving");

  await act(async () => {
    submitForm();
  });
  assert.equal(writes.length, 1, "a second submit never reaches the backend");

  await act(async () => {
    resolveWrite();
  });
  await unmount();
});

test("the onboarding input keeps the existing username length rules", async () => {
  const writes = [];
  availabilityLookups.length = 0;
  setUsernameAvailable(true);
  const unmount = await renderOnboarding({
    user: googleUserWithoutUsername(),
    updateProfile: async (changes) => {
      writes.push(changes);
      return { ok: true, message: null, status: null, user: accountProfile({ username: changes.username }) };
    },
  });

  const input = q(".unm-input");
  // No native maxLength: it counts UTF-16 units and would reject a valid 20
  // code point emoji username. The code point maximum is enforced by the shared
  // username rules instead.
  assert.equal(input.getAttribute("maxlength"), null);
  assert.equal(q(".unm-counter").textContent, "0 / 20");

  typeInto(input, "ab");
  await act(async () => {
    submitForm();
  });
  assert.equal(writes.length, 0, "an invalid username never reaches the backend");
  assert.equal(availabilityLookups.length, 0, "and is never looked up");
  assert.ok(q(".unm-modal"), "the modal stays open");
  assert.equal(q(".unm-hint--error").textContent, "Username too small");

  typeInto(input, "Ank");
  assert.equal(q(".unm-hint--error"), null, "a usable value clears the warning");
  await act(async () => {
    submitForm();
  });
  assert.equal(writes.length, 1);
  await unmount();
});
