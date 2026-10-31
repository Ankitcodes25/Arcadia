// Admin Panel: routing helpers, the server-side login-account resolution
// hand-off (frontend side), the protected-route redirect for unauthenticated
// visitors, and the admin auth-context contract.
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
let adminRouting;
let AdminPanelApp;
let useAdminAuth;
let AdminAuthProvider;
let loginResolution;
let navigation;

// Simple fetch stub: routes are matched by URL substring; each test can set
// behaviour via the mutable `fetchPlan` array of { match, status, body }.
let fetchPlan = [];
let fetchCalls = [];

function stubFetch(url, options = {}) {
  fetchCalls.push({ url: String(url), options });
  const route = fetchPlan.find((entry) => String(url).includes(entry.match));
  if (!route) {
    return Promise.resolve(new Response(JSON.stringify({ error: "Not stubbed" }), { status: 404 }));
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
    url: "https://arcadia.test/admin",
  });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  for (const key of [
    "HTMLElement", "HTMLInputElement", "HTMLButtonElement", "HTMLTextAreaElement", "HTMLSelectElement",
    "Element", "Node", "Event", "MouseEvent", "KeyboardEvent", "CustomEvent",
    "FocusEvent", "MutationObserver",
    // NOTE: "Response" is deliberately NOT copied from jsdom (jsdom has no
    // fetch API, so window.Response is undefined and would clobber Node's
    // built-in Response that the fetch stub relies on).
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

  adminRouting = await vite.ssrLoadModule("/src/Admin_Panel/hooks/adminRouting.ts");
  AdminPanelApp = (await vite.ssrLoadModule("/src/Admin_Panel/AdminPanelApp.tsx")).default;
  ({ useAdminAuth, AdminAuthProvider } = await vite.ssrLoadModule("/src/Admin_Panel/hooks/useAdminAuth.tsx"));
  loginResolution = await vite.ssrLoadModule("/src/auth/loginResolution.ts");
  // Same module instance the admin tree imports (vite caches SSR modules), so
  // the login-open intent set by the gate can be observed here.
  navigation = await vite.ssrLoadModule("/src/lib/navigation.ts");
});

after(async () => {
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
  // Drain any intent parked by a previous test so it cannot leak forward.
  navigation.consumeLoginOnNextMount();
  window.history.pushState({}, "", "/admin");
});

async function render(element) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
}

/* ---- Routing helpers ------------------------------------------------------ */

test("isAdminPath recognises only /admin paths", () => {
  assert.equal(adminRouting.isAdminPath("/admin"), true);
  assert.equal(adminRouting.isAdminPath("/admin/login"), true);
  assert.equal(adminRouting.isAdminPath("/admin/players"), true);
  assert.equal(adminRouting.isAdminPath("/administrator"), false);
  assert.equal(adminRouting.isAdminPath("/"), false);
  assert.equal(adminRouting.isAdminPath("/match-history"), false);
});

test("resolveAdminPageKey maps known routes and falls back to dashboard", () => {
  assert.equal(adminRouting.resolveAdminPageKey("/admin/dashboard"), "dashboard");
  assert.equal(adminRouting.resolveAdminPageKey("/admin/players"), "players");
  assert.equal(adminRouting.resolveAdminPageKey("/admin/reports"), "reports");
  assert.equal(adminRouting.resolveAdminPageKey("/admin/support"), "support");
  assert.equal(adminRouting.resolveAdminPageKey("/admin/games"), "games");
  assert.equal(adminRouting.resolveAdminPageKey("/admin/moderation"), "moderation");
  assert.equal(adminRouting.resolveAdminPageKey("/admin/announcements"), "announcements");
  assert.equal(adminRouting.resolveAdminPageKey("/admin/settings"), "settings");
  // Unknown admin subpath (including the removed /admin/login) falls back to
  // the dashboard — there is no dedicated admin login page.
  assert.equal(adminRouting.resolveAdminPageKey("/admin/nope"), "dashboard");
  assert.equal(adminRouting.resolveAdminPageKey("/admin/login"), "dashboard");
});

test("sidebar order matches the product spec exactly", () => {
  const keys = adminRouting.ADMIN_PAGE_PATHS.map((entry) => entry.key);
  assert.deepEqual(keys, [
    "dashboard", "players", "reports", "support",
    "games", "moderation", "announcements", "settings",
  ]);
});

/* ---- Server-side login-account resolution (frontend hand-off) ------------- */

test("admin credentials resolve to the admin routing intent via the server", async () => {
  fetchPlan = [{
    match: "/api/admin/auth/login",
    status: 200,
    body: { accountType: "admin", admin: { username: "admin", displayName: "Super Admin", role: "SUPER_ADMIN" } },
  }];

  const resolution = await loginResolution.resolveLoginAccount("admin@arcadia.gg", "correct-password");

  assert.equal(resolution.kind, "admin");
  // The browser only relays the attempt — it never compares anything itself.
  const call = fetchCalls.find((entry) => entry.url.includes("/api/admin/auth/login"));
  assert.ok(call, "the resolver endpoint was called");
  const sent = JSON.parse(call.options.body);
  assert.equal(sent.email, "admin@arcadia.gg");
  assert.equal(sent.password, "correct-password");
  assert.equal(call.options.credentials, "include");
  assert.equal(call.options.headers["X-Admin-Request"], "1");
});

test("player credentials resolve to the player routing intent (continue player flow)", async () => {
  fetchPlan = [{ match: "/api/admin/auth/login", status: 200, body: { accountType: "player" } }];

  const resolution = await loginResolution.resolveLoginAccount("player@arcadia.gg", "some-password");

  assert.equal(resolution.kind, "player");
});

test("a wrong admin password (401) resolves to a definitive failure, never the player path", async () => {
  fetchPlan = [{ match: "/api/admin/auth/login", status: 401, body: { error: "Invalid email or password" } }];

  const resolution = await loginResolution.resolveLoginAccount("admin@arcadia.gg", "wrong-password");

  assert.equal(resolution.kind, "failed");
  assert.match(resolution.message, /invalid email or password/i);
  // Only the resolver was consulted — there is no fall-through to a player
  // login attempt from this path.
  const resolverCalls = fetchCalls.filter((entry) => entry.url.includes("/api/admin/auth/login"));
  assert.equal(resolverCalls.length, 1);
});

test("a rate-limited resolution (429) stops with the rate-limit message", async () => {
  fetchPlan = [{
    match: "/api/admin/auth/login",
    status: 429,
    body: { error: "Too many login attempts. Please try again later." },
  }];

  const resolution = await loginResolution.resolveLoginAccount("admin@arcadia.gg", "pw");

  assert.equal(resolution.kind, "failed");
  assert.match(resolution.message, /too many login attempts/i);
});

test("an unreachable admin backend fails closed instead of trying player authentication", async () => {
  globalThis.fetch = (url, options) => {
    fetchCalls.push({ url: String(url), options });
    if (String(url).includes("/api/admin/auth/login")) {
      return Promise.reject(new TypeError("fetch failed"));
    }
    return stubFetch(url, options);
  };

  const resolution = await loginResolution.resolveLoginAccount("player@arcadia.gg", "pw");

  assert.equal(resolution.kind, "failed");
  assert.match(resolution.message, /unable to verify your account/i);
  assert.equal(
    fetchCalls.some((entry) => entry.url.includes("/api/v1/auth/login")),
    false,
    "a resolver outage must not reach player authentication",
  );
});

test("an unknown resolver response type does not continue as a player", async () => {
  fetchPlan = [{
    match: "/api/admin/auth/login",
    status: 200,
    body: { accountType: "unknown" },
  }];

  const resolution = await loginResolution.resolveLoginAccount("player@arcadia.gg", "pw");

  assert.equal(resolution.kind, "failed");
  assert.match(resolution.message, /unable to verify your account/i);
});

/* ---- Protected route gate -------------------------------------------------- */

test("an unauthenticated visitor on a protected page is redirected to the landing page", async () => {
  fetchPlan = [
    { match: "/api/admin/auth/me", status: 401, body: { error: "Invalid or expired session" } },
  ];
  window.history.pushState({}, "", "/admin/players");

  await render(React.createElement(AdminPanelApp));
  // Let the /me bootstrap settle and the redirect effect fire.
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });

  // Leaves the admin tree entirely — there is no /admin/login page.
  assert.equal(window.location.pathname, "/");
  // And the shared login modal is requested exactly once for the Navbar mount.
  assert.equal(navigation.consumeLoginOnNextMount(), true);
  assert.equal(navigation.consumeLoginOnNextMount(), false, "the intent is consumed once");
});

test("an authenticated session on /admin/login is sent to the dashboard", async () => {
  fetchPlan = [
    {
      match: "/api/admin/auth/me",
      status: 200,
      body: { admin: { username: "admin", displayName: "Super Admin", role: "SUPER_ADMIN" } },
    },
  ];
  window.history.pushState({}, "", "/admin/login");

  await render(React.createElement(AdminPanelApp));
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });

  assert.equal(window.location.pathname, "/admin/dashboard");
});

/* ---- useAdminAuth contract -------------------------------------------------- */

test("useAdminAuth throws when used outside its provider", async () => {
  function Bare() {
    useAdminAuth();
    return null;
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const localRoot = createRoot(container);

  // React rethrows the invariant from act() when a render throws.
  await assert.rejects(async () => {
    await act(async () => {
      localRoot.render(React.createElement(Bare));
    });
  }, /must be used within an AdminAuthProvider/);

  await act(async () => { localRoot.unmount(); });
});

/* ---- AdminAuthProvider export sanity ---------------------------------------- */

test("AdminAuthProvider + useAdminAuth are exported together for the admin tree", () => {
  assert.equal(typeof AdminAuthProvider, "function");
  assert.equal(typeof useAdminAuth, "function");
});
