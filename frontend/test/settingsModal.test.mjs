// SettingsModal behaviour: preferences loaded from the API and auto-saved
// silently, the debounced volume slider, the inline Change Password form,
// the reveal-based deletion flow, and close handling.
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
let SettingsModal;
let AuthContext;
let authApi;

let closedCount;
let deleteCalls;
let passwordCalls;
let preferenceSaves;

function installDom() {
  dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://arcadia.test/",
  });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  for (const key of [
    "HTMLElement", "HTMLInputElement", "HTMLButtonElement", "HTMLSelectElement",
    "Element", "Node", "Event", "MouseEvent", "KeyboardEvent", "CustomEvent",
    "FocusEvent", "MutationObserver",
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
  SettingsModal = (await vite.ssrLoadModule("/src/pages/Settings/SettingsModal.tsx")).default;
  AuthContext = (await vite.ssrLoadModule("/src/auth/AuthContext.tsx")).default;
  ({ authApi } = await vite.ssrLoadModule("/src/auth/authApi.ts"));
});

after(async () => {
  await vite?.close();
  console.error = originalConsoleError;
});

beforeEach(() => {
  closedCount = 0;
  deleteCalls = [];
  passwordCalls = [];
  preferenceSaves = [];

  /*
    The network is fully stubbed at the authApi module level, which is the
    object SettingsModal calls through. Nothing here reaches a real server.
  */
  authApi.refresh = async () => null;
  authApi.me = async () => {
    throw new Error("auth is stubbed in tests");
  };
  authApi.getPreferences = async () => ({ preferences: defaultPreferences() });
  authApi.updatePreferences = async (updates) => {
    preferenceSaves.push(updates);
    return { preferences: { ...defaultPreferences(), ...updates } };
  };
  authApi.resetPreferences = async () => ({ preferences: defaultPreferences() });
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

function hiddenPreferences() {
  return {
    soundEffects: false,
    soundVolume: 40,
    profileVisibility: "FRIENDS",
    leaderboardVisibility: "HIDE",
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

function authValue(user = authUser()) {
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
    changePassword: async (current, next, confirmation) => {
      passwordCalls.push({ current, next, confirmation });
      return { success: true, message: "" };
    },
    revokeSession: async () => ({ current: false, message: "" }),
    logoutOtherSessions: async () => ({ revokedCount: 0, message: "" }),
    loginWithGoogle: () => {},
    logout: async () => ({ success: true }),
    logoutAll: async () => ({ success: true }),
    refresh: async () => null,
    deleteAccount: async (values) => {
      deleteCalls.push(values);
      return { success: true, message: null };
    },
  };
}

async function renderModal({ user = authUser(), value = null } = {}) {
  await act(async () => { root?.unmount(); });
  document.body.innerHTML = "";
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const onClose = () => { closedCount += 1; };
  await act(async () => {
    root.render(React.createElement(
      AuthContext.Provider,
      { value: value || authValue(user) },
      React.createElement(SettingsModal, { open: true, onClose }),
    ));
  });
  return () => act(async () => root.unmount());
}

/** Lets the volume debounce fire and its request settle. */
async function settleVolume() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 420)); });
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

function mouseDown(node) {
  return act(async () => {
    node.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  });
}

function pressEscape() {
  return act(async () => {
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
}

/**
 * Sets a field the way a user types does: the value goes on through the
 * prototype setter (chosen from the element's own class, so textareas work
 * too) so React's value tracker notices, then the input event fires.
 */
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

function setRangeValue(slider, value) {
  return act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(slider, String(value));
    slider.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

function releaseSlider(slider) {
  return act(async () => {
    slider.dispatchEvent(new window.Event("pointerup", { bubbles: true }));
    slider.dispatchEvent(new window.FocusEvent("focusout", { bubbles: true }));
  });
}

/**
 * The deletion reason is a custom listbox, not a native <select>, so it is
 * driven the way a pointer drives it: open the trigger, then choose the option.
 * The list is rendered in DELETE_REASONS order, and the test only knows the
 * values, so the table is repeated here on purpose.
 */
const DELETE_REASON_VALUES = [
  "NO_LONGER_USE",
  "PRIVACY_CONCERNS",
  "POOR_EXPERIENCE",
  "SWITCHING_PLATFORM",
  "CREATING_NEW_ACCOUNT",
  "OTHER",
];

async function chooseReason(value) {
  const trigger = q("#settings-delete-reason");
  assert.ok(trigger, "the reason control is rendered");
  await click(trigger);

  const list = q("#settings-delete-reason-listbox");
  assert.ok(list, "the reason list opens");
  const option = list.children[DELETE_REASON_VALUES.indexOf(value)];
  assert.ok(option, `the ${value} reason is offered`);
  await click(option);

  assert.equal(q("#settings-delete-reason-listbox"), null, "choosing closes the list");
}

function submitForm(form) {
  return act(async () => {
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  });
}

function soundSwitch() { return q(".settings-switch input"); }
function profileRadios() { return qa('input[name="profile-visibility"]'); }
function leaderboardRadios() { return qa('input[name="leaderboard-visibility"]'); }
function radioGroupLabel(radio) { return radio.closest("label").querySelector("strong").textContent; }
function selectedRadio(radios) {
  const selected = radios.find((radio) => radio.checked);
  return selected ? radioGroupLabel(selected) : null;
}
function volumeSlider() { return q("#settings-volume"); }
function bodyText() { return q(".settings-body").textContent; }

/** Buttons inside the whole modal, matched by their visible label. */
function button(label) {
  return qa("button").find((node) => node.textContent.trim().includes(label));
}

/* ==================================================================
   1. Loading preferences from the backend
   ================================================================== */

test("the modal renders a loading state and then the stored preferences", async () => {
  let release;
  authApi.getPreferences = () => new Promise((resolve) => { release = () => resolve({ preferences: hiddenPreferences() }); });

  const unmount = await renderModal();

  assert.ok(q(".settings-backdrop"), "the backdrop is portaled to the body");
  const dialog = q('[role="dialog"]');
  assert.ok(dialog, "a dialog role is rendered");
  assert.equal(dialog.getAttribute("aria-modal"), "true");
  assert.match(bodyText(), /Loading settings/, "a loading state is shown first");

  await act(async () => { release(); });

  assert.equal(soundSwitch().checked, false, "the stored sound value drives the switch");
  assert.equal(selectedRadio(profileRadios()), "Friends", "the stored profile visibility is selected");
  assert.equal(selectedRadio(leaderboardRadios()), "Hide", "the stored leaderboard visibility is selected");
  assert.equal(volumeSlider().value, "40", "the stored volume drives the slider");
  assert.equal(document.body.style.overflow, "hidden", "the scroll lock is engaged");
  await unmount();
});

test("a load failure shows an error and the retry re-requests the settings", async () => {
  let calls = 0;
  authApi.getPreferences = async () => {
    calls += 1;
    if (calls === 1) throw new Error("offline");
    return { preferences: defaultPreferences() };
  };

  const unmount = await renderModal();

  assert.match(q(".settings-load-failed").textContent, /Unable to load settings/);
  await click(button("Retry"));

  assert.equal(calls, 2, "retry asks the backend again");
  assert.ok(q(".settings-switch"), "the preferences render once the retry succeeds");
  await unmount();
});

/* ==================================================================
   2. Silent auto-save for every preference
   ================================================================== */

test("toggling sound effects saves server field names with no success message", async () => {
  const unmount = await renderModal();

  await click(soundSwitch());

  assert.deepEqual(preferenceSaves[0], { soundEffects: false }, "the PATCH body uses the server schema");
  assert.equal(soundSwitch().checked, false, "the switch shows the confirmed value");
  assert.doesNotMatch(bodyText(), /Settings saved|Changes saved|Saved successfully|saved successfully/i, "no save confirmation is shown");
  await unmount();
});

test("a rejected save is silent and the control reverts to the persisted value", async () => {
  authApi.updatePreferences = async (updates) => {
    preferenceSaves.push(updates);
    throw new Error("Save rejected");
  };
  const unmount = await renderModal();

  await click(soundSwitch());

  assert.equal(soundSwitch().checked, true, "the unsaved change reverted to the stored value");
  assert.doesNotMatch(bodyText(), /Unable to save|error/i, "no error banner appears, so nothing shifts");
  await unmount();
});

test("the volume slider saves on release, not during the drag", async () => {
  const unmount = await renderModal();
  const slider = volumeSlider();

  await setRangeValue(slider, 62);
  assert.equal(preferenceSaves.length, 0, "dragging alone saves nothing yet");
  assert.doesNotMatch(bodyText(), /Release the slider|Release to save/i, "no helper text appears while dragging");

  await releaseSlider(slider);
  assert.deepEqual(preferenceSaves, [{ soundVolume: 62 }], "releasing commits the draft");
  assert.equal(slider.value, "62");
  await unmount();
});

test("a paused drag saves automatically after the debounce", async () => {
  const unmount = await renderModal();

  await setRangeValue(volumeSlider(), 55);
  assert.equal(preferenceSaves.length, 0, "nothing is sent the instant the value changes");

  await settleVolume();
  assert.deepEqual(preferenceSaves, [{ soundVolume: 55 }], "the value is persisted without a release");
  await unmount();
});

test("the volume sent to the backend is always inside 0-100", async () => {
  authApi.getPreferences = async () => ({ preferences: { ...defaultPreferences(), soundVolume: 40 } });
  const unmount = await renderModal();

  await setRangeValue(volumeSlider(), 250);
  await releaseSlider(volumeSlider());

  assert.equal(volumeSlider().value, "100", "the slider itself never leaves the 0-100 range");
  assert.deepEqual(preferenceSaves, [{ soundVolume: 100 }], "an out-of-range drag is clamped before it leaves the client");
  await unmount();
});

test("privacy controls save the server enum, never the display label", async () => {
  const unmount = await renderModal();

  await click(profileRadios()[2]);
  assert.deepEqual(preferenceSaves.at(-1), { profileVisibility: "NO_ONE" });
  assert.equal(selectedRadio(profileRadios()), "No one");

  await click(leaderboardRadios()[1]);
  assert.deepEqual(preferenceSaves.at(-1), { leaderboardVisibility: "HIDE" });
  assert.equal(selectedRadio(leaderboardRadios()), "Hide");
  assert.doesNotMatch(bodyText(), /Settings saved/i, "privacy saves are silent too");
  await unmount();
});

/* ==================================================================
   3. Stale responses
   ================================================================== */

test("a slow save response cannot overwrite a newer one", async () => {
  const first = { soundEffects: false, soundVolume: 100, profileVisibility: "PUBLIC", leaderboardVisibility: "SHOW" };
  const second = { soundEffects: false, soundVolume: 100, profileVisibility: "NO_ONE", leaderboardVisibility: "SHOW" };
  let releaseFirst;
  let calls = 0;
  authApi.updatePreferences = (updates) => {
    calls += 1;
    if (calls === 1) {
      // The first save is slow and, being stale, still carries the old values.
      return new Promise((resolve) => { releaseFirst = () => resolve({ preferences: first }); });
    }
    assert.deepEqual(updates, { profileVisibility: "NO_ONE" });
    return Promise.resolve({ preferences: second });
  };

  const unmount = await renderModal();

  // Both controls fire before either response comes back.
  await act(async () => {
    soundSwitch().dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    profileRadios()[2].dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  assert.equal(calls, 2, "both saves went out");
  assert.equal(selectedRadio(profileRadios()), "No one", "the newer save is already reflected");

  // The stale response lands last with the pre-save values.
  await act(async () => { releaseFirst(); });

  assert.equal(selectedRadio(profileRadios()), "No one", "the stale response did not roll the UI back");
  assert.equal(soundSwitch().checked, false);
  await unmount();
});

/* ==================================================================
   4. Reset to defaults
   ================================================================== */

test("resetting asks for confirmation and renders only the backend's confirmation", async () => {
  authApi.getPreferences = async () => ({ preferences: hiddenPreferences() });
  let resets = 0;
  authApi.resetPreferences = async () => {
    resets += 1;
    return { preferences: defaultPreferences() };
  };
  const unmount = await renderModal();
  assert.equal(soundSwitch().checked, false, "starting from non-default values");

  await click(button("Reset"));

  assert.equal(resets, 0, "nothing is sent before the confirmation");
  assert.match(q(".settings-confirm-row").textContent, /Reset all settings to defaults/);

  await click(button("Yes, reset"));

  assert.equal(resets, 1, "the dedicated reset endpoint was called once");
  assert.equal(soundSwitch().checked, true, "the UI shows the backend's post-reset response");
  assert.equal(volumeSlider().value, "100");
  assert.equal(selectedRadio(profileRadios()), "Public");
  assert.equal(selectedRadio(leaderboardRadios()), "Show");
  assert.doesNotMatch(bodyText(), /Settings reset to defaults|Settings saved/i, "reset is silent");
  await unmount();
});

test("the reset confirmation can be cancelled without calling the API", async () => {
  let resets = 0;
  authApi.resetPreferences = async () => { resets += 1; return { preferences: defaultPreferences() }; };
  const unmount = await renderModal();

  await click(button("Reset"));
  await click(button("Cancel"));

  assert.equal(resets, 0, "cancelling never reaches the backend");
  assert.equal(q(".settings-confirm-row"), null, "the confirmation row is dismissed");
  await unmount();
});

/* ==================================================================
   5. Closing the modal
   ================================================================== */

test("Escape, the backdrop and the X close the modal; clicks inside it do not", async () => {
  await renderModal();

  await mouseDown(q(".settings-modal"));
  assert.equal(closedCount, 0, "a press inside the dialog never dismisses it");

  await mouseDown(q(".settings-backdrop"));
  assert.equal(closedCount, 1, "the backdrop dismisses the modal");

  await click(q(".settings-close"));
  assert.equal(closedCount, 2, "the X dismisses the modal");

  await pressEscape();
  assert.equal(closedCount, 3, "Escape dismisses the modal");

  await act(async () => { root.unmount(); });
  assert.equal(document.body.style.overflow, "", "closing releases the scroll lock");
});

/* ==================================================================
   6. Account & Security — inline, no child modal
   ================================================================== */

test("Account & Security renders inline with no child modal or second page", async () => {
  const unmount = await renderModal();

  // The change-password and deletion interfaces are in this one view.
  assert.ok(q("#settings-current-password"), "the change password form is inline");
  assert.ok(q("#settings-delete-confirmation") === null, "the deletion controls start hidden");
  assert.equal(button("Permanently Delete Your Account")?.getAttribute("aria-expanded"), "false");

  // No child modal, drawer or second view exists anywhere.
  assert.equal(q(".account-settings-panel"), null, "the old child panel is gone");
  assert.equal(qa('[role="dialog"]').length, 1, "exactly one dialog exists");
  assert.doesNotMatch(bodyText(), /Open account settings/, "the old trigger is gone");
  await unmount();
});

test("a Google-only account is told there is no password to change", async () => {
  const unmount = await renderModal({ user: authUser({ authProvider: "GOOGLE" }) });

  assert.equal(q("#settings-current-password"), null, "no change password form for a Google account");
  assert.match(bodyText(), /no Arcadia password to change/);
  await unmount();
});

test("change password validates locally before calling the secure endpoint", async () => {
  const value = authValue();
  const unmount = await renderModal({ value });

  // Too short.
  await setTextInput(q("#settings-current-password"), "old-password-1");
  await setTextInput(q("#settings-new-password"), "short");
  await setTextInput(q("#settings-confirm-password"), "short");
  await submitForm(q("#settings-current-password").form);
  assert.equal(passwordCalls.length, 0, "a short password never reaches the API");
  assert.match(q(".settings-error").textContent, /at least 8 characters/);

  // Mismatched.
  await setTextInput(q("#settings-new-password"), "brand-new-pass-1");
  await setTextInput(q("#settings-confirm-password"), "brand-new-pass-2");
  await submitForm(q("#settings-current-password").form);
  assert.equal(passwordCalls.length, 0, "a mismatch never reaches the API");
  assert.match(q(".settings-error").textContent, /do not match/);

  // Valid.
  await setTextInput(q("#settings-confirm-password"), "brand-new-pass-1");
  await submitForm(q("#settings-current-password").form);
  assert.deepEqual(passwordCalls, [{
    current: "old-password-1",
    next: "brand-new-pass-1",
    confirmation: "brand-new-pass-1",
  }], "the existing secure endpoint is used with the typed values");
  await unmount();
});

test("a failed password change reports inline and keeps the form", async () => {
  const value = authValue();
  value.changePassword = async (current, next, confirmation) => {
    passwordCalls.push({ current, next, confirmation });
    return { success: false, message: "Current password is incorrect" };
  };
  const unmount = await renderModal({ value });

  await setTextInput(q("#settings-current-password"), "wrong-password");
  await setTextInput(q("#settings-new-password"), "brand-new-pass-1");
  await setTextInput(q("#settings-confirm-password"), "brand-new-pass-1");
  await submitForm(q("#settings-current-password").form);

  assert.equal(passwordCalls.length, 1);
  assert.match(q(".settings-error").textContent, /Current password is incorrect/);
  assert.equal(q("#settings-current-password").value, "wrong-password", "the form is kept for a retry");
  await unmount();
});

test("a successful password change shows no success message inside Settings", async () => {
  const unmount = await renderModal();

  await setTextInput(q("#settings-current-password"), "old-password-1");
  await setTextInput(q("#settings-new-password"), "brand-new-pass-1");
  await setTextInput(q("#settings-confirm-password"), "brand-new-pass-1");
  await submitForm(q("#settings-current-password").form);

  assert.equal(passwordCalls.length, 1, "the endpoint was called once");
  /*
   * Settings itself stays silent — the confirmation is the separate dialog the
   * auth layer raises, never a message written into this modal.
   */
  assert.doesNotMatch(bodyText(), /changed successfully|Password changed|success/i, "no success message is shown inside Settings");
  await unmount();
});

/* ==================================================================
   7. Permanent account deletion
   ================================================================== */

test("the deletion controls are revealed in place by their button", async () => {
  const unmount = await renderModal();

  await click(button("Permanently Delete Your Account"));

  assert.equal(qa('[role="dialog"]').length, 1, "revealing them opens no second modal");
  assert.ok(q("#settings-delete-panel"), "the panel appears directly underneath the button");
  const trigger = button("Permanently Delete Your Account");
  assert.equal(trigger.getAttribute("aria-expanded"), "true", "the same button now reports expanded");

  // Clicking it again collapses.
  await click(trigger);
  assert.equal(q("#settings-delete-panel"), null, "the panel collapses");
  await unmount();
});

test("the deletion flow requires a reason and the exact word DELETE", async () => {
  const unmount = await renderModal();
  await click(button("Permanently Delete Your Account"));

  const proceed = () => q("#settings-delete-panel").querySelector('button[type="submit"]');
  const confirmation = () => q("#settings-delete-confirmation");

  assert.ok(proceed().disabled, "proceed starts disabled");

  // The word alone is not enough.
  await setTextInput(confirmation(), "DELETE");
  assert.ok(proceed().disabled, "a reason is still required");

  // Case variations are rejected.
  await setTextInput(confirmation(), "delete");
  await chooseReason("PRIVACY_CONCERNS");
  assert.ok(proceed().disabled, "only the exact word DELETE counts");

  // Exact word + reason enables it.
  await setTextInput(confirmation(), "DELETE");
  assert.equal(proceed().disabled, false, "reason plus DELETE enables proceeding");

  await submitForm(q("#settings-delete-panel"));
  assert.equal(deleteCalls.length, 0, "proceeding on its own deletes nothing");
  assert.ok(q("#settings-delete-reauth"), "a password account is taken to the re-authentication step");
  assert.equal(q("#settings-delete-panel"), null, "the confirmation form is replaced, not stacked under it");
  assert.doesNotMatch(bodyText(), /deleted successfully|Your account has been/i, "no fake success is shown");
  await unmount();
});

test("typing DELETE never puts the deletion section in front of a browser as a credential form", async () => {
  const unmount = await renderModal();
  await click(button("Permanently Delete Your Account"));

  const panel = q("#settings-delete-panel");
  assert.ok(panel, "the confirmation step is present");

  /*
   * The reported bug: a password field sharing a form with the confirmation
   * word is read as a username + password pair, so the browser offered to
   * save "DELETE" as a credential when the form was submitted.
   */
  assert.equal(panel.querySelector('input[type="password"]'), null, "the confirmation form holds no password field");
  assert.equal(panel.querySelector('input[type="email"]'), null, "and no email field");
  assert.equal(panel.querySelector("textarea[type=password]"), null, "and no hidden password box");

  // Nothing in the form may carry a name a password manager reads as a credential.
  const credentialName = /^(user(name)?|email|e-mail|pass(word|wd)|current_?password|new_?password|confirm_?password)$/i;
  for (const field of panel.querySelectorAll("input, textarea")) {
    const name = field.getAttribute("name") ?? "";
    assert.ok(!credentialName.test(name), `the field named "${name}" is not a credential name`);
  }

  const confirmation = q("#settings-delete-confirmation");
  assert.equal(confirmation.getAttribute("type"), "text", "the confirmation field is plain text");
  assert.equal(confirmation.getAttribute("placeholder"), "Type DELETE here");
  assert.equal(confirmation.getAttribute("autocomplete"), "off");

  /*
   * The password re-authentication the backend requires is a separate step
   * with no <form> around it, so there is no form submission for a password
   * manager to answer with a "Save password?" prompt, and no field beside
   * the password for it to pair with one.
   */
  await chooseReason("PRIVACY_CONCERNS");
  await setTextInput(confirmation, "DELETE");
  await click(button("Yes, Proceed"));

  const reauth = q("#settings-delete-reauth");
  assert.equal(reauth.tagName, "DIV", "the re-authentication step is not a form");
  assert.equal(reauth.querySelector('button[type="submit"]'), null, "its action is a plain button, not a form submission");
  assert.equal(reauth.querySelector('input[type="text"]'), null, "it holds no field that could be read as a username");
  assert.equal(reauth.querySelectorAll("input").length, 1, "the password is the only field in it");
  assert.equal(reauth.querySelector("input").getAttribute("type"), "password");
  assert.ok(button("Delete my account").disabled, "an empty password cannot delete the account");
  await unmount();
});

test("Back from the re-authentication step returns to the confirmation without deleting", async () => {
  const unmount = await renderModal();
  await click(button("Permanently Delete Your Account"));

  await chooseReason("POOR_EXPERIENCE");
  await setTextInput(q("#settings-delete-confirmation"), "DELETE");
  await click(button("Yes, Proceed"));
  await setTextInput(q("#settings-delete-password"), "hunter22");

  await click(button("Back"));

  assert.equal(deleteCalls.length, 0, "Back never deletes anything");
  assert.equal(q("#settings-delete-reauth"), null, "the re-authentication step is gone");
  assert.equal(q("#settings-delete-confirmation").value, "DELETE", "the typed word is kept");
  assert.equal(q("#settings-delete-reason").textContent.trim(), "I had a poor experience", "the reason is kept");
  assert.equal(q("#settings-delete-panel").querySelector('input[type="password"]'), null, "and no password lingers in the confirmation form");
  await unmount();
});

test("the Other reason reveals an optional comment that survives typing", async () => {
  const unmount = await renderModal();
  await click(button("Permanently Delete Your Account"));

  const comment = () => q("#settings-delete-comment");

  assert.equal(comment(), null, "no comment box for a normal reason");

  await chooseReason("OTHER");
  assert.ok(comment(), "Other reveals the comment box directly below the dropdown");
  assert.match(q("#settings-delete-panel").textContent, /Please tellus more|Please tell us more/);

  await setTextInput(comment(), "The matchmaking queue was empty for weeks.");
  assert.equal(comment().value, "The matchmaking queue was empty for weeks.", "the text is kept");

  // Switching away from Other hides it; returning shows it empty again.
  await chooseReason("POOR_EXPERIENCE");
  assert.equal(comment(), null, "a different reason hides the comment box");
  await chooseReason("OTHER");
  assert.equal(comment().value, "", "changing the reason clears the old comment");

  // The comment stays optional.
  const proceed = () => q("#settings-delete-panel").querySelector('button[type="submit"]');
  await setTextInput(q("#settings-delete-confirmation"), "DELETE");
  assert.equal(proceed().disabled, false, "Other does not require the comment");
  await unmount();
});

test("No, Cancel collapses the panel and resets everything without deleting", async () => {
  const unmount = await renderModal();
  await click(button("Permanently Delete Your Account"));

  await chooseReason("OTHER");
  await setTextInput(q("#settings-delete-comment"), "Some reason.");
  await setTextInput(q("#settings-delete-confirmation"), "DELETE");

  await click(button("No, Cancel"));

  assert.equal(q("#settings-delete-panel"), null, "the panel collapsed");
  assert.equal(deleteCalls.length, 0, "nothing was deleted");

  // Reopening starts clean.
  await click(button("Permanently Delete Your Account"));
  assert.equal(q("#settings-delete-reason").textContent.trim(), "Select a reason…", "the reason was reset");
  assert.equal(q("#settings-delete-comment"), null, "the comment was reset");
  assert.equal(q("#settings-delete-confirmation").value, "", "the typed word was reset");
  await unmount();
});

test("a failed deletion explains itself and keeps the account", async () => {
  const value = authValue();
  value.deleteAccount = async (values) => {
    deleteCalls.push(values);
    return { success: false, message: "Wrong password." };
  };
  const unmount = await renderModal({ value });
  await click(button("Permanently Delete Your Account"));

  await chooseReason("NO_LONGER_USE");
  await setTextInput(q("#settings-delete-confirmation"), "DELETE");
  await click(button("Yes, Proceed"));

  await setTextInput(q("#settings-delete-password"), "hunter22");
  await click(button("Delete my account"));

  assert.deepEqual(deleteCalls, [{ confirmation: "DELETE", password: "hunter22" }], "the typed password is sent with the typed word");
  assert.match(q(".settings-error").textContent, /Wrong password/);
  assert.ok(q("#settings-delete-reauth"), "the re-authentication step stays open for a retry");
  assert.equal(button("Permanently Delete Your Account").getAttribute("aria-expanded"), "true");
  await unmount();
});

test("a Google-only account is deleted without a password field", async () => {
  const unmount = await renderModal({ user: authUser({ authProvider: "GOOGLE" }) });
  await click(button("Permanently Delete Your Account"));

  assert.equal(q("#settings-delete-password"), null, "no password is asked of a Google account");
  assert.equal(q("#settings-delete-reauth"), null, "a Google account never reaches a re-authentication step");

  await chooseReason("SWITCHING_PLATFORM");
  await setTextInput(q("#settings-delete-confirmation"), "DELETE");
  await submitForm(q("#settings-delete-panel"));

  assert.deepEqual(deleteCalls, [{ confirmation: "DELETE", password: undefined }]);
  await unmount();
});
