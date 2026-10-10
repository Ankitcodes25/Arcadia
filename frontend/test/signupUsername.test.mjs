import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

const frontendRoot = fileURLToPath(new URL("../", import.meta.url));

const ACCOUNT_EXISTS_MESSAGE =
  "Account already exists. Please use your existing email and password to log in.";
const USERNAME_TOO_SMALL = "Username too small";
const USERNAME_MAX_REACHED = "Username max size reached";

let dom;
let vite;
let React;
let act;
let createRoot;
let LoginSignupModal;
let root;
const originalConsoleError = console.error;

let submitted;
let googleClicks;
let oauthClears;

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
  LoginSignupModal = (await vite.ssrLoadModule("/src/components/LoginSignupModal.tsx")).default;
});

after(async () => {
  await vite?.close();
  console.error = originalConsoleError;
});

function modalProps(overrides = {}) {
  return {
    authMode: "signup",
    onClose: () => {},
    onSubmit: (values) => {
      submitted.push(values);
    },
    onGoogleLogin: () => googleClicks.push(true),
    onSwitchMode: () => {},
    onClearError: () => oauthClears.push(true),
    onForgotPassword: async () => "sent",
    isSubmitting: false,
    error: null,
    ...overrides,
  };
}

async function renderRoot(element) {
  // Each test starts from an empty document and empty call records, so a
  // previous modal can never be queried by mistake.
  await act(async () => {
    root?.unmount();
  });
  document.body.innerHTML = "";
  submitted = [];
  googleClicks = [];
  oauthClears = [];

  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root.render(element);
  });

  return () => act(async () => root.unmount());
}

async function renderModal(props = {}) {
  return renderRoot(React.createElement(LoginSignupModal, modalProps(props)));
}

/**
 * Mirrors AuthContext: the OAuth warning is owned by state and only disappears
 * once the error is really cleared, exactly like a production clearError().
 */
async function renderOauthHost(props = {}) {
  function OauthHost() {
    const [oauthError, setOauthError] = React.useState(ACCOUNT_EXISTS_MESSAGE);
    return React.createElement(
      LoginSignupModal,
      modalProps({
        ...props,
        oauthError,
        onClearError: () => {
          setOauthError(null);
          oauthClears.push(true);
        },
      }),
    );
  }

  return renderRoot(React.createElement(OauthHost));
}

function q(selector) {
  return document.querySelector(selector);
}

function usernameInput() {
  return q('input[name="username"]');
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
    q(".auth-modal form").dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}

function warningText() {
  return q(".auth-username-warning")?.textContent ?? null;
}

function counterText() {
  return q(".auth-username-counter")?.textContent ?? null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Real time passes outside act(); act afterwards flushes the state updates that
// the timers produced. DOM nodes are never compared directly in assertions,
// because the test reporter cannot serialize them cheaply on failure.
async function wait(ms) {
  await sleep(ms);
  await act(async () => {});
}

/* ------------------------------------------------------------------
   Signup form shape
   ------------------------------------------------------------------ */

test("signup form has username, email and password but no display name field", async () => {
  const unmount = await renderModal();

  assert.ok(usernameInput(), "username input is rendered");
  assert.ok(q('input[name="email"]'), "email input is rendered");
  assert.ok(q('input[name="password"]'), "password input is rendered");
  assert.equal(q('input[name="name"]') === null, true, "display name input is gone");

  const labels = [...document.querySelectorAll(".auth-modal label")].map((node) =>
    node.textContent.replace(/\d+\s*\/\s*20/, "").trim(),
  );
  assert.ok(labels.some((label) => label.startsWith("Username")));
  assert.ok(!labels.some((label) => /display name/i.test(label)));

  await unmount();
});

test("submitting the signup form never sends a display name", async () => {
  const unmount = await renderModal();

  typeInto(usernameInput(), "Ankit Das");
  typeInto(q('input[name="email"]'), "ankit@example.com");
  typeInto(q('input[name="password"]'), "password-123456");
  submitForm();

  assert.equal(submitted.length, 1);
  assert.deepEqual(Object.keys(submitted[0]).sort(), ["email", "password", "username"]);
  assert.equal(submitted[0].username, "Ankit Das");
  await unmount();
});

/* ------------------------------------------------------------------
   Counter and 20 character cap
   ------------------------------------------------------------------ */

test("username counter renders and updates while typing", async () => {
  const unmount = await renderModal();

  assert.equal(counterText(), "0 / 20");
  typeInto(usernameInput(), "A");
  assert.equal(counterText(), "1 / 20");
  typeInto(usernameInput(), "Ankit");
  assert.equal(counterText(), "5 / 20");
  typeInto(usernameInput(), "Ankit Das");
  assert.equal(counterText(), "9 / 20");
  await unmount();
});

test("emoji count as single characters and the 20th character is the limit", async () => {
  const unmount = await renderModal();
  const emoji = "\u{1F600}";

  typeInto(usernameInput(), emoji.repeat(20));
  assert.equal(counterText(), "20 / 20");
  assert.equal([...usernameInput().value].length, 20);
  assert.equal(usernameInput().value, emoji.repeat(20));
  assert.equal(warningText(), null);

  // A 21st character is rejected and never reaches the input value.
  typeInto(usernameInput(), emoji.repeat(21));
  assert.equal(usernameInput().value, emoji.repeat(20));
  assert.equal(counterText(), "20 / 20");
  assert.equal(warningText(), USERNAME_MAX_REACHED);

  // Continuing to type at the limit keeps the warning alive.
  typeInto(usernameInput(), `${emoji.repeat(20)}x`);
  assert.equal(usernameInput().value, emoji.repeat(20));
  assert.equal(counterText(), "20 / 20");
  assert.equal(warningText(), USERNAME_MAX_REACHED);
  await unmount();
});

test("visible unicode, punctuation and symbols are accepted by the input", async () => {
  const unmount = await renderModal();

  for (const value of ["Ankit Das", "Ankit@Arcadia", "ARCADIA 25", "Ａｎｋｉｔ", "Ankit ⚡"]) {
    typeInto(usernameInput(), value);
    assert.equal(usernameInput().value, value, value);
    assert.equal(warningText(), null, value);
  }
  await unmount();
});

/* ------------------------------------------------------------------
   Minimum length
   ------------------------------------------------------------------ */

test("signup is blocked below three characters and the modal stays open", async () => {
  const unmount = await renderModal();

  typeInto(usernameInput(), "ab");
  typeInto(q('input[name="email"]'), "ankit@example.com");
  typeInto(q('input[name="password"]'), "password-123456");
  submitForm();

  assert.equal(submitted.length, 0, "no signup request was sent");
  assert.ok(q(".auth-modal"), "the signup modal is still open");
  assert.equal(warningText(), USERNAME_TOO_SMALL);
  assert.equal(usernameInput().value, "ab", "entered values are kept");
  assert.equal(q('input[name="email"]').value, "ankit@example.com");

  // One more valid character clears the warning and allows signup again.
  typeInto(usernameInput(), "Ank");
  submitForm();
  assert.equal(warningText(), null);
  assert.equal(submitted.length, 1);
  await unmount();
});

/* ------------------------------------------------------------------
   5 second warning lifecycle
   ------------------------------------------------------------------ */

test("username warning stays visible, fades and is then removed", async () => {
  const unmount = await renderModal({ noticeDurationMs: 120 });

  typeInto(usernameInput(), "ab");
  submitForm();
  assert.equal(warningText(), USERNAME_TOO_SMALL);
  assert.equal(q(".auth-username-warning").classList.contains("is-leaving"), false);

  // Fade starts at the injected 120ms and the notice is removed at
  // 120ms + NOTICE_FADE_MS (320ms).
  await wait(150);
  assert.equal(q(".auth-username-warning")?.classList.contains("is-leaving"), true);

  await wait(320);
  assert.equal(warningText(), null, "warning is removed after the fade");
  assert.ok(q(".auth-modal"), "the modal is still open");
  await unmount();
});

test("a new username warning restarts the lifecycle", async () => {
  const unmount = await renderModal({ noticeDurationMs: 100 });

  typeInto(usernameInput(), "A".repeat(21));
  assert.equal(warningText(), USERNAME_MAX_REACHED);

  // A different warning starts 200ms later. Without a timer reset the first
  // warning would already be gone by then (100ms + 320ms = 420ms).
  await wait(200);
  typeInto(usernameInput(), "a");
  submitForm();
  assert.equal(warningText(), USERNAME_TOO_SMALL);

  await wait(280);
  assert.equal(
    warningText(),
    USERNAME_TOO_SMALL,
    "the new warning is still visible after the first one would have been removed",
  );

  await wait(320);
  assert.equal(warningText(), null, "removed 420ms after the new warning started");
  await unmount();
});

test("the shared notice lifecycle is five seconds with a short fade", async () => {
  const { createAutoDismissNotice, NOTICE_AUTO_DISMISS_MS, NOTICE_FADE_MS } =
    await vite.ssrLoadModule("/src/auth/authNotice.ts");

  assert.equal(NOTICE_AUTO_DISMISS_MS, 5_000);
  assert.ok(NOTICE_FADE_MS >= 250 && NOTICE_FADE_MS <= 400);

  // Deterministic clock: nothing here depends on wall clock timing.
  let now = 0;
  let nextId = 0;
  const pending = new Map();
  const setTimer = (callback, delayMs) => {
    const id = ++nextId;
    pending.set(id, { callback, at: now + delayMs });
    return id;
  };
  const clearTimer = (id) => pending.delete(id);
  const advance = (ms) => {
    now += ms;
    for (const [id, entry] of [...pending.entries()]) {
      if (entry.at <= now) {
        pending.delete(id);
        entry.callback();
      }
    }
  };

  const events = [];
  const notice = createAutoDismissNotice({
    onFadeStart: () => events.push("fade"),
    onDismiss: () => events.push("dismiss"),
    setTimer,
    clearTimer,
  });

  notice.start();
  advance(4_600);
  assert.deepEqual(events, [], "fully visible for the first 4.6 seconds");

  advance(400);
  assert.deepEqual(events, ["fade"], "the fade starts at five seconds");

  advance(NOTICE_FADE_MS);
  assert.deepEqual(events, ["fade", "dismiss"], "removed only after the fade");

  // A new warning clears the previous timers and restarts the lifecycle.
  events.length = 0;
  notice.start();
  advance(4_000);
  notice.start();
  advance(4_000);
  assert.deepEqual(events, [], "the restarted timer replaced the previous one");
  advance(1_000);
  assert.deepEqual(events, ["fade"]);
  advance(NOTICE_FADE_MS);
  assert.deepEqual(events, ["fade", "dismiss"]);

  // Cancelling (unmount) leaves no pending timer behind.
  events.length = 0;
  notice.start();
  notice.cancel();
  advance(30_000);
  assert.deepEqual(events, []);
  assert.equal(pending.size, 0);
});

/* ------------------------------------------------------------------
   account_exists keeps the modal open
   ------------------------------------------------------------------ */

test("account_exists warning is shown inside the still-open modal", async () => {
  const unmount = await renderOauthHost({ authMode: "login" });

  const notice = q(".auth-modal-notice");
  assert.ok(notice, "warning is rendered inside the modal");
  assert.equal(notice.textContent.startsWith(ACCOUNT_EXISTS_MESSAGE), true);
  assert.ok(notice.closest(".auth-modal"), "warning lives inside the dialog");
  assert.ok(q(".auth-modal"), "the login modal remains open");
  assert.ok(q('input[name="email"]'), "the login form is still usable");
  assert.equal(q(".auth-global-notice") === null, true, "no duplicate global notice");

  // Entered values survive the warning.
  typeInto(q('input[name="email"]'), "ankit@example.com");
  assert.equal(q('input[name="email"]').value, "ankit@example.com");

  // The user can dismiss the warning without the dialog closing.
  await act(async () => {
    q(".auth-modal-notice button").dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });
  assert.equal(oauthClears.length, 1);
  assert.equal(q(".auth-modal-notice") === null, true, "dismissed warning is removed");
  assert.ok(q(".auth-modal"), "the modal is still open after dismissing the warning");
  assert.equal(q('input[name="email"]').value, "ankit@example.com", "values are kept");
  await unmount();
});

test("account_exists warning keeps the signup form and values intact", async () => {
  const unmount = await renderOauthHost({ authMode: "signup" });

  typeInto(usernameInput(), "Ankit Das");
  assert.equal(usernameInput().value, "Ankit Das");
  assert.ok(q(".auth-modal"), "signup modal remains open");
  assert.ok(q(".auth-modal-notice"), "warning is visible over the form");
  await unmount();
});

test("account_exists notice uses the production 5 second duration and is not short-circuited", async () => {
  const unmount = await renderOauthHost({ authMode: "login" });

  assert.ok(q(".auth-modal-notice"), "warning is visible immediately");
  assert.equal(
    q(".auth-modal-notice").classList.contains("is-leaving"),
    false,
    "warning starts fully visible",
  );

  // No injected duration here, so the notice runs on the real production
  // 5 second lifecycle. It must still be visible and not fading well before it.
  await wait(1_200);
  assert.ok(q(".auth-modal-notice"), "still visible after 1.2 seconds");
  assert.equal(q(".auth-modal-notice").classList.contains("is-leaving"), false);
  assert.ok(q(".auth-modal"), "the modal is still open");
  await unmount();
});

test("account_exists notice fades before it is removed and the modal stays open", async () => {
  const unmount = await renderOauthHost({ authMode: "login", noticeDurationMs: 120 });

  assert.ok(q(".auth-modal-notice"));

  // Fade starts at 120ms, removal at 120ms + NOTICE_FADE_MS.
  await wait(150);
  assert.equal(q(".auth-modal-notice")?.classList.contains("is-leaving"), true);
  assert.ok(q(".auth-modal"), "the modal is still open while the warning fades");

  await wait(320);
  assert.equal(q(".auth-modal-notice") === null, true, "warning removed after the fade");
  assert.ok(q(".auth-modal"), "the modal is still open after the warning is gone");
  assert.ok(q('input[name="email"]'), "the login form is still usable");
  await unmount();
});

test("no warning is shown for a normal Google attempt and the flow is unchanged", async () => {
  const unmount = await renderModal({ authMode: "login" });

  assert.equal(q(".auth-modal-notice") === null, true, "no warning before any OAuth error");

  const googleButton = q(".auth-google");
  if (googleButton) {
    await act(async () => {
      googleButton.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    assert.equal(googleClicks.length, 1, "the Google button still starts the OAuth flow");
  }

  assert.ok(q(".auth-modal"), "the modal is untouched");
  await unmount();
});

/* ------------------------------------------------------------------
   Reopen decision (pure, no DOM needed)
   ------------------------------------------------------------------ */

test("oauth errors reopen the auth modal on the login view", async () => {
  const { getOAuthErrorAuthMode } = await vite.ssrLoadModule(
    "/src/auth/oauthErrorMessages.js",
  );

  assert.equal(getOAuthErrorAuthMode("account_exists"), "login");
  assert.equal(getOAuthErrorAuthMode("access_denied"), "login");
  assert.equal(getOAuthErrorAuthMode("invalid_state"), "login");
  assert.equal(getOAuthErrorAuthMode(null), null);
});

test("the global oauth notice is hidden while the auth modal is open", async () => {
  const { shouldShowGlobalAuthNotice } = await vite.ssrLoadModule("/src/auth/authUtils.ts");

  const base = { authError: ACCOUNT_EXISTS_MESSAGE, authErrorKind: "oauth" };
  assert.equal(shouldShowGlobalAuthNotice({ ...base, authMode: "login" }), false);
  assert.equal(shouldShowGlobalAuthNotice({ ...base, authMode: "signup" }), false);
  assert.equal(shouldShowGlobalAuthNotice({ ...base, authMode: null }), true);
  assert.equal(
    shouldShowGlobalAuthNotice({ authError: "x", authErrorKind: "form", authMode: null }),
    false,
  );
});
