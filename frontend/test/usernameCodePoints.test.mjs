import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

/*
 * Username length is measured in Unicode code points everywhere, so a username
 * of 20 emoji is valid and a username of 21 is not. These tests cover the
 * shared rules and then assert that signup, the Google username onboarding
 * modal and My Profile username editing all behave identically through them.
 *
 * The native `maxLength` attribute is never used on a username field: browsers
 * count it in UTF-16 units, which rejected valid 20 code point emoji usernames
 * in the profile/onboarding modal while signup accepted them.
 */

const frontendRoot = fileURLToPath(new URL("../", import.meta.url));
const originalConsoleError = console.error;

const EMOJI = "\u{1F600}";
const SUPPLEMENTARY = "\u{1D11E}"; // MUSICAL SYMBOL G CLEF, outside the BMP.

let dom;
let vite;
let React;
let act;
let createRoot;
let root;
let LoginSignupModal;
let UsernameModal;
let UsernameOnboarding;
let AuthContext;
let rules;
let notice;
let availability;
let apiRef;
let originalCheckUsernameAvailability;

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
    "InputEvent",
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
  UsernameModal = (await vite.ssrLoadModule("/src/components/UsernameModal.tsx")).default;
  UsernameOnboarding = (await vite.ssrLoadModule("/src/auth/UsernameOnboarding.tsx")).default;
  AuthContext = (await vite.ssrLoadModule("/src/auth/AuthContext.tsx")).default;
  rules = await vite.ssrLoadModule("/src/auth/usernameRules.ts");
  notice = await vite.ssrLoadModule("/src/auth/authNotice.ts");
  availability = await vite.ssrLoadModule("/src/auth/usernameAvailability.ts");

  // Every username surface asks the backend before accepting a name. These tests
  // are about code point counting, so the availability answer is fixed here and
  // the taken-name behaviour is covered in profileProgression.test.mjs.
  const api = (await vite.ssrLoadModule("/src/auth/authApi.ts")).authApi;
  apiRef = api;
  originalCheckUsernameAvailability = api.checkUsernameAvailability.bind(api);
  api.checkUsernameAvailability = async () => ({ available: true });
});

after(async () => {
  if (apiRef && originalCheckUsernameAvailability) {
    apiRef.checkUsernameAvailability = originalCheckUsernameAvailability;
  }
  await vite?.close();
  console.error = originalConsoleError;
});

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

function click(node) {
  act(() => {
    node.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

/*
 * Sets the input value through the native setter and dispatches `input`, which
 * is the exact code path React's onChange sees for a keystroke and for a paste,
 * so a pasted value is covered by the same assertions as a typed one.
 */
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Real time passes outside act(); act afterwards flushes the timer driven state.
async function wait(ms) {
  await sleep(ms);
  await act(async () => {});
}

/* ==================================================================
   Shared rules: the single frontend source for the 3-20 code point rule
   ================================================================== */

test("20 ASCII characters are accepted and 21 are capped at 20", () => {
  const twenty = "a".repeat(20);
  const twentyOne = "a".repeat(21);

  assert.equal(rules.getUsernameLength(twenty), 20);
  assert.deepEqual(rules.resolveUsernameInput(twenty), {
    value: twenty,
    exceededMax: false,
  });

  const capped = rules.resolveUsernameInput(twentyOne);
  assert.equal(capped.exceededMax, true);
  assert.equal(capped.value, twenty);
  assert.equal(capped.value.length, 20, "20 code points is 20 UTF-16 units for ASCII");
  assert.equal(rules.getUsernameLength(capped.value), 20);
});

test("20 emoji code points are accepted and 21 are capped at 20", () => {
  const twentyEmoji = EMOJI.repeat(20);
  const twentyOneEmoji = EMOJI.repeat(21);

  // 20 emoji is 40 UTF-16 units, which is exactly what a native maxLength of
  // 20 would have refused.
  assert.equal(twentyEmoji.length, 40);
  assert.equal(rules.getUsernameLength(twentyEmoji), 20);
  assert.deepEqual(rules.resolveUsernameInput(twentyEmoji), {
    value: twentyEmoji,
    exceededMax: false,
  });

  const capped = rules.resolveUsernameInput(twentyOneEmoji);
  assert.equal(capped.exceededMax, true);
  assert.equal(rules.getUsernameLength(capped.value), 20);
  assert.equal(capped.value, twentyEmoji, "the first 20 emoji remain");
  assert.equal(capped.value.length, 40, "no surrogate pair was cut in half");
  assert.equal([...capped.value].every((character) => character === EMOJI), true);
});

test("mixed ASCII and emoji are counted by code points", () => {
  // 16 ASCII + 4 emoji = 20 code points = 24 UTF-16 units.
  const mixed = `${"a".repeat(16)}${EMOJI.repeat(4)}`;
  assert.equal(mixed.length, 24);
  assert.equal(rules.getUsernameLength(mixed), 20);

  const overLimit = `${mixed}x`;
  const capped = rules.resolveUsernameInput(overLimit);
  assert.equal(capped.exceededMax, true);
  assert.equal(rules.getUsernameLength(capped.value), 20);
  assert.equal(capped.value, mixed, "the extra code point is refused, nothing before it changes");
});

test("supplementary Unicode characters count as one code point", () => {
  assert.equal(SUPPLEMENTARY.length, 2, "a non-BMP character is two UTF-16 units");
  assert.equal(rules.getUsernameLength(SUPPLEMENTARY), 1);
  assert.equal(rules.getUsernameLength(SUPPLEMENTARY.repeat(20)), 20);
  assert.equal(rules.getUsernameLength(SUPPLEMENTARY.repeat(21)), 21);

  // CJK ideographs and full width forms are also supplementary.
  const fullWidth = "\u{1F600}\u{1D11E}\u{20BB7}";
  assert.ok(fullWidth.length > fullWidth.length / 2);
  assert.equal(rules.getUsernameLength(fullWidth), 3);

  const capped = rules.resolveUsernameInput(SUPPLEMENTARY.repeat(21));
  assert.equal(rules.getUsernameLength(capped.value), 20);
  assert.equal(capped.value, SUPPLEMENTARY.repeat(20));
});

test("the 3-20 code point rule is unchanged", () => {
  assert.equal(rules.USERNAME_MIN_LENGTH, 3);
  assert.equal(rules.USERNAME_MAX_LENGTH, 20);

  assert.equal(availability.getUsernameLengthWarning(""), null);
  assert.equal(availability.getUsernameLengthWarning("   "), null, "whitespace only is still too short");
  assert.equal(availability.getUsernameLengthWarning("a"), "Username too small");
  assert.equal(availability.getUsernameLengthWarning("ab"), "Username too small", "2 code points is still too short");
  assert.equal(availability.getUsernameLengthWarning(EMOJI.repeat(2)), "Username too small", "2 emoji is 2 code points");
  assert.equal(availability.getUsernameLengthWarning("abc"), null);
  assert.equal(availability.getUsernameLengthWarning(EMOJI.repeat(3)), null, "3 emoji is 3 code points");
  assert.equal(availability.getUsernameLengthWarning("a".repeat(20)), null);
  assert.equal(availability.getUsernameLengthWarning(EMOJI.repeat(20)), null);
  assert.equal(availability.getUsernameLengthWarning("a".repeat(21)), "Username max size reached");
  assert.equal(availability.getUsernameLengthWarning(EMOJI.repeat(21)), "Username max size reached");

  // Surrounding whitespace does not count, exactly like the backend validates.
  assert.equal(rules.getTrimmedUsernameLength("  abc  "), 3);
  assert.equal(availability.getUsernameLengthWarning("  abc  "), null);
  assert.equal(availability.getUsernameLengthWarning("  ab  "), "Username too small");
});

test("resolving an input never alters the value that is within the limit", () => {
  // The visible value is passed through untouched: no trimming, lowercasing or
  // normalization happens on the way in.
  for (const value of ["Ankit Das", "Ankit@Arcadia", "\u{FF21}\u{FF4E}", "a b  c", "  padded  "]) {
    const resolved = rules.resolveUsernameInput(value);
    assert.equal(resolved.exceededMax, false, JSON.stringify(value));
    assert.equal(resolved.value, value, JSON.stringify(value));
  }
});

/* ==================================================================
   UsernameModal: the shared field used by onboarding and My Profile
   ================================================================== */

function renderUsernameModal(props = {}) {
  return renderRoot(React.createElement(UsernameModal, {
    mode: "onboarding",
    onSubmit: async () => null,
    ...props,
  }));
}

test("the username modal input has no native maxLength and counts code points", async () => {
  const unmount = await renderUsernameModal();

  const input = q(".unm-input");
  assert.equal(input.getAttribute("maxlength"), null, "a native maxLength would count UTF-16 units");
  assert.equal(q(".unm-counter").textContent, "0 / 20");

  typeInto(input, EMOJI.repeat(20));
  assert.equal(q(".unm-counter").textContent, "20 / 20", "20 emoji count as 20 code points");
  assert.equal(input.value, EMOJI.repeat(20));
  assert.equal(q(".unm-continue").disabled, false, "a 20 emoji username is valid");
  await unmount();
});

test("the username modal refuses the 21st code point and keeps the first 20", async () => {
  const unmount = await renderUsernameModal();

  const input = q(".unm-input");
  typeInto(input, EMOJI.repeat(21));
  assert.equal(input.value, EMOJI.repeat(20), "only the first 20 code points remain");
  assert.equal(q(".unm-counter").textContent, "20 / 20");

  // Typing on at the limit is a no-op for the value and raises the warning.
  typeInto(input, `${EMOJI.repeat(20)}x`);
  assert.equal(input.value, EMOJI.repeat(20));
  assert.equal(q(".unm-hint--error").textContent, "Username max size reached");

  // A usable value clears the warning again.
  typeInto(input, "Ankit");
  assert.equal(q(".unm-hint--error"), null);
  assert.equal(q(".unm-counter").textContent, "5 / 20");
  await unmount();
});

test("a pasted username is capped at 20 code points", async () => {
  const unmount = await renderUsernameModal();

  const input = q(".unm-input");
  // A paste sets the whole value at once, which is the over limit path.
  typeInto(input, "a".repeat(25));
  assert.equal(input.value, "a".repeat(20));

  typeInto(input, EMOJI.repeat(25));
  assert.equal(rules.getUsernameLength(input.value), 20);

  typeInto(input, `${"a".repeat(16)}${EMOJI.repeat(10)}`);
  assert.equal(input.value, `${"a".repeat(16)}${EMOJI.repeat(4)}`);
  assert.equal(rules.getUsernameLength(input.value), 20);
  await unmount();
});

test("the username modal reports a too-short value instead of closing", async () => {
  const submitted = [];
  const unmount = await renderUsernameModal({
    onSubmit: async (username) => {
      submitted.push(username);
      return null;
    },
  });

  // Two emoji is two code points, which is below the 3 code point minimum.
  typeInto(q(".unm-input"), EMOJI.repeat(2));
  await act(async () => {
    q(".unm-modal form").dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  assert.equal(submitted.length, 0, "an invalid username never reaches the backend");
  assert.ok(q(".unm-modal"), "a validation error never closes the modal");
  assert.equal(q(".unm-hint--error").textContent, "Username too small");
  assert.equal(q(".unm-input").value, EMOJI.repeat(2), "the value is kept");

  // Three emoji is three code points.
  typeInto(q(".unm-input"), EMOJI.repeat(3));
  assert.equal(q(".unm-hint--error"), null);
  await act(async () => {
    q(".unm-modal form").dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0], EMOJI.repeat(3), "the exact visible value is submitted");
  await unmount();
});

test("a caller can refuse a username and keep the modal open", async () => {
  const submitted = [];
  const unmount = await renderUsernameModal({
    onSubmit: async (username) => {
      submitted.push(username);
      return "Username already taken";
    },
  });

  typeInto(q(".unm-input"), "Someone Else");
  await act(async () => {
    q(".unm-modal form").dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );
  });

  assert.deepEqual(submitted, ["Someone Else"]);
  assert.ok(q(".unm-modal"), "a refusal never closes the modal");
  assert.equal(q(".unm-input").value, "Someone Else", "the entered value is kept for editing");
  assert.equal(q(".unm-hint--error").textContent, "Username already taken");

  // Another username can be entered straight away.
  typeInto(q(".unm-input"), "Free Name");
  assert.equal(q(".unm-hint--error"), null, "typing clears the warning");
  await unmount();
});

test("a 20 emoji username is submitted exactly as entered", async () => {
  const submitted = [];
  const unmount = await renderUsernameModal({
    onSubmit: async (username) => {
      submitted.push(username);
      return null;
    },
  });

  const value = `${"Ankit "}${EMOJI.repeat(14)}`;
  typeInto(q(".unm-input"), value);
  assert.equal(rules.getUsernameLength(value), 20);

  await act(async () => {
    q(".unm-modal form").dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  assert.equal(submitted[0], value, "nothing was trimmed, lowercased or normalized");
  await unmount();
});

test("the username modal reuses the shared 5 second notice lifecycle", async () => {
  const unmount = await renderUsernameModal({ noticeDurationMs: 120 });

  assert.equal(notice.NOTICE_AUTO_DISMISS_MS, 5_000);

  typeInto(q(".unm-input"), "a".repeat(21));
  const hint = q(".unm-hint--error");
  assert.ok(hint, "the warning is shown immediately");
  assert.equal(hint.textContent, "Username max size reached");
  assert.equal(hint.classList.contains("is-leaving"), false);

  await wait(150);
  assert.equal(
    q(".unm-hint--error")?.classList.contains("is-leaving"),
    true,
    "the fade starts on the shared timer",
  );

  await wait(320);
  assert.equal(q(".unm-hint--error"), null, "the warning is removed after the fade");
  assert.ok(q(".unm-modal"), "the modal is still open");
  await unmount();
});

test("a refused username takes priority over the length warning and still fades", async () => {
  const unmount = await renderUsernameModal({
    noticeDurationMs: 120,
    onSubmit: async () => "Username already taken",
  });

  typeInto(q(".unm-input"), "Someone Else");
  await act(async () => {
    q(".unm-modal form").dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );
  });

  const hint = q(".unm-hint--error");
  assert.equal(hint.textContent, "Username already taken");
  assert.equal(hint.classList.contains("is-leaving"), false);
  assert.ok(q(".unm-input-box--error"));

  await wait(150);
  assert.equal(q(".unm-hint--error")?.classList.contains("is-leaving"), true);

  await wait(320);
  assert.equal(q(".unm-hint--error"), null, "the warning is removed after the fade");
  assert.ok(q(".unm-modal"), "the modal is still open");
  await unmount();
});

/* ==================================================================
   The three username surfaces behave identically
   ================================================================== */

async function renderSignup() {
  return renderRoot(React.createElement(LoginSignupModal, {
    authMode: "signup",
    onClose: () => {},
    onSubmit: () => {},
    onGoogleLogin: () => {},
    onSwitchMode: () => {},
    onClearError: () => {},
    onForgotPassword: async () => "sent",
    isSubmitting: false,
    error: null,
  }));
}

async function renderOnboarding() {
  const value = {
    user: {
      id: "user-1",
      name: "",
      username: null,
      usernameSetupRequired: true,
      playerId: "ARC-7K4M2P9Q",
      displayName: "",
      avatar: { type: "google", value: "google" },
      avatarSource: "google",
      googleAvatarAvailable: true,
      googleAvatarUrl: null,
      authProvider: "GOOGLE",
      email: "user@example.com",
      role: "USER",
      status: "ACTIVE",
      createdAt: null,
      updatedAt: null,
      lastLoginAt: null,
    },
    isAuthenticated: true,
    updateProfile: async () => ({ ok: true, message: null, user: null }),
  };
  return renderRoot(React.createElement(
    AuthContext.Provider,
    { value },
    React.createElement(UsernameOnboarding),
  ));
}

function readUsernameField(input, counterSelector) {
  return {
    value: input.value,
    length: rules.getUsernameLength(input.value),
    counter: q(counterSelector).textContent,
    nativeMaxLength: input.getAttribute("maxlength"),
  };
}

test("signup and the profile username modal enforce identical code point limits", async () => {
  const signup = await renderSignup();
  const cases = ["a".repeat(21), EMOJI.repeat(21), `${"a".repeat(16)}${EMOJI.repeat(6)}`];

  for (const value of cases) {
    typeInto(q('input[name="username"]'), value);
    const signupField = readUsernameField(q('input[name="username"]'), ".auth-username-counter");
    assert.equal(signupField.nativeMaxLength, null);
    assert.equal(signupField.length, 20, JSON.stringify(value));
    assert.equal(signupField.counter, "20 / 20", JSON.stringify(value));
    assert.equal(q(".auth-username-warning").textContent, "Username max size reached");
  }
  await signup();

  const profile = await renderUsernameModal({ mode: "edit", onClose: () => {} });
  for (const value of cases) {
    typeInto(q(".unm-input"), value);
    const profileField = readUsernameField(q(".unm-input"), ".unm-counter");
    assert.equal(profileField.nativeMaxLength, null);
    assert.equal(profileField.length, 20, JSON.stringify(value));
    assert.equal(profileField.counter, "20 / 20", JSON.stringify(value));
    assert.equal(q(".unm-hint--error").textContent, "Username max size reached");
  }
  await profile();
});

test("Google username onboarding enforces the identical code point limit", async () => {
  const onboarding = await renderOnboarding();
  assert.ok(q(".unm-modal"));

  typeInto(q(".unm-input"), EMOJI.repeat(20));
  assert.equal(q(".unm-counter").textContent, "20 / 20");
  assert.equal(q(".unm-continue").disabled, false, "20 emoji is a valid username");

  typeInto(q(".unm-input"), EMOJI.repeat(21));
  assert.equal(q(".unm-input").value, EMOJI.repeat(20));
  assert.equal(q(".unm-counter").textContent, "20 / 20");
  assert.equal(q(".unm-hint--error").textContent, "Username max size reached");

  typeInto(q(".unm-input"), EMOJI.repeat(2));
  await act(async () => {
    q(".unm-modal form").dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  assert.equal(q(".unm-hint--error").textContent, "Username too small", "the 3 code point minimum is unchanged");
  assert.ok(q(".unm-modal"));
  await onboarding();
});

test("the My Profile username editor shares the same field behaviour", async () => {
  const MyProfileModal = (await vite.ssrLoadModule("/src/pages/Myprofile/MyProfileModal.tsx")).default;
  const unmount = await renderRoot(React.createElement(MyProfileModal, {
    profile: {
      id: "user-1",
      name: "",
      username: "ankitbuilds",
      usernameSetupRequired: false,
      playerId: "ARC-7K4M2P9Q",
      displayName: "",
      avatar: { type: "local", value: "avatar-01" },
      avatarSource: "local",
      googleAvatarAvailable: false,
      googleAvatarUrl: null,
      authProvider: "PASSWORD",
      email: "user@example.com",
      progression: {
        totalXp: 0,
        level: 0,
        currentLevelXp: 0,
        nextLevelXp: 100,
        progressPercent: 0,
        title: "Arcadia Rookie",
        badgeKey: "bronze",
        themeKey: "neutral-grey",
      },
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
    },
    onClose: () => {},
    onSaveUsername: async () => {},
  }));

  // The editor opens the shared username modal with the current value.
  click(q('button[aria-label="Edit username"]'));
  assert.ok(q(".unm-modal"), "My Profile uses the same username modal");
  assert.equal(q(".unm-input").value, "ankitbuilds");

  typeInto(q(".unm-input"), EMOJI.repeat(21));
  assert.equal(q(".unm-input").value, EMOJI.repeat(20));
  assert.equal(q(".unm-counter").textContent, "20 / 20");
  assert.equal(q(".unm-continue").disabled, false, "20 emoji is a valid username");
  await unmount();
});
