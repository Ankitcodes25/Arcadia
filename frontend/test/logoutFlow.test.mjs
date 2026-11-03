/*
 * The player sign-out flow.
 *
 * The real App, AuthProvider, Navbar and Profile Popup are mounted here; only
 * the network (authApi and fetch) is stubbed. The assertions cover the actual
 * sequence the reader sees:
 *
 *   Logout -> existing full-screen session-restoration screen -> confirmed
 *   server logout -> "/" at scroll top -> guest navbar.
 *
 * A failed request must leave the account signed in, report the failure through
 * the existing global notice, and leave Logout available as a safe retry.
 */
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
let App;
let authApi;
let AuthApiError;
let scrollCalls;
let logoutImpl;
let logoutCalls;

function installDom() {
  dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://arcadia.test/games",
  });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  for (const key of [
    "HTMLElement", "HTMLInputElement", "HTMLButtonElement", "HTMLTextAreaElement",
    "HTMLSelectElement", "Element", "Node", "Event", "MouseEvent", "KeyboardEvent",
    "CustomEvent", "FocusEvent", "MutationObserver",
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

  scrollCalls = [];
  window.scrollTo = (...args) => { scrollCalls.push(args); };
  globalThis.scrollTo = window.scrollTo;

  if (!window.matchMedia) {
    window.matchMedia = (query) => ({
      matches: false, media: query, onchange: null,
      addListener() {}, removeListener() {},
      addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
    });
  }
  globalThis.matchMedia = window.matchMedia;
  globalThis.IntersectionObserver = window.IntersectionObserver
    || class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
  globalThis.ResizeObserver = window.ResizeObserver
    || class { observe() {} unobserve() {} disconnect() {} };

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
  ({ authApi, AuthApiError } = await vite.ssrLoadModule("/src/auth/authApi.ts"));
});

after(async () => {
  await act(async () => { root?.unmount(); });
  root = null;
  await vite?.close();
  console.error = originalConsoleError;
  delete globalThis.fetch;
});

function authUser() {
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
  };
}

/** Friends/presence calls are best-effort; 401 keeps them quiet in tests. */
function quietFetch() {
  return Promise.resolve(new Response(JSON.stringify({ error: "Not signed in" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  }));
}

beforeEach(async () => {
  await act(async () => { root?.unmount(); });
  root = null;
  document.body.innerHTML = "";
  logoutCalls = 0;
  logoutImpl = async () => ({ message: "Logged out successfully" });
  globalThis.fetch = quietFetch;

  authApi.refresh = async () => ({ token: "access-token", user: authUser() });
  authApi.logout = () => {
    logoutCalls += 1;
    return logoutImpl();
  };
});

async function flush() {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}

async function mountApp(path = "/games") {
  window.history.replaceState({}, "", path);
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(React.createElement(App)); });
  await flush();
}

function q(selector) { return document.querySelector(selector); }

function click(node) {
  return act(async () => {
    node.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

async function openProfileAndLogout() {
  const avatar = q(".avatar-button");
  assert.ok(avatar, "the signed-in avatar opens the account menu");
  await click(avatar);
  const logout = q(".profile-popup-item.logout");
  assert.ok(logout, "the profile popup offers Logout");
  await click(logout);
}

const wait = (ms) => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, ms));
});

test("logout shows the shared loading screen, clears the session and lands on the guest home page", async () => {
  let resolveLogout;
  logoutImpl = () => new Promise((resolve) => {
    resolveLogout = () => resolve({ message: "Logged out successfully" });
  });

  await mountApp("/games");
  assert.ok(q(".navbar-profile-identity"), "the account starts signed in on Games");

  await openProfileAndLogout();

  // The real full-screen restoration screen replaces every signed-in surface
  // while the request is still pending.
  assert.ok(q(".auth-loading-screen"), "the existing full-screen loading screen is shown");
  assert.match(q(".auth-loading-screen").textContent, /Restoring your Arcadia session/);
  assert.equal(q(".navbar"), null, "no signed-in navbar can flash behind it");
  assert.equal(logoutCalls, 1, "the real logout request is in flight");

  await act(async () => { resolveLogout(); });
  await wait(400);

  assert.equal(logoutCalls, 1, "logout is sent exactly once");
  assert.equal(q(".auth-loading-screen"), null, "the loading screen is released after navigation");
  assert.equal(window.location.pathname, "/", "the guest homepage is the active route");
  assert.ok(scrollCalls.some((args) => args[0] === 0 && args[1] === 0),
    "the homepage is scrolled to the very top");

  assert.ok(q(".navbar"), "the public navbar is rendered");
  assert.equal(q(".navbar-profile-identity"), null, "no username or XP block remains");
  assert.equal(q(".avatar-button"), null, "no avatar dropdown remains");
  assert.equal(q(".navbar-friends-nav"), null, "no Friends navigation remains");

  const text = document.body.textContent.replace(/\s+/g, " ");
  assert.match(text, /Sign up/, "the guest Sign up action is present");
  assert.match(text, /Log in/, "the guest Log in action is present");
});

test("a failed logout keeps the account signed in, reports the error and allows a retry", async () => {
  logoutImpl = async () => {
    throw new AuthApiError("Unable to reach the authentication service. Please try again.", 0);
  };

  await mountApp("/games");
  await openProfileAndLogout();
  await wait(50);

  assert.equal(logoutCalls, 1, "one attempt was made");
  assert.equal(q(".auth-loading-screen"), null, "the loading screen is released on failure");
  assert.equal(window.location.pathname, "/games", "a failed logout does not redirect");
  assert.ok(q(".navbar-profile-identity"), "the account is still signed in");

  const notice = q(".auth-global-notice");
  assert.ok(notice, "the existing global auth notice reports the failure");
  assert.match(notice.textContent, /Unable to reach the authentication service/);

  // The account menu is still available, so Logout is a safe retry.
  await click(q(".avatar-button"));
  assert.ok(q(".profile-popup-item.logout"), "Logout remains available after a failure");
});
