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

  friendsApi.listFriends = async () => {
    listFriendsCalls += 1;
    return {
      friends: [
        player("player-online", "ZedOnline", true, { friendsSince: "2026-01-01T00:00:00.000Z" }),
        player("player-offline", "AmyOffline", false, { friendsSince: "2026-02-01T00:00:00.000Z" }),
      ],
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
  friendsApi.getSummary = async () => ({ incomingCount: requestsState.incomingCount });
  friendsApi.heartbeat = async () => ({ online: true, checkedAt: new Date().toISOString() });
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

async function settleSearch() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 420)); });
}

test("the modal opens on Friends, shows online friends first, and keeps tab state", async () => {
  const unmount = await renderModal();

  const tabs = qa('[role="tab"]');
  assert.deepEqual(
    tabs.map((tab) => tab.textContent.replace(/\d+/g, "").trim()),
    ["Friends", "Requests", "Find Friends"],
    "tabs are ordered Friends, Requests, Find Friends",
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
