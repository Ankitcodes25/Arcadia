import type { AuthAvatar } from "../auth/authTypes";

/*
 * Wire types for the friends feature. They mirror the backend's public
 * projections exactly: no email, password, role or private preference is ever
 * part of a friend, request or search result.
 */

export type FriendRelationshipStatus =
  | "NONE"
  | "OUTGOING_PENDING"
  | "INCOMING_PENDING"
  | "FRIENDS"
  | "BLOCKED";

export type FriendRelationship = {
  status: FriendRelationshipStatus;
  requestId: string | null;
  blockedByMe: boolean;
  blockedMe: boolean;
  friendSince: string | null;
};

export type FriendPlayer = {
  id: string;
  username: string;
  playerId: string | null;
  avatar: AuthAvatar;
  avatarUrl: string | null;
  online: boolean;
};

export type Friend = FriendPlayer & {
  friendsSince: string | null;
};

export type FriendRequestItem = {
  id: string;
  createdAt: string | null;
  user: FriendPlayer;
};

export type FriendsResponse = {
  friends: Friend[];
};

export type FriendRequestsResponse = {
  incoming: FriendRequestItem[];
  outgoing: FriendRequestItem[];
  incomingCount: number;
};

export type FriendSummaryResponse = {
  incomingCount: number;
  /**
   * Persisted unread chat messages from accepted, unblocked friends. It shares
   * the existing Friends navbar dot with incoming requests rather than adding
   * a second notification surface.
   */
  unreadMessageCount?: number;
};

export type FriendSearchResult = FriendPlayer & {
  relationship: FriendRelationship;
};

export type FriendSearchResponse = {
  players: FriendSearchResult[];
};

export type FriendRelationshipResponse = {
  relationship: FriendRelationship;
};

export type SendFriendRequestResponse = FriendRelationshipResponse & {
  request: { id: string; createdAt: string | null };
};

export type AcceptFriendRequestResponse = FriendRelationshipResponse & {
  friend: Friend;
};

export type FriendPresenceResponse = {
  online: boolean;
  checkedAt: string;
};
