// Help & Support: the Contact Support mail button and the Report a Problem
// form sending its report through the backend API.
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

const frontendRoot = fileURLToPath(new URL("../", import.meta.url));
const originalConsoleError = console.error;
const SUPPORT = "helpsupportarcadia@gmail.com";

let dom;
let vite;
let React;
let act;
let createRoot;
let root;
let HelpSupportModal;
let authApi;
let setAccessToken;

function installDom() {
  dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://arcadia.test/",
  });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  for (const key of [
    "HTMLElement", "HTMLInputElement", "HTMLButtonElement", "HTMLTextAreaElement",
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
  HelpSupportModal = (await vite.ssrLoadModule("/src/pages/HelpandSupport/HelpSupportModal.tsx")).default;
  ({ authApi, setAccessToken } = await vite.ssrLoadModule("/src/auth/authApi.ts"));
});

after(async () => {
  await act(async () => { root?.unmount(); });
  await vite?.close();
  console.error = originalConsoleError;
});

beforeEach(async () => {
  await act(async () => { root?.unmount(); });
  root = null;
  document.body.innerHTML = "";
});

async function renderModal(props = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(HelpSupportModal, { onClose: () => {}, ...props }));
  });
}

function q(selector) { return document.querySelector(selector); }

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
    Object.getOwnPropertyDescriptor(proto, "value").set.call(field, value);
    field.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

function submitForm() {
  return act(async () => {
    q(".hsm-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  });
}

async function chooseCategory(label) {
  await click(q(".hsm-dd-trigger"));
  const option = [...document.querySelectorAll(".hsm-dd-option")]
    .find((node) => node.textContent.trim() === label);
  assert.ok(option, `the ${label} category is offered`);
  await click(option);
}

async function fillReport({ category = "Bug", subject, description }) {
  await chooseCategory(category);
  await setTextInput(q('input[placeholder="Briefly describe the issue"]'), subject);
  await setTextInput(q("textarea"), description);
}

/* ---------------- Contact Support ---------------- */

test("Contact Support offers an Email us button that opens a prefilled mail to support", async () => {
  await renderModal({ supportEmail: SUPPORT });

  const button = q(".hsm-contact-btn");
  assert.ok(button, "the button is rendered beside Contact Support");
  assert.equal(button.textContent.trim(), "Email us");
  assert.equal(button.getAttribute("href"), `mailto:${SUPPORT}?subject=Arcadia%20support%20request`);
  assert.equal(button.getAttribute("aria-label"), `Email support at ${SUPPORT}`);
  assert.ok(button.querySelector("svg"), "the button carries the mail icon");
  assert.equal(q(".hsm-contact-text a").getAttribute("href"), button.getAttribute("href"));
  assert.equal(q(".hsm-contact-text a").textContent, SUPPORT);
});

test("without a configured support address no mail button or link is invented", async () => {
  await renderModal({ supportEmail: "" });

  assert.equal(q(".hsm-contact-btn"), null);
  assert.equal(q(".hsm-contact-text a"), null);
  assert.match(q(".hsm-contact").textContent, /Still need help/);
});

/* ---------------- Report a Problem ---------------- */

test("submitting a report sends the trimmed fields and confirms once the backend accepts it", async () => {
  const sent = [];
  await renderModal({
    supportEmail: SUPPORT,
    onSubmitReport: async (payload) => { sent.push(payload); return { message: "ok" }; },
  });

  await fillReport({
    category: "Gameplay",
    subject: "  Snake freezes  ",
    description: "  The snake stops after the third apple.  ",
  });
  await submitForm();

  assert.deepEqual(sent, [{
    category: "Gameplay",
    subject: "Snake freezes",
    description: "The snake stops after the third apple.",
  }]);
  assert.match(q(".hsm-status").textContent, /Your report was submitted/);
  assert.equal(q('input[placeholder="Briefly describe the issue"]').value, "", "the form resets");
  assert.equal(q(".hsm-dd-trigger").textContent.trim(), "Select category");
});

test("a rejected report shows the backend's message and keeps what the player typed", async () => {
  await renderModal({
    onSubmitReport: async () => { throw new Error("Too many requests. Please try again later."); },
  });

  await fillReport({ subject: "Login loop", description: "Signing in sends me back to the start." });
  await submitForm();

  assert.match(q(".hsm-status-error").textContent, /Too many requests/);
  assert.equal(q('input[placeholder="Briefly describe the issue"]').value, "Login loop");
});

test("an invalid report is stopped in the form and never sent", async () => {
  let calls = 0;
  await renderModal({ onSubmitReport: async () => { calls += 1; } });

  await fillReport({ subject: "", description: "short" });
  await submitForm();

  assert.equal(calls, 0);
  assert.match(document.body.textContent, /Enter a subject/);
  assert.match(document.body.textContent, /at least 10 characters/);
});

test("authApi.submitSupportReport posts the report to the support endpoint as the signed-in user", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init });
    return new Response(JSON.stringify({
      message: "Your report was submitted.",
      report: { id: "r1", category: "Bug", subject: "S", status: "OPEN", createdAt: "2026-10-13T00:00:00.000Z" },
    }), { status: 201, headers: { "content-type": "application/json" } });
  };

  try {
    setAccessToken("test-access-token");
    const result = await authApi.submitSupportReport({
      category: "Bug",
      subject: "S",
      description: "A long enough description.",
    });

    assert.equal(result.report.id, "r1");
    assert.equal(requests.length, 1);
    const [{ url, init }] = requests;
    assert.match(String(url), /\/api\/v1\/support\/reports$/);
    assert.equal(init.method, "POST");
    assert.equal(init.headers.get("authorization"), "Bearer test-access-token");
    assert.equal(init.headers.get("x-arcadia-request"), "1", "the CSRF header is sent");
    assert.equal(init.credentials, "omit", "no cookies are sent with a report");
    assert.deepEqual(JSON.parse(init.body), {
      category: "Bug",
      subject: "S",
      description: "A long enough description.",
    });
  } finally {
    setAccessToken(null);
    globalThis.fetch = originalFetch;
  }
});
