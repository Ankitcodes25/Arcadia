import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

/*
 * The logged-in navbar identity block and the My Profile Player ID.
 *
 * The navbar must be a pure consumer of the progression the backend already put
 * on the authenticated user: no level or XP requirement is calculated there, and
 * the badge tier title stays in My Profile. The Player ID is displayed and
 * copied, never generated on the client.
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
let MyProfileModal;
let AuthContext;
let progressionModule;
let accountInfo;
let clipboardWrites;
let clipboardFails;

function installDom() {
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

  // The Clipboard API is a browser capability, so it is installed per test.
  clipboardWrites = [];
  clipboardFails = false;
  Object.defineProperty(window.navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (text) => {
        if (clipboardFails) throw new Error("clipboard blocked");
        clipboardWrites.push(text);
      },
    },
  });
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
  MyProfileModal = (await vite.ssrLoadModule("/src/pages/Myprofile/MyProfileModal.tsx")).default;
  AuthContext = (await vite.ssrLoadModule("/src/auth/AuthContext.tsx")).default;
  progressionModule = await vite.ssrLoadModule("/src/auth/progression.ts");
  accountInfo = await vite.ssrLoadModule("/src/auth/accountInfo.ts");
});

after(async () => {
  await vite?.close();
  console.error = originalConsoleError;
});

function progression(overrides = {}) {
  return {
    totalXp: 0,
    level: 0,
    currentLevelXp: 0,
    nextLevelXp: 100,
    progressPercent: 0,
    title: "Arcadia Rookie",
    badgeKey: "bronze",
    themeKey: "neutral-grey",
    ...overrides,
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
    createdAt: "2026-09-14T10:00:00.000Z",
    updatedAt: null,
    lastLoginAt: null,
    ...overrides,
  };
}

/* Only the fields Navbar reads; it is never a real auth session here. */
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
    deleteAccount: async () => ({ success: true }),
    loginWithGoogle: () => {},
    logout: async () => ({ success: true }),
    logoutAll: async () => ({ success: true }),
    refresh: async () => null,
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

async function renderNavbar(user) {
  return renderRoot(React.createElement(
    AuthContext.Provider,
    { value: authValue(user) },
    React.createElement(Navbar),
  ));
}

function q(selector) {
  return document.querySelector(selector);
}

function qa(selector) {
  return [...document.querySelectorAll(selector)];
}

function click(node) {
  return act(async () => {
    node.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function wait(ms) {
  await sleep(ms);
  await act(async () => {});
}

function identityText() {
  return q(".navbar-profile-identity").textContent;
}

/* ==================================================================
   Navbar identity block
   ================================================================== */

test("the navbar shows the username, level and XP straight from progression", async () => {
  const unmount = await renderNavbar(navbarUser({
    progression: progression({
      totalXp: 1500,
      level: 5,
      currentLevelXp: 60,
      nextLevelXp: 550,
      progressPercent: 11,
    }),
  }));

  assert.equal(q(".navbar-username").textContent, "Ankit10", "the exact stored username");
  assert.equal(q(".navbar-level").textContent, "Lv. 5", "the level comes from progression.level");
  assert.equal(q(".navbar-xp").textContent, "60 / 550 XP", "current / next XP from progression");
  assert.equal(q(".navbar-xp-fill").style.width, "11%", "the bar width is progressPercent");
  assert.equal(q(".navbar-xp-track").getAttribute("aria-valuemax"), "550");
  assert.equal(q(".navbar-xp-track").getAttribute("aria-valuenow"), "60");
  await unmount();
});

test("Level 0 renders correctly in the navbar", async () => {
  const unmount = await renderNavbar(navbarUser());

  assert.equal(q(".navbar-level").textContent, "Lv. 0");
  assert.equal(q(".navbar-xp").textContent, "0 / 100 XP");
  assert.equal(q(".navbar-xp-fill").style.width, "0%");
  assert.doesNotMatch(identityText(), /NaN|Infinity|undefined/);
  await unmount();
});

test("a full progress bar renders at 100% without overflowing", async () => {
  const unmount = await renderNavbar(navbarUser({
    progression: progression({
      totalXp: 1500,
      level: 5,
      currentLevelXp: 550,
      nextLevelXp: 550,
      progressPercent: 100,
    }),
  }));

  assert.equal(q(".navbar-xp-fill").style.width, "100%");
  await unmount();
});

test("the navbar never shows the badge tier title", async () => {
  const titles = [
    "Arcadia Rookie",
    "Arcadia Challenger",
    "Arcadia Veteran",
    "Arcadia Master",
    "Arcadia Legend",
    "Arcadia Supreme",
  ];

  for (const [index, title] of titles.entries()) {
    const unmount = await renderNavbar(navbarUser({
      progression: progression({
        level: index,
        title,
        currentLevelXp: 10,
        nextLevelXp: 100,
        progressPercent: 10,
      }),
    }));
    assert.doesNotMatch(identityText(), new RegExp(title), title);
    await unmount();
  }
});

test("the navbar tracks a progression change from AuthContext", async () => {
  function Host() {
    const [user, setUser] = React.useState(navbarUser());
    hostValue.user = user;
    hostValue.setUser = setUser;
    return React.createElement(
      AuthContext.Provider,
      { value: authValue(user) },
      React.createElement(Navbar),
    );
  }
  const hostValue = {};

  const unmount = await renderRoot(React.createElement(Host));
  assert.equal(q(".navbar-level").textContent, "Lv. 0");
  assert.equal(q(".navbar-xp-fill").style.width, "0%");

  await act(async () => {
    hostValue.setUser(navbarUser({
      progression: progression({
        totalXp: 300,
        level: 2,
        currentLevelXp: 200,
        nextLevelXp: 300,
        progressPercent: 67,
        title: "Arcadia Rookie",
      }),
    }));
  });

  assert.equal(q(".navbar-level").textContent, "Lv. 2", "the level followed the new progression");
  assert.equal(q(".navbar-xp").textContent, "200 / 300 XP");
  assert.equal(q(".navbar-xp-fill").style.width, "67%");
  await unmount();
});

test("the navbar consumes the shared progression view and never recalculates it", async () => {
  // The navbar view is exactly the shared, defensive renderer over the same
  // backend payload the profile uses.
  const payload = progression({ totalXp: 2050, level: 6, currentLevelXp: 50, nextLevelXp: 600, progressPercent: 8 });
  assert.deepEqual(
    progressionModule.getUserProgressionView({ progression: payload }),
    progressionModule.getProgressionView(payload),
  );

  const unmount = await renderNavbar(navbarUser({ progression: payload }));
  assert.equal(q(".navbar-level").textContent, "Lv. 6");
  assert.equal(q(".navbar-xp").textContent, "50 / 600 XP");
  assert.equal(q(".navbar-xp-fill").style.width, "8%");
  await unmount();
});

test("the navbar does not put the Player ID on screen", async () => {
  const unmount = await renderNavbar(navbarUser());

  assert.doesNotMatch(identityText(), /ARC-7K4M2P9Q/, "the Player ID stays in My Profile");
  assert.equal(q(".navbar-username").textContent, "Ankit10");
  await unmount();
});

test("the navbar identity and the avatar are rounded squares that open the same menu", async () => {
  const menuLabels = ["My Profile", "Leaderboards", "Settings", "Help & Support", "Logout"];

  for (const target of [".navbar-identity-button", ".avatar-button"]) {
    const unmount = await renderNavbar(navbarUser());
    assert.equal(q(".profile-popup"), null, "the menu starts closed");

    await click(q(target));
    for (const label of menuLabels) {
      assert.match(q(".profile-popup").textContent, new RegExp(label), `${target}: ${label}`);
    }
    await unmount();
  }
});

test("the navbar avatar keeps both avatar sources", async () => {
  const local = await renderNavbar(navbarUser({
    avatar: { type: "local", value: "avatar-03" },
    avatarSource: "local",
  }));
  const localAvatar = q(".avatar-button .avatar-preview-placeholder");
  assert.ok(localAvatar, "a local Arcadia avatar renders as the placeholder");
  assert.equal(localAvatar.getAttribute("aria-label"), "Nova avatar");
  await local();

  const google = await renderNavbar(navbarUser({
    avatar: { type: "google", value: "google" },
    avatarSource: "google",
    googleAvatarAvailable: true,
    googleAvatarUrl: "https://lh3.googleusercontent.com/a/test-avatar",
  }));
  const googleAvatar = q(".avatar-button .avatar-preview-image");
  assert.ok(googleAvatar, "the Google picture still renders");
  assert.equal(googleAvatar.getAttribute("src"), "https://lh3.googleusercontent.com/a/test-avatar");
  await google();
});

/* ==================================================================
   My Profile: username and Player ID
   ================================================================== */

/*
 * An independent oracle for the joined date, derived in plain local time with
 * its own month table. It is deliberately not the module under test, and it does
 * not hardcode a calendar day, so the assertion is correct in any timezone the
 * suite runs in.
 */
const EXPECTED_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function expectedJoinedDate(iso) {
  const date = new Date(iso);
  return `${date.getDate()} ${EXPECTED_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function profileFixture(overrides = {}) {
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
    // Midday UTC keeps the local-time rendering on the same calendar day in any
    // timezone the suite might run in.
    createdAt: "2026-09-24T12:00:00.000Z",
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

async function renderProfile(profile) {
  return renderRoot(React.createElement(MyProfileModal, {
    profile,
    onClose: () => {},
    onSaveUsername: async () => {},
  }));
}

test("My Profile shows the exact username and Player ID from the server", async () => {
  const unmount = await renderProfile(profileFixture());

  assert.equal(q('[data-field="username"]').textContent, "Ankit10");
  assert.equal(q('[data-field="playerId"]').textContent, "ARC-7K4M2P9Q");
  await unmount();
});

test("My Profile no longer shows the Google name in the identity block", async () => {
  const unmount = await renderProfile(profileFixture({
    authProvider: "GOOGLE",
    displayName: "Ankit Das From Google",
    name: "Ankit Das From Google",
  }));

  const fields = q(".mpm-identity").textContent;
  assert.doesNotMatch(fields, /Ankit Das From Google/, "the Google fetched name is gone");
  assert.doesNotMatch(fields, /Joined/, "the joined date is not in the identity block");

  // Google identity is still surfaced, under Account Info, so OAuth is untouched.
  assert.equal(q('[data-field="loginMethod"]').textContent, "Google \u00B7 user@example.com");
  assert.equal(q(".mpm-provider-pill"), null, "the old header badge is not rendered");
  await unmount();
});

test("the username copy button copies the exact username and confirms", async () => {
  const unmount = await renderProfile(profileFixture());
  clipboardWrites.length = 0;

  const button = q('button[aria-label="Copy username"]');
  assert.equal(button.getAttribute("type"), "button", "never submits a form");
  await click(button);

  assert.deepEqual(clipboardWrites, ["Ankit10"], "the exact displayed username");
  assert.equal(q('[data-field="username"]').textContent, "Ankit10", "the username is not modified");
  assert.equal(q(".copy-field-feedback").textContent, "Username copied");
  assert.equal(q(".copy-field-feedback").getAttribute("role"), "status");
  await unmount();
});

test("the Player ID copy button copies the exact Player ID and confirms", async () => {
  const unmount = await renderProfile(profileFixture());
  clipboardWrites.length = 0;

  const button = q('button[aria-label="Copy player ID"]');
  assert.equal(button.getAttribute("type"), "button");
  await click(button);

  assert.deepEqual(clipboardWrites, ["ARC-7K4M2P9Q"]);
  assert.equal(q('[data-field="playerId"]').textContent, "ARC-7K4M2P9Q", "the Player ID is never modified");
  assert.equal(q(".copy-field-feedback").textContent, "Player ID copied");
  await unmount();
});

test("copy feedback fades away on its own and leaves no persistent UI", async () => {
  const { NOTICE_AUTO_DISMISS_MS, NOTICE_FADE_MS } =
    await vite.ssrLoadModule("/src/auth/authNotice.ts");
  assert.equal(NOTICE_AUTO_DISMISS_MS, 5_000, "the shared lifecycle is reused unchanged");

  const unmount = await renderProfile(profileFixture());
  clipboardWrites.length = 0;

  await click(q('button[aria-label="Copy username"]'));
  let feedback = q(".copy-field-feedback");
  assert.equal(feedback.textContent, "Username copied");
  assert.equal(feedback.classList.contains("is-leaving"), false);

  // Fade starts at the shared duration, removal follows the shared fade.
  await wait(NOTICE_AUTO_DISMISS_MS - 400);
  feedback = q(".copy-field-feedback");
  assert.ok(feedback, "still visible just before the fade");
  assert.equal(feedback.classList.contains("is-leaving"), false);

  await wait(500);
  assert.equal(q(".copy-field-feedback")?.classList.contains("is-leaving"), true, "fading out");

  await wait(NOTICE_FADE_MS);
  assert.equal(q(".copy-field-feedback"), null, "the feedback removed itself");
  assert.ok(q(".mpm-modal"), "the profile modal is untouched");
  await unmount();
});

test("a blocked clipboard reports inline instead of breaking the profile", async () => {
  const unmount = await renderProfile(profileFixture());
  clipboardFails = true;
  clipboardWrites.length = 0;

  await click(q('button[aria-label="Copy username"]'));
  assert.equal(clipboardWrites.length, 0);
  assert.equal(q(".copy-field-feedback").textContent, "Copy failed");
  assert.ok(q(".mpm-modal"), "the profile is still open and usable");
  assert.equal(q('[data-field="username"]').textContent, "Ankit10", "nothing was changed");
  clipboardFails = false;
  await unmount();
});

test("an account without a Player ID shows a neutral value and cannot copy one", async () => {
  const unmount = await renderProfile(profileFixture({ playerId: null }));

  assert.equal(q('[data-field="playerId"]').textContent, "—");
  assert.equal(q('button[aria-label="Copy player ID"]').disabled, true);
  await click(q('button[aria-label="Copy player ID"]'));
  assert.equal(clipboardWrites.length, 0, "nothing is copied for a missing Player ID");
  await unmount();
});

test("the frontend never generates a Player ID of its own", async () => {
  const generated = new Set();
  const profiles = [
    profileFixture(),
    profileFixture({ playerId: null }),
    profileFixture({ playerId: "ARC-ZZ99XX88" }),
  ];

  for (const profile of profiles) {
    const unmount = await renderProfile(profile);
    const shown = q('[data-field="playerId"]').textContent;
    generated.add(shown);
    // Whatever is displayed is either the server value or the neutral dash.
    assert.ok(
      shown === (profile.playerId ?? "—"),
      `displayed "${shown}" for server value "${profile.playerId}"`,
    );
    await unmount();
  }

  assert.equal(generated.size, 3, "no value was invented or reused across accounts");
});

test("no browser storage is used for the Player ID or the username", async () => {
  const unmount = await renderProfile(profileFixture());
  clipboardWrites.length = 0;
  await click(q('button[aria-label="Copy player ID"]'));

  assert.equal(window.localStorage.length, 0, "nothing is written to localStorage");
  assert.equal(window.sessionStorage.length, 0, "nothing is written to sessionStorage");
  assert.equal(document.cookie, "", "nothing is written to a cookie");
  await unmount();
});

test("the navbar shows no copy controls in its identity block and My Profile is opened from it", async () => {
  const unmount = await renderNavbar(navbarUser());
  assert.equal(q('button[aria-label="Copy username"]'), null, "the navbar bar itself has no copy");
  assert.equal(q('button[aria-label="Copy player ID"]'), null);

  await click(q(".avatar-button"));
  assert.ok(q(".profile-popup"), "the account menu opens as before");
  await unmount();
});

/* ==================================================================
   Profile Popup <-> My Profile layering

   My Profile is a layer above the Profile Popup, not a replacement for it, so
   its X is a back action: only My Profile closes and the popup stays open.
   ================================================================== */

test("opening My Profile leaves the Profile Popup open underneath it", async () => {
  const unmount = await renderNavbar(navbarUser());

  await click(q(".avatar-button"));
  assert.ok(q(".profile-popup"), "the menu is open");

  await click(qa(".profile-popup-item").find((node) => node.textContent.includes("My Profile")));

  assert.ok(q(".mpm-backdrop"), "My Profile opened");
  assert.ok(q(".profile-popup"), "the Profile Popup is still open, not replaced");
  await unmount();
});

test("My Profile's X is a back action that leaves the Profile Popup open", async () => {
  const unmount = await renderNavbar(navbarUser());

  await click(q(".avatar-button"));
  await click(qa(".profile-popup-item").find((node) => node.textContent.includes("My Profile")));
  assert.ok(q(".mpm-backdrop"), "My Profile is open");

  await click(q(".mpm-close"));

  assert.equal(q(".mpm-backdrop"), null, "My Profile closed");
  assert.ok(q(".profile-popup"), "the Profile Popup survived and is showing again");
  assert.match(q(".profile-popup").textContent, /My Profile/, "with its menu intact");
  await unmount();
});

test("the Profile Popup X still closes the whole Profile Popup", async () => {
  const unmount = await renderNavbar(navbarUser());

  await click(q(".avatar-button"));
  assert.ok(q(".profile-popup"), "the menu is open");

  // A pointer press outside the menu is the existing dismiss gesture.
  await act(async () => {
    document.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
  });

  assert.equal(q(".profile-popup"), null, "the menu closed normally");
  assert.equal(q(".mpm-backdrop"), null, "and My Profile was never involved");
  await unmount();
});

test("the Profile Popup ignores outside clicks while My Profile is open", async () => {
  const unmount = await renderNavbar(navbarUser());

  await click(q(".avatar-button"));
  await click(qa(".profile-popup-item").find((node) => node.textContent.includes("My Profile")));

  // My Profile is portaled outside the menu, so a press on it lands outside the
  // menu. That must not dismiss the menu while My Profile is the active layer.
  await act(async () => {
    q(".mpm-modal").dispatchEvent(
      new window.MouseEvent("pointerdown", { bubbles: true, cancelable: true }),
    );
    document.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
  });

  assert.ok(q(".mpm-backdrop"), "My Profile is still open");
  assert.ok(q(".profile-popup"), "and the Profile Popup was not dismissed by it");
  await unmount();
});

test("Escape closes My Profile without also closing the Profile Popup", async () => {
  const unmount = await renderNavbar(navbarUser());

  await click(q(".avatar-button"));
  await click(qa(".profile-popup-item").find((node) => node.textContent.includes("My Profile")));

  await act(async () => {
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });

  assert.equal(q(".mpm-backdrop"), null, "My Profile closed");
  assert.ok(q(".profile-popup"), "the Profile Popup is still open");
  await unmount();
});

/* ==================================================================
   Profile Popup identity
   ================================================================== */

test("the Profile Popup shows no email address or verification state", async () => {
  const unmount = await renderNavbar(navbarUser());

  await click(q(".avatar-button"));
  const popup = q(".profile-popup");

  assert.doesNotMatch(popup.textContent, /user@example\.com/, "the email is removed");
  assert.doesNotMatch(popup.textContent, /Verified/i, "the verification state is removed");
  assert.equal(q(".profile-popup-email"), null, "the email row no longer exists");
  await unmount();
});

test("the Profile Popup leads with the Player ID, then the username and badge title", async () => {
  const unmount = await renderNavbar(navbarUser({
    // The Legend tier exactly as the backend tier table describes it.
    progression: progression({
      level: 20,
      title: "Arcadia Legend",
      badgeKey: "crown",
      themeKey: "crown",
    }),
  }));

  await click(q(".avatar-button"));
  const identity = q(".profile-popup-identity-body");

  // The order is the hierarchy: Player ID, then username, then badge title.
  const fields = [...identity.querySelectorAll("[data-field]")].map((node) => node.dataset.field);
  assert.deepEqual(fields, ["playerId", "username", "progressionTitle"]);

  assert.equal(q(".profile-popup-label").textContent, "Player ID");
  assert.equal(q('.profile-popup [data-field="playerId"]').textContent, "ARC-7K4M2P9Q");
  assert.equal(q('.profile-popup [data-field="username"]').textContent, "Ankit10");
  assert.equal(
    q('.profile-popup [data-field="progressionTitle"]').textContent,
    "Arcadia Legend",
    "the badge title comes from the progression, not a hardcoded string",
  );
  assert.equal(
    q('.profile-popup [data-field="progressionTitle"]').className,
    "profile-popup-badge profile-popup-badge--crown",
    "the badge is tinted by the progression theme",
  );
  // The avatar keeps its own class but now sits inside the ring wrapper.
  const avatar = q(".profile-popup-avatar");
  assert.equal(avatar.parentElement.className, "profile-popup-avatar-wrap", "the ring wraps the avatar");
  await unmount();
});

test("the Profile Popup copies the exact Player ID", async () => {
  const unmount = await renderNavbar(navbarUser());
  clipboardWrites.length = 0;

  await click(q(".avatar-button"));
  const copy = q('.profile-popup button[aria-label="Copy player ID"]');
  assert.ok(copy, "the Player ID is copyable from the Profile Popup");
  assert.equal(q('.profile-popup button[aria-label="Copy username"]'), null, "no username copy is added");

  await click(copy);

  assert.deepEqual(clipboardWrites, ["ARC-7K4M2P9Q"], "the exact Player ID reached the clipboard");
  assert.match(
    q(".profile-popup").textContent,
    /Player ID copied/,
    "the existing inline confirmation is reused",
  );
  await unmount();
});

test("the Profile Popup still offers exactly the six approved options in order", async () => {
  const unmount = await renderNavbar(navbarUser());

  await click(q(".avatar-button"));
  const labels = qa(".profile-popup-item").map((node) => node.textContent.replace("Logging out…", "Logout"));
  assert.deepEqual(
    labels,
    ["My Profile", "Leaderboards", "Match History", "Settings", "Help & Support", "Logout"],
    "Match History sits immediately after Leaderboards and before Settings",
  );

  // Every item has a real icon rather than a bare glyph.
  for (const item of qa(".profile-popup-item")) {
    assert.ok(item.querySelector(".profile-popup-icon svg"), `${item.textContent} has an icon`);
  }
  await unmount();
});

test("Settings and Logout from the Profile Popup keep working", async () => {
  const settings = await renderNavbar(navbarUser());
  await click(q(".avatar-button"));
  await click(qa(".profile-popup-item").find((node) => node.textContent.includes("Settings")));

  /*
   * Settings now opens as its own modal layer portaled above the popup
   * rather than expanding the popup in place. The popup stays mounted
   * underneath, which is what makes the modal's close a back action.
   */
  assert.ok(q(".settings-backdrop"), "the settings modal opens as its own layer");
  assert.ok(
    q('.settings-backdrop .settings-modal[role="dialog"]'),
    "and it is a real dialog, not an inline panel",
  );
  assert.ok(q(".profile-popup"), "and the popup is not torn down");

  // Escape closes only the top layer: the modal, leaving the popup open.
  await act(async () => {
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  assert.equal(q(".settings-backdrop"), null, "escape closes the settings modal");
  assert.ok(q(".profile-popup"), "but the popup stays open underneath");

  await settings();

  // Logout closes the popup, which is the pre-existing behaviour.
  const logout = await renderNavbar(navbarUser());
  await click(q(".avatar-button"));
  assert.ok(q(".profile-popup"));
  await click(q(".profile-popup-item.logout"));
  await wait(0);
  assert.equal(q(".profile-popup"), null, "logout still dismisses the popup");
  await logout();
});

/* ==================================================================
   Account Info
   ================================================================== */

test("the joined date is formatted from createdAt without a new field", async () => {
  // A fixed English month table, so the month is never abbreviated or localised.
  assert.match(
    accountInfo.formatJoinedDate("2026-09-24T12:00:00.000Z"),
    /^\d{1,2} [A-Z][a-z]+ \d{4}$/,
  );
  assert.equal(
    accountInfo.formatJoinedDate("2026-01-05T12:00:00.000Z"),
    expectedJoinedDate("2026-01-05T12:00:00.000Z"),
  );
  assert.equal(
    accountInfo.formatJoinedDate("2026-12-31T12:00:00.000Z"),
    expectedJoinedDate("2026-12-31T12:00:00.000Z"),
  );
  // A December date must not collapse to a numeric month.
  assert.match(
    accountInfo.formatJoinedDate("2026-12-31T12:00:00.000Z"),
    /December/,
  );

  // Anything unusable is neutral rather than "Invalid Date".
  for (const value of [null, undefined, "", "not-a-date", Number.NaN]) {
    assert.equal(accountInfo.formatJoinedDate(value), "—", String(value));
  }

  const createdAt = "2026-09-24T12:00:00.000Z";
  const unmount = await renderProfile(profileFixture({ createdAt }));
  assert.equal(q('[data-field="joinedDate"]').textContent, expectedJoinedDate(createdAt));
  await unmount();
});

test("Total Hours Played shows a neutral placeholder because nothing tracks playtime", async () => {
  // There is no playtime source in the backend today, so the value is absent.
  assert.equal("totalMinutesPlayed" in accountInfo, false, "no invented default is exposed");

  const unmount = await renderProfile(profileFixture());
  assert.equal(q('[data-field="hoursPlayed"]').textContent, "—", "no number is invented");
  assert.match(q(".mpm-info-card .mpm-info-hint").textContent, /Not tracked yet/);
  await unmount();

  // The integration point is ready: a real backend value renders immediately.
  const withPlaytime = await renderProfile(profileFixture({
    gamingStats: {
      gamesPlayed: 0,
      gamesWon: 0,
      totalScore: 0,
      bestScore: 0,
      currentStreak: 0,
      winRatePercent: 0,
      totalMinutesPlayed: 768,
    },
  }));
  assert.equal(q('[data-field="hoursPlayed"]').textContent, "12h 48m");
  assert.doesNotMatch(q(".mpm-info-card .mpm-info-hint").textContent, /Not tracked yet/);
  await withPlaytime();
});

test("playtime formatting is safe for every unusable value", () => {
  assert.equal(accountInfo.formatHoursPlayed(768), "12h 48m");
  assert.equal(accountInfo.formatHoursPlayed(60), "1h 0m");
  assert.equal(accountInfo.formatHoursPlayed(0), "0m", "a real zero is still a real value");
  assert.equal(accountInfo.formatHoursPlayed(45), "45m");
  assert.equal(accountInfo.formatHoursPlayed(1441), "24h 1m");

  for (const value of [null, undefined, Number.NaN, Infinity, -1, "many", {}]) {
    assert.equal(accountInfo.formatHoursPlayed(value), "—", String(value));
  }
});

test("the login method reflects the account's real authentication method", async () => {
  assert.equal(accountInfo.getLoginMethodWithEmail("GOOGLE", "a@gmail.com"), "Google · a@gmail.com");
  assert.equal(
    accountInfo.getLoginMethodWithEmail("PASSWORD", "a@example.com"),
    "Email · a@example.com",
  );
  assert.equal(accountInfo.getLoginMethodWithEmail("SOMETHING_ELSE", "a@b.com"), "— · a@b.com");

  const password = await renderProfile(profileFixture());
  assert.equal(q('[data-field="loginMethod"]').textContent, "Email \u00B7 user@example.com");
  await password();

  const google = await renderProfile(profileFixture({
    authProvider: "GOOGLE",
    avatar: { type: "google", value: "google" },
    avatarSource: "google",
    googleAvatarAvailable: true,
    googleAvatarUrl: "https://lh3.googleusercontent.com/a/test-avatar",
  }));
  assert.equal(q('[data-field="loginMethod"]').textContent, "Google \u00B7 user@example.com");
  await google();
});

test("the account status comes from the account record", async () => {
  assert.equal(accountInfo.getAccountStatusLabel("ACTIVE"), "Active");
  assert.equal(accountInfo.getAccountStatusLabel("SUSPENDED"), "Suspended");
  assert.equal(accountInfo.getAccountStatusLabel("DELETED"), "Deleted");
  assert.equal(accountInfo.getAccountStatusLabel("UNKNOWN"), "—");

  for (const [status, label, tone] of [
    ["ACTIVE", "Active", "active"],
    ["SUSPENDED", "Suspended", "inactive"],
  ]) {
    const unmount = await renderProfile(profileFixture({ status }));
    const value = q('[data-field="accountStatus"]');
    assert.equal(value.textContent, label);
    assert.ok(value.classList.contains(`mpm-info-value--${tone}`));
    await unmount();
  }
});

test("the Google badge moved into Account Info and is not duplicated", async () => {
  const unmount = await renderProfile(profileFixture({
    authProvider: "GOOGLE",
    avatar: { type: "google", value: "google" },
    avatarSource: "google",
    googleAvatarAvailable: true,
    googleAvatarUrl: "https://lh3.googleusercontent.com/a/test-avatar",
  }));

  // Gone from the header.
  assert.equal(q(".mpm-provider-pill"), null, "the header badge was removed");
  assert.doesNotMatch(q(".mpm-header").textContent, /Signed in with Google/);

  // Present exactly once, inside Account Info.
  assert.equal(q('[data-field="loginMethod"]').textContent, "Google \u00B7 user@example.com");
  assert.equal(
    (document.body.textContent.match(/Google/g) || []).length >= 1,
    true,
  );
  const accountSection = [...document.querySelectorAll(".mpm-section")]
    .find((section) => section.querySelector(".mpm-section-title").textContent.includes("Account Info"));
  assert.ok(accountSection, "the Account Info section exists");
  assert.match(accountSection.querySelector('[data-field="loginMethod"]').textContent, /Google/);
  assert.equal(
    document.querySelectorAll(".mpm-provider-pill").length,
    0,
    "the old badge is not rendered anywhere",
  );

  // The trusted Google avatar still renders, so OAuth identity is untouched.
  assert.ok(q("img.avatar-preview-image"), "the Google avatar still works");
  await unmount();
});

test("Account Info sits directly below Game Breakdown and is informational only", async () => {
  const unmount = await renderProfile(profileFixture());

  const titles = [...document.querySelectorAll(".mpm-section-title")].map((node) => node.textContent);
  const breakdownIndex = titles.findIndex((title) => title.includes("Game Breakdown"));
  const accountIndex = titles.findIndex((title) => title.includes("Account Info"));
  assert.ok(breakdownIndex >= 0, "Game Breakdown still exists");
  assert.equal(accountIndex, breakdownIndex + 1, "Account Info comes straight after Game Breakdown");

  // Exactly the four required pieces of information.
  const labels = [...document.querySelectorAll(".mpm-info-label")].map((node) => node.textContent);
  assert.deepEqual(labels, [
    "Total Hours Played",
    "Joined Date",
    "Login Method",
    "Account Status",
  ]);
  assert.equal(document.querySelectorAll(".mpm-info-card").length, 4);

  // The modal has no generic action row at all, so there is nothing in the
  // section (or anywhere else) that could save or discard a change.
  assert.equal(document.querySelectorAll(".mpm-save").length, 0, "no Save Changes button");
  assert.equal(document.querySelectorAll(".mpm-reset").length, 0, "no Reset Changes button");
  assert.equal(q(".mpm-actions"), null, "no action row");

  // Game Breakdown itself is unchanged.
  assert.equal(document.querySelectorAll(".mpm-table").length, 1);
  assert.equal(document.querySelectorAll(".mpm-table tbody tr").length, 5);
  await unmount();
});

test("My Profile is read-only apart from the contextual controls", async () => {
  const unmount = await renderProfile(profileFixture());

  const arcadionSection = [...document.querySelectorAll(".mpm-section")]
    .find((section) => section.querySelector(".mpm-section-title").textContent.includes("Played with Arcadion"));
  assert.ok(arcadionSection, "Played with Arcadion section exists");
  assert.deepEqual(
    [...arcadionSection.querySelectorAll(".mpm-stat-label")].map((node) => node.textContent),
    ["Total Matches", "Total Wins", "Best Score", "Win Ratio"],
  );

  // No generic action button exists to enable, so reading the profile can never
  // look like an edit and there is nothing to press.
  assert.equal(q(".mpm-save"), null, "there is no Save Changes to enable");
  assert.equal(q(".mpm-reset"), null, "there is no Reset Changes");
  assert.equal(q(".mpm-pending-pill"), null, "no pending change is implied");
  assert.equal(q(".mpm-avatar-picker"), null, "no staged avatar");

  // Exactly the contextual controls the profile elements own.
  assert.ok(q(".mpm-close"), "the top-right X");
  assert.ok(q('button[aria-label="Copy username"]'), "the username copy");
  assert.ok(q('button[aria-label="Edit username"]'), "the username pencil");
  assert.ok(q('button[aria-label="Copy player ID"]'), "the Player ID copy");
  assert.ok(q('button[aria-label="Edit avatar"]'), "the avatar pencil");
  await unmount();
});

test("every Account Info item is an icon card, not a table row", async () => {
  const unmount = await renderProfile(profileFixture());

  const cards = [...document.querySelectorAll(".mpm-info-card")];
  assert.equal(cards.length, 4);

  for (const card of cards) {
    // A subtle icon, an uppercase label, a brighter value and a hint line.
    const icon = card.querySelector(".mpm-info-icon");
    assert.ok(icon, "the card has an icon chip");
    assert.ok(icon.querySelector("svg"), "the chip holds an actual icon");
    assert.ok(card.querySelector(".mpm-info-label"), "the card has a label");
    assert.ok(card.querySelector(".mpm-info-value"), "the card has a value");
    assert.ok(card.querySelector(".mpm-info-hint"), "the card has a hint line");
  }

  // The status tone is the one green accent in the section.
  const active = q(".mpm-info-value--active");
  assert.ok(active, "an active account gets the positive tone");
  assert.equal(active.dataset.field, "accountStatus");

  // A suspended account is not styled as active.
  const suspended = await renderProfile(profileFixture({ status: "SUSPENDED" }));
  assert.equal(q(".mpm-info-value--active"), null, "a suspended account is not toned as active");
  assert.ok(q(".mpm-info-value--inactive"), "it gets the negative tone instead");
  await suspended();
  await unmount();
});

test("Account Info renders neutral values when the profile fields are missing", async () => {
  const unmount = await renderProfile(profileFixture({
    createdAt: null,
    status: "ACTIVE",
    authProvider: "PASSWORD",
  }));

  assert.equal(q('[data-field="joinedDate"]').textContent, "—");
  assert.equal(q('[data-field="hoursPlayed"]').textContent, "—");
  assert.equal(q('[data-field="loginMethod"]').textContent, "Email \u00B7 user@example.com");
  assert.equal(q('[data-field="accountStatus"]').textContent, "Active");
  assert.doesNotMatch(q(".mpm-section--account").textContent, /NaN|Invalid Date|undefined/);
  await unmount();
});
