import type { AuthAvatar } from "../../auth/authTypes";

export const LUDO_GAME_NAME = "Ludo";

export const LUDO_COLOURS = ["RED", "GREEN", "YELLOW", "BLUE"] as const;

/** The order the colour boxes are shown in, matching the hand-drawn layout. */
export const LUDO_COLOUR_DISPLAY_ORDER = ["RED", "GREEN", "BLUE", "YELLOW"] as const;

export type LudoColour = (typeof LUDO_COLOURS)[number];

export type LudoMode = "ARCADION" | "PASS_PLAY" | "ONLINE_FRIENDS";

export type LudoPlayerCount = 2 | 3 | 4;

export type LudoDifficulty = "EASY" | "MEDIUM" | "HARD";

export type ArcadionPower = "LOW" | "MEDIUM" | "HIGH";

export type LudoSeatType = "HUMAN" | "ARCADION" | "EMPTY";

export type LudoSeat = {
  colour: LudoColour;
  type: LudoSeatType;
  playerId?: string;
  displayName?: string;
  isHost?: boolean;
  avatar?: AuthAvatar;
  avatarUrl?: string | null;
};

/** The small subset of a friend needed to reserve a local or online seat. */
export type LudoFriendSummary = {
  id: string;
  username: string;
  avatar: AuthAvatar;
  avatarUrl: string | null;
  online: boolean;
};

export type LudoPendingInvite = {
  inviteeId: string;
  displayName: string;
  colour: LudoColour;
};

/**
 * The authoritative shape of a temporary online lobby, serialised by the
 * backend. Nothing here is persisted: the lobby exists only while the socket
 * session is alive.
 */
export type LudoLobbyState = {
  id: string;
  gameName: typeof LUDO_GAME_NAME;
  hostId: string;
  playerCount: LudoPlayerCount;
  arcadionPower: ArcadionPower;
  seats: LudoSeat[];
  pendingInviteeIds: string[];
  pendingInvites: LudoPendingInvite[];
};

export type LudoInviter = {
  id: string;
  displayName: string;
  avatar: AuthAvatar;
  avatarUrl: string | null;
};

export type LudoInvitation = {
  id: string;
  lobbyId: string;
  gameName: string;
  inviter: LudoInviter;
  expiresAt: string;
};

export type LudoSentInvitation = {
  id: string;
  lobbyId: string;
  inviteeId: string;
  inviteeName: string;
  colour?: LudoColour;
  expiresAt: string;
};

export type LudoChatMessage = {
  id: string;
  lobbyId: string;
  senderId: string;
  senderName: string;
  colour: LudoColour;
  text: string;
  createdAt: string;
};

export type LudoLobbyStatePayload = {
  lobby: LudoLobbyState;
};

export type LudoPlayerJoinedPayload = {
  lobbyId: string;
  playerName: string;
};

export type LudoLobbyClosedPayload = {
  lobbyId: string;
  reason: "HOST_LEFT" | "LOBBY_CLOSED" | "REMOVED" | "EXPIRED";
};

export type LudoInvitationPayload = {
  invitation: LudoInvitation;
};

export type LudoInvitationSentPayload = {
  invitation: LudoSentInvitation;
};

export type LudoInvitationDeclinedPayload = {
  inviteeId: string;
  inviteeName: string;
};

export type LudoInvitationExpiredPayload = {
  inviteId: string;
};

export type LudoChatPayload = {
  message: LudoChatMessage;
};

export type LudoErrorPayload = {
  event: string;
  message: string;
};

export type LudoChatBubble = {
  id: string;
  text: string;
  colour: LudoColour;
  senderName: string;
  createdAt: number;
};

export type LudoColourMeta = {
  label: string;
  hex: string;
  light: string;
  deep: string;
  glow: string;
};

export const LUDO_COLOUR_META: Record<LudoColour, LudoColourMeta> = {
  RED: {
    label: "Red",
    hex: "#f2445f",
    light: "#ff91a3",
    deep: "#8d0f24",
    glow: "rgba(242, 68, 95, 0.65)",
  },
  GREEN: {
    label: "Green",
    hex: "#2fd07c",
    light: "#8bf2ba",
    deep: "#08733d",
    glow: "rgba(47, 208, 124, 0.65)",
  },
  YELLOW: {
    label: "Yellow",
    hex: "#f5c93c",
    light: "#ffeb95",
    deep: "#8a6106",
    glow: "rgba(245, 201, 60, 0.65)",
  },
  BLUE: {
    label: "Blue",
    hex: "#3f8cff",
    light: "#9bc5ff",
    deep: "#0d3d94",
    glow: "rgba(63, 140, 255, 0.65)",
  },
};

export const LUDO_MODE_META: Record<
  LudoMode,
  { label: string; description: string }
> = {
  ARCADION: {
    label: "Arcadion",
    description: "Play solo against Arcadion-controlled bots.",
  },
  PASS_PLAY: {
    label: "Pass & Play",
    description: "Share this device with friends sitting beside you.",
  },
  ONLINE_FRIENDS: {
    label: "Online Friends",
    description: "Invite online friends into a temporary lobby.",
  },
};
