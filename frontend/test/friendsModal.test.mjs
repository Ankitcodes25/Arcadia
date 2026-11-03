// FriendsModal behaviour: tab order and in-place switching, verified online
// grouping, incoming-request actions, debounced search and send-request state.
// The friends API is stubbed at the module object the modal calls through.
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
let FriendsModal;
let PlayerProfileModal;
let Navbar;
let AuthContext;
let friendsApi;
let chatApi;
let authApi;
let setAccessToken;
let originalGetPublicPlayerProfile;

let closedCount;
let incomingCounts;
let acceptCalls;
let sendCalls;
let searchCalls;
let listFriendsCalls;
let requestsState;
let searchResults;
let relationshipState;
let chatMessages;
let chatReadCalls;
let chatSendCalls;
let chatSendError;
let clearState;
let clearCalls;
let friendActionCalls;
let friendActionError;
let removedFriendIds;
let blockedPlayers;
let listBlockedCalls;
let unblockCalls;
let unblockError;
let blockedListError;

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

function player(id, username, online, extra = {}) {
  return {
    id,
    username,
    playerId: `ARC-${id.padEnd(8, "X").slice(0, 8).toUpperCase()}`,
    avatar: { type: "local", value: "avatar-02" },
    avatarUrl: null,
    online,
    ...extra,
  };
}

function blockedPlayer(id, username, extra = {}) {
  return player(id, username, false, {
    blockedAt: "2026-10-01T00:00:00.000Z",
    ...extra,
  });
}

function clearRequestFixture(overrides = {}) {
  return {
    id: "clear-1",
    conversationId: "conversation-online",
    requesterId: "player-online",
    recipientId: "player-self",
    requesterUsername: "ZedOnline",
    status: "pending",
    createdAt: new Date().toISOString(),
    respondedAt: null,
    ...overrides,
  };
}

function defaultRequests() {
  return {
    incoming: [{
      id: "request-1",
      createdAt: new Date().toISOString(),
      user: player("player-knight", "ArcadeDevKnight", false),
    }],
    outgoing: [{
      id: "request-2",
      createdAt: new Date().toISOString(),
      user: player("player-oracle", "ArcadeDevOracle", true),
    }],
    incomingCount: 1,
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
  FriendsModal = (await vite.ssrLoadModule("/src/friends/FriendsModal.tsx")).default;
  PlayerProfileModal = (await vite.ssrLoadModule("/src/components/PlayerProfileModal.tsx")).default;
  Navbar = (await vite.ssrLoadModule("/src/components/Navbar.tsx")).default;
  AuthContext = (await vite.ssrLoadModule("/src/auth/AuthContext.tsx")).default;
  ({ friendsApi } = await vite.ssrLoadModule("/src/friends/friendsApi.ts"));
  ({ chatApi } = await vite.ssrLoadModule("/src/chat/chatApi.ts"));
  ({ setAccessToken, authApi } = await vite.ssrLoadModule("/src/auth/authApi.ts"));
  originalGetPublicPlayerProfile = authApi.getPublicPlayerProfile;
});

after(async () => {
  if (authApi && originalGetPublicPlayerProfile) {
    authApi.getPublicPlayerProfile = originalGetPublicPlayerProfile;
  }
  await vite?.close();
  console.error = originalConsoleError;
});

beforeEach(() => {
  setAccessToken?.(null);
  closedCount = 0;
  incomingCounts = [];
  acceptCalls = [];
  sendCalls = [];
  searchCalls = [];
  listFriendsCalls = 0;
  requestsState = defaultRequests();
  relationshipState = {
    status: "NONE",
    requestId: null,
    blockedByMe: false,
    blockedMe: false,
    friendSince: null,
  };
  searchResults = [{
    ...player("player-oracle", "ArcadeDevOracle", false),
    relationship: {
      status: "NONE",
      requestId: null,
      blockedByMe: false,
      blockedMe: false,
      friendSince: null,
    },
  }];
  chatMessages = [];
  chatReadCalls = [];
  chatSendCalls = [];
  chatSendError = null;
  clearState = { request: null, outcome: null };
  clearCalls = [];
  friendActionCalls = [];
  friendActionError = null;
  removedFriendIds = new Set();
  blockedPlayers = [];
  listBlockedCalls = 0;
  unblockCalls = [];
  unblockError = null;
  blockedListError = null;

  chatApi.getClearState = async () => clearState;
  chatApi.clearForMe = async (friendId) => {
    clearCalls.push({ action: "me", friendId });
    chatMessages = [];
    return { scope: "me", conversationId: "conversation-online", clearedAt: new Date().toISOString() };
  };
  chatApi.requestClearForBoth = async (friendId) => {
    clearCalls.push({ action: "both", friendId });
    const request = clearRequestFixture({ requesterId: "player-self", recipientId: friendId, requesterUsername: "Me" });
    clearState = { request, outcome: null };
    return { request };
  };
  chatApi.acceptClearRequest = async (requestId) => {
    clearCalls.push({ action: "accept", requestId });
    chatMessages = [];
    const request = { ...clearState.request, status: "accepted" };
    clearState = { request: null, outcome: null };
    return { request, conversationId: "conversation-online", deletedCount: 2 };
  };
  chatApi.declineClearRequest = async (requestId) => {
    clearCalls.push({ action: "decline", requestId });
    const request = { ...clearState.request, status: "declined" };
    clearState = { request: null, outcome: null };
    return { request };
  };
  chatApi.cancelClearRequest = async (requestId) => {
    clearCalls.push({ action: "cancel", requestId });
    const request = { ...clearState.request, status: "cancelled" };
    clearState = { request: null, outcome: null };
    return { request };
  };
  chatApi.acknowledgeClearRequest = async (requestId) => {
    clearCalls.push({ action: "acknowledge", requestId });
    clearState = { ...clearState, outcome: null };
    return { acknowledged: true };
  };
  friendsApi.removeFriend = async (userId) => {
    friendActionCalls.push({ action: "remove", userId });
    if (friendActionError) throw friendActionError;
    removedFriendIds.add(userId);
    return { relationship: { status: "NONE", requestId: null, blockedByMe: false, blockedMe: false, friendSince: null } };
  };
  friendsApi.blockUser = async (userId) => {
    friendActionCalls.push({ action: "block", userId });
    if (friendActionError) throw friendActionError;
    removedFriendIds.add(userId);
    const target = player("player-online", "ZedOnline", false);
    if (!blockedPlayers.some((blocked) => blocked.id === userId)) {
      blockedPlayers = [
        { ...(userId === target.id ? target : player(userId, "Blocked Player", false)), blockedAt: new Date().toISOString() },
        ...blockedPlayers,
      ];
    }
    return { relationship: { status: "BLOCKED", requestId: null, blockedByMe: true, blockedMe: false, friendSince: null } };
  };

  friendsApi.listBlocked = async () => {
    listBlockedCalls += 1;
    if (blockedListError) throw blockedListError;
    return { blocked: blockedPlayers };
  };
  friendsApi.unblockUser = async (userId) => {
    unblockCalls.push(userId);
    if (unblockError) throw unblockError;
    blockedPlayers = blockedPlayers.filter((blocked) => blocked.id !== userId);
    return {
      relationship: {
        status: "NONE",
        requestId: null,
        blockedByMe: false,
        blockedMe: false,
        friendSince: null,
      },
    };
  };

  friendsApi.listFriends = async () => {
    listFriendsCalls += 1;
    return {
      friends: [
        player("player-online", "ZedOnline", true, { friendsSince: "2026-01-01T00:00:00.000Z" }),
        player("player-offline", "AmyOffline", false, { friendsSince: "2026-02-01T00:00:00.000Z" }),
      ].filter((friend) => !removedFriendIds.has(friend.id)),
    };
  };
  friendsApi.listRequests = async () => requestsState;
  friendsApi.searchPlayers = async (query) => {
    searchCalls.push(query);
    return { players: searchResults };
  };
  friendsApi.acceptRequest = async (requestId) => {
    acceptCalls.push(requestId);
    requestsState = { incoming: [], outgoing: requestsState.outgoing, incomingCount: 0 };
    return {
      relationship: {
        status: "FRIENDS",
        requestId: null,
        blockedByMe: false,
        blockedMe: false,
        friendSince: new Date().toISOString(),
      },
      friend: player("player-knight", "ArcadeDevKnight", false, { friendsSince: new Date().toISOString() }),
    };
  };
  friendsApi.sendRequest = async (userId) => {
    sendCalls.push(userId);
    relationshipState = {
      status: "OUTGOING_PENDING",
      requestId: "request-3",
      blockedByMe: false,
      blockedMe: false,
      friendSince: null,
    };
    searchResults = searchResults.map((result) => result.id === userId
      ? {
        ...result,
        relationship: {
          status: "OUTGOING_PENDING",
          requestId: "request-3",
          blockedByMe: false,
          blockedMe: false,
          friendSince: null,
        },
      }
      : result);
    return {
      relationship: {
        status: "OUTGOING_PENDING",
        requestId: "request-3",
        blockedByMe: false,
        blockedMe: false,
        friendSince: null,
      },
      request: { id: "request-3", createdAt: new Date().toISOString() },
    };
  };
  friendsApi.rejectRequest = async () => ({ relationship: { status: "NONE", requestId: null, blockedByMe: false, blockedMe: false, friendSince: null } });
  friendsApi.cancelRequest = async () => ({ relationship: { status: "NONE", requestId: null, blockedByMe: false, blockedMe: false, friendSince: null } });
  friendsApi.blockRequest = async () => ({ relationship: { status: "BLOCKED", requestId: null, blockedByMe: true, blockedMe: false, friendSince: null } });
  friendsApi.getRelationship = async () => ({ relationship: relationshipState });
  friendsApi.getSummary = async () => ({
    incomingCount: requestsState.incomingCount,
    unreadMessageCount: 0,
  });
  friendsApi.heartbeat = async () => ({ online: true, checkedAt: new Date().toISOString() });

  chatApi.listConversations = async () => ({
    conversations: [{
      id: "conversation-online",
      friend: player("player-online", "ZedOnline", true, { friendsSince: "2026-01-01T00:00:00.000Z" }),
      lastMessage: "See you in the arena",
      lastMessageAt: new Date().toISOString(),
      lastMessageFromMe: false,
      unreadCount: 3,
    }],
  });
  chatApi.listMessages = async (friendId, options = {}) => ({
    messages: options.before ? [] : chatMessages,
    hasMore: false,
    nextCursor: null,
  });
  chatApi.markRead = async (friendId) => {
    chatReadCalls.push(friendId);
    return {
      conversationId: "conversation-online",
      readAt: new Date().toISOString(),
      messageIds: chatMessages
        .filter((message) => message.senderId === friendId)
        .map((message) => message.id),
    };
  };
  chatApi.sendMessage = async (friendId, text) => {
    chatSendCalls.push({ friendId, text });
    if (chatSendError) throw chatSendError;
    const message = {
      id: `sent-${chatSendCalls.length}`,
      conversationId: "conversation-online",
      senderId: "player-self",
      receiverId: friendId,
      text,
      status: "SENT",
      readAt: null,
      createdAt: new Date().toISOString(),
    };
    chatMessages = [...chatMessages, message];
    return { message };
  };
});

async function renderModal() {
  await act(async () => { root?.unmount(); });
  document.body.innerHTML = "";
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const onClose = () => { closedCount += 1; };
  const onIncomingCountChange = (count) => { incomingCounts.push(count); };
  await act(async () => {
    root.render(React.createElement(FriendsModal, {
      currentUserId: "player-self",
      onClose,
      onIncomingCountChange,
    }));
  });
  return () => act(async () => root.unmount());
}

function navbarUser() {
  return {
    id: "player-self",
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
      totalXp: 0,
      level: 0,
      currentLevelXp: 0,
      nextLevelXp: 100,
      progressPercent: 0,
      title: "Arcadia Rookie",
      badgeKey: "bronze",
      themeKey: "bronze",
    },
    role: "USER",
    status: "ACTIVE",
    createdAt: "2024-03-15T08:00:00.000Z",
    updatedAt: null,
    lastLoginAt: null,
  };
}

function authValue(user = navbarUser()) {
  return {
    user,
    isAuthenticated: true,
    isLoading: false,
    isSubmitting: false,
    authError: null,
    authErrorKind: null,
    authMode: null,
    openAuthMode: () => {},
    closeAuthMode: () => {},
    clearError: () => {},
    login: async () => true,
    register: async () => true,
    forgotPassword: async () => "sent",
    loginWithGoogle: () => {},
    logout: async () => ({ success: true }),
  };
}

async function renderNavbar() {
  await act(async () => { root?.unmount(); });
  document.body.innerHTML = "";
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(
      AuthContext.Provider,
      { value: authValue() },
      React.createElement(Navbar),
    ));
  });
  return () => act(async () => root.unmount());
}

function publicProfile() {
  return {
    id: "player-knight",
    username: "ArcadeDevKnight",
    playerId: "ARC-C2ME3CFA",
    avatar: { type: "local", value: "avatar-04" },
    avatarUrl: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    completedMatches: 1,
    progression: {
      totalXp: 120,
      level: 1,
      currentLevelXp: 20,
      nextLevelXp: 100,
      progressPercent: 20,
      title: "Rookie",
      badgeKey: "rookie",
      themeKey: "rookie",
    },
  };
}

async function renderProfile() {
  await act(async () => { root?.unmount(); });
  document.body.innerHTML = "";
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(PlayerProfileModal, {
      playerId: "player-knight",
      currentUserId: "player-self",
      onClose: () => { closedCount += 1; },
    }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return () => act(async () => root.unmount());
}

function q(selector) { return document.querySelector(selector); }
function qa(selector) { return [...document.querySelectorAll(selector)]; }

function click(node) {
  return act(async () => {
    node.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function button(label) {
  return qa("button").find((node) => node.textContent.trim().includes(label));
}

function setTextInput(field, value) {
  return act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(field, value);
    field.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

function setTextareaInput(field, value) {
  return act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    setter.call(field, value);
    field.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

function flush(ms = 0) {
  return act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
}

async function settleSearch() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 420)); });
}

test("the modal opens on Friends, shows online friends first, and keeps tab state", async () => {
  const unmount = await renderModal();
  await flush();
  assert.equal(listBlockedCalls, 0, "the Blocked list waits until its tab is opened");

  const tabs = qa('[role="tab"]');
  assert.deepEqual(
    tabs.map((tab) => tab.textContent.replace(/\d+/g, "").trim()),
    ["Friends", "Requests", "Find Friends", "Blocked"],
    "tabs are ordered Friends, Requests, Find Friends, Blocked",
  );
  assert.equal(q(".friends-tab--active").textContent.includes("Friends"), true);
  assert.equal(q("#friends-panel-friends").getAttribute("aria-hidden"), "false");

  const names = [...q("#friends-panel-friends").querySelectorAll(".friends-card-name")]
    .map((node) => node.textContent);
  assert.deepEqual(names, ["ZedOnline", "AmyOffline"], "online friends render above offline friends");
  assert.ok(q("#friends-panel-friends .friends-presence--online"));
  assert.ok(q("#friends-panel-friends .friends-presence--offline"));
  assert.equal(qa("#friends-panel-friends .friends-card-list").length, 1, "friends use one continuous list");
  assert.equal(q("#friends-panel-friends").textContent.includes("Online Friends"), false);
  assert.equal(q("#friends-panel-friends").textContent.includes("Offline Friends"), false);
  const friendCards = qa("#friends-panel-friends .friends-card");
  assert.equal(friendCards[0].querySelector(".friends-card-meta").textContent.trim(), "Online");
  assert.equal(
    friendCards[1].querySelector(".friends-card-meta").textContent.trim(),
    "Offline · Friends since Feb 2026",
  );
  const chatButtons = qa("#friends-panel-friends .friends-chat-button");
  assert.equal(chatButtons.length, 2, "every accepted friend has a Chat button");
  assert.equal(chatButtons[0].textContent.trim(), "3", "the specific friend shows its own unread count");
  assert.equal(chatButtons[1].textContent.trim(), "", "friends without unread messages show no count");
  assert.deepEqual(incomingCounts, [1], "the navbar count receives the backend incoming count");

  const friendsLoads = listFriendsCalls;
  await click(button("Friends"));
  assert.equal(listFriendsCalls, friendsLoads, "clicking the active tab does not reset the tab state");

  await click(button("Requests"));
  assert.equal(q("#friends-panel-requests").getAttribute("aria-hidden"), "false");
  assert.ok(q(".friends-request-card"));
  assert.equal(button("Accept") != null, true);

  await click(q(".friends-close"));
  assert.equal(closedCount, 1, "the close control calls onClose");

  await unmount();
});

test("the friend Chat button opens the chat modal, sends text and preserves a failed draft", async () => {
  const today = new Date();
  const yesterday = new Date(today.getTime() - (24 * 60 * 60 * 1000));
  chatMessages = [
    {
      id: "chat-in-1",
      conversationId: "conversation-online",
      senderId: "player-online",
      receiverId: "player-self",
      text: "Hello from Zed",
      status: "READ",
      readAt: yesterday.toISOString(),
      createdAt: yesterday.toISOString(),
    },
    {
      id: "chat-out-1",
      conversationId: "conversation-online",
      senderId: "player-self",
      receiverId: "player-online",
      text: "Hello back",
      status: "READ",
      readAt: today.toISOString(),
      createdAt: today.toISOString(),
    },
  ];

  const unmount = await renderModal();
  await flush();
  await click(qa("#friends-panel-friends .friends-chat-button")[0]);
  await flush(20);

  assert.ok(q(".chat-modal"), "the Chat button opens the one-to-one chat modal");
  assert.equal(q("#chat-modal-title").textContent, "ZedOnline");
  assert.ok(q(".chat-header .friends-presence--online"), "the header uses the backend presence value");
  assert.equal(qa(".chat-message-row--friend").length, 1, "the friend's message is aligned left");
  assert.equal(qa(".chat-message-row--mine").length, 1, "the current user's message is aligned right");
  assert.equal(qa(".chat-date-separator").length, 2, "date separators are shown when the calendar date changes");
  assert.ok(q(".chat-message-status--read"), "read receipts are visible on the sender's messages");
  assert.deepEqual(chatReadCalls, ["player-online"], "opening the conversation marks it read");

  const input = q(".chat-input");
  assert.equal(q(".chat-send-button").disabled, true, "empty messages cannot be sent");
  await setTextareaInput(input, "Ready to play");
  assert.equal(q(".chat-send-button").disabled, false);
  await click(q(".chat-send-button"));
  await flush(10);

  assert.deepEqual(chatSendCalls.map((call) => call.text), ["Ready to play"]);
  assert.equal(q(".chat-input").value, "", "the input clears only after a successful send");
  assert.equal(q(".chat-messages").textContent.includes("Ready to play"), true);

  chatSendError = new Error("Network unavailable");
  await setTextareaInput(q(".chat-input"), "Keep this draft");
  await click(q(".chat-send-button"));
  await flush(10);
  assert.equal(q(".chat-input").value, "Keep this draft", "a failed send preserves the draft");
  assert.ok(q(".chat-send-error"), "a failed send shows an inline error");

  await click(q(".chat-close"));
  assert.equal(q(".chat-modal"), null);
  assert.ok(q(".friends-modal"), "closing chat returns to the still-open Friends modal");

  await unmount();
});

test("outgoing messages show distinct sent, delivered and read ticks", async () => {
  const now = Date.now();
  const base = {
    conversationId: "conversation-online",
    senderId: "player-self",
    receiverId: "player-online",
    text: "Tick check",
  };
  chatMessages = [
    {
      ...base,
      id: "tick-sent",
      status: "SENT",
      sentAt: new Date(now - 3000).toISOString(),
      deliveredAt: null,
      readAt: null,
      createdAt: new Date(now - 3000).toISOString(),
    },
    {
      ...base,
      id: "tick-delivered",
      status: "DELIVERED",
      sentAt: new Date(now - 2000).toISOString(),
      deliveredAt: new Date(now - 1500).toISOString(),
      readAt: null,
      createdAt: new Date(now - 2000).toISOString(),
    },
    {
      ...base,
      id: "tick-read",
      status: "READ",
      sentAt: new Date(now - 1000).toISOString(),
      deliveredAt: new Date(now - 500).toISOString(),
      readAt: new Date(now).toISOString(),
      createdAt: new Date(now - 1000).toISOString(),
    },
  ];

  const unmount = await renderModal();
  await flush();
  await click(qa("#friends-panel-friends .friends-chat-button")[0]);
  await flush(20);

  assert.equal(qa(".chat-message-status").length, 3, "only the sender sees ticks");
  const sent = q(".chat-message-status--sent");
  const delivered = q(".chat-message-status--delivered");
  const read = q(".chat-message-status--read");
  assert.ok(sent, "sent messages use the single-tick state");
  assert.ok(delivered, "delivered messages use the double-tick state");
  assert.ok(read, "read messages use the bright double-tick state");
  assert.equal(sent.getAttribute("title"), "Sent");
  assert.equal(delivered.getAttribute("title"), "Delivered");
  assert.equal(read.getAttribute("title"), "Read");
  assert.equal(qa(".chat-message-status svg").length, 3);

  await unmount();
});

test("scrolling to the top loads older messages through the cursor", async () => {
  const today = new Date();
  const yesterday = new Date(today.getTime() - (24 * 60 * 60 * 1000));
  const latest = [{
    id: "chat-new",
    conversationId: "conversation-online",
    senderId: "player-online",
    receiverId: "player-self",
    text: "Newer message",
    status: "DELIVERED",
    readAt: null,
    createdAt: today.toISOString(),
  }];
  const older = [{
    id: "chat-old",
    conversationId: "conversation-online",
    senderId: "player-online",
    receiverId: "player-self",
    text: "Older message",
    status: "READ",
    readAt: yesterday.toISOString(),
    createdAt: yesterday.toISOString(),
  }];
  chatMessages = latest;
  chatApi.listMessages = async (friendId, options = {}) => (
    options.before
      ? { messages: older, hasMore: false, nextCursor: null }
      : { messages: latest, hasMore: true, nextCursor: "older-cursor" }
  );

  const unmount = await renderModal();
  await flush();
  await click(qa("#friends-panel-friends .friends-chat-button")[0]);
  await flush(20);
  assert.equal(q(".chat-messages").textContent.includes("Newer message"), true);
  assert.equal(q(".chat-messages").textContent.includes("Older message"), false);

  const messageList = q(".chat-messages");
  await act(async () => {
    messageList.scrollTop = 0;
    messageList.dispatchEvent(new window.Event("scroll", { bubbles: true }));
  });
  await flush(20);
  assert.equal(q(".chat-messages").textContent.includes("Older message"), true);

  await unmount();
});

test("the Friends navbar dot includes persisted unread chat messages", async () => {
  setAccessToken("test-access-token");
  requestsState = { incoming: [], outgoing: [], incomingCount: 0 };
  friendsApi.getSummary = async () => ({ incomingCount: 0, unreadMessageCount: 2 });

  const unmount = await renderNavbar();
  await flush();

  const friendsNav = q(".navbar-friends-nav");
  assert.ok(q(".navbar-friends-dot"), "unread messages light the existing Friends dot");
  assert.equal(
    friendsNav.getAttribute("aria-label").includes("2 unread messages"),
    true,
    "the accessible label distinguishes unread messages from requests",
  );

  await unmount();
  setAccessToken(null);
});

test("accepting an incoming request updates requests, friends and the badge", async () => {
  const unmount = await renderModal();
  await click(button("Requests"));

  await click(button("Accept"));
  assert.deepEqual(acceptCalls, ["request-1"], "the exact incoming request id is accepted");
  assert.equal(q(".friends-feedback--success")?.textContent.includes("now friends"), true);
  assert.equal(incomingCounts.at(-1), 0, "the notification count updates after acceptance");
  assert.equal(qa(".friends-request-card").length, 1, "only the sent request remains");

  await unmount();
});

test("search is debounced, sends a request, and renders the confirmed Request Sent state", async () => {
  const unmount = await renderModal();
  await click(button("Find Friends"));

  const input = q(".friends-search-input");
  await setTextInput(input, "Knight");
  assert.deepEqual(searchCalls, [], "search waits for the debounce");
  await settleSearch();
  assert.deepEqual(searchCalls, ["Knight"]);
  assert.equal(q("#friends-panel-find .friends-card-name").textContent, "ArcadeDevOracle");

  await click(q(".friends-status-button"));
  assert.deepEqual(sendCalls, ["player-oracle"]);
  assert.equal(q(".friends-status-button").textContent.includes("Request Sent"), true);
  assert.equal(q(".friends-feedback--success")?.textContent.includes("Friend request sent"), true);

  await click(q(".friends-search-clear"));
  assert.equal(q(".friends-search-input").value, "", "the clear button empties the query");
  assert.ok(q(".friends-empty--search"), "clearing returns to the search prompt");
  assert.deepEqual(searchCalls, ["Knight"], "clearing does not issue another search");

  await unmount();
});

test("the Friends nav item carries the request dot and opens the same modal", async () => {
  setAccessToken("test-access-token");
  const unmount = await renderNavbar();

  const navItems = qa(".navbar-nav [data-nav-item]").map((item) => item.dataset.navItem);
  assert.deepEqual(navItems, ["home", "games", "popular", "about", "friends"]);
  assert.equal(q(".navbar-friends-button"), null, "the old square Friends button is gone");

  const friendsNav = q(".navbar-friends-nav");
  assert.ok(friendsNav, "the authenticated navbar has a Friends nav item");
  assert.equal(friendsNav.textContent.trim(), "Friends");
  assert.equal(friendsNav.querySelector("svg"), null, "the Friends nav item is text-only");
  assert.equal(friendsNav.getAttribute("aria-label").includes("1 pending friend request"), true);
  assert.ok(q(".navbar-friends-dot"), "the nav item shows a notification dot");
  assert.equal(friendsNav.classList.contains("active"), false);

  await click(friendsNav);
  assert.ok(q(".friends-modal"), "the navbar opens the shared Friends modal");
  assert.equal(friendsNav.classList.contains("active"), true, "Friends is active while the modal is open");
  assert.equal(q("#friends-panel-friends").getAttribute("aria-hidden"), "false");
  assert.equal(q(".friends-tab--active").textContent.includes("Friends"), true);

  await click(button("Requests"));
  await click(button("Accept"));
  assert.deepEqual(acceptCalls, ["request-1"]);
  assert.equal(q(".navbar-friends-dot"), null, "accepting clears the navbar dot immediately");

  await click(q(".friends-close"));
  assert.equal(q(".navbar-friends-nav").classList.contains("active"), false);

  await unmount();
  setAccessToken(null);
});

test("the player profile sends a friend request and locks into the confirmed state", async () => {
  authApi.getPublicPlayerProfile = async () => ({ profile: publicProfile() });

  const unmount = await renderProfile();
  const button = q(".player-profile-friend-button");
  assert.ok(button, "the profile shows a relationship control");
  assert.equal(button.textContent.includes("Add Friend"), true);

  await click(button);
  assert.deepEqual(sendCalls, ["player-knight"]);
  assert.equal(q(".player-profile-friend-button").textContent.includes("Friend Request Sent"), true);
  assert.equal(q(".player-profile-friend-button").disabled, true);

  await unmount();
});

/* ---------------- Friends badge, ticks, remove/block and clear chat ---------------- */

const FRIENDS_RELATIONSHIP = {
  status: "FRIENDS",
  requestId: null,
  blockedByMe: false,
  blockedMe: false,
  friendSince: "2026-01-01T00:00:00.000Z",
};

function pressKey(key) {
  return act(async () => {
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

async function openChatWithZed() {
  await click(qa("#friends-panel-friends .friends-chat-button")[0]);
  await flush(20);
}

function ownMessage(id, text, minutesAgo) {
  const at = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  return {
    id,
    conversationId: "conversation-online",
    senderId: "player-self",
    receiverId: "player-online",
    text,
    status: "DELIVERED",
    sentAt: at,
    deliveredAt: at,
    readAt: null,
    createdAt: at,
  };
}

// The Requests tab stays mounted (hidden), so its Accept/Cancel buttons exist
// too; these helpers only ever press the confirmation dialog or the chat card.
function dialogButton(label) {
  return [...document.querySelectorAll(".confirm-dialog-actions button")]
    .find((node) => node.textContent.trim() === label);
}

function bannerButton(label) {
  return [...document.querySelectorAll(".chat-clear-banner button")]
    .find((node) => node.textContent.trim() === label);
}

function withClearRequestOnZed(request) {
  const original = chatApi.listConversations;
  chatApi.listConversations = async () => {
    const response = await original();
    return {
      conversations: response.conversations.map((row) => ({ ...row, clearRequest: request })),
    };
  };
}

test("the profile Friends badge shows a single tick on the left", async () => {
  authApi.getPublicPlayerProfile = async () => ({ profile: publicProfile() });
  relationshipState = FRIENDS_RELATIONSHIP;

  const unmount = await renderProfile();
  const badge = q(".player-profile-friend-button--friends");
  assert.ok(badge, "an accepted friendship shows the Friends badge");
  assert.equal(badge.textContent.trim(), "Friends", "the label has no trailing tick character");
  assert.equal(badge.textContent.includes("✓"), false);
  assert.equal(badge.querySelectorAll("svg").length, 1, "exactly one tick icon");
  assert.equal(badge.firstElementChild.tagName.toLowerCase(), "svg", "and it sits left of the label");

  await unmount();
});

test("double ticks draw two complete, separate check marks and single ticks one", async () => {
  chatMessages = [
    { ...ownMessage("tick-a", "Sent one", 2), status: "SENT", deliveredAt: null },
    ownMessage("tick-b", "Delivered one", 1),
  ];
  const unmount = await renderModal();
  await flush();
  await openChatWithZed();

  const sent = q(".chat-message-status--sent svg");
  const delivered = q(".chat-message-status--delivered svg");
  assert.equal(sent.querySelectorAll("path").length, 1, "SENT is one tick");
  assert.equal(delivered.querySelectorAll("path").length, 2, "DELIVERED is two ticks");
  assert.equal(
    sent.getAttribute("viewBox"),
    delivered.getAttribute("viewBox"),
    "both states share one box, so the timestamp never shifts",
  );

  await unmount();
});

test("every friend card offers Chat, Remove Friend and Block, each labelled", async () => {
  const unmount = await renderModal();
  await flush();

  const cards = qa("#friends-panel-friends .friends-card");
  assert.equal(cards.length, 2);
  for (const card of cards) {
    const name = card.querySelector(".friends-card-name").textContent;
    const actions = [...card.querySelectorAll(".friends-card-actions button")];
    assert.equal(actions.length, 3, "Chat, Remove Friend and Block");
    assert.match(actions[0].getAttribute("aria-label"), new RegExp(`^Chat with ${name}`));
    assert.equal(actions[1].getAttribute("aria-label"), `Remove ${name} from friends`);
    assert.equal(actions[1].getAttribute("title"), "Remove Friend");
    assert.equal(actions[2].getAttribute("aria-label"), `Block ${name}`);
    assert.equal(actions[2].getAttribute("title"), "Block");
  }

  await unmount();
});

test("Remove Friend asks first; Cancel changes nothing and Proceed removes after the server confirms", async () => {
  const unmount = await renderModal();
  await flush();

  await click(q('[aria-label="Remove AmyOffline from friends"]'));
  const dialog = q(".confirm-dialog");
  assert.ok(dialog, "a confirmation opens instead of removing at once");
  assert.equal(dialog.querySelector(".confirm-dialog-title").textContent, "Remove Friend?");
  assert.equal(
    dialog.querySelector(".confirm-dialog-message").textContent.replace(/\s+/g, " ").trim(),
    "Are you sure you want to remove AmyOffline from your friends?",
  );
  assert.deepEqual(
    [...dialog.querySelectorAll(".confirm-dialog-actions button")].map((node) => node.textContent.trim()),
    ["Cancel", "Proceed"],
  );

  await click(dialogButton("Cancel"));
  assert.equal(q(".confirm-dialog"), null);
  assert.deepEqual(friendActionCalls, [], "Cancel never calls the server");
  assert.equal(qa("#friends-panel-friends .friends-card").length, 2);

  // Escape closes the dialog only, never the Friends modal underneath.
  await click(q('[aria-label="Remove AmyOffline from friends"]'));
  await pressKey("Escape");
  assert.equal(q(".confirm-dialog"), null);
  assert.equal(closedCount, 0, "the Friends modal stays open");

  await click(q('[aria-label="Remove AmyOffline from friends"]'));
  await click(dialogButton("Proceed"));
  await flush();
  assert.deepEqual(friendActionCalls, [{ action: "remove", userId: "player-offline" }]);
  assert.equal(q(".confirm-dialog"), null, "the dialog closes after success");
  assert.deepEqual(
    qa("#friends-panel-friends .friends-card-name").map((node) => node.textContent),
    ["ZedOnline"],
    "the removed friend leaves the list without a refresh",
  );
  assert.match(q(".friends-feedback--success").textContent, /AmyOffline was removed/);
  assert.ok(q(".friends-modal"), "the Friends modal stays open");

  await unmount();
});

test("a failed removal keeps the friend and shows the error in the dialog", async () => {
  friendActionError = new Error("Server unavailable");
  const unmount = await renderModal();
  await flush();

  await click(q('[aria-label="Remove ZedOnline from friends"]'));
  await click(dialogButton("Proceed"));
  await flush();
  assert.ok(q(".confirm-dialog"), "the dialog stays open");
  assert.ok(q(".confirm-dialog-error"), "and explains the failure");
  assert.equal(qa("#friends-panel-friends .friends-card").length, 2, "nobody is removed locally");

  await unmount();
});

test("Block asks first and removes the friend only after the server confirms", async () => {
  const unmount = await renderModal();
  await flush();

  await click(q('[aria-label="Block ZedOnline"]'));
  assert.equal(q(".confirm-dialog-title").textContent, "Block Player?");
  assert.equal(
    q(".confirm-dialog-message").textContent.replace(/\s+/g, " ").trim(),
    "Are you sure you want to block ZedOnline? They will no longer be able to send you friend requests or messages.",
  );
  await click(dialogButton("Cancel"));
  assert.deepEqual(friendActionCalls, []);

  await click(q('[aria-label="Block ZedOnline"]'));
  await click(dialogButton("Proceed"));
  await flush();
  assert.deepEqual(friendActionCalls, [{ action: "block", userId: "player-online" }]);
  assert.deepEqual(
    qa("#friends-panel-friends .friends-card-name").map((node) => node.textContent),
    ["AmyOffline"],
  );
  assert.match(q(".friends-feedback--success").textContent, /ZedOnline has been blocked/);

  await unmount();
});

test("the Blocked tab lists persisted blocks and unblocks only after confirmation", async () => {
  blockedPlayers = [
    blockedPlayer("player-knight", "ArcadeDevKnight"),
    blockedPlayer("player-oracle", "ArcadeDevOracle"),
  ];
  const unmount = await renderModal();
  await flush();

  await click(button("Blocked"));
  await flush();
  assert.equal(q("#friends-panel-blocked").getAttribute("aria-hidden"), "false");
  assert.deepEqual(
    qa("#friends-panel-blocked .friends-card-name").map((node) => node.textContent),
    ["ArcadeDevKnight", "ArcadeDevOracle"],
  );
  const cards = qa("#friends-panel-blocked .friends-card");
  assert.equal(cards.length, 2);
  assert.ok(cards[0].querySelector(".friends-avatar-placeholder"), "each row reuses the friend avatar");
  assert.equal(cards[0].querySelector(".friends-card-player-id").textContent, "ARC-PLAYER-K");
  assert.ok(listBlockedCalls >= 1, "the modal reads the persisted block list");
  assert.equal(qa("#friends-panel-blocked .friends-unblock-button").length, 2);

  await click(q('[aria-label="Unblock ArcadeDevKnight"]'));
  assert.equal(q(".confirm-dialog-title").textContent, "Unblock Player?");
  assert.equal(
    q(".confirm-dialog-message").textContent.replace(/\s+/g, " ").trim(),
    "Are you sure you want to unblock ArcadeDevKnight? They will be able to send you friend requests and messages again.",
  );
  assert.deepEqual(
    [...document.querySelectorAll(".confirm-dialog-actions button")].map((node) => node.textContent.trim()),
    ["Cancel", "Unblock"],
  );

  await click(dialogButton("Cancel"));
  assert.equal(q(".confirm-dialog"), null, "Cancel closes the confirmation");
  assert.deepEqual(unblockCalls, [], "Cancel makes no backend change");
  assert.equal(qa("#friends-panel-blocked .friends-card").length, 2, "the player stays blocked");

  await click(q('[aria-label="Unblock ArcadeDevKnight"]'));
  await click(dialogButton("Unblock"));
  await flush();
  assert.deepEqual(unblockCalls, ["player-knight"]);
  assert.equal(q(".confirm-dialog"), null, "the dialog closes after success");
  assert.deepEqual(
    qa("#friends-panel-blocked .friends-card-name").map((node) => node.textContent),
    ["ArcadeDevOracle"],
    "the unblocked player leaves the list immediately",
  );
  assert.match(q(".friends-feedback--success").textContent, /ArcadeDevKnight has been unblocked/);

  await unmount();
});

test("a failed unblock keeps the player blocked and reports the error in the dialog", async () => {
  blockedPlayers = [blockedPlayer("player-knight", "ArcadeDevKnight")];
  unblockError = new Error("Server unavailable");
  const unmount = await renderModal();
  await flush();

  await click(button("Blocked"));
  await flush();
  await click(q('[aria-label="Unblock ArcadeDevKnight"]'));
  await click(dialogButton("Unblock"));
  await flush();

  assert.ok(q(".confirm-dialog"), "the confirmation stays open");
  assert.match(
    q(".confirm-dialog-error").textContent,
    /Unable to unblock this player\. Please try again\./,
  );
  assert.deepEqual(
    qa("#friends-panel-blocked .friends-card-name").map((node) => node.textContent),
    ["ArcadeDevKnight"],
    "the failed player is still blocked",
  );

  await unmount();
});

test("duplicate unblock confirmations issue one backend request", async () => {
  blockedPlayers = [blockedPlayer("player-knight", "ArcadeDevKnight")];
  let resolveUnblock;
  friendsApi.unblockUser = (userId) => {
    unblockCalls.push(userId);
    return new Promise((resolve) => {
      resolveUnblock = () => {
        blockedPlayers = blockedPlayers.filter((player) => player.id !== userId);
        resolve({
          relationship: {
            status: "NONE",
            requestId: null,
            blockedByMe: false,
            blockedMe: false,
            friendSince: null,
          },
        });
      };
    });
  };

  const unmount = await renderModal();
  await flush();
  await click(button("Blocked"));
  await flush();
  await click(q('[aria-label="Unblock ArcadeDevKnight"]'));

  await act(async () => {
    const confirm = dialogButton("Unblock");
    confirm.click();
    confirm.click();
  });
  assert.deepEqual(unblockCalls, ["player-knight"], "a second confirmation is ignored");

  await act(async () => {
    resolveUnblock();
  });
  await flush();
  assert.equal(q(".confirm-dialog"), null);
  assert.equal(qa("#friends-panel-blocked .friends-card").length, 0);

  await unmount();
});

test("the Blocked tab shows a loading state and then the empty state", async () => {
  let releaseBlockedList;
  friendsApi.listBlocked = () => {
    listBlockedCalls += 1;
    return new Promise((resolve) => {
      releaseBlockedList = resolve;
    });
  };

  const unmount = await renderModal();
  await click(button("Blocked"));
  await flush();
  assert.match(q("#friends-panel-blocked .friends-loading").textContent, /Loading blocked players/);

  await act(async () => {
    releaseBlockedList({ blocked: [] });
  });
  await flush();
  assert.equal(q("#friends-panel-blocked .friends-empty h3").textContent, "No blocked players");
  assert.equal(
    q("#friends-panel-blocked .friends-empty p").textContent,
    "Players you block will appear here.",
  );

  await unmount();
});

test("the Blocked tab reports a fetch failure and retries", async () => {
  blockedListError = new Error("Offline");
  const unmount = await renderModal();
  await flush();

  await click(button("Blocked"));
  await flush();
  assert.match(
    q("#friends-panel-blocked .friends-error").textContent,
    /Unable to load blocked players/,
  );

  blockedListError = null;
  blockedPlayers = [blockedPlayer("player-knight", "ArcadeDevKnight")];
  await click(q("#friends-panel-blocked .friends-error button"));
  await flush();
  assert.deepEqual(
    qa("#friends-panel-blocked .friends-card-name").map((node) => node.textContent),
    ["ArcadeDevKnight"],
  );

  await unmount();
});

test("an incoming Clear Chat Request dots only that friend's Chat button, separately from unread", async () => {
  withClearRequestOnZed(clearRequestFixture());
  const unmount = await renderModal();
  await flush();

  const [zedChat, amyChat] = qa("#friends-panel-friends .friends-chat-button");
  assert.ok(zedChat.querySelector(".friends-chat-request-dot"), "the requester's Chat button has the dot");
  assert.ok(zedChat.querySelector(".friends-chat-unread"), "the unread count still shows independently");
  assert.equal(amyChat.querySelector(".friends-chat-request-dot"), null, "other friends have no dot");
  assert.match(zedChat.getAttribute("aria-label"), /Clear Chat Request/);

  await unmount();
});

test("the requester's own pending request shows no dot", async () => {
  withClearRequestOnZed(clearRequestFixture({ requesterId: "player-self", recipientId: "player-online" }));
  const unmount = await renderModal();
  await flush();
  assert.equal(q(".friends-chat-request-dot"), null);
  await unmount();
});

test("Clear Chat from the header menu clears only my side when the box is unchecked", async () => {
  chatMessages = [ownMessage("m1", "First", 3), ownMessage("m2", "Second", 2)];
  const unmount = await renderModal();
  await flush();
  await openChatWithZed();
  assert.equal(qa(".chat-message-row").length, 2);

  await click(q(".chat-menu-trigger"));
  const items = qa('[role="menuitem"]');
  assert.deepEqual(items.map((node) => node.textContent.trim()), ["Clear Chat"], "the menu has only Clear Chat");

  await click(items[0]);
  const dialog = q(".confirm-dialog");
  assert.equal(dialog.querySelector(".confirm-dialog-title").textContent, "Clear Chat");
  assert.equal(
    dialog.querySelector(".confirm-dialog-message").textContent,
    "Are you sure you want to clear this conversation?",
  );
  const checkbox = dialog.querySelector('input[type="checkbox"]');
  assert.equal(checkbox.checked, false, "the both-ends option starts unchecked");
  assert.match(dialog.textContent, /Also delete chat from both ends/);
  assert.deepEqual(
    [...dialog.querySelectorAll(".confirm-dialog-actions button")].map((node) => node.textContent.trim()),
    ["Cancel", "Clear Chat"],
  );

  // Escape dismisses the dialog but leaves the chat open.
  await pressKey("Escape");
  assert.equal(q(".confirm-dialog"), null);
  assert.ok(q(".chat-modal"));
  assert.deepEqual(clearCalls, []);

  await click(q(".chat-menu-trigger"));
  await click(q('[role="menuitem"]'));
  await click(q(".confirm-dialog-button--confirm"));
  await flush();
  assert.deepEqual(clearCalls, [{ action: "me", friendId: "player-online" }]);
  assert.equal(qa(".chat-message-row").length, 0, "my side is empty at once");
  assert.match(q(".chat-clear-notice").textContent, /Chat cleared for you/);
  assert.equal(q(".chat-clear-banner"), null, "no request was created");

  await unmount();
});

test("checking both ends sends a request, shows the pending state, and can be cancelled", async () => {
  chatMessages = [ownMessage("m1", "Keep while pending", 2)];
  const unmount = await renderModal();
  await flush();
  await openChatWithZed();

  await click(q(".chat-menu-trigger"));
  await click(q('[role="menuitem"]'));
  await act(async () => { q('.confirm-dialog input[type="checkbox"]').click(); });
  await click(q(".confirm-dialog-button--confirm"));
  await flush();

  assert.deepEqual(clearCalls, [{ action: "both", friendId: "player-online" }]);
  assert.equal(qa(".chat-message-row").length, 1, "messages stay while the request is pending");
  assert.match(q(".chat-clear-banner--pending").textContent, /Waiting for the other person to respond/);

  await click(bannerButton("Cancel request"));
  await flush();
  assert.equal(clearCalls.at(-1).action, "cancel");
  assert.equal(q(".chat-clear-banner"), null);
  assert.equal(qa(".chat-message-row").length, 1);

  await unmount();
});

test("the recipient sees the request card in the chat and Accept clears both sides", async () => {
  chatMessages = [ownMessage("m1", "Old", 3)];
  clearState = { request: clearRequestFixture(), outcome: null };
  const unmount = await renderModal();
  await flush();
  await openChatWithZed();

  const card = q(".chat-clear-banner");
  assert.ok(card, "the request is shown inside the existing chat modal");
  assert.equal(card.querySelector("h3").textContent, "Clear Chat Request");
  assert.equal(
    card.querySelector("p").textContent.replace(/\s+/g, " ").trim(),
    "ZedOnline wants to permanently clear this conversation for both of you. Do you agree?",
  );

  await click(bannerButton("Accept"));
  await flush();
  assert.deepEqual(clearCalls, [{ action: "accept", requestId: "clear-1" }]);
  assert.equal(q(".chat-clear-banner"), null);
  assert.equal(qa(".chat-message-row").length, 0);
  assert.equal(q(".chat-clear-notice").textContent, "Chat cleared for both users");

  await unmount();
});

test("Decline keeps history and a failed answer restores the card with an error", async () => {
  chatMessages = [ownMessage("m1", "Stay", 3)];
  clearState = { request: clearRequestFixture(), outcome: null };
  const unmount = await renderModal();
  await flush();
  await openChatWithZed();

  const realDecline = chatApi.declineClearRequest;
  chatApi.declineClearRequest = async () => { throw new Error("Network unavailable"); };
  await click(bannerButton("Decline"));
  await flush();
  assert.ok(q(".chat-clear-banner"), "the card is still there");
  assert.ok(q(".chat-clear-banner-error"), "with an error");
  assert.equal(bannerButton("Accept").disabled, false, "and the buttons are usable again");

  chatApi.declineClearRequest = realDecline;
  await click(bannerButton("Decline"));
  await flush();
  assert.equal(q(".chat-clear-banner"), null);
  assert.equal(qa(".chat-message-row").length, 1, "history is untouched");

  await unmount();
});

test("the requester sees a declined outcome until dismissing it", async () => {
  clearState = {
    request: null,
    outcome: clearRequestFixture({
      requesterId: "player-self",
      recipientId: "player-online",
      status: "declined",
    }),
  };
  const unmount = await renderModal();
  await flush();
  await openChatWithZed();

  assert.equal(
    q(".chat-clear-banner--declined .chat-clear-banner-outcome").textContent,
    "Your Clear Chat Request was declined",
  );
  await click(bannerButton("Dismiss"));
  await flush();
  assert.deepEqual(clearCalls, [{ action: "acknowledge", requestId: "clear-1" }]);
  assert.equal(q(".chat-clear-banner"), null);

  await unmount();
});

test("search results show presence for friends only", async () => {
  searchResults = [
    { ...player("player-online", "ZedOnline", true), relationship: FRIENDS_RELATIONSHIP },
    {
      // Even if a server sent presence for a stranger, the card never shows it.
      ...player("player-stranger", "StrangerDanger", true),
      relationship: { status: "NONE", requestId: null, blockedByMe: false, blockedMe: false, friendSince: null },
    },
  ];
  const unmount = await renderModal();
  await click(button("Find Friends"));
  await setTextInput(q(".friends-search-input"), "Zed");
  await settleSearch();

  const [friendCard, strangerCard] = qa(".friends-search-result");
  assert.match(friendCard.textContent, /Online now/, "a friend's presence is shown");
  assert.equal(strangerCard.querySelector(".friends-card-meta"), null, "a stranger has no presence line");
  assert.equal(strangerCard.querySelector(".friends-presence--online"), null, "and no online dot");
  assert.doesNotMatch(strangerCard.textContent, /Online|Offline/);

  await unmount();
});

test("the Friends navbar dot includes an incoming Clear Chat Request", async () => {
  setAccessToken("test-access-token");
  requestsState = { incoming: [], outgoing: [], incomingCount: 0 };
  friendsApi.getSummary = async () => ({
    incomingCount: 0,
    unreadMessageCount: 0,
    incomingClearRequestCount: 1,
  });

  const unmount = await renderNavbar();
  await flush();
  assert.ok(q(".navbar-friends-dot"));
  assert.match(q(".navbar-friends-nav").getAttribute("aria-label"), /1 Clear Chat Request/);

  await unmount();
  setAccessToken(null);
});
