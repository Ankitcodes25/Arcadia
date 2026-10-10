import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const frontendRoot = fileURLToPath(new URL("../", import.meta.url));
const user = {
  id: "user-1",
  name: "Ankit Das",
  username: "ankitbuilds",
  usernameSetupRequired: false,
  playerId: "ARC-7K4M2P9Q",
  displayName: "Ankit Das",
  avatar: { type: "google", value: "google" },
  avatarSource: "google",
  googleAvatarAvailable: true,
  googleAvatarUrl: "https://lh3.googleusercontent.com/a/test-avatar",
  authProvider: "GOOGLE",
  email: "user@example.com",
  role: "USER",
  status: "ACTIVE",
  createdAt: null,
  updatedAt: null,
  lastLoginAt: null,
};

let vite;
let ProfilePopupModal;

before(async () => {
  vite = await createServer({
    root: frontendRoot,
    logLevel: "silent",
    server: { middlewareMode: true },
    appType: "custom",
  });
  ProfilePopupModal = (
    await vite.ssrLoadModule("/src/components/ProfilePopupmodal.tsx")
  ).default;
});

after(async () => {
  await vite?.close();
});

function renderPopup(overrides = {}) {
  return renderToStaticMarkup(React.createElement(ProfilePopupModal, {
    user,
    isMyProfileOpen: false,
    isMatchHistoryOpen: false,
    onClose: () => {},
    onOpenMyProfile: () => {},
    onOpenMatchHistory: () => {},
    onLogout: () => {},
    isLoggingOut: false,
    ...overrides,
  }));
}

test("profile header shows Arcadia username beside the avatar, not Google display name", () => {
  const markup = renderPopup();

  assert.match(markup, /ankitbuilds/);
  assert.doesNotMatch(markup, /Ankit Das/);
  assert.match(markup, /profile-popup-avatar/);
});

test("profile popup contains exactly the six approved menu options in order", () => {
  const markup = renderPopup();

  for (const label of [
    "My Profile",
    "Leaderboards",
    "Match History",
    "Settings",
    "Help &amp; Support",
    "Logout",
  ]) {
    assert.match(markup, new RegExp(`>${label}<`));
  }
  for (const label of ["Favorite Games", "Trophies", "Achievements", "Account Settings"]) {
    assert.doesNotMatch(markup, new RegExp(`>${label}<`));
  }
  assert.equal((markup.match(/class="profile-popup-item/g) || []).length, 6);
});

test("Match History sits immediately after Leaderboards and before Settings", () => {
  const markup = renderPopup();

  // The rendered order is what matters, so the positions are compared directly.
  const positions = ["My Profile", "Leaderboards", "Match History", "Settings", "Help &amp; Support", "Logout"]
    .map((label) => markup.indexOf(`>${label}<`));

  assert.ok(positions.every((position) => position >= 0), "every option is rendered");
  assert.deepEqual(
    positions.slice().sort((a, b) => a - b),
    positions,
    "the options render in the documented order",
  );
  assert.ok(
    positions[1] < positions[2] && positions[2] < positions[3],
    "Match History is between Leaderboards and Settings",
  );
});

test("the profile popup exposes no email address or verification state", () => {
  const markup = renderPopup();

  assert.doesNotMatch(markup, /user@example\.com/);
  assert.doesNotMatch(markup, /Verified/i);
  assert.doesNotMatch(markup, /profile-popup-email/);
});

test("the profile popup identity leads with the Player ID and copies it", () => {
  const markup = renderPopup();

  // Player ID, then username, then the progression badge title.
  const fields = [...markup.matchAll(/data-field="([a-zA-Z]+)"/g)].map((match) => match[1]);
  assert.deepEqual(fields, ["playerId", "username", "progressionTitle"]);

  assert.match(markup, /ARC-7K4M2P9Q/);
  assert.match(markup, /aria-label="Copy player ID"/);
  // Username copy is not added to the popup.
  assert.doesNotMatch(markup, /aria-label="Copy username"/);
});

test("the profile popup badge title comes from the progression payload", () => {
  const markup = renderPopup({
    user: {
      ...user,
      progression: { title: "Arcadia Legend", badgeKey: "crown", themeKey: "crown" },
    },
  });

  assert.match(markup, /Arcadia Legend/);
  assert.match(markup, /profile-popup-badge--crown/);
});
