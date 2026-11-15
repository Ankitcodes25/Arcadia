import {
  LUDO_COLOURS,
  type ArcadionPower,
  type LudoColour,
  type LudoDifficulty,
  type LudoFriendSummary,
  type LudoMode,
  type LudoPlayerCount,
  type LudoSeat,
} from "./types";

export type ArcadionSetupState = {
  playerCount: LudoPlayerCount;
  selectedColour: LudoColour;
  difficulty: LudoDifficulty;
  arcadionPower: ArcadionPower;
};

export type PassPlaySeatType = "HUMAN" | "FRIEND" | "ARCADION" | "EMPTY";

export type PassPlaySlot = {
  colour: LudoColour;
  type: PassPlaySeatType;
  displayName: string;
  friend?: LudoFriendSummary;
};

export type PassPlaySetupState = {
  playerCount: LudoPlayerCount;
  slots: PassPlaySlot[];
  arcadionPower: ArcadionPower;
};

export type OnlineSetupState = {
  playerCount: LudoPlayerCount;
  preferredColour: LudoColour;
  arcadionPower: ArcadionPower;
};

export type LudoSetupState = {
  mode: LudoMode;
  arcadion: ArcadionSetupState;
  passPlay: PassPlaySetupState;
  online: OnlineSetupState;
};

export const LUDO_DEFAULT_PLAYER_COUNT: LudoPlayerCount = 2;
export const LUDO_DEFAULT_COLOUR: LudoColour = "RED";
export const LUDO_DEFAULT_DIFFICULTY: LudoDifficulty = "MEDIUM";
export const LUDO_DEFAULT_POWER: ArcadionPower = "MEDIUM";

export function isLudoPlayerCount(value: unknown): value is LudoPlayerCount {
  return value === 2 || value === 3 || value === 4;
}

export function isLudoColour(value: unknown): value is LudoColour {
  return typeof value === "string" && (LUDO_COLOURS as readonly string[]).includes(value);
}

export function isArcadionPower(value: unknown): value is ArcadionPower {
  return value === "LOW" || value === "MEDIUM" || value === "HIGH";
}

export function isLudoDifficulty(value: unknown): value is LudoDifficulty {
  return value === "EASY" || value === "MEDIUM" || value === "HARD";
}

export function createPassPlaySlots(playerCount: LudoPlayerCount = LUDO_DEFAULT_PLAYER_COUNT): PassPlaySlot[] {
  return LUDO_COLOURS.map((colour, index) => ({
    colour,
    type: index < playerCount ? "HUMAN" : "EMPTY",
    displayName: "",
  }));
}

export function createArcadionSetupState(): ArcadionSetupState {
  return {
    playerCount: LUDO_DEFAULT_PLAYER_COUNT,
    selectedColour: LUDO_DEFAULT_COLOUR,
    difficulty: LUDO_DEFAULT_DIFFICULTY,
    arcadionPower: LUDO_DEFAULT_POWER,
  };
}

export function createPassPlaySetupState(): PassPlaySetupState {
  return {
    playerCount: LUDO_DEFAULT_PLAYER_COUNT,
    slots: createPassPlaySlots(LUDO_DEFAULT_PLAYER_COUNT),
    arcadionPower: LUDO_DEFAULT_POWER,
  };
}

export function createOnlineSetupState(): OnlineSetupState {
  return {
    playerCount: LUDO_DEFAULT_PLAYER_COUNT,
    preferredColour: LUDO_DEFAULT_COLOUR,
    arcadionPower: LUDO_DEFAULT_POWER,
  };
}

export function createInitialLudoSetupState(mode: LudoMode = "ARCADION"): LudoSetupState {
  return {
    mode,
    arcadion: createArcadionSetupState(),
    passPlay: createPassPlaySetupState(),
    online: createOnlineSetupState(),
  };
}

export function setLudoMode(state: LudoSetupState, mode: LudoMode): LudoSetupState {
  return state.mode === mode ? state : { ...state, mode };
}

/**
 * The Arcadion roster is always derived from the player count and the human
 * colour: one human plus (playerCount - 1) bots, with no colour ever reused.
 */
export function buildArcadionSeats(
  arcadion: ArcadionSetupState,
  humanName = "You",
): LudoSeat[] {
  const botColours = LUDO_COLOURS
    .filter((colour) => colour !== arcadion.selectedColour)
    .slice(0, arcadion.playerCount - 1);

  return LUDO_COLOURS.map((colour) => {
    if (colour === arcadion.selectedColour) {
      return {
        colour,
        type: "HUMAN",
        displayName: humanName,
        isHost: true,
      } satisfies LudoSeat;
    }
    if (botColours.includes(colour)) {
      return {
        colour,
        type: "ARCADION",
        displayName: "Arcadion",
      } satisfies LudoSeat;
    }
    return { colour, type: "EMPTY" } satisfies LudoSeat;
  });
}

export function setArcadionPlayerCount(
  state: LudoSetupState,
  playerCount: LudoPlayerCount,
): LudoSetupState {
  return {
    ...state,
    arcadion: { ...state.arcadion, playerCount },
  };
}

export function selectArcadionColour(
  state: LudoSetupState,
  selectedColour: LudoColour,
): LudoSetupState {
  return {
    ...state,
    arcadion: { ...state.arcadion, selectedColour },
  };
}

export function setArcadionDifficulty(
  state: LudoSetupState,
  difficulty: LudoDifficulty,
): LudoSetupState {
  return {
    ...state,
    arcadion: { ...state.arcadion, difficulty },
  };
}

export function setArcadionPower(
  state: LudoSetupState,
  arcadionPower: ArcadionPower,
): LudoSetupState {
  return {
    ...state,
    arcadion: { ...state.arcadion, arcadionPower },
  };
}

export function isPassPlaySeatActive(
  state: LudoSetupState,
  colour: LudoColour,
): boolean {
  const index = LUDO_COLOURS.indexOf(colour);
  return index >= 0 && index < state.passPlay.playerCount;
}

function emptyPassPlaySlot(colour: LudoColour): PassPlaySlot {
  return { colour, type: "EMPTY", displayName: "" };
}

function humanPassPlaySlot(colour: LudoColour): PassPlaySlot {
  return { colour, type: "HUMAN", displayName: "" };
}

/**
 * The selected player count decides which of the four fixed colour slots are
 * active. Seats outside the count are disabled completely: they cannot hold a
 * name, a friend or a bot, so the disabled state is never merely cosmetic.
 */
export function setPassPlayPlayerCount(
  state: LudoSetupState,
  playerCount: LudoPlayerCount,
): LudoSetupState {
  const slots = state.passPlay.slots.map((slot, index) => {
    if (index >= playerCount) return emptyPassPlaySlot(slot.colour);
    if (slot.type === "EMPTY") return humanPassPlaySlot(slot.colour);
    return slot;
  });

  return {
    ...state,
    passPlay: { ...state.passPlay, playerCount, slots },
  };
}

export function setPassPlayName(
  state: LudoSetupState,
  colour: LudoColour,
  displayName: string,
): LudoSetupState {
  if (!isPassPlaySeatActive(state, colour)) return state;

  const slots = state.passPlay.slots.map((slot) => (
    slot.colour === colour && slot.type === "HUMAN"
      ? { ...slot, displayName }
      : slot
  ));

  return {
    ...state,
    passPlay: { ...state.passPlay, slots },
  };
}

export function getPassPlaySlot(
  state: LudoSetupState,
  colour: LudoColour,
): PassPlaySlot | null {
  return state.passPlay.slots.find((slot) => slot.colour === colour) ?? null;
}

export function canAddPassPlayBot(
  state: LudoSetupState,
  colour: LudoColour,
): boolean {
  const slot = getPassPlaySlot(state, colour);
  return Boolean(
    slot
    && isPassPlaySeatActive(state, colour)
    && slot.type === "HUMAN"
    && !slot.displayName.trim(),
  );
}

/** Add Arcadion to an active seat that has no human name and no friend. */
export function addPassPlayBot(
  state: LudoSetupState,
  colour: LudoColour,
): LudoSetupState {
  if (!canAddPassPlayBot(state, colour)) return state;

  const slots = state.passPlay.slots.map((slot) => (
    slot.colour === colour
      ? { ...slot, type: "ARCADION" as const, displayName: "Arcadion", friend: undefined }
      : slot
  ));

  return {
    ...state,
    passPlay: { ...state.passPlay, slots },
  };
}

/** Removing the bot returns the seat to an empty human seat, not a locked one. */
export function removePassPlayBot(
  state: LudoSetupState,
  colour: LudoColour,
): LudoSetupState {
  if (!isPassPlaySeatActive(state, colour)) return state;

  const slots = state.passPlay.slots.map((slot) => (
    slot.colour === colour && slot.type === "ARCADION"
      ? humanPassPlaySlot(colour)
      : slot
  ));

  return {
    ...state,
    passPlay: { ...state.passPlay, slots },
  };
}

export function togglePassPlayBot(
  state: LudoSetupState,
  colour: LudoColour,
): LudoSetupState {
  const slot = getPassPlaySlot(state, colour);
  if (!slot) return state;
  return slot.type === "ARCADION"
    ? removePassPlayBot(state, colour)
    : addPassPlayBot(state, colour);
}

export function getPassPlayAssignedFriendIds(state: LudoSetupState): string[] {
  return state.passPlay.slots
    .filter((slot) => slot.type === "FRIEND" && slot.friend)
    .map((slot) => slot.friend!.id);
}

/**
 * A friend invited into Pass & Play is assigned to the chosen seat immediately.
 * A bot cannot be replaced this way, and the same friend can never occupy two
 * seats at once.
 */
export function assignPassPlayFriend(
  state: LudoSetupState,
  colour: LudoColour,
  friend: LudoFriendSummary,
): LudoSetupState {
  if (!isPassPlaySeatActive(state, colour)) return state;

  const current = getPassPlaySlot(state, colour);
  if (!current || current.type === "ARCADION") return state;

  const friendAlreadySeated = state.passPlay.slots.some(
    (slot) => slot.colour !== colour && slot.type === "FRIEND" && slot.friend?.id === friend.id,
  );
  if (friendAlreadySeated) return state;

  const slots = state.passPlay.slots.map((slot) => (
    slot.colour === colour
      ? {
        colour,
        type: "FRIEND" as const,
        displayName: friend.username,
        friend,
      }
      : slot
  ));

  return {
    ...state,
    passPlay: { ...state.passPlay, slots },
  };
}

export function removePassPlayFriend(
  state: LudoSetupState,
  colour: LudoColour,
): LudoSetupState {
  if (!isPassPlaySeatActive(state, colour)) return state;

  const slots = state.passPlay.slots.map((slot) => (
    slot.colour === colour && slot.type === "FRIEND"
      ? humanPassPlaySlot(colour)
      : slot
  ));

  return {
    ...state,
    passPlay: { ...state.passPlay, slots },
  };
}

export function setPassPlayPower(
  state: LudoSetupState,
  arcadionPower: ArcadionPower,
): LudoSetupState {
  return {
    ...state,
    passPlay: { ...state.passPlay, arcadionPower },
  };
}

export function setOnlinePlayerCount(
  state: LudoSetupState,
  playerCount: LudoPlayerCount,
): LudoSetupState {
  return {
    ...state,
    online: { ...state.online, playerCount },
  };
}

export function setOnlinePreferredColour(
  state: LudoSetupState,
  preferredColour: LudoColour,
): LudoSetupState {
  return {
    ...state,
    online: { ...state.online, preferredColour },
  };
}

export function hasPassPlayBot(state: LudoSetupState): boolean {
  return state.passPlay.slots.some(
    (slot) => slot.type === "ARCADION" && isPassPlaySeatActive(state, slot.colour),
  );
}

export function hasArcadionBots(state: LudoSetupState): boolean {
  return state.arcadion.playerCount > 1;
}

export type LudoSetupValidation = {
  valid: boolean;
  message: string | null;
  invalidColours: LudoColour[];
};

export function getLudoSetupValidation(state: LudoSetupState): LudoSetupValidation {
  if (state.mode !== "PASS_PLAY") {
    return { valid: true, message: null, invalidColours: [] };
  }

  const invalidColours = state.passPlay.slots
    .filter((slot) => (
      slot.type === "HUMAN"
      && isPassPlaySeatActive(state, slot.colour)
      && !slot.displayName.trim()
    ))
    .map((slot) => slot.colour);

  return invalidColours.length
    ? {
      valid: false,
      message: "Every active human seat needs a player name.",
      invalidColours,
    }
    : { valid: true, message: null, invalidColours: [] };
}

export function getActivePassPlaySeats(state: LudoSetupState): LudoSeat[] {
  return state.passPlay.slots
    .filter((slot) => slot.type !== "EMPTY" && isPassPlaySeatActive(state, slot.colour))
    .map((slot) => ({
      colour: slot.colour,
      type: slot.type === "ARCADION" ? "ARCADION" : "HUMAN",
      displayName: slot.displayName,
    }));
}
