import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

/*
 * The footer legal navigation and the three legal pages.
 *
 * The real App is mounted here, so routing, the footer links and the page
 * components are all the ones a reader gets. Only the session bootstrap network
 * call is stubbed.
 */
const frontendRoot = fileURLToPath(new URL("../", import.meta.url));
const originalConsoleError = console.error;

const LEGAL_PAGES = [
  {
    link: "Terms of Service",
    path: "/terms-of-service",
    title: "Terms of Service",
  },
  {
    link: "Privacy Policy",
    path: "/privacy-policy",
    title: "Privacy Policy",
  },
  {
    link: "Cookie Policy",
    path: "/cookie-policy",
    title: "Cookie Policy",
  },
];

let dom;
let vite;
let React;
let act;
let createRoot;
let root;
let App;
let authApi;
let originalBack;

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
  globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
  globalThis.cancelAnimationFrame = (handle) => clearTimeout(handle);
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.scrollTo = () => {};
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
  ({ authApi } = await vite.ssrLoadModule("/src/auth/authApi.ts"));
  originalBack = window.history.back;
});

after(async () => {
  await act(async () => { root?.unmount(); });
  root = null;
  await vite?.close();
  console.error = originalConsoleError;
  delete globalThis.fetch;
});

beforeEach(async () => {
  await act(async () => { root?.unmount(); });
  root = null;
  document.body.innerHTML = "";
  window.history.back = originalBack;
  window.history.replaceState(null, "", "/");
  window.scrollTo = () => {};
  globalThis.fetch = () => Promise.resolve(new Response(
    JSON.stringify({ error: "Not signed in" }),
    { status: 401, headers: { "Content-Type": "application/json" } },
  ));

  // A guest session is enough: the footer and all three legal pages are public.
  authApi.refresh = async () => null;
  authApi.me = async () => {
    throw new Error("auth is stubbed in tests");
  };
});

async function flush() {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}

async function mountApp(path, state = {}) {
  await act(async () => { root?.unmount(); });
  root = null;
  document.body.innerHTML = "";
  window.history.replaceState(state, "", path);
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(React.createElement(App)); });
  await flush();
}

function q(selector) { return document.querySelector(selector); }
function qa(selector) { return [...document.querySelectorAll(selector)]; }

function click(node) {
  return act(async () => {
    node.dispatchEvent(new window.MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    }));
  });
}

function assertLegalPage(title) {
  if (title === "Terms of Service") {
    const termsTitle = q(".tos-hero h1");
    assert.ok(termsTitle, "the Terms page renders its hero");
    assert.match(termsTitle.textContent, /TERMS OF\s+SERVICE/);
    assert.ok(q(".tos-meta"), "the Terms page renders its date panel");
    assert.ok(q(".tos-toc"), "the Terms page renders its contents navigation");
    assert.ok(qa(".tos-section").length > 0, "the Terms page renders its sections");
    assert.equal(q(".mh-hero"), null, "the legal pages do not reuse the Match History hero");
    return;
  }

  assert.equal(q(".legal-title").textContent, title);
  assert.match(q(".legal-eyebrow").textContent, /ARCADIA\s*•\s*LEGAL/);
  assert.match(q(".legal-intro").textContent, /temporary introduction/i);
  assert.equal(qa(".legal-section").length, 3);
  assert.match(q(".legal-section p").textContent, /Temporary placeholder text/i);
  assert.match(q(".legal-updated").textContent, /Last updated/);
  assert.match(q(".legal-updated").textContent, /Placeholder/);
  assert.equal(q(".mh-hero"), null, "the legal pages do not reuse the Match History hero");
}

test("the footer keeps its existing content and adds three legal links", async () => {
  await mountApp("/");

  assert.match(q("footer .footer-brand").textContent, /ARCADIA/);
  assert.equal(q("footer p").textContent, "A small place for big fun.");
  assert.equal(q("footer .copyright").textContent, "© 2026 Arcadia");

  const links = qa(".footer-legal a");
  assert.deepEqual(
    links.map((link) => link.textContent.trim()),
    LEGAL_PAGES.map((page) => page.link),
  );
  assert.deepEqual(
    links.map((link) => link.getAttribute("href")),
    LEGAL_PAGES.map((page) => page.path),
  );
});

test("each footer link opens its matching page", async () => {
  await mountApp("/");

  for (const page of LEGAL_PAGES) {
    const link = qa(".footer-legal a").find((item) => item.textContent.trim() === page.link);
    assert.ok(link, `${page.link} link is present`);

    await click(link);
    await flush();

    assert.equal(window.location.pathname, page.path);
    assertLegalPage(page.title);
  }
});

test("each legal route works on direct access and after a remount", async () => {
  for (const page of LEGAL_PAGES) {
    await mountApp(page.path, null);
    assert.equal(window.location.pathname, page.path);
    assertLegalPage(page.title);

    // A remount is the React side of a browser refresh at the same URL.
    await mountApp(page.path, null);
    assertLegalPage(page.title);
  }
});

test("Terms of Service keeps the remaining sections and renumbers its contents", async () => {
  await mountApp("/terms-of-service", null);

  const expectedTitles = [
    "About Arcadia",
    "User Accounts",
    "User Profiles and Player IDs",
    "Friends and User Interactions",
    "Private Messaging",
    "Match History and Experience Points",
    "Acceptable Use",
    "Intellectual Property",
    "Platform Availability",
    "Account Suspension and Deletion",
    "Disclaimers",
    "Limitation of Liability",
    "Changes to These Terms",
    "Governing Law",
    "Contact Information",
  ];

  assert.deepEqual(
    qa(".tos-toc-title").map((node) => node.textContent.trim()),
    expectedTitles,
  );
  assert.equal(qa(".tos-section").length, expectedTitles.length);
  assert.equal(q("#third-party"), null);
  assert.equal(q("#privacy"), null);
  assert.equal(qa(".tos-section-num")[9].textContent, "10");
  assert.equal(qa(".tos-section-num")[14].textContent, "15");

  assert.match(q("#messaging").textContent, /Clear for Me/);
  assert.match(q("#messaging").textContent, /Clear for Both/);
  assert.match(q("#messaging").textContent, /other participant's approval/);
  assert.doesNotMatch(
    q("#messaging").textContent,
    /end-to-end|plaintext|Message Storage and Encryption|sensitive information/i,
  );

  assert.match(
    q("#suspension").textContent,
    /Account deletion removes your account and associated platform data, subject to applicable legal requirements\./,
  );
  assert.doesNotMatch(
    q("#suspension").textContent,
    /retained where required|dispute resolution/i,
  );

  const suspensionToc = qa(".tos-toc-link")
    .find((link) => link.textContent.includes("Account Suspension and Deletion"));
  await click(suspensionToc);
  assert.equal(suspensionToc.getAttribute("aria-current"), "true");
});

test("the back button uses history when the page was reached in-app", async () => {
  await mountApp("/");

  const privacy = qa(".footer-legal a")
    .find((item) => item.textContent.trim() === "Privacy Policy");
  await click(privacy);
  await flush();

  let backCalls = 0;
  window.history.back = () => { backCalls += 1; };

  await click(q(".legal-back"));

  assert.equal(backCalls, 1);
  assert.equal(window.location.pathname, "/privacy-policy");
});

test("the back button falls back to the homepage on a direct visit", async () => {
  await mountApp("/cookie-policy", null);

  let backCalls = 0;
  window.history.back = () => { backCalls += 1; };

  await click(q(".legal-back"));
  await flush();

  assert.equal(backCalls, 0);
  assert.equal(window.location.pathname, "/");
  assert.equal(q(".legal-page"), null);
});

test("Terms of Service back button returns to the previous in-app page", async () => {
  await mountApp("/");

  const terms = qa(".footer-legal a")
    .find((item) => item.textContent.trim() === "Terms of Service");
  await click(terms);
  await flush();

  let backCalls = 0;
  window.history.back = () => { backCalls += 1; };

  await click(q(".tos-return"));

  assert.equal(backCalls, 1);
  assert.equal(window.location.pathname, "/terms-of-service");
});

test("Terms of Service back button returns home on a direct visit", async () => {
  await mountApp("/terms-of-service", null);

  let backCalls = 0;
  window.history.back = () => { backCalls += 1; };

  await click(q(".tos-return"));
  await flush();

  assert.equal(backCalls, 0);
  assert.equal(window.location.pathname, "/");
});

test("the footer links wrap on small screens without becoming a column layout", async () => {
  const footerCss = await readFile(
    new URL("../src/components/Footer.css", import.meta.url),
    "utf8",
  );

  assert.match(footerCss, /\.footer-legal\s*\{[^}]*flex-wrap:\s*wrap/s);
  assert.doesNotMatch(footerCss, /\.footer-legal\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(footerCss, /@media \(max-width: 700px\)/);
});
