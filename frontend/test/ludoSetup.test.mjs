import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const frontendRoot = fileURLToPath(new URL("../", import.meta.url));

let vite;
let stateModule;
let permissionsModule;
let chatModule;
let launchModule;
let types;
let LudoSetupFooter;
let GamesloadingContent;
let OnlineSeatCard;
let PassPlaySeatCard;
let PassAndPlaySetup;

before(async () => {
  vite = await createServer({
    root: frontendRoot,
    logLevel: "silent",
    server: { middlewareMode: true },
    appType: "custom",
  });

  stateModule = await vite.ssrLoadModule("/src/games/ludo/ludoSetupState.ts");
  permissionsModule = await vite.ssrLoadModule("/src/games/ludo/ludoPermissions.ts");
  chatModule = await vite.ssrLoadModule("/src/games/ludo/ludoChat.ts");
  launchModule = await vite.ssrLoadModule("/src/games/ludo/ludoLaunch.ts");
  types = await vite.ssrLoadModule("/src/games/ludo/types.ts");
  LudoSetupFooter = (await vite.ssrLoadModule("/src/games/ludo/LudoSetupFooter.tsx")).default;
  GamesloadingContent = (await vite.ssrLoadModule("/src/games/GamesloadingModal.tsx")).GamesloadingContent;
  OnlineSeatCard = (await vite.ssrLoadModule("/src/games/ludo/OnlineSeatCard.tsx")).default;
  PassPlaySeatCard = (await vite.ssrLoadModule("/src/games/ludo/PassPlaySeatCard.tsx")).default;
  PassAndPlaySetup = (await vite.ssrLoadModule("/src/games/ludo/PassAndPlaySetup.tsx")).default;
});

after(async () => {
  await vite?.close();
});

function lobby(overrides = {}) {
  return {
    id: "lobby-1",
    gameName: "Ludo",
    hostId: "user-host",
    playerCount: 2,
    arcadionPower: "MEDIUM",
    seats: [
      {
        colour: "RED",
        type: "HUMAN",
        playerId: "user-host",
        displayName: "Host",
        isHost: true,
      },
      { colour: "GREEN", type: "EMPTY" },
      { colour: "YELLOW", type: "EMPTY" },
      { colour: "BLUE", type: "EMPTY" },
    ],
    pendingInviteeIds: [],
    pendingInvites: [],
    ...overrides,
  };
}

test("initial setup defaults to Arcadion with two players, Red and Medium", () => {
  const setup = stateModule.createInitialLudoSetupState();

  assert.equal(setup.mode, "ARCADION");
  assert.equal(setup.arcadion.playerCount, 2);
  assert.equal(setup.arcadion.selectedColour, "RED");
  assert.equal(setup.arcadion.difficulty, "MEDIUM");
  assert.equal(setup.passPlay.playerCount, 2);
  assert.equal(setup.passPlay.slots.length, 4);
  assert.equal(setup.online.playerCount, 2);
  assert.equal(setup.online.preferredColour, "RED");
});

test("mode transitions keep each mode's independent configuration", () => {
  let setup = stateModule.createInitialLudoSetupState();
  setup = stateModule.setArcadionPlayerCount(setup, 4);
  setup = stateModule.selectArcadionColour(setup, "BLUE");
  setup = stateModule.setLudoMode(setup, "PASS_PLAY");

  assert.equal(setup.mode, "PASS_PLAY");
  assert.equal(setup.arcadion.playerCount, 4);
  assert.equal(setup.arcadion.selectedColour, "BLUE");

  setup = stateModule.setPassPlayPlayerCount(setup, 3);
  assert.equal(setup.passPlay.playerCount, 3);
  assert.equal(setup.arcadion.playerCount, 4);
});

test("Arcadion player counts always produce one human plus bots and unique colours", () => {
  let setup = stateModule.createInitialLudoSetupState();

  for (const playerCount of [2, 3, 4]) {
    setup = stateModule.setArcadionPlayerCount(setup, playerCount);
    const seats = stateModule.buildArcadionSeats(setup.arcadion, "Ankit");
    const active = seats.filter((seat) => seat.type !== "EMPTY");
    const colours = seats.map((seat) => seat.colour);

    assert.equal(seats.length, 4);
    assert.equal(active.length, playerCount);
    assert.equal(active.filter((seat) => seat.type === "HUMAN").length, 1);
    assert.equal(active.filter((seat) => seat.type === "ARCADION").length, playerCount - 1);
    assert.equal(new Set(colours).size, 4);
    assert.equal(active.find((seat) => seat.type === "HUMAN").colour, "RED");
  }
});

test("Arcadion difficulty and colour changes are stored without affecting seat count", () => {
  let setup = stateModule.createInitialLudoSetupState();
  setup = stateModule.setArcadionDifficulty(setup, "HARD");
  setup = stateModule.selectArcadionColour(setup, "YELLOW");

  const seats = stateModule.buildArcadionSeats(setup.arcadion, "Ankit");
  assert.equal(setup.arcadion.difficulty, "HARD");
  assert.equal(seats.find((seat) => seat.type === "HUMAN").colour, "YELLOW");
  assert.equal(seats.filter((seat) => seat.type !== "EMPTY").length, 2);
});

test("Pass & Play always exposes four slots and starts with two human seats", () => {
  const setup = stateModule.createInitialLudoSetupState("PASS_PLAY");

  assert.equal(setup.passPlay.slots.length, 4);
  assert.deepEqual(
    setup.passPlay.slots.map((slot) => slot.type),
    ["HUMAN", "HUMAN", "EMPTY", "EMPTY"],
  );
});

test("Pass & Play player count adjusts human seats while preserving explicit bots", () => {
  let setup = stateModule.createInitialLudoSetupState("PASS_PLAY");
  setup = stateModule.togglePassPlayBot(setup, "BLUE");
  assert.equal(setup.passPlay.slots[3].type, "ARCADION");

  setup = stateModule.setPassPlayPlayerCount(setup, 4);
  assert.deepEqual(
    setup.passPlay.slots.map((slot) => slot.type),
    ["HUMAN", "HUMAN", "HUMAN", "ARCADION"],
  );

  setup = stateModule.setPassPlayPlayerCount(setup, 2);
  assert.deepEqual(
    setup.passPlay.slots.map((slot) => slot.type),
    ["HUMAN", "HUMAN", "EMPTY", "ARCADION"],
  );
});

test("Pass & Play bot toggles auto-name the seat and disable human names", () => {
  let setup = stateModule.createInitialLudoSetupState("PASS_PLAY");
  setup = stateModule.togglePassPlayBot(setup, "GREEN");

  const bot = setup.passPlay.slots.find((slot) => slot.colour === "GREEN");
  assert.equal(bot.type, "ARCADION");
  assert.equal(bot.displayName, "Arcadion");

  setup = stateModule.setPassPlayName(setup, "GREEN", "Not allowed");
  assert.equal(
    setup.passPlay.slots.find((slot) => slot.colour === "GREEN").displayName,
    "Arcadion",
  );

  setup = stateModule.togglePassPlayBot(setup, "GREEN");
  assert.equal(setup.passPlay.slots.find((slot) => slot.colour === "GREEN").type, "HUMAN");
  assert.equal(setup.passPlay.slots.find((slot) => slot.colour === "GREEN").displayName, "");
});

test("Pass & Play Arcadion has one remove action without the duplicate cross button", () => {
  const markup = renderToStaticMarkup(React.createElement(PassPlaySeatCard, {
    slot: { colour: "GREEN", type: "ARCADION", displayName: "Arcadion" },
    index: 1,
    active: true,
    invalid: false,
    canAddBot: true,
    onNameChange: () => {},
    onAddBot: () => {},
    onRemoveBot: () => {},
    onRemoveFriend: () => {},
  }));

  assert.match(markup, /ludo-seat-action--bot is-active/);
  assert.match(markup, />Remove<\/button>/);
  assert.doesNotMatch(markup, /ludo-seat-remove/);
});

test("Pass & Play reserves the power controls layout while Arcadion is removed", () => {
  const renderSetup = (setupState) => renderToStaticMarkup(React.createElement(PassAndPlaySetup, {
    setup: {
      state: setupState,
      validation: stateModule.getLudoSetupValidation(setupState),
      passPlayHasBot: stateModule.hasPassPlayBot(setupState),
      changePassPlayPlayerCount: () => {},
      changePassPlayName: () => {},
      addPassPlaySeatBot: () => {},
      removePassPlaySeatBot: () => {},
      removePassPlaySeatFriend: () => {},
      changePassPlayPower: () => {},
    },
  }));
  const withoutBot = renderSetup(stateModule.createInitialLudoSetupState("PASS_PLAY"));
  const withBotState = stateModule.togglePassPlayBot(
    stateModule.createInitialLudoSetupState("PASS_PLAY"),
    "GREEN",
  );
  const withBot = renderSetup(withBotState);

  assert.match(withoutBot, /class="ludo-panel ludo-panel--pass-play"/);
  assert.match(withBot, /class="ludo-panel ludo-panel--pass-play"/);
  assert.match(withoutBot, /ludo-pass-power is-reserved/);
  assert.match(withBot, /class="ludo-section ludo-pass-power"/);
  assert.equal((withoutBot.match(/ludo-pass-power/g) ?? []).length, (withBot.match(/ludo-pass-power/g) ?? []).length);
});

test("Pass & Play bot deselect restores EMPTY for seats outside the player count", () => {
  let setup = stateModule.createInitialLudoSetupState("PASS_PLAY");
  setup = stateModule.togglePassPlayBot(setup, "YELLOW");
  assert.equal(setup.passPlay.slots[2].type, "ARCADION");

  setup = stateModule.togglePassPlayBot(setup, "YELLOW");
  assert.equal(setup.passPlay.slots[2].type, "EMPTY");
});

test("Arcadion Power is only visible in Pass & Play when a bot exists", () => {
  let setup = stateModule.createInitialLudoSetupState("PASS_PLAY");
  assert.equal(stateModule.hasPassPlayBot(setup), false);

  setup = stateModule.togglePassPlayBot(setup, "RED");
  assert.equal(stateModule.hasPassPlayBot(setup), true);

  setup = stateModule.togglePassPlayBot(setup, "RED");
  assert.equal(stateModule.hasPassPlayBot(setup), false);
});

test("Pass & Play validation requires a name for every active human seat", () => {
  const setup = stateModule.createInitialLudoSetupState("PASS_PLAY");
  const validation = stateModule.getLudoSetupValidation(setup);

  assert.equal(validation.valid, false);
  assert.deepEqual(validation.invalidColours, ["RED", "GREEN"]);
  assert.match(validation.message, /name/i);

  const named = stateModule.setPassPlayName(
    stateModule.setPassPlayName(setup, "RED", "Ankit"),
    "GREEN",
    "Riya",
  );
  assert.deepEqual(stateModule.getLudoSetupValidation(named), {
    valid: true,
    message: null,
    invalidColours: [],
  });
});

test("active Pass & Play seats exclude empty slots", () => {
  let setup = stateModule.createInitialLudoSetupState("PASS_PLAY");
  setup = stateModule.setPassPlayName(setup, "RED", "Ankit");
  setup = stateModule.setPassPlayName(setup, "GREEN", "Riya");
  setup = stateModule.togglePassPlayBot(setup, "BLUE");

  const seats = stateModule.getActivePassPlaySeats(setup);
  assert.deepEqual(seats.map((seat) => seat.colour), ["RED", "GREEN", "BLUE"]);
  assert.deepEqual(seats.map((seat) => seat.type), ["HUMAN", "HUMAN", "ARCADION"]);
});

test("host permissions are scoped to the lobby host only", () => {
  const value = lobby();

  assert.equal(permissionsModule.isLudoHost(value, "user-host"), true);
  assert.equal(permissionsModule.isLudoHost(value, "user-guest"), false);
  assert.equal(permissionsModule.canHostConfigureLudo(value, "user-host"), true);
  assert.equal(permissionsModule.canHostConfigureLudo(value, "user-guest"), false);
  assert.equal(permissionsModule.canHostConfigureLudo(null, "user-host"), false);
});

test("seat lookup and own-colour availability reserve every occupied colour", () => {
  const value = lobby({
    seats: [
      { colour: "RED", type: "HUMAN", playerId: "user-host", displayName: "Host", isHost: true },
      { colour: "GREEN", type: "HUMAN", playerId: "user-guest", displayName: "Guest" },
      { colour: "YELLOW", type: "ARCADION", displayName: "Arcadion" },
      { colour: "BLUE", type: "EMPTY" },
    ],
  });

  assert.equal(permissionsModule.findLudoSeat(value, "user-guest").colour, "GREEN");
  assert.equal(permissionsModule.findLudoSeat(value, "stranger"), null);
  assert.equal(permissionsModule.canChangeLudoColour(value, "user-guest"), true);
  assert.equal(permissionsModule.canChangeLudoColour(value, "stranger"), false);
  assert.deepEqual(
    permissionsModule.getAvailableLudoColours(value, "user-guest"),
    ["GREEN", "BLUE"],
  );
  assert.equal(permissionsModule.countLudoParticipants(value), 3);
});

test("a bot can only be added to an empty seat while the lobby has room", () => {
  const value = lobby();

  assert.equal(permissionsModule.canAddLudoBot(value, "GREEN"), true);
  assert.equal(permissionsModule.canAddLudoBot(value, "RED"), false);

  const full = lobby({
    playerCount: 2,
    seats: [
      { colour: "RED", type: "HUMAN", playerId: "user-host", displayName: "Host", isHost: true },
      { colour: "GREEN", type: "ARCADION", displayName: "Arcadion" },
      { colour: "YELLOW", type: "EMPTY" },
      { colour: "BLUE", type: "EMPTY" },
    ],
  });
  assert.equal(permissionsModule.canAddLudoBot(full, "YELLOW"), false);
});

test("online seat cards only enable the selected player count and preserve occupied seats", () => {
  const seats = lobby().seats;
  const pendingInvites = [];

  assert.deepEqual(
    permissionsModule.getEnabledOnlineSeatColours(seats, pendingInvites, 2),
    ["RED", "GREEN"],
  );
  assert.deepEqual(
    permissionsModule.getEnabledOnlineSeatColours(seats, pendingInvites, 3),
    ["RED", "GREEN", "YELLOW"],
  );
  assert.deepEqual(
    permissionsModule.getEnabledOnlineSeatColours(seats, pendingInvites, 4),
    ["RED", "GREEN", "YELLOW", "BLUE"],
  );
  assert.deepEqual(
    permissionsModule.getEnabledOnlineSeatColours(
      seats,
      [{ inviteeId: "user-invited", displayName: "Invited", colour: "BLUE" }],
      2,
    ),
    ["RED", "BLUE"],
  );
});

test("inactive online seat disables invites but leaves Arcadion available and hides chat names", () => {
  const markup = renderToStaticMarkup(React.createElement(OnlineSeatCard, {
    seat: { colour: "YELLOW", type: "EMPTY" },
    isSelf: false,
    hostControls: true,
    inactive: true,
    bubbles: [{
      id: "bubble-1",
      text: "Ready!",
      colour: "YELLOW",
      senderName: "Host Name",
      createdAt: 0,
    }],
    onInvite: () => {},
    onToggleBot: () => {},
    onRemovePlayer: () => {},
    onLeave: () => {},
  }));

  assert.match(markup, /ludo-seat is-yellow is-empty is-inactive/);
  assert.match(markup, /disabled="" title="Invite a friend to the Yellow seat"/);
  assert.match(markup, /Add Arcadion to the Yellow seat/);
  assert.doesNotMatch(markup, /ludo-seat-action--bot-icon"[^>]*disabled=""/);
  assert.doesNotMatch(markup, /Host Name/);
  assert.match(markup, /ludo-seat-bubble-text">Ready!/);
});

test("the online host seat shows its Host badge", () => {
  const markup = renderToStaticMarkup(React.createElement(OnlineSeatCard, {
    seat: {
      colour: "RED",
      type: "HUMAN",
      playerId: "user-host",
      displayName: "Host",
      isHost: true,
    },
    isSelf: true,
    hostControls: true,
    onInvite: () => {},
    onToggleBot: () => {},
    onRemovePlayer: () => {},
    onLeave: () => {},
  }));

  assert.match(markup, /ludo-host-badge/);
  assert.match(markup, />Host<\/span>/);
});

test("invitation eligibility rejects offline players, duplicates and full lobbies", () => {
  const value = lobby({
    playerCount: 3,
    seats: [
      { colour: "RED", type: "HUMAN", playerId: "user-host", displayName: "Host", isHost: true },
      { colour: "GREEN", type: "HUMAN", playerId: "user-guest", displayName: "Guest" },
      { colour: "YELLOW", type: "EMPTY" },
      { colour: "BLUE", type: "EMPTY" },
    ],
  });

  assert.equal(
    permissionsModule.getInviteEligibility({ id: "user-host", online: true }, value),
    "HOST",
  );
  assert.equal(
    permissionsModule.getInviteEligibility({ id: "user-guest", online: true }, value),
    "ALREADY_IN_LOBBY",
  );
  assert.equal(
    permissionsModule.getInviteEligibility({ id: "user-invited", online: true }, value, ["user-invited"]),
    "INVITED",
  );
  assert.equal(
    permissionsModule.getInviteEligibility({ id: "user-offline", online: false }, value),
    "OFFLINE",
  );
  assert.equal(
    permissionsModule.getInviteEligibility({ id: "user-eligible", online: true }, value),
    "ELIGIBLE",
  );

  const full = lobby({
    playerCount: 2,
    seats: [
      { colour: "RED", type: "HUMAN", playerId: "user-host", displayName: "Host", isHost: true },
      { colour: "GREEN", type: "ARCADION", displayName: "Arcadion" },
      { colour: "YELLOW", type: "EMPTY" },
      { colour: "BLUE", type: "EMPTY" },
    ],
  });
  assert.equal(
    permissionsModule.getInviteEligibility({ id: "user-eligible", online: true }, full),
    "LOBBY_FULL",
  );
  assert.equal(
    permissionsModule.getInviteEligibility({ id: "user-eligible", online: true }, null),
    "LOBBY_FULL",
  );
});

test("Start is always visible in state but permanently disabled", () => {
  const start = permissionsModule.getLudoStartState();

  assert.equal(permissionsModule.LUDO_START_ENABLED, false);
  assert.equal(start.disabled, true);
  assert.equal(start.label, "Start");
  assert.match(start.reason, /gameplay/i);
});

test("rendered footer always shows a disabled Start button and the reason", () => {
  const html = renderToStaticMarkup(React.createElement(LudoSetupFooter, {
    mode: "ARCADION",
    isHost: true,
    onBack: () => {},
  }));

  assert.match(html, />Start</);
  assert.match(html, /disabled=""/);
  assert.match(html, /Starting a Ludo match will be enabled when gameplay ships\./);
});

test("generic loading modal shows the selected game's logo and name", () => {
  const html = renderToStaticMarkup(React.createElement(GamesloadingContent, {
    gameName: "Rock Paper Scissors",
    titleId: "games-loading-title",
  }));

  assert.match(html, /rps-emoji-logo/);
  assert.match(html, /Starting Rock Paper Scissors\.\.\./);
  assert.match(html, /role="progressbar" aria-label="Loading Rock Paper Scissors"/);
  assert.match(html, /INITIALIZING/);
  assert.doesNotMatch(html, /PLEASE WAIT/);
  assert.doesNotMatch(html, /Arcadion is setting the board/);
});

test("only Ludo game names request the Ludo launch flow", () => {
  assert.equal(launchModule.isLudoGame("Ludo"), true);
  assert.equal(launchModule.isLudoGame("LUDO"), true);
  assert.equal(launchModule.isLudoGame(" ludo "), true);
  assert.equal(launchModule.isLudoGame("Snake & Ladder"), false);
  assert.equal(launchModule.isLudoGame(null), false);
});

test("chat quick messages match the requested lobby shortcuts", () => {
  assert.deepEqual([...chatModule.LUDO_CHAT_QUICK_MESSAGES], [
    "Ready!",
    "Wait a moment.",
    "Let's start!",
    "One more player.",
    "Choose your colour.",
  ]);
});

test("chat bubbles de-duplicate by id and never keep more than twelve", () => {
  let bubbles = [];
  const first = {
    id: "message-1",
    lobbyId: "lobby-1",
    senderId: "user-host",
    senderName: "Host",
    colour: "RED",
    text: "Ready!",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  bubbles = chatModule.addLudoChatBubble(bubbles, first, 1000);
  bubbles = chatModule.addLudoChatBubble(bubbles, first, 2000);
  assert.equal(bubbles.length, 1);
  assert.equal(bubbles[0].createdAt, 1000);

  for (let index = 2; index <= 14; index += 1) {
    bubbles = chatModule.addLudoChatBubble(bubbles, {
      ...first,
      id: `message-${index}`,
      text: `Message ${index}`,
    }, 1000 + index);
  }
  assert.equal(bubbles.length, 12);
  assert.equal(bubbles[0].id, "message-3");
});

test("chat bubbles expire and are pruned after roughly four and a half seconds", () => {
  const message = {
    id: "message-expiry",
    lobbyId: "lobby-1",
    senderId: "user-host",
    senderName: "Host",
    colour: "RED",
    text: "Wait a moment.",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  const bubbles = chatModule.addLudoChatBubble([], message, 10_000);
  assert.equal(chatModule.pruneLudoChatBubbles(bubbles, 10_000 + chatModule.LUDO_CHAT_BUBBLE_MS - 1).length, 1);
  assert.deepEqual(chatModule.pruneLudoChatBubbles(bubbles, 10_000 + chatModule.LUDO_CHAT_BUBBLE_MS), []);
  assert.equal(chatModule.LUDO_CHAT_BUBBLE_MS, 4500);
});

test("chat text is trimmed, bounded and empty messages are ignored", () => {
  assert.equal(chatModule.normaliseLudoChatText("  hello  "), "hello");
  assert.equal(chatModule.normaliseLudoChatText("   "), "");
  assert.equal(
    chatModule.normaliseLudoChatText("x".repeat(chatModule.LUDO_CHAT_MAX_LENGTH + 40)).length,
    chatModule.LUDO_CHAT_MAX_LENGTH,
  );
});

test("Ludo colours retain the requested four unique tokens", () => {
  assert.deepEqual([...types.LUDO_COLOURS], ["RED", "GREEN", "YELLOW", "BLUE"]);
  assert.equal(new Set(types.LUDO_COLOURS).size, 4);
  assert.equal(types.LUDO_MODE_META.ARCADION.label, "Arcadion");
  assert.equal(types.LUDO_MODE_META.PASS_PLAY.label, "Pass & Play");
  assert.equal(types.LUDO_MODE_META.ONLINE_FRIENDS.label, "Online Friends");
});
