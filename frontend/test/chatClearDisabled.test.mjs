// Clear Chat must be disabled for empty conversations and while a request is
// pending. These tests exercise the real ChatModal against a stubbed API so no
// backend or database is required.
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

const SELF = "player-self";
const emptyFriend = {
  id: "player-empty",
  username: "EmptyChat",
  playerId: "ARC-EMPTYCHT",
  avatar: { type: "local", value: "avatar-02" },
  avatarUrl: null,
  online: true,
  friendsSince: "2026-01-01T00:00:00.000Z",
};
const chattyFriend = {
  id: "player-chatty",
  username: "Chatty",
  playerId: "ARC-CHATTY00",
  avatar: { type: "local", value: "avatar-04" },
  avatarUrl: null,
  online: false,
  friendsSince: "2026-01-02T00:00:00.000Z",
};

let responses;
let clearStates;
let requestCalls;
let clearForMeCalls;
let cancelCalls;

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

function message(id, friendId, text) {
  return {
    id,
    conversationId: `conversation-${friendId}`,
    senderId: SELF,
    receiverId: friendId,
    text,
    status: "DELIVERED",
    sentAt: "2026-11-01T10:00:00.000Z",
    deliveredAt: "2026-11-01T10:00:00.000Z",
    readAt: null,
    createdAt: "2026-11-01T10:00:00.000Z",
  };
}

function pendingRequest(friendId) {
  return {
    id: `clear-${friendId}`,
    conversationId: `conversation-${friendId}`,
    requesterId: SELF,
    recipientId: friendId,
    requesterUsername: "Me",
    status: "pending",
    createdAt: "2026-11-01T12:00:00.000Z",
    respondedAt: null,
  };
}

function responseFor(friendId, messages) {
  return {
    conversationId: `conversation-${friendId}`,
    messages,
    hasMessages: messages.length > 0,
    hasMore: false,
    nextCursor: null,
    clearedAt: null,
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
  responses = {
    [emptyFriend.id]: responseFor(emptyFriend.id, []),
    [chattyFriend.id]: responseFor(chattyFriend.id, [
      message("m1", chattyFriend.id, "Hello"),
      message("m2", chattyFriend.id, "Still here"),
    ]),
  };
  clearStates = {
    [emptyFriend.id]: { request: null, outcome: null },
    [chattyFriend.id]: { request: null, outcome: null },
  };
  requestCalls = [];
  clearForMeCalls = [];
  cancelCalls = [];

  chatApi.listMessages = async (friendId, options = {}) => {
    const response = responses[friendId];
    return options.before
      ? { ...response, messages: [], hasMore: false, nextCursor: null }
      : response;
  };
  chatApi.getClearState = async (friendId) => (
    clearStates[friendId] || { request: null, outcome: null }
  );
  chatApi.markRead = async (friendId) => ({
    conversationId: `conversation-${friendId}`,
    readAt: new Date().toISOString(),
    messageIds: [],
  });
  chatApi.clearForMe = async (friendId) => {
    clearForMeCalls.push(friendId);
    return {
      scope: "me",
      conversationId: `conversation-${friendId}`,
      clearedAt: new Date().toISOString(),
    };
  };
  chatApi.requestClearForBoth = async (friendId) => {
    requestCalls.push(friendId);
    const request = pendingRequest(friendId);
    clearStates[friendId] = { request, outcome: null };
    return { request };
  };
  chatApi.cancelClearRequest = async (requestId) => {
    cancelCalls.push(requestId);
    const friendId = requestId.replace(/^clear-/, "");
    const request = { ...clearStates[friendId].request, status: "cancelled" };
    clearStates[friendId] = { request: null, outcome: null };
    return { request };
  };
});

async function mount(friend) {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await renderFriend(friend);
}

async function renderFriend(friend) {
  await act(async () => {
    root.render(React.createElement(ChatModal, {
      friend,
      currentUserId: SELF,
      onClose: () => {},
    }));
  });
  await act(async () => { await flushed(); });
}

function q(selector) {
  return document.querySelector(selector);
}

function qa(selector) {
  return [...document.querySelectorAll(selector)];
}

async function click(node) {
  await act(async () => {
    node.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

async function openMenu() {
  await click(q(".chat-menu-trigger"));
}

function clearItem() {
  return q('[role="menuitem"]');
}

function bannerButton(label) {
  return qa(".chat-clear-banner button")
    .find((node) => node.textContent.trim() === label);
}

async function closeMenu() {
  if (q(".chat-menu-list")) await openMenu();
}

test("an empty conversation disables Clear Chat and never calls an API", async () => {
  await mount(emptyFriend);
  await openMenu();

  const item = clearItem();
  assert.ok(item, "the Clear Chat menu item is still rendered");
  assert.equal(item.textContent.trim(), "Clear Chat");
  assert.equal(item.disabled, true);
  assert.equal(item.getAttribute("aria-disabled"), "true");
  assert.match(item.title, /no messages to clear/i);

  await click(item);
  assert.equal(q(".confirm-dialog"), null, "clicking does nothing");
  assert.deepEqual(requestCalls, [], "no both-sides request is sent");
  assert.deepEqual(clearForMeCalls, [], "no clear-for-me request is sent");

  await root.unmount();
});

test("a conversation with messages keeps Clear Chat enabled", async () => {
  await mount(chattyFriend);
  await openMenu();

  const item = clearItem();
  assert.equal(item.disabled, false);
  assert.equal(item.getAttribute("aria-disabled"), "false");
  await click(item);
  assert.ok(q(".confirm-dialog"), "the confirmation opens for a non-empty chat");

  await root.unmount();
});

test("clearing the last visible messages disables Clear Chat again", async () => {
  await mount(chattyFriend);
  await openMenu();
  await click(clearItem());
  assert.ok(q(".confirm-dialog"));

  // Leave the both-ends checkbox unchecked: this clears only this viewer.
  await click(q(".confirm-dialog-button--confirm"));
  await act(async () => { await flushed(); });

  assert.deepEqual(clearForMeCalls, [chattyFriend.id]);
  assert.equal(qa(".chat-message-row").length, 0, "the viewer no longer sees messages");
  assert.equal(q(".confirm-dialog"), null);

  await openMenu();
  const item = clearItem();
  assert.equal(item.disabled, true, "zero visible messages disables the option");
  assert.match(item.title, /no messages to clear/i);
  await click(item);
  assert.equal(q(".confirm-dialog"), null);
  assert.deepEqual(requestCalls, [], "no Clear Chat request is sent");

  await root.unmount();
});

test("sending a request immediately disables the option and rapid clicks send once", async () => {
  let resolveRequest;
  chatApi.requestClearForBoth = (friendId) => {
    requestCalls.push(friendId);
    return new Promise((resolve) => {
      resolveRequest = () => {
        const request = pendingRequest(friendId);
        clearStates[friendId] = { request, outcome: null };
        resolve({ request });
      };
    });
  };

  await mount(chattyFriend);
  await openMenu();
  await click(clearItem());
  await act(async () => { q('.confirm-dialog input[type="checkbox"]').click(); });

  const confirm = q(".confirm-dialog-button--confirm");
  await act(async () => {
    confirm.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    confirm.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  assert.deepEqual(requestCalls, [chattyFriend.id], "the second tap is ignored");

  resolveRequest();
  await act(async () => { await flushed(); });
  assert.ok(q(".chat-clear-banner--pending"), "the pending card appears");

  await openMenu();
  const item = clearItem();
  assert.equal(item.disabled, true, "the menu is disabled while the request is pending");
  assert.match(item.title, /already pending/i);
  await click(item);
  assert.equal(q(".confirm-dialog"), null, "a second confirmation cannot be opened");
  assert.deepEqual(requestCalls, [chattyFriend.id], "no duplicate request is sent");

  await root.unmount();
});

test("a pending request disables the option and cancelling it re-enables it when messages remain", async () => {
  clearStates[chattyFriend.id] = {
    request: pendingRequest(chattyFriend.id),
    outcome: null,
  };

  await mount(chattyFriend);
  await openMenu();
  assert.equal(clearItem().disabled, true, "the persisted pending request disables the menu");
  await closeMenu();

  await click(bannerButton("Cancel request"));
  await act(async () => { await flushed(); });
  assert.deepEqual(cancelCalls, [`clear-${chattyFriend.id}`]);
  assert.equal(q(".chat-clear-banner"), null);

  await openMenu();
  const item = clearItem();
  assert.equal(item.disabled, false, "messages still exist, so Clear Chat is usable again");
  await click(item);
  assert.ok(q(".confirm-dialog"));

  await root.unmount();
});

test("switching conversations does not leak the previous Clear Chat state", async () => {
  await mount(emptyFriend);
  await openMenu();
  assert.equal(clearItem().disabled, true);

  await renderFriend(chattyFriend);
  await openMenu();
  assert.equal(clearItem().disabled, false, "the non-empty conversation is independent");
  await closeMenu();

  await renderFriend(emptyFriend);
  await openMenu();
  assert.equal(clearItem().disabled, true, "going back restores the empty state");

  await root.unmount();
});

test("the disabled menu item keeps the existing layout and has a visible disabled style", async () => {
  const css = await readFile(
    new URL("../src/chat/ChatModal.css", import.meta.url),
    "utf8",
  );
  const block = css.match(/\.chat-menu-item:disabled[^{]*\{([^}]*)\}/);
  assert.ok(block, "the menu item has a disabled CSS rule");
  const opacity = Number((block[1].match(/opacity:\s*([\d.]+)/) || [])[1]);
  assert.ok(opacity > 0 && opacity < 1, "disabled opacity is reduced but still readable");
  assert.match(block[1], /cursor:\s*not-allowed/);
});
