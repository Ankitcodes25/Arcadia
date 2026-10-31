/*
 * Strict UI separation between the Admin Portal and the player-facing Arcadia.
 *
 * This renders the REAL App component (the exact tree the browser mounts, with
 * the player AuthProvider and the admin tree together) in jsdom and asserts the
 * two surfaces never bleed into each other:
 *
 *   - On an AUTHENTICATED /admin/* path the player Navbar, profile popup,
 *     avatar/XP header and page-transition wrapper are NOT in the DOM at all
 *     (the App short-circuits to <AdminPanelApp/> before any player component
 *     is referenced).
 *   - On an UNAUTHENTICATED /admin/* path (including the removed /admin/login)
 *     the visitor is sent to the landing page and the ONE shared Arcadia
 *     login/signup modal opens — there is no separate admin login page, and the
 *     admin shell is never reached.
 *   - On a player path the admin sidebar/shell is NOT in the DOM, and the player
 *     Navbar renders as before.
 *
 * This is a structural assertion about what React actually mounts — not a CSS
 * visibility check — so it fails if anyone ever wraps /admin in the player layout.
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
let navigation;

// Routes matched by URL substring; each test fills the mutable fetchPlan.
let fetchPlan = [];
let fetchCalls = [];

function stubFetch(url, options = {}) {
  fetchCalls.push({ url: String(url), options });
  const route = fetchPlan.find((entry) => String(url).includes(entry.match));
  if (!route) {
    // Player endpoints fall through here; a non-OK status keeps the player
    // bootstrap resolving to "signed out" without a real backend.
    return Promise.resolve(
      new Response(JSON.stringify({ error: "Not stubbed" }), { status: route?.status ?? 401 }),
    );
  }
  return Promise.resolve(
    new Response(JSON.stringify(route.body ?? {}), {
      status: route.status ?? 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function installDom() {
  dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://arcadia.test/",
  });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  for (const key of [
    "HTMLElement", "HTMLInputElement", "HTMLButtonElement", "HTMLTextAreaElement",
    "HTMLSelectElement", "Element", "Node", "Event", "MouseEvent", "KeyboardEvent",
    "CustomEvent", "FocusEvent", "MutationObserver",
    // NOTE: "Response" is deliberately NOT copied — jsdom has no fetch API, and
    // copying an undefined Response would clobber Node's built-in that the stub
    // relies on.
  ]) {
    globalThis[key] = window[key];
  }
  Object.defineProperty(globalThis, "navigator", {
    value: window.navigator,
    configurable: true,
  });
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  globalThis.cancelAnimationFrame = (handle) => clearTimeout(handle);
  window.HTMLElement.prototype.scrollIntoView = function () {};

  // Browser APIs the player Landing Page / Navbar may touch but jsdom lacks.
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
  window.scrollTo = () => {};
  globalThis.scrollTo = () => {};
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

  // The real application root — player AuthProvider + AppContent + admin tree.
  App = (await vite.ssrLoadModule("/src/App.tsx")).default;
  // Shared module instance (vite caches SSR modules) so a login-open intent set
  // by the admin gate can be observed / drained here.
  navigation = await vite.ssrLoadModule("/src/lib/navigation.ts");
});

after(async () => {
  // Unmount the last root so the player AuthProvider's cleanup runs (it closes
  // its BroadcastChannel); otherwise the event loop stays alive and `node --test`
  // never exits.
  await act(async () => { root?.unmount(); });
  await vite?.close();
  console.error = originalConsoleError;
  delete globalThis.fetch;
});

beforeEach(async () => {
  await act(async () => { root?.unmount(); });
  root = null;
  document.body.innerHTML = "";
  fetchPlan = [];
  fetchCalls = [];
  globalThis.fetch = stubFetch;
  // Drain any login-open intent parked by a previous test so it cannot leak.
  navigation.consumeLoginOnNextMount();
});

async function renderApp(path) {
  window.history.pushState({}, "", path);
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(React.createElement(App)); });
  // Flush the admin /me bootstrap and the player auth bootstrap.
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
}

function q(selector) { return document.querySelector(selector); }

/** Extra rounds so multi-step effects (admin /me → redirect → Navbar mount →
 * shared modal) fully settle before asserting. */
async function flush() {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}

const ADMIN_SESSION = {
  match: "/api/admin/auth/me",
  status: 200,
  body: { admin: { username: "admin", displayName: "Super Admin", role: "SUPER_ADMIN" } },
};

// Selectors that must NEVER appear on an admin route.
const PLAYER_CHROME = [
  ".navbar",
  ".navbar-inner",
  ".navbar-profile-identity",
  ".navbar-level",
  ".navbar-xp",
  ".profile-menu-wrapper",
  ".avatar-button",
  ".page-transition",
];

// Admin selectors that must never appear on a player route.
const ADMIN_CHROME = [".adm-root", ".adm-shell", ".adm-sidebar", ".adm-topbar", ".adm-content"];

/* ==================================================================
   Admin routes render ONLY the admin portal
   ================================================================== */

test("an authenticated /admin/dashboard renders the admin shell with zero player UI", async () => {
  fetchPlan = [ADMIN_SESSION];
  await renderApp("/admin/dashboard");

  // The dedicated admin layout is present.
  assert.ok(q(".adm-shell"), "AdminLayout (.adm-shell) is mounted");
  assert.ok(q(".adm-sidebar"), "the admin sidebar is mounted");
  assert.ok(q(".adm-topbar"), "the admin topbar is mounted");
  assert.ok(q(".adm-content"), "the admin content area is mounted");

  // There is no admin login page at all — the shared modal is the only login.
  assert.equal(q(".adm-login"), null, "no dedicated admin login page exists");

  // No player-facing surface exists anywhere in the DOM.
  for (const selector of PLAYER_CHROME) {
    assert.equal(q(selector), null, `player element ${selector} must not render on /admin/*`);
  }
  // The admin identity label is present; the player XP/level header is not.
  assert.doesNotMatch(document.body.textContent, /Lv\.\s*\d/, "no player level header");
});

test("an unauthenticated admin route leaves for the landing page and opens the shared login modal", async () => {
  fetchPlan = [{ match: "/api/admin/auth/me", status: 401, body: { error: "Invalid or expired session" } }];
  // /admin/login is only a legacy URL now — no dedicated admin login page exists.
  await renderApp("/admin/login");
  await flush();

  assert.equal(window.location.pathname, "/", "the visitor is sent out of the admin tree");
  // The admin shell / login page are never reached.
  assert.equal(q(".adm-shell"), null, "the admin shell is not reached");
  assert.equal(q(".adm-login"), null, "there is no dedicated admin login page");
  // The ONE existing Arcadia login/signup modal is what gates re-entry.
  assert.ok(q(".auth-modal"), "the shared login/signup modal opens on the landing page");
});

test("every admin section renders without player chrome", async () => {
  const sections = [
    "/admin/dashboard", "/admin/players", "/admin/reports", "/admin/support",
    "/admin/games", "/admin/moderation", "/admin/announcements", "/admin/settings",
  ];

  fetchPlan = [ADMIN_SESSION];
  for (const path of sections) {
    document.body.innerHTML = "";
    await renderApp(path);

    assert.ok(q(".adm-shell"), `${path}: the admin shell is mounted`);
    for (const selector of PLAYER_CHROME) {
      assert.equal(q(selector), null, `${path}: player element ${selector} must not render`);
    }
    await act(async () => { root?.unmount(); });
  }
});

/* ==================================================================
   Player route renders ONLY the player interface
   ================================================================== */

test("the player home route renders the player Navbar and no admin chrome", async () => {
  await renderApp("/");

  // The player interface is intact.
  assert.ok(q(".navbar"), "the player Navbar renders on the player route");
  assert.equal(q(".adm-shell"), null, "the admin shell must not render on a player route");
  for (const selector of ADMIN_CHROME) {
    assert.equal(q(selector), null, `admin element ${selector} must not render on /`);
  }
});

/* ==================================================================
   A player session grants no admin access (and vice versa)
   ================================================================== */

test("a valid PLAYER session does not unlock /admin — gated to the shared login", async () => {
  // Player session is fully signed in; the admin session check says 401.
  fetchPlan = [
    { match: "/api/v1/auth/refresh", status: 200, body: {} },
    { match: "/api/v1/auth/me", status: 200, body: { user: { username: "player1" } } },
    { match: "/api/admin/auth/me", status: 401, body: { error: "Invalid or expired session" } },
  ];

  await renderApp("/admin/dashboard");
  await flush();

  // The player session grants nothing on the admin tree: we leave /admin and
  // never reach the protected shell.
  assert.ok(!window.location.pathname.startsWith("/admin"),
    `never stays on /admin (got ${window.location.pathname})`);
  assert.equal(q(".adm-shell"), null, "the protected admin shell is NOT reached");
  // Re-entry is gated by the shared login modal, not a separate admin page.
  assert.ok(q(".auth-modal"), "the shared login modal opens");
});

test("direct URL navigation to a deep admin path is gated to the shared login", async () => {
  fetchPlan = [{ match: "/api/admin/auth/me", status: 401, body: { error: "Invalid or expired session" } }];

  await renderApp("/admin/settings");
  await flush();

  assert.equal(window.location.pathname, "/", "deep link is redirected off the admin tree");
  assert.ok(q(".auth-modal"), "the shared login modal opens for the gated path");
  assert.equal(q(".adm-shell"), null, "the admin shell is never reached");
  assert.equal(q(".adm-login"), null, "no dedicated admin login page exists");
});

/* ==================================================================
   Admin logout lands on the shared modal, never a player dashboard
   ================================================================== */

test("admin logout leaves the portal, opens the shared login modal, and never signs into a player dashboard", async () => {
  fetchPlan = [
    ADMIN_SESSION,
    { match: "/api/admin/auth/logout", status: 200, body: { ok: true } },
    // The player bootstrap runs on the landing page and stays signed out.
    { match: "/api/v1/auth/refresh", status: 401, body: { error: "Not signed in" } },
    { match: "/api/v1/auth/me", status: 401, body: { error: "Not signed in" } },
  ];

  await renderApp("/admin/dashboard");
  await flush();
  assert.ok(q(".adm-shell"), "the admin portal is mounted before logout");

  const logoutButton = q(".adm-topbar__logout");
  assert.ok(logoutButton, "the admin topbar exposes the logout control");
  await act(async () => {
    logoutButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  await flush();

  // Out of the portal, on the landing page, with the ONE shared modal open.
  assert.equal(window.location.pathname, "/", "logout returns to the landing page");
  assert.equal(q(".adm-shell"), null, "the admin shell is gone after logout");
  assert.ok(q(".auth-modal"), "the shared Arcadia login/signup modal opens");

  // No player dashboard: the admin logout never authenticates a player.
  assert.equal(q(".navbar-profile-identity"), null, "no signed-in player identity");
  assert.equal(q(".navbar-level"), null, "no player level header");
  assert.equal(q(".navbar-xp"), null, "no player XP header");
});
