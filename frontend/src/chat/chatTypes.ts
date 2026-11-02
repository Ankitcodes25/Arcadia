import type { Friend } from "../friends/friendsTypes";

export type ChatMessageStatus = "SENT" | "DELIVERED" | "READ";

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  text: string;
  status: ChatMessageStatus;
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt: string | null;
  createdAt: string;
};

export type ChatClearRequestStatus = "pending" | "accepted" | "declined" | "cancelled";

/**
 * A persisted request to permanently clear a conversation for both
 * participants. Direction is derived on the client from requesterId.
 */
export type ChatClearRequest = {
  id: string;
  conversationId: string;
  requesterId: string;
  recipientId: string;
  requesterUsername: string;
  status: ChatClearRequestStatus;
  createdAt: string | null;
  respondedAt: string | null;
};

export type ChatConversation = {
  id: string;
  friend: Friend;
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastMessageFromMe: boolean;
  unreadCount: number;
  /** The conversation's pending clear request, if any. */
  clearRequest?: ChatClearRequest | null;
};

export type ChatConversationsResponse = {
  conversations: ChatConversation[];
};

export type ChatMessagesResponse = {
  messages: ChatMessage[];
  hasMore: boolean;
  nextCursor: string | null;
  /** The viewer's own "clear my side" cutoff, if they set one. */
  clearedAt?: string | null;
};

export type ChatClearScope = "me" | "both";

export type ChatClearStateResponse = {
  /** The pending request for this conversation, from either participant. */
  request: ChatClearRequest | null;
  /** The viewer's latest answered request they have not dismissed yet. */
  outcome: ChatClearRequest | null;
};

export type ClearChatForMeResponse = {
  scope: "me";
  conversationId: string | null;
  clearedAt: string;
};

export type ChatClearRequestResponse = {
  request: ChatClearRequest;
};

export type AcceptChatClearResponse = ChatClearRequestResponse & {
  conversationId: string;
  deletedCount: number;
};

export type ChatClearRequestEvent = {
  request: ChatClearRequest;
};

export type ChatClearedEvent = {
  scope: ChatClearScope;
  conversationWith: string;
  clearedAt: string | null;
};

export type FriendsChangedEvent = {
  reason: "removed" | "blocked" | "unblocked";
  /** The other player whose relationship with the viewer changed. */
  userId: string;
};

export type SendChatMessageResponse = {
  message: ChatMessage;
};

export type MarkChatReadResponse = {
  conversationId: string | null;
  readAt: string | null;
  messageIds: string[];
};

export type ChatMessageEvent = {
  message: ChatMessage;
};

export type ChatMessageStatusEvent = {
  conversationWith: string;
  messageIds: string[];
  status: ChatMessageStatus;
  deliveredAt?: string | null;
  readAt?: string | null;
};

export type ChatTypingEvent = {
  friendId: string;
  typing: boolean;
};

export type ChatChangedEvent = {
  reason: "message" | "read" | "sent" | "refresh" | "clear-request" | "cleared" | "friendship";
};

export type ChatErrorEvent = {
  event: string;
  error: string;
};
