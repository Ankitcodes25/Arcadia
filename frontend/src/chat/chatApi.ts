import { apiRequest } from "../auth/authApi";
import type {
  ChatConversationsResponse,
  ChatMessagesResponse,
  MarkChatReadResponse,
  SendChatMessageResponse,
} from "./chatTypes";

export const CHAT_CHANGED_EVENT = "arcadia:chat-changed";

/**
 * Local chat surfaces use this event for actions they performed themselves.
 * Realtime server events arrive through chatSocket.ts and are merged by the
 * same components, so there is only one notification path per source.
 */
export function notifyChatChanged(source: "chat-modal" | "friends-modal" | "navbar" = "navbar") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CHAT_CHANGED_EVENT, { detail: { source } }));
}

function request<T>(path: string, input: Parameters<typeof apiRequest>[1] = {}) {
  return apiRequest<T>(path, input, { credentials: "omit" });
}

export const chatApi = {
  listConversations() {
    return request<ChatConversationsResponse>("/api/v1/chat/conversations");
  },

  listMessages(friendId: string, options: { before?: string | null; limit?: number } = {}) {
    const params = new URLSearchParams();
    if (options.before) params.set("before", options.before);
    if (options.limit) params.set("limit", String(options.limit));
    const suffix = params.toString();
    return request<ChatMessagesResponse>(
      `/api/v1/chat/conversations/${encodeURIComponent(friendId)}/messages${suffix ? `?${suffix}` : ""}`,
    );
  },

  sendMessage(friendId: string, text: string, clientMessageId: string) {
    return request<SendChatMessageResponse>(
      `/api/v1/chat/conversations/${encodeURIComponent(friendId)}/messages`,
      {
        method: "POST",
        body: { text, clientMessageId },
      },
    );
  },

  markRead(friendId: string) {
    return request<MarkChatReadResponse>(
      `/api/v1/chat/conversations/${encodeURIComponent(friendId)}/read`,
      { method: "POST" },
    );
  },
};
