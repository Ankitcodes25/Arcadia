// Chat Clear Request placement: the status card must sit in normal flow
// immediately above the composer, below a long message log, never over the
// input row. The CSS contract is asserted directly because jsdom does not load
// Vite's CSS imports or compute layout.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
let ChatModal;
let chatApi;
let clearState;
let messages;

const SELF = "player-self";
const FRIEND = {
  id: "player-online",
  username: "ZedOnline",
  playerId: "ARC-ZEDONLIN",
  avatar: { type: "local", value: "avatar-02" },
  avatarUrl: null,
  online: true,
  friendsSince: "2026-01-01T00:00:00.000Z",
};

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
    "FocusEvent", "MutationObserver", "PointerEvent",
  ]) {
    if (window[key]) globalThis[key] = window[key];
  }
  Object.defineProperty(globalThis, "navigator", {
    value: window.navigator,
    configurable: true,
  });
  window.matchMedia = window.matchMedia || ((media) => ({
    matches: false,
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
  window.HTMLElement.prototype.scrollTo = function () {};
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
}

function flushed() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function message(index) {
  return {
    id: `message-${index}`,
    conversationId: "conversation-new",
    senderId: index % 2 === 0 ? SELF : FRIEND.id,
    receiverId: index % 2 === 0 ? FRIEND.id : SELF,
    text: `Message ${index}`,
    status: "READ",
    sentAt: "2026-11-01T10:00:00.000Z",
    deliveredAt: "2026-11-01T10:00:00.000Z",
    readAt: "2026-11-01T10:00:00.000Z",
    createdAt: `2026-11-01T10:${String(index % 60).padStart(2, "0")}:00.000Z`,
  };
}

function pendingRequest() {
  return {
    id: "clear-1",
    conversationId: "conversation-new",
    requesterId: FRIEND.id,
    recipientId: SELF,
    requesterUsername: FRIEND.username,
    status: "pending",
    createdAt: "2026-11-01T12:00:00.000Z",
    respondedAt: null,
  };
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
  ChatModal = (await vite.ssrLoadModule("/src/chat/ChatModal.tsx")).default;
  ({ chatApi } = await vite.ssrLoadModule("/src/chat/chatApi.ts"));
});

after(async () => {
  await vite?.close();
  console.error = originalConsoleError;
});

beforeEach(() => {
  clearState = { request: pendingRequest(), outcome: null };
  messages = Array.from({ length: 70 }, (_, index) => message(index));

  chatApi.getClearState = async () => clearState;
  chatApi.listMessages = async () => ({
    conversationId: "conversation-new",
    messages,
    hasMore: false,
    nextCursor: null,
    clearedAt: null,
  });
  chatApi.markRead = async () => ({
    conversationId: "conversation-new",
    readAt: new Date().toISOString(),
    messageIds: [],
  });
});

async function renderChat() {
  await act(async () => { root?.unmount(); });
  document.body.innerHTML = "";
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(ChatModal, {
      friend: FRIEND,
      currentUserId: SELF,
      onClose: () => {},
    }));
  });
  await act(async () => { await flushed(); });
  return () => act(async () => root.unmount());
}

test("the Clear Chat Request card sits below a long history and directly above the composer", async () => {
  const unmount = await renderChat();

  const modal = document.querySelector(".chat-modal");
  const header = modal.querySelector(".chat-header");
  const log = modal.querySelector(".chat-messages");
  const region = modal.querySelector(".chat-clear-region");
  const composer = modal.querySelector(".chat-composer");
  const banner = region.querySelector(".chat-clear-banner");

  assert.ok(banner, "the request card is rendered");
  assert.equal(header.nextElementSibling, log, "the request no longer follows the header");
  assert.equal(region.previousElementSibling, log, "the region is after the message log");
  assert.equal(region.nextElementSibling, composer, "the region is immediately above the composer");
  assert.ok(region.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING);
  assert.match(banner.textContent, /Clear Chat Request/);

  // The input row remains a separate, later sibling: normal flow means the
  // card cannot cover the textarea or send button.
  const composerRow = composer.querySelector(".chat-composer-row");
  assert.ok(composerRow.querySelector(".chat-input"));
  assert.ok(composerRow.querySelector(".chat-send-button"));
  assert.ok(composerRow.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_PRECEDING);

  await unmount();
});

test("an empty status region adds no space when no clear request is active", async () => {
  clearState = { request: null, outcome: null };
  messages = [];
  const unmount = await renderChat();

  const modal = document.querySelector(".chat-modal");
  const region = modal.querySelector(".chat-clear-region");
  const composer = modal.querySelector(".chat-composer");
  assert.ok(region, "the stable slot still exists");
  assert.equal(region.children.length, 0);
  assert.equal(region.nextElementSibling, composer);

  await unmount();
});

test("the status slot stays in normal flow and scrolls internally on small viewports", async () => {
  const css = await readFile(
    new URL("../src/chat/ChatModal.css", import.meta.url),
    "utf8",
  );

  const block = css.match(/\.chat-clear-region\s*\{([^}]*)\}/);
  assert.ok(block, "the clear region has a CSS rule");
  assert.match(block[1], /flex:\s*none/);
  assert.match(block[1], /overflow-y:\s*auto/);
  assert.match(block[1], /max-height:\s*min\(/);
  assert.doesNotMatch(block[1], /position:\s*(absolute|fixed)/);

  assert.match(
    css,
    /@media \(max-width: 620px\)[\s\S]*?\.chat-clear-region\s*\{[\s\S]*?max-height:/,
    "the region is shortened where the mobile keyboard leaves less room",
  );
});
