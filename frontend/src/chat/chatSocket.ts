import { io, type Socket } from "socket.io-client";
import { getAccessToken, getApiBaseUrl } from "../auth/authApi";
import type {
  ChatChangedEvent,
  ChatErrorEvent,
  ChatMessageEvent,
  ChatMessageStatusEvent,
  ChatTypingEvent,
} from "./chatTypes";

type ChatEventMap = {
  "chat:message": ChatMessageEvent;
  "chat:message-status": ChatMessageStatusEvent;
  "chat:read": ChatMessageStatusEvent;
  "chat:typing": ChatTypingEvent;
  "chat:changed": ChatChangedEvent;
  "chat:error": ChatErrorEvent;
};

type ChatEventName = keyof ChatEventMap;
type ChatHandler<T> = (payload: T) => void;

const SOCKET_EVENTS: ChatEventName[] = [
  "chat:message",
  "chat:message-status",
  "chat:read",
  "chat:typing",
  "chat:changed",
  "chat:error",
];

const ACK_BATCH_MS = 30;
const ACK_BATCH_MAX = 200;

const handlers = new Map<ChatEventName, Set<ChatHandler<unknown>>>();
let socket: Socket | null = null;
let activeUserId: string | null = null;
let ackTimer: ReturnType<typeof setTimeout> | null = null;
const pendingAckIds = new Set<string>();

function dispatch<T extends ChatEventName>(event: T, payload: ChatEventMap[T]) {
  const eventHandlers = handlers.get(event);
  if (!eventHandlers) return;
  for (const handler of eventHandlers) {
    handler(payload);
  }
}

function clearAckQueue() {
  if (ackTimer !== null) {
    clearTimeout(ackTimer);
    ackTimer = null;
  }
  pendingAckIds.clear();
}

function flushDeliveryAcks() {
  ackTimer = null;
  if (!socket || !socket.connected) {
    clearAckQueue();
    return;
  }

  const ids: string[] = [];
  for (const id of pendingAckIds) {
    ids.push(id);
    if (ids.length >= ACK_BATCH_MAX) break;
  }

  for (const id of ids) {
    pendingAckIds.delete(id);
  }

  if (ids.length) {
    socket.emit("chat:delivered", { messageIds: ids });
  }

  if (pendingAckIds.size) {
    ackTimer = setTimeout(flushDeliveryAcks, 0);
  }
}

function queueDeliveryAck(messageIds: string[]) {
  if (!socket || !socket.connected) return;

  for (const id of messageIds) {
    if (typeof id === "string" && id) pendingAckIds.add(id);
  }
  if (!pendingAckIds.size || ackTimer !== null) return;
  ackTimer = setTimeout(flushDeliveryAcks, ACK_BATCH_MS);
}

/**
 * The authenticated device acknowledges receipt of messages. The backend
 * ignores this claim unless the authenticated user is the persisted recipient
 * of every supplied message, so this never moves another user's status.
 */
export function acknowledgeChatDelivered(messageIds: string[]) {
  queueDeliveryAck(messageIds);
}

export function onChatEvent<T extends ChatEventName>(
  event: T,
  handler: ChatHandler<ChatEventMap[T]>,
) {
  const eventHandlers = handlers.get(event) || new Set<ChatHandler<unknown>>();
  eventHandlers.add(handler as ChatHandler<unknown>);
  handlers.set(event, eventHandlers);

  return () => {
    eventHandlers.delete(handler as ChatHandler<unknown>);
    if (!eventHandlers.size) handlers.delete(event);
  };
}

export function connectChatSocket(userId: string) {
  // Component tests run through Vite's SSR module loader. They deliberately
  // exercise the API/UI without opening a real browser socket.
  if ((import.meta.env as { SSR?: boolean }).SSR) return null;
  if (!userId || !getAccessToken()) return null;
  if (socket && activeUserId === userId) {
    if (!socket.connected) socket.connect();
    return socket;
  }

  disconnectChatSocket();
  activeUserId = userId;
  socket = io(getApiBaseUrl(), {
    // Read the token at every reconnect attempt so a token refreshed by the
    // normal REST layer is picked up without a page reload.
    auth: (callback) => callback({ token: getAccessToken() || "" }),
    transports: ["websocket", "polling"],
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 5000,
    timeout: 10_000,
  });

  for (const event of SOCKET_EVENTS) {
    socket.on(event, (payload: ChatEventMap[typeof event]) => {
      dispatch(event, payload);
    });
  }

  // The recipient's device, not its presence, confirms delivery. Pending
  // messages replayed after reconnect are acknowledged in the same path.
  socket.on("chat:message", (payload: ChatMessageEvent) => {
    const message = payload && payload.message;
    if (
      message
      && message.receiverId === activeUserId
      && message.status === "SENT"
    ) {
      queueDeliveryAck([message.id]);
    }
  });

  // A reconnect can happen after a token refresh, a network change or the tab
  // waking up. Refresh persisted summaries immediately instead of waiting for
  // the next 30-second poll, and allow pending messages to be acknowledged
  // again if a previous acknowledgement was lost with the old connection.
  socket.on("connect", () => {
    dispatch("chat:changed", { reason: "refresh" });
  });

  socket.on("disconnect", () => {
    clearAckQueue();
  });

  return socket;
}

export function disconnectChatSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  activeUserId = null;
  clearAckQueue();
}

export function sendChatTyping(friendId: string, typing: boolean) {
  if (!socket || !socket.connected) return;
  socket.emit("chat:typing", { friendId, typing });
}

export function isChatSocketConnected() {
  return Boolean(socket && socket.connected);
}
