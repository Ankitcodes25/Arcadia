/*
 * The shared background scroll lock.
 *
 * These tests cover the lock itself and real modal components: the page must
 * stay at its exact scroll offset while a layer is open, nested layers must
 * count independently, and the last close must restore the original body styles
 * and position whether it happened through Escape, a backdrop, a close button or
 * an unmount.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
let LoginSignupModal;
let ConfirmDialog;
let scrollLock;
let scrollX = 0;
let scrollY = 0;
const scrollCalls = [];

function installDom() {
  dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://arcadia.test/",
  });
  const { window } = dom;

  // JSDOM always reports 0 here; the tests need a real offset to preserve.
  Object.defineProperty(window, "scrollX", {
    configurable: true,
    get: () => scrollX,
  });
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    get: () => scrollY,
  });
  window.scrollTo = (x, y) => {
    if (typeof x === "object" && x !== null) {
      scrollCalls.push([x.left ?? 0, x.top ?? 0]);
      scrollX = x.left ?? 0;
      scrollY = x.top ?? 0;
      return;
    }
    scrollCalls.push([x, y]);
    scrollX = x;
    scrollY = y;
  };

  globalThis.window = window;
  globalThis.document = window.document;
  for (const key of [
    "HTMLElement",
    "HTMLInputElement",
    "HTMLButtonElement",
    "HTMLAnchorElement",
    "Element",
    "Node",
    "Event",
    "MouseEvent",
    "KeyboardEvent",
    "CustomEvent",
    "FocusEvent",
    "MutationObserver",
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

  LoginSignupModal = (await vite.ssrLoadModule("/src/components/LoginSignupModal.tsx")).default;
  ConfirmDialog = (await vite.ssrLoadModule("/src/components/ConfirmDialog.tsx")).default;
  scrollLock = await vite.ssrLoadModule("/src/auth/modalScrollLock.ts");
});

after(async () => {
  await act(async () => { root?.unmount(); });
  await vite?.close();
  console.error = originalConsoleError;
});

beforeEach(async () => {
  await act(async () => { root?.unmount(); });
  root = null;
  scrollCalls.length = 0;
  scrollX = 0;
  scrollY = 0;
  document.body.innerHTML = "";
  document.body.removeAttribute("style");
  document.documentElement.removeAttribute("style");
  document.documentElement.classList.remove(scrollLock.MODAL_LOCK_CLASS);
  window.history.replaceState({}, "", "/");
});

function presetPage() {
  document.body.style.overflow = "clip";
  document.body.style.position = "relative";
  document.body.style.top = "5px";
  document.body.style.left = "3px";
  document.body.style.width = "90%";
  document.body.style.paddingRight = "13px";
  document.body.style.color = "red";
  document.documentElement.style.scrollBehavior = "smooth";
  scrollX = 27;
  scrollY = 640;
}

function loginProps(onClose = () => {}) {
  return {
    authMode: "login",
    onClose,
    onSubmit: () => {},
    onGoogleLogin: () => {},
    onSwitchMode: () => {},
    onClearError: () => {},
    onForgotPassword: async () => "",
    isSubmitting: false,
    error: null,
  };
}

function confirmProps(onCancel = () => {}) {
  return {
    title: "Clear chat?",
    message: "This clears the conversation for both players.",
    confirmLabel: "Clear chat",
    busyLabel: "Clearing…",
    onConfirm: () => {},
    onCancel,
  };
}

async function render(element) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const localRoot = createRoot(container);
  await act(async () => {
    localRoot.render(element);
  });
  return {
    container,
    unmount: () => act(async () => { localRoot.unmount(); }),
  };
}

function assertLocked() {
  assert.equal(
    document.documentElement.classList.contains(scrollLock.MODAL_LOCK_CLASS),
    true,
    "the document carries the shared lock class",
  );
  assert.equal(document.body.style.position, "fixed", "the body is fixed");
  assert.equal(document.body.style.top, "-640px", "at the page's existing scroll offset");
  assert.equal(document.body.style.overflow, "hidden", "document scrolling is disabled");
}

function assertReleased() {
  assert.equal(scrollLock.activeModalScrollLocks(), 0, "no layer still holds the lock");
  assert.equal(
    document.documentElement.classList.contains(scrollLock.MODAL_LOCK_CLASS),
    false,
    "the shared lock class is removed",
  );
  assert.equal(document.body.style.position, "relative", "the original body position is restored");
  assert.equal(document.body.style.top, "5px", "the original body top is restored");
  assert.equal(document.body.style.left, "3px", "the original body left is restored");
  assert.equal(document.body.style.width, "90%", "the original body width is restored");
  assert.equal(document.body.style.overflow, "clip", "the original body overflow is restored");
  assert.equal(document.body.style.paddingRight, "13px", "unrelated body styles are untouched");
  assert.equal(document.body.style.color, "red", "the body is not rewritten");
  assert.equal(document.documentElement.style.scrollBehavior, "smooth", "scroll-behavior is restored");
}

test("the lock fixes the body at the current offset and restores every inline style", () => {
  presetPage();
  const release = scrollLock.acquireModalScrollLock();

  try {
    assert.equal(scrollLock.activeModalScrollLocks(), 1);
    assertLocked();
    assert.equal(document.body.style.left, "-27px", "horizontal scroll is preserved too");
    assert.equal(document.body.style.width, "100%", "the fixed body keeps the viewport width");
    assert.equal(document.body.style.paddingRight, "13px", "unrelated padding is preserved");
    assert.equal(document.body.style.color, "red", "the rest of the body is untouched");
  } finally {
    release();
  }

  assertReleased();
  assert.deepEqual(scrollCalls, [[27, 640]], "the exact scroll position is restored once");
  assert.equal(scrollX, 27);
  assert.equal(scrollY, 640);
});

test("nested layers count independently, including double release", () => {
  presetPage();
  const parentRelease = scrollLock.acquireModalScrollLock();
  const childRelease = scrollLock.acquireModalScrollLock();

  try {
    assert.equal(scrollLock.activeModalScrollLocks(), 2, "both layers hold a reference");
    assertLocked();

    parentRelease();
    assert.equal(scrollLock.activeModalScrollLocks(), 1, "one layer still needs the lock");
    assertLocked();

    // A cleanup running twice must not steal the remaining layer's lock.
    parentRelease();
    assert.equal(scrollLock.activeModalScrollLocks(), 1, "a double release is ignored");
    assertLocked();

    childRelease();
  } finally {
    // These are idempotent, so they are safe even if an assertion above failed.
    parentRelease();
    childRelease();
  }

  assertReleased();
  assert.equal(scrollCalls.length, 1, "the page is restored exactly once");
  assert.deepEqual(scrollCalls[0], [27, 640]);
});

test("independent modal components share the lock and release it in any order", async () => {
  presetPage();

  const login = await render(React.createElement(LoginSignupModal, loginProps()));
  const confirm = await render(React.createElement(ConfirmDialog, confirmProps()));

  assert.equal(scrollLock.activeModalScrollLocks(), 2, "both modal components hold the lock");
  assertLocked();

  await confirm.unmount();
  assert.equal(scrollLock.activeModalScrollLocks(), 1, "the login dialog still holds the lock");
  assertLocked();
  assert.equal(scrollCalls.length, 0, "the background is not restored while one modal remains");

  await login.unmount();
  assertReleased();
  assert.deepEqual(scrollCalls, [[27, 640]], "the previous page position is restored");
});

test("a route change while the lock is held leaves the new page's scroll alone", () => {
  presetPage();
  const release = scrollLock.acquireModalScrollLock();

  try {
    assertLocked();

    /*
     * A fixed body removes the old document height, so the browser clamps the
     * window's offset to zero. The new route's own top-scroll then takes over.
     * If the lock restores its saved offset afterwards, the reader lands in the
     * middle of the new page.
     */
    scrollX = 0;
    scrollY = 0;
    window.history.pushState({}, "", "/privacy-policy");
  } finally {
    release();
  }

  assertReleased();
  assert.equal(scrollCalls.length, 0, "the previous route's offset is not replayed");
  assert.equal(scrollX, 0);
  assert.equal(scrollY, 0);
});

test("Escape and the backdrop release nested layers only when the last one closes", async () => {
  presetPage();

  function Harness() {
    const [loginOpen, setLoginOpen] = React.useState(true);
    const [confirmOpen, setConfirmOpen] = React.useState(true);

    return React.createElement(
      React.Fragment,
      null,
      loginOpen
        ? React.createElement(LoginSignupModal, loginProps(() => setLoginOpen(false)))
        : null,
      confirmOpen
        ? React.createElement(ConfirmDialog, confirmProps(() => setConfirmOpen(false)))
        : null,
    );
  }

  const harness = await render(React.createElement(Harness));
  assert.equal(scrollLock.activeModalScrollLocks(), 2);
  assertLocked();

  // ConfirmDialog owns Escape while it is the topmost layer.
  await act(async () => {
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  assert.equal(scrollLock.activeModalScrollLocks(), 1, "Escape closed only the confirmation");
  assertLocked();
  assert.equal(scrollCalls.length, 0, "the login dialog still keeps the page fixed");

  // The login dialog closes through its backdrop press.
  const backdrop = document.querySelector(".auth-modal-backdrop");
  assert.ok(backdrop, "the login dialog is still open underneath");
  await act(async () => {
    backdrop.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  });

  assertReleased();
  assert.deepEqual(scrollCalls, [[27, 640]], "closing the final modal restores the exact position");
  await harness.unmount();
});

function stylesheet(path) {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

function ruleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `${selector} has a rule`);
  return match[1];
}

test("the shared stylesheet reserves the gutter and disables overscroll chaining", () => {
  const globalCss = stylesheet("../src/index.css");
  const locked = ruleBody(globalCss, "html.has-modal-scroll-lock");

  assert.match(locked, /overflow:\s*hidden/, "the document overflow is locked");
  assert.match(locked, /overscroll-behavior:\s*none/, "overscroll chaining is disabled");
  assert.match(locked, /scrollbar-gutter:\s*stable/, "the scrollbar gutter is reserved");
});

test("every blocking modal keeps its own content scrollable inside the viewport", () => {
  const auth = stylesheet("../src/components/LoginSignupModal.css");
  const confirm = stylesheet("../src/components/ConfirmDialog.css");
  const profilePopup = stylesheet("../src/components/ProfilePopupmodal.css");

  assert.match(ruleBody(auth, ".auth-modal"), /overflow-y:\s*auto/, "long auth forms scroll internally");
  assert.match(ruleBody(auth, ".auth-modal"), /max-height:\s*96dvh/, "and stay within the viewport");

  const confirmBody = ruleBody(confirm, ".confirm-dialog");
  assert.match(confirmBody, /max-height:\s*calc\(100dvh - 32px\)/, "the confirmation fits the viewport");
  assert.match(confirmBody, /overflow-y:\s*auto/, "long confirmation content scrolls internally");

  const popup = ruleBody(profilePopup, ".profile-popup");
  assert.match(popup, /max-height:\s*calc\(100dvh - 84px\)/, "the menu fits short viewports");
  assert.match(popup, /overflow-y:\s*auto/, "and scrolls internally when it cannot fit");
});
