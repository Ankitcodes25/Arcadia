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

export type ChatConversation = {
  id: string;
  friend: Friend;
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastMessageFromMe: boolean;
  unreadCount: number;
};

export type ChatConversationsResponse = {
  conversations: ChatConversation[];
};

export type ChatMessagesResponse = {
  messages: ChatMessage[];
  hasMore: boolean;
  nextCursor: string | null;
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
  reason: "message" | "read" | "sent" | "refresh";
};

export type ChatErrorEvent = {
  event: string;
  error: string;
};
