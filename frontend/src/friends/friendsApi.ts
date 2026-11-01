import { apiRequest, getAccessToken } from "../auth/authApi";
import type {
  AcceptFriendRequestResponse,
  FriendPresenceResponse,
  FriendRelationshipResponse,
  FriendRequestsResponse,
  FriendSearchResponse,
  FriendsResponse,
  FriendSummaryResponse,
  SendFriendRequestResponse,
} from "./friendsTypes";

export const FRIENDS_CHANGED_EVENT = "arcadia:friends-changed";

export function hasAuthToken() {
  return Boolean(getAccessToken());
}

/**
 * Notifies every mounted surface (the navbar badge, an open profile, an open
 * Friends modal) that a relationship changed. The optional source lets a sender
 * ignore its own broadcast and avoid a duplicate refresh.
 */
export function notifyFriendsChanged(source: "friends-modal" | "profile" | "navbar" = "navbar") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FRIENDS_CHANGED_EVENT, { detail: { source } }));
}

function request<T>(path: string, input: Parameters<typeof apiRequest>[1] = {}) {
  return apiRequest<T>(path, input, { credentials: "omit" });
}

export const friendsApi = {
  listFriends() {
    return request<FriendsResponse>("/api/v1/friends");
  },

  listRequests() {
    return request<FriendRequestsResponse>("/api/v1/friends/requests");
  },

  getSummary() {
    return request<FriendSummaryResponse>("/api/v1/friends/summary");
  },

  searchPlayers(query: string) {
    const suffix = new URLSearchParams({ q: query }).toString();
    return request<FriendSearchResponse>(`/api/v1/friends/search?${suffix}`);
  },

  getRelationship(userId: string) {
    return request<FriendRelationshipResponse>(
      `/api/v1/friends/status/${encodeURIComponent(userId)}`,
    );
  },

  sendRequest(userId: string) {
    return request<SendFriendRequestResponse>("/api/v1/friends/requests", {
      method: "POST",
      body: { userId },
    });
  },

  acceptRequest(requestId: string) {
    return request<AcceptFriendRequestResponse>(
      `/api/v1/friends/requests/${encodeURIComponent(requestId)}/accept`,
      { method: "POST" },
    );
  },

  rejectRequest(requestId: string) {
    return request<FriendRelationshipResponse>(
      `/api/v1/friends/requests/${encodeURIComponent(requestId)}/reject`,
      { method: "POST" },
    );
  },

  cancelRequest(requestId: string) {
    return request<FriendRelationshipResponse>(
      `/api/v1/friends/requests/${encodeURIComponent(requestId)}`,
      { method: "DELETE" },
    );
  },

  blockRequest(requestId: string) {
    return request<FriendRelationshipResponse>(
      `/api/v1/friends/requests/${encodeURIComponent(requestId)}/block`,
      { method: "POST" },
    );
  },

  blockUser(userId: string) {
    return request<FriendRelationshipResponse>("/api/v1/friends/blocks", {
      method: "POST",
      body: { userId },
    });
  },

  unblockUser(userId: string) {
    return request<FriendRelationshipResponse>(
      `/api/v1/friends/blocks/${encodeURIComponent(userId)}`,
      { method: "DELETE" },
    );
  },

  heartbeat() {
    return request<FriendPresenceResponse>("/api/v1/friends/presence/heartbeat", {
      method: "POST",
    });
  },
};
