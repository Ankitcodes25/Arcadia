// The Change Password success flow: Settings hands the confirmed change to
// AuthContext, the confirmation dialog has to appear after the session it ended
// is already gone, and its Login button has to land on the Landing Page with
// the existing Login/Signup dialog open in login mode.
//
// AuthProvider, SettingsModal and the confirmation dialog are all real here —
// only the network (authApi) is stubbed, so the sequence under test is the one
// the application actually runs.
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

const frontendRoot = fileURLToPath(new URL("../", import.meta.url));
const originalConsoleError = console.error;

/** Matches the dialog by its heading, so a different dialog is never mistaken. */
const DIALOG = '[aria-labelledby="password-changed-title"]';

let dom;
let vite;
let React;
let act;
let createRoot;
let root;
let AuthProvider;
let useAuth;
let authApi;
let AuthApiError;
let SettingsModal;
let PasswordChangeSuccessModal;
let Navbar;

/** The context as of the last render, so a test can read provider state. */
let auth;
let navigationEvents;
let changePasswordCalls;
let changePasswordImpl;

function installDom() {
  dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://arcadia.test/games",
  });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  for (const key of [
    "HTMLElement", "HTMLInputElement", "HTMLButtonElement", "HTMLSelectElement",
    "HTMLTextAreaElement", "Element", "Node", "Event", "MouseEvent",
    "KeyboardEvent", "CustomEvent", "FocusEvent", "MutationObserver",
  ]) {
    globalThis[key] = window[key];
  }
  Object.defineProperty(globalThis, "navigator", {
    value: window.navigator,
    configurable: true,
  });
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
  globalThis.cancelAnimationFrame = (handle) => clearTimeout(handle);
  window.HTMLElement.prototype.scrollIntoView = function () {};
  /* jsdom has no viewport to scroll; navigation only has to update the URL. */
  window.scrollTo = function () {};
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

  /* What the Landing Page navigation helper reports to the application. */
  navigationEvents = 0;
  dom.window.addEventListener("arcadia:navigate", () => { navigationEvents += 1; });

  vite = await createServer({
    root: frontendRoot,
    logLevel: "silent",
    server: { middlewareMode: true },
    appType: "custom",
  });
  ({ AuthProvider, useAuth } = await vite.ssrLoadModule("/src/auth/AuthContext.tsx"));
  ({ authApi, AuthApiError } = await vite.ssrLoadModule("/src/auth/authApi.ts"));
  SettingsModal = (await vite.ssrLoadModule("/src/pages/Settings/SettingsModal.tsx")).default;
  PasswordChangeSuccessModal =
    (await vite.ssrLoadModule("/src/auth/PasswordChangeSuccessModal.tsx")).default;
  Navbar = (await vite.ssrLoadModule("/src/components/Navbar.tsx")).default;
});

after(async () => {
  /* Unmounting also closes AuthProvider's BroadcastChannel. */
  await act(async () => { root?.unmount(); });
  root = null;
  await vite?.close();
  console.error = originalConsoleError;
});

beforeEach(() => {
  navigationEvents = 0;
  changePasswordCalls = [];
  changePasswordImpl = async () => ({
    message: "Password changed successfully. Please log in again.",
  });

  /*
   * The network is stubbed at the module SettingsModal and AuthContext call
   * through. `refresh` returns a signed-in account, so each test starts where
   * a reader changing their password starts: authenticated.
   */
  authApi.refresh = async () => ({ token: "access-token", user: authUser() });
  authApi.me = async () => { throw new Error("auth is stubbed in tests"); };
  authApi.changePassword = async (values) => {
    changePasswordCalls.push(values);
    return changePasswordImpl(values);
  };
  authApi.getPreferences = async () => ({ preferences: defaultPreferences() });
  authApi.updatePreferences = async (updates) => ({ preferences: { ...defaultPreferences(), ...updates } });
  authApi.resetPreferences = async () => ({ preferences: defaultPreferences() });
  authApi.updateProfile = async () => ({ user: authUser() });
  authApi.deleteAccount = async () => ({ success: true, message: null });
  authApi.revokeSession = async () => ({ current: false, message: "" });
  authApi.logoutOtherSessions = async () => ({ revokedCount: 0, message: "" });
  authApi.logout = async () => ({});
  authApi.logoutAll = async () => ({});
});

/* ------------------------------------------------------------------
   Fixtures
   ---------------------------------------------------------------- */

function defaultPreferences() {
  return {
    soundEffects: true,
    soundVolume: 100,
    profileVisibility: "PUBLIC",
    leaderboardVisibility: "SHOW",
  };
}

function authUser(overrides = {}) {
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
    progression: {
      totalXp: 240, level: 2, currentLevelXp: 40, nextLevelXp: 100,
      progressPercent: 40, title: "Arcadia Rookie", badgeKey: "bronze",
      themeKey: "bronze",
    },
    role: "USER",
    status: "ACTIVE",
    createdAt: "2024-03-15T08:00:00.000Z",
    updatedAt: null,
    lastLoginAt: null,
    ...overrides,
  };
}

/** Reads the provider on every render, so `auth` is never stale. */
function Probe() {
  auth = useAuth();
  return null;
}

/**
 * Mounts the real provider with Settings and the confirmation dialog, exactly
 * as the application does — Settings from the profile popup, the dialog from
 * the top level so it outlives the signed-out state the change produces.
 */
async function mount({ path = "/games", withNavbar = false } = {}) {
  window.history.replaceState({}, "", path);
  await act(async () => { root?.unmount(); });
  document.body.innerHTML = "";
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const surfaces = [
    React.createElement(SettingsModal, { onClose() {} }),
    React.createElement(PasswordChangeSuccessModal),
    React.createElement(Probe),
  ];
  /* The Navbar is what carries the Login/Signup dialog, so it joins when the
     navigation handoff itself is under test. */
  if (withNavbar) surfaces.unshift(React.createElement(Navbar, { isVisible: true }));
  await act(async () => {
    root.render(React.createElement(AuthProvider, null, ...surfaces));
  });
  /* Lets the session bootstrap settle before anything is asserted. */
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
  return () => act(async () => root.unmount());
}

/* ------------------------------------------------------------------
   Event helpers
   ---------------------------------------------------------------- */

function q(selector) { return document.querySelector(selector); }
function qa(selector) { return [...document.querySelectorAll(selector)]; }

function click(node) {
  return act(async () => {
    node.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function setTextInput(field, value) {
  return act(async () => {
    const proto = field instanceof window.HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(field, value);
    field.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

function submitForm(form) {
  return act(async () => {
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  });
}

/** Fills the Change Password form and submits it, as the reader would. */
async function changePassword({
  current = "old-password-1",
  next = "brand-new-pass-1",
} = {}) {
  await setTextInput(q("#settings-current-password"), current);
  await setTextInput(q("#settings-new-password"), next);
  await setTextInput(q("#settings-confirm-password"), next);
  await submitForm(q("#settings-current-password").form);
}

function dialog() { return q(DIALOG); }

/** A button inside the confirmation dialog, so another dialog is never picked. */
function dialogButton(label) {
  return [...dialog().querySelectorAll("button")]
    .find((node) => node.textContent.trim() === label);
}

/** A button anywhere on the surface, used for Settings' own controls. */
function button(label) {
  return qa("button").find((node) => node.textContent.trim() === label);
}

/* ==================================================================
   1. The confirmation appears only once the backend has confirmed
   ================================================================== */

test("a confirmed change ends the session and then shows the confirmation", async () => {
  const unmount = await mount({ path: "/games" });

  assert.equal(auth.isAuthenticated, true, "the reader starts signed in");
  assert.equal(dialog(), null, "nothing is claimed before the request goes out");

  await changePassword();

  assert.equal(changePasswordCalls.length, 1, "the existing endpoint was called once");
  assert.deepEqual(changePasswordCalls[0], {
    currentPassword: "old-password-1",
    newPassword: "brand-new-pass-1",
  }, "the change is sent through the existing API");
  assert.equal(auth.user, null, "the session the change ended is gone");
  assert.equal(auth.isAuthenticated, false, "and the reader is signed out");
  assert.equal(window.location.pathname, "/games", "no navigation happens before the dialog");

  assert.ok(dialog(), "the confirmation appears once the backend confirms");
  assert.equal(dialog().getAttribute("aria-modal"), "true", "it is a modal dialog");
  assert.equal(
    dialog().querySelector("h2").textContent,
    "Password Changed Successfully",
    "the required heading",
  );
  assert.match(
    dialog().textContent.replace(/\s+/g, " "),
    /Your password has been changed successfully\. Please log in again using your new password\./,
    "the required message",
  );
  assert.ok(dialogButton("Login"), "the primary Login button is present");
  await unmount();
});

test("each change-password field can show and hide its value independently", async () => {
  const unmount = await mount();
  const fields = [
    ["#settings-current-password", "Show current password", "Hide current password"],
    ["#settings-new-password", "Show new password", "Hide new password"],
    ["#settings-confirm-password", "Show confirmation password", "Hide confirmation password"],
  ];

  for (const [selector, showLabel, hideLabel] of fields) {
    const field = q(selector);
    assert.equal(field.type, "password", `${selector} starts hidden`);
    await click(q(`[aria-label="${showLabel}"]`));
    assert.equal(field.type, "text", `${selector} is visible after clicking its eye`);
    await click(q(`[aria-label="${hideLabel}"]`));
    assert.equal(field.type, "password", `${selector} is hidden again`);
  }

  await unmount();
});

test("the confirmation waits for the response and never shows early", async () => {
  let release;
  changePasswordImpl = () => new Promise((resolve) => {
    release = () => resolve({ message: "Password changed successfully. Please log in again." });
  });
  const unmount = await mount();

  await changePassword();

  assert.equal(changePasswordCalls.length, 1, "the request is in flight");
  assert.equal(dialog(), null, "no confirmation before the backend answers");
  assert.equal(auth.isAuthenticated, true, "the session survives until the change is confirmed");

  await act(async () => { release(); });

  assert.ok(dialog(), "the confirmation appears on the confirmed response alone");
  await unmount();
});

test("a failed change reports inline and raises no confirmation", async () => {
  changePasswordImpl = async () => {
    throw new AuthApiError("Current password is incorrect", 401);
  };
  const unmount = await mount();

  await changePassword();

  assert.match(q(".settings-error").textContent, /Current password is incorrect/, "the error stays inline in Settings");
  assert.equal(dialog(), null, "no confirmation is raised on a failure");
  assert.equal(auth.isAuthenticated, true, "the session is untouched by a failed change");
  assert.equal(auth.user?.id, "user-1", "and the account is still the signed-in one");
  assert.equal(navigationEvents, 0, "a failure navigates nowhere");
  await unmount();
});

test("a second submit while the request is in flight never reaches the backend", async () => {
  let release;
  changePasswordImpl = () => new Promise((resolve) => {
    release = () => resolve({ message: "Password changed successfully. Please log in again." });
  });
  const unmount = await mount();

  await changePassword();
  assert.equal(changePasswordCalls.length, 1, "the first submit went out");
  assert.ok(button("Updating…")?.disabled, "the submit button is disabled while busy");

  await submitForm(q("#settings-current-password").form);
  await submitForm(q("#settings-current-password").form);
  assert.equal(changePasswordCalls.length, 1, "a repeat submit while busy never reaches the backend");

  await act(async () => { release(); });
  assert.equal(changePasswordCalls.length, 1, "still one call after the response lands");
  await unmount();
});

/* ==================================================================
   2. The Login button: Landing Page + the existing Login/Signup dialog
   ================================================================== */

test("Login closes the dialog, returns to the Landing Page and opens the Login dialog", async () => {
  const unmount = await mount({ path: "/games" });

  await changePassword();
  assert.ok(dialog(), "the confirmation is up");

  await click(dialogButton("Login"));

  assert.equal(dialog(), null, "the confirmation is closed first");
  assert.equal(window.location.pathname, "/", "the reader is on the Landing Page");
  assert.equal(navigationEvents, 1, "it went there through the application's navigation");
  assert.equal(auth.authMode, "login", "the existing Login/Signup dialog is open in login mode");
  assert.equal(auth.isAuthenticated, false, "the reader is still signed out, ready to log back in");
  await unmount();
});

test("Login from an already-Landing Page still opens the Login dialog", async () => {
  const unmount = await mount({ path: "/" });

  await changePassword();
  await click(dialogButton("Login"));

  assert.equal(navigationEvents, 0, "navigating to the page already shown does nothing noisy");
  assert.equal(auth.authMode, "login", "the Login/Signup dialog opens either way");
  assert.equal(dialog(), null, "the confirmation is closed");
  await unmount();
});

/* ==================================================================
   3. Dismissing never restores the ended session
   ================================================================== */

test("the X is a direct link to the Landing Page without the sign-in dialog", async () => {
  const unmount = await mount({ path: "/games" });

  await changePassword();
  assert.ok(dialog(), "the confirmation is up");

  const closeLink = q(".password-change-close");
  assert.equal(closeLink.tagName, "A", "the close control uses native link navigation");
  assert.equal(closeLink.getAttribute("href"), "/", "the link targets the Landing Page");
  assert.equal(closeLink.getAttribute("aria-label"), "Close dialog and return to the landing page");
  assert.equal(auth.authMode, null, "no sign-in dialog is opened by closing it");
  assert.equal(auth.isAuthenticated, false, "the ended session stays ended");
  assert.equal(auth.user, null, "no account is restored");
  await unmount();
});

test("the X points to Landing Page even without a JavaScript click handler", async () => {
  const unmount = await mount({ path: "/games" });

  await changePassword();
  const closeLink = q(".password-change-close");
  assert.ok(closeLink, "the close link is visible");
  assert.equal(new URL(closeLink.href).pathname, "/", "the browser destination is the Landing Page");
  assert.equal(auth.authMode, null, "the Login/Signup dialog stays closed");
  await unmount();
});

test("closing with the backdrop lands on the Landing Page without the sign-in dialog", async () => {
  const unmount = await mount({ path: "/games" });

  await changePassword();
  assert.ok(dialog(), "the confirmation is up");

  await act(async () => {
    q(".auth-modal-backdrop").dispatchEvent(
      new window.MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );
  });

  assert.equal(dialog(), null, "the backdrop closes the dialog");
  assert.equal(window.location.pathname, "/", "the reader is on the Landing Page");
  assert.equal(auth.authMode, null, "nothing else opens in its place");
  assert.equal(auth.isAuthenticated, false, "the ended session stays ended");
  await unmount();
});

test("the X still targets the Landing Page when already there", async () => {
  const unmount = await mount({ path: "/" });

  await changePassword();
  assert.equal(q(".password-change-close").getAttribute("href"), "/");
  assert.equal(auth.authMode, null, "and still no sign-in dialog is opened");
  await unmount();
});

/* ==================================================================
   4. The handoff, with the real Navbar carrying the Login/Signup dialog
   ================================================================== */

test("the change ends at the Landing Page with the real Login/Signup dialog open", async () => {
  const unmount = await mount({ path: "/games", withNavbar: true });
  assert.equal(auth.isAuthenticated, true, "the reader starts signed in");
  assert.ok(q(".navbar"), "the application shell is mounted");

  await changePassword();
  const login = dialogButton("Login");
  assert.ok(login, "the confirmation is up over the signed-out application");

  await click(login);

  /* "/" is the route App renders the Landing Page for, and the navigation
     helper's event is what tells the router to switch to it. */
  assert.equal(window.location.pathname, "/", "the router is on the Landing Page route");
  assert.equal(navigationEvents, 1, "it got there through the application's navigation");
  assert.equal(dialog(), null, "the confirmation is closed, not stacked behind anything");

  const title = q("#auth-modal-title");
  assert.ok(title, "the existing Login/Signup dialog is on screen");
  assert.equal(title.textContent, "Log in to Arcadia", "and it is open in login mode");
  assert.equal(
    title.closest('[role="dialog"]').getAttribute("aria-modal"),
    "true",
    "as a modal dialog",
  );
  assert.equal(auth.authMode, "login", "the modal state is the provider's, not a local copy");
  assert.equal(auth.isAuthenticated, false, "the reader is signed out and ready for the new password");
  await unmount();
});
