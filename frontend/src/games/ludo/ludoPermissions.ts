import type { Friend } from "../../friends/friendsTypes";
import {
  LUDO_COLOURS,
  type LudoColour,
  type LudoLobbyState,
  type LudoPendingInvite,
  type LudoPlayerCount,
  type LudoSeat,
} from "./types";

export type InviteEligibility =
  | "ELIGIBLE"
  | "OFFLINE"
  | "ALREADY_IN_LOBBY"
  | "INVITED"
  | "LOBBY_FULL"
  | "HOST";

export function isLudoHost(lobby: LudoLobbyState | null, userId: string | null): boolean {
  return Boolean(lobby && userId && lobby.hostId === userId);
}

export function canHostConfigureLudo(lobby: LudoLobbyState | null, userId: string | null): boolean {
  return isLudoHost(lobby, userId);
}

export function findLudoSeat(lobby: LudoLobbyState | null, userId: string | null) {
  if (!lobby || !userId) return null;
  return lobby.seats.find((seat) => seat.type === "HUMAN" && seat.playerId === userId) ?? null;
}

export function canChangeLudoColour(lobby: LudoLobbyState | null, userId: string | null): boolean {
  return Boolean(findLudoSeat(lobby, userId));
}

export function countLudoParticipants(lobby: LudoLobbyState | null): number {
  return lobby ? lobby.seats.filter((seat) => seat.type !== "EMPTY").length : 0;
}

export function countLudoReservedSeats(lobby: LudoLobbyState | null): number {
  return lobby?.pendingInvites.length ?? 0;
}

export function getEnabledOnlineSeatColours(
  seats: readonly LudoSeat[],
  pendingInvites: readonly LudoPendingInvite[],
  playerCount: LudoPlayerCount,
): LudoColour[] {
  const enabledColours = new Set(
    seats.filter((seat) => seat.type !== "EMPTY").map((seat) => seat.colour),
  );
  pendingInvites.forEach((invite) => enabledColours.add(invite.colour));

  for (const seat of seats) {
    if (enabledColours.size >= playerCount) break;
    if (seat.type === "EMPTY") enabledColours.add(seat.colour);
  }

  return seats
    .filter((seat) => enabledColours.has(seat.colour))
    .map((seat) => seat.colour);
}

export function getPendingInviteForColour(
  lobby: LudoLobbyState | null,
  colour: LudoColour,
): LudoPendingInvite | null {
  return lobby?.pendingInvites.find((invite) => invite.colour === colour) ?? null;
}

/**
 * A colour can be chosen when it is the player's current colour or still empty.
 * Human seats, bots and pending invitations all reserve their colour.
 */
export function getAvailableLudoColours(
  lobby: LudoLobbyState | null,
  userId: string | null,
): LudoColour[] {
  if (!lobby) return [...LUDO_COLOURS];

  const reservedColours = new Set(
    lobby.pendingInvites.map((invite) => invite.colour),
  );

  return lobby.seats
    .filter((seat) => (
      (seat.type === "EMPTY" && !reservedColours.has(seat.colour))
      || (seat.type === "HUMAN" && seat.playerId === userId)
    ))
    .map((seat) => seat.colour);
}

export function canChangeOwnOnlineColour(
  lobby: LudoLobbyState | null,
  userId: string | null,
  colour: LudoColour,
): boolean {
  return Boolean(
    findLudoSeat(lobby, userId)
    && getAvailableLudoColours(lobby, userId).includes(colour),
  );
}

/** Only the host can add or remove Arcadion from an online lobby. */
export function canManageOnlineBots(
  lobby: LudoLobbyState | null,
  userId: string | null,
): boolean {
  return isLudoHost(lobby, userId);
}

export function canChangeOnlinePlayerCount(
  lobby: LudoLobbyState | null,
  userId: string | null,
): boolean {
  return isLudoHost(lobby, userId);
}

export function canChangeOnlinePower(
  lobby: LudoLobbyState | null,
  userId: string | null,
): boolean {
  return isLudoHost(lobby, userId);
}

export function canInviteOnlineFriends(
  lobby: LudoLobbyState | null,
  userId: string | null,
): boolean {
  return isLudoHost(lobby, userId);
}

export function canUseLudoLobbyChat(
  lobby: LudoLobbyState | null,
  userId: string | null,
): boolean {
  return Boolean(findLudoSeat(lobby, userId));
}

export function canAddLudoBot(lobby: LudoLobbyState | null, colour: LudoColour): boolean {
  if (!lobby) return false;
  const seat = lobby.seats.find((candidate) => candidate.colour === colour);
  if (!seat || seat.type !== "EMPTY") return false;
  if (getPendingInviteForColour(lobby, colour)) return false;
  return countLudoParticipants(lobby) + countLudoReservedSeats(lobby) < lobby.playerCount;
}

export function getInviteEligibility(
  friend: Pick<Friend, "id" | "online">,
  lobby: LudoLobbyState | null,
  pendingInviteeIds: readonly string[] = [],
): InviteEligibility {
  if (!lobby) return "LOBBY_FULL";
  if (friend.id === lobby.hostId) return "HOST";
  if (lobby.seats.some((seat) => seat.type === "HUMAN" && seat.playerId === friend.id)) {
    return "ALREADY_IN_LOBBY";
  }
  if (pendingInviteeIds.includes(friend.id)) return "INVITED";
  if (!friend.online) return "OFFLINE";
  if (countLudoParticipants(lobby) + countLudoReservedSeats(lobby) >= lobby.playerCount) {
    return "LOBBY_FULL";
  }
  return "ELIGIBLE";
}

/** A pending invite can only be attached to a free, unreserved colour. */
export function canInviteFriendToColour(
  lobby: LudoLobbyState | null,
  colour: LudoColour,
  friendId: string,
): boolean {
  if (!lobby) return false;
  if (lobby.pendingInviteeIds.includes(friendId)) return false;
  if (lobby.seats.some((seat) => seat.type === "HUMAN" && seat.playerId === friendId)) {
    return false;
  }
  if (getPendingInviteForColour(lobby, colour)) return false;
  const seat = lobby.seats.find((candidate) => candidate.colour === colour);
  if (!seat || seat.type !== "EMPTY") return false;
  return countLudoParticipants(lobby) + countLudoReservedSeats(lobby) < lobby.playerCount;
}

export const LUDO_START_ENABLED = false;

export function getLudoStartState(): {
  disabled: true;
  label: string;
  reason: string;
} {
  return {
    disabled: true,
    label: "Start",
    reason: "Starting a Ludo match will be enabled when gameplay ships.",
  };
}

export function clampLudoPlayerCount(value: unknown): 2 | 3 | 4 {
  return value === 3 || value === 4 ? value : 2;
}
