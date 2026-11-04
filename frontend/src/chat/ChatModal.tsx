import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Eraser, MessageSquare, MoreVertical, Send, X } from "lucide-react";
import { getAuthErrorMessage } from "../auth/authUtils";
import { acquireModalScrollLock } from "../auth/modalScrollLock";
import ConfirmDialog from "../components/ConfirmDialog";
import FriendAvatar from "../friends/FriendAvatar";
import OnlineStatusIndicator from "../friends/OnlineStatusIndicator";
import type { Friend } from "../friends/friendsTypes";
import { chatApi, notifyChatChanged } from "./chatApi";
import { acknowledgeChatDelivered, onChatEvent, sendChatTyping } from "./chatSocket";
import type { ChatClearRequest, ChatMessage, ChatMessageStatus } from "./chatTypes";
import "./ChatModal.css";

type ChatModalProps = {
  friend: Friend;
  currentUserId: string;
  onClose: () => void;
};

const PAGE_SIZE = 30;
const TYPING_STOP_MS = 1600;
const TYPING_DISPLAY_MS = 4200;
const STATUS_RANK: Record<ChatMessageStatus, number> = {
  SENT: 0,
  DELIVERED: 1,
  READ: 2,
};

function messageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function dateKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (dateKey(value) === dateKey(today.toISOString())) return "Today";
  if (dateKey(value) === dateKey(yesterday.toISOString())) return "Yesterday";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    const existing = byId.get(message.id);
    if (!existing) {
      byId.set(message.id, message);
      continue;
    }

    // Socket status events can arrive before the REST send response. Never let
    // an older SENT payload overwrite a newer DELIVERED or READ state.
    const status = STATUS_RANK[message.status] >= STATUS_RANK[existing.status]
      ? message.status
      : existing.status;
    byId.set(message.id, {
      ...existing,
      ...message,
      status,
      sentAt: message.sentAt ?? existing.sentAt,
      deliveredAt: message.deliveredAt ?? existing.deliveredAt,
      readAt: message.readAt ?? existing.readAt,
    });
  }

  return [...byId.values()].sort((left, right) => {
    const leftTime = Date.parse(left.createdAt) || 0;
    const rightTime = Date.parse(right.createdAt) || 0;
    if (leftTime !== rightTime) return leftTime - rightTime;
    return left.id.localeCompare(right.id);
  });
}

function createClientMessageId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/*
 * Delivery ticks drawn on a 1-unit-per-pixel grid. Lucide's CheckCheck tucks
 * the second tick's short stroke behind the first; at timestamp size that
 * stroke is under a pixel, so the pair read as one tick plus a clipped line.
 * Here both ticks are complete and parallel with a clear gap, and SENT uses
 * the same box so the timestamp never shifts when the status advances.
 */
function MessageTicks({ double }: { double: boolean }) {
  return (
    <svg
      viewBox="0 0 18 11"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1.2 5.8 4.4 9l6.2-6.6" />
      {double && <path d="M8.4 7.6 9.8 9l7-6.6" />}
    </svg>
  );
}

function MessageStatus({ status }: { status: ChatMessageStatus }) {
  const label = status === "READ" ? "Read" : status === "DELIVERED" ? "Delivered" : "Sent";
  return (
    <span
      className={`chat-message-status chat-message-status--${status.toLowerCase()}`}
      role="img"
      title={label}
      aria-label={label}
    >
      <MessageTicks double={status !== "SENT"} />
    </span>
  );
}

type ClearAction = "accept" | "decline" | "cancel" | "dismiss";

/*
 * The clear-chat request card shown at the top of the message area. It only
 * renders states the server reported: an incoming request to answer, the
 * viewer's own pending request, or the answer to the viewer's request.
 */
function ClearRequestBanner({
  request,
  outcome,
  currentUserId,
  action,
  error,
  onAccept,
  onDecline,
  onCancel,
  onDismiss,
}: {
  request: ChatClearRequest | null;
  outcome: ChatClearRequest | null;
  currentUserId: string;
  action: ClearAction | null;
  error: string | null;
  onAccept: () => void;
  onDecline: () => void;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  const busy = action !== null;
  const spinner = <span className="chat-spinner" aria-hidden="true" />;

  if (request && request.recipientId === currentUserId) {
    return (
      <section className="chat-clear-banner" role="region" aria-labelledby="chat-clear-banner-title">
        <h3 id="chat-clear-banner-title">Clear Chat Request</h3>
        <p>
          <strong>{request.requesterUsername}</strong> wants to permanently clear this conversation
          for both of you. Do you agree?
        </p>
        {error && <p className="chat-clear-banner-error" role="alert">{error}</p>}
        <div className="chat-clear-banner-actions">
          <button
            type="button"
            className="chat-clear-banner-button chat-clear-banner-button--primary"
            disabled={busy}
            onClick={onAccept}
          >
            {action === "accept" && spinner}
            {action === "accept" ? "Clearing…" : "Accept"}
          </button>
          <button
            type="button"
            className="chat-clear-banner-button"
            disabled={busy}
            onClick={onDecline}
          >
            {action === "decline" && spinner}
            {action === "decline" ? "Declining…" : "Decline"}
          </button>
        </div>
      </section>
    );
  }

  if (request && request.requesterId === currentUserId) {
    return (
      <section className="chat-clear-banner chat-clear-banner--pending" role="status">
        <div className="chat-clear-banner-row">
          <div>
            <h3>Clear Chat Request sent</h3>
            <p>Waiting for the other person to respond</p>
          </div>
          <button
            type="button"
            className="chat-clear-banner-button"
            disabled={busy}
            onClick={onCancel}
          >
            {action === "cancel" && spinner}
            {action === "cancel" ? "Cancelling…" : "Cancel request"}
          </button>
        </div>
        {error && <p className="chat-clear-banner-error" role="alert">{error}</p>}
      </section>
    );
  }

  if (outcome) {
    const declined = outcome.status === "declined";
    return (
      <section
        className={`chat-clear-banner chat-clear-banner--${declined ? "declined" : "accepted"}`}
        role="status"
      >
        <div className="chat-clear-banner-row">
          <p className="chat-clear-banner-outcome">
            {declined ? "Your Clear Chat Request was declined" : "Chat cleared for both users"}
          </p>
          <button
            type="button"
            className="chat-clear-banner-button"
            disabled={busy}
            onClick={onDismiss}
          >
            {action === "dismiss" ? "Dismissing…" : "Dismiss"}
          </button>
        </div>
        {error && <p className="chat-clear-banner-error" role="alert">{error}</p>}
      </section>
    );
  }

  return null;
}

function ChatModal({ friend, currentUserId, onClose }: ChatModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasMessages, setHasMessages] = useState<boolean | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [friendTyping, setFriendTyping] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearBoth, setClearBoth] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [clearRequest, setClearRequest] = useState<ChatClearRequest | null>(null);
  const [clearOutcome, setClearOutcome] = useState<ChatClearRequest | null>(null);
  const [clearStateError, setClearStateError] = useState<string | null>(null);
  const [clearStateLoaded, setClearStateLoaded] = useState(false);
  const [clearAction, setClearAction] = useState<ClearAction | null>(null);
  const [clearActionError, setClearActionError] = useState<string | null>(null);
  const [clearNotice, setClearNotice] = useState<{ tone: "success" | "info"; message: string } | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);
  const menuOpenRef = useRef(false);
  const clearActionRef = useRef(false);
  const confirmBusyRef = useRef(false);
  const friendIdRef = useRef(friend.id);
  const clearSequence = useRef(0);
  const clearNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The viewer's own "clear my side" cutoff. Late socket or replayed rows at
  // or before it are dropped so cleared history cannot reappear.
  const clearedAtRef = useRef<number | null>(null);
  // The conversation currently loaded for this friend. After a block and a new
  // friendship the same friend has a different conversation id, so a delayed
  // event from the old thread must be ignored rather than merged into the new
  // one.
  const conversationIdRef = useRef<string | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const loadSequence = useRef(0);
  const loadingOlderRef = useRef(false);
  const loadedOlderRef = useRef(false);
  const sendingRef = useRef(false);
  const stickToBottomRef = useRef(true);
  const typingSentRef = useRef(false);
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const friendTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markReadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const node = messagesRef.current;
    if (!node) return;
    if (behavior === "smooth" && typeof node.scrollTo === "function") {
      node.scrollTo({ top: node.scrollHeight, behavior });
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, []);

  const markReadNow = useCallback(async () => {
    try {
      const response = await chatApi.markRead(friend.id);
      if (response.messageIds.length) {
        notifyChatChanged("chat-modal");
      }
    } catch {
      // Read receipts are best-effort. A later open or refresh retries them.
    }
  }, [friend.id]);

  const scheduleMarkRead = useCallback((delay = 250) => {
    if (markReadTimer.current !== null) clearTimeout(markReadTimer.current);
    markReadTimer.current = setTimeout(() => {
      markReadTimer.current = null;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void markReadNow();
    }, delay);
  }, [markReadNow]);

  const isVisible = useCallback((message: ChatMessage) => {
    const cutoff = clearedAtRef.current;
    return cutoff === null || (Date.parse(message.createdAt) || 0) > cutoff;
  }, []);

  // A message from an older conversation with the same friend must not survive
  // a reload once the current conversation id is known.
  const keepForConversation = useCallback((message: ChatMessage) => {
    const conversationId = conversationIdRef.current;
    if (conversationId && message.conversationId !== conversationId) return false;
    return isVisible(message);
  }, [isVisible]);

  const showClearNotice = useCallback((tone: "success" | "info", message: string) => {
    setClearNotice({ tone, message });
    if (clearNoticeTimer.current !== null) clearTimeout(clearNoticeTimer.current);
    clearNoticeTimer.current = setTimeout(() => {
      clearNoticeTimer.current = null;
      setClearNotice(null);
    }, 6000);
  }, []);

  /**
   * Drops every loaded row and any in-flight page. Bumping the load sequence
   * means a history response that left the server before the clear can never
   * be merged back in, and the old pagination cursor is forgotten.
   */
  const resetHistory = useCallback(() => {
    loadSequence.current += 1;
    loadingOlderRef.current = false;
    loadedOlderRef.current = false;
    stickToBottomRef.current = true;
    setMessages([]);
    setHasMore(false);
    setNextCursor(null);
    setLoading(false);
    setLoadError(null);
    setLoadingOlder(false);
    setOlderError(null);
  }, []);

  const loadClearState = useCallback(async () => {
    const sequence = ++clearSequence.current;
    setClearStateLoaded(false);
    try {
      const response = await chatApi.getClearState(friend.id);
      if (sequence !== clearSequence.current) return;
      setClearRequest(response.request);
      setClearOutcome(response.outcome);
      setClearStateError(null);
      setClearStateLoaded(true);
    } catch (error) {
      if (sequence !== clearSequence.current) return;
      setClearStateError(getAuthErrorMessage(error, "Clear Chat status is unavailable."));
      setClearStateLoaded(false);
    }
  }, [friend.id]);

  const acknowledgeIncoming = useCallback((incoming: ChatMessage[]) => {
    const messageIds = incoming
      .filter((message) => (
        message.receiverId === currentUserId && message.status === "SENT"
      ))
      .map((message) => message.id);
    if (messageIds.length) acknowledgeChatDelivered(messageIds);
  }, [currentUserId]);

  const refreshMessages = useCallback(async () => {
    const sequence = loadSequence.current;
    try {
      const response = await chatApi.listMessages(friend.id, { limit: PAGE_SIZE });
      if (sequence !== loadSequence.current) return;
      conversationIdRef.current = response.conversationId ?? null;
      clearedAtRef.current = response.clearedAt ? Date.parse(response.clearedAt) : null;
      setHasMessages(response.hasMessages ?? response.messages.length > 0);
      setMessages((current) => mergeMessages(current.filter(keepForConversation), response.messages));
      if (!loadedOlderRef.current) {
        setHasMore(response.hasMore);
        setNextCursor(response.nextCursor);
      }
      setLoadError(null);
      acknowledgeIncoming(response.messages);
      scheduleMarkRead(0);
      if (stickToBottomRef.current) {
        requestAnimationFrame(() => scrollToBottom("smooth"));
      }
    } catch {
      // Reconnect catch-up is best-effort; the next open or message retries it.
    }
  }, [acknowledgeIncoming, friend.id, keepForConversation, scheduleMarkRead, scrollToBottom]);

  const stopTyping = useCallback(() => {
    if (typingStopTimer.current !== null) {
      clearTimeout(typingStopTimer.current);
      typingStopTimer.current = null;
    }
    if (typingSentRef.current) {
      sendChatTyping(friend.id, false);
      typingSentRef.current = false;
    }
  }, [friend.id]);

  useEffect(() => acquireModalScrollLock(), []);

  useEffect(() => {
    menuOpenRef.current = menuOpen;
  }, [menuOpen]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // An open header menu owns the first Escape.
      if (menuOpenRef.current) {
        setMenuOpen(false);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  useEffect(() => () => {
    clearSequence.current += 1;
    if (clearNoticeTimer.current !== null) clearTimeout(clearNoticeTimer.current);
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleMarkRead(0);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [scheduleMarkRead]);

  useEffect(() => {
    const sequence = ++loadSequence.current;
    friendIdRef.current = friend.id;
    setLoading(true);
    setLoadError(null);
    setMessages([]);
    setHasMessages(null);
    setHasMore(false);
    setNextCursor(null);
    setLoadingOlder(false);
    loadedOlderRef.current = false;
    setOlderError(null);
    setDraft("");
    setSendError(null);
    setFriendTyping(false);
    stickToBottomRef.current = true;
    clearedAtRef.current = null;
    conversationIdRef.current = null;
    setClearRequest(null);
    setClearOutcome(null);
    setClearStateError(null);
    setClearStateLoaded(false);
    setClearActionError(null);
    setClearNotice(null);
    setConfirmOpen(false);
    setClearBoth(false);
    setConfirmError(null);
    setMenuOpen(false);
    void loadClearState();

    chatApi.listMessages(friend.id, { limit: PAGE_SIZE })
      .then((response) => {
        if (sequence !== loadSequence.current) return;
        conversationIdRef.current = response.conversationId ?? null;
        clearedAtRef.current = response.clearedAt ? Date.parse(response.clearedAt) : null;
        setHasMessages(response.hasMessages ?? response.messages.length > 0);
        setMessages((current) => mergeMessages(current.filter(keepForConversation), response.messages));
        setHasMore(response.hasMore);
        setNextCursor(response.nextCursor);
        setLoading(false);
        acknowledgeIncoming(response.messages);
        requestAnimationFrame(() => scrollToBottom());
        scheduleMarkRead(0);
      })
      .catch((error) => {
        if (sequence !== loadSequence.current) return;
        setLoading(false);
        setLoadError(getAuthErrorMessage(error, "Unable to load this conversation."));
      });

    return () => {
      loadSequence.current += 1;
      if (markReadTimer.current !== null) {
        clearTimeout(markReadTimer.current);
        markReadTimer.current = null;
      }
      if (typingStopTimer.current !== null) {
        clearTimeout(typingStopTimer.current);
        typingStopTimer.current = null;
      }
      if (friendTypingTimer.current !== null) {
        clearTimeout(friendTypingTimer.current);
        friendTypingTimer.current = null;
      }
      if (typingSentRef.current) {
        sendChatTyping(friend.id, false);
        typingSentRef.current = false;
      }
    };
  }, [acknowledgeIncoming, friend.id, keepForConversation, loadClearState, scheduleMarkRead, scrollToBottom]);

  useEffect(() => {
    const belongsToConversation = (message: ChatMessage) => {
      const activeConversationId = conversationIdRef.current;
      if (activeConversationId && message.conversationId) {
        return message.conversationId === activeConversationId;
      }
      return (
        (message.senderId === currentUserId && message.receiverId === friend.id)
        || (message.senderId === friend.id && message.receiverId === currentUserId)
      );
    };

    const unsubscribeMessage = onChatEvent("chat:message", ({ message }) => {
      if (!belongsToConversation(message) || !isVisible(message)) return;
      setHasMessages(true);
      setMessages((current) => mergeMessages(current, [message]));

      if (message.senderId === friend.id && message.receiverId === currentUserId) {
        scheduleMarkRead(400);
      }

      if (stickToBottomRef.current) {
        requestAnimationFrame(() => scrollToBottom("smooth"));
      }
    });

    const applyStatus = (event: {
      conversationWith: string;
      messageIds: string[];
      status: ChatMessageStatus;
      deliveredAt?: string | null;
      readAt?: string | null;
    }) => {
      if (event.conversationWith !== friend.id) return;
      setMessages((current) => current.map((message) => {
        if (!event.messageIds.includes(message.id)) return message;
        const status = STATUS_RANK[event.status] >= STATUS_RANK[message.status]
          ? event.status
          : message.status;
        return {
          ...message,
          status,
          deliveredAt: event.deliveredAt ?? message.deliveredAt,
          readAt: event.readAt ?? message.readAt,
        };
      }));
    };

    const unsubscribeStatus = onChatEvent("chat:message-status", applyStatus);
    const unsubscribeRead = onChatEvent("chat:read", applyStatus);

    const unsubscribeTyping = onChatEvent("chat:typing", ({ friendId, typing }) => {
      if (friendId !== friend.id) return;
      setFriendTyping(typing);
      if (friendTypingTimer.current !== null) clearTimeout(friendTypingTimer.current);
      if (typing) {
        friendTypingTimer.current = setTimeout(() => {
          friendTypingTimer.current = null;
          setFriendTyping(false);
        }, TYPING_DISPLAY_MS);
      }
    });

    // A reconnect can miss status fan-out while the socket was down. Re-read
    // the newest page so persisted delivery/read states catch up without a
    // page refresh; mergeMessages keeps existing rows and newer local states.
    const unsubscribeRefresh = onChatEvent("chat:changed", ({ reason }) => {
      if (reason !== "refresh") return;
      void refreshMessages();
      void loadClearState();
    });

    const belongsToPair = (request: ChatClearRequest) => {
      const activeConversationId = conversationIdRef.current;
      if (activeConversationId && request.conversationId !== activeConversationId) {
        return false;
      }
      return (
        (request.requesterId === currentUserId && request.recipientId === friend.id)
        || (request.requesterId === friend.id && request.recipientId === currentUserId)
      );
    };

    const unsubscribeClearRequest = onChatEvent("chat:clear-request", ({ request }) => {
      if (!belongsToPair(request)) return;
      setClearActionError(null);
      if (request.status === "pending") {
        setClearRequest(request);
        if (request.requesterId === currentUserId) setClearOutcome(null);
        return;
      }

      setClearRequest((current) => (current?.id === request.id ? null : current));
      if (request.status === "accepted") {
        // Acceptance deletes both sides; never briefly re-enable the menu
        // between this event and the chat:cleared event.
        setHasMessages(false);
      }
      if (request.requesterId === currentUserId && request.status !== "cancelled") {
        setClearOutcome(request);
      } else if (request.recipientId === currentUserId && request.status === "cancelled") {
        showClearNotice("info", `${request.requesterUsername} cancelled their Clear Chat Request.`);
      }
    });

    const unsubscribeCleared = onChatEvent("chat:cleared", ({ scope, conversationWith, clearedAt }) => {
      if (conversationWith !== friend.id) return;
      if (scope === "me") {
        clearedAtRef.current = clearedAt ? Date.parse(clearedAt) : Date.now();
      } else {
        clearedAtRef.current = null;
        setHasMessages(false);
      }
      resetHistory();
    });

    return () => {
      unsubscribeMessage();
      unsubscribeStatus();
      unsubscribeRead();
      unsubscribeTyping();
      unsubscribeRefresh();
      unsubscribeClearRequest();
      unsubscribeCleared();
    };
  }, [
    currentUserId,
    friend.id,
    isVisible,
    loadClearState,
    refreshMessages,
    resetHistory,
    scheduleMarkRead,
    scrollToBottom,
    showClearNotice,
  ]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 116)}px`;
  }, [draft]);

  const loadOlder = useCallback(async () => {
    if (loadingOlderRef.current || !hasMore || !nextCursor) return;

    const sequence = loadSequence.current;
    const node = messagesRef.current;
    const previousHeight = node?.scrollHeight ?? 0;
    const previousTop = node?.scrollTop ?? 0;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    setOlderError(null);

    try {
      const response = await chatApi.listMessages(friend.id, {
        before: nextCursor,
        limit: PAGE_SIZE,
      });
      if (sequence !== loadSequence.current) return;
      setHasMessages(response.hasMessages ?? response.messages.length > 0);
      setMessages((current) => mergeMessages(current, response.messages));
      setHasMore(response.hasMore);
      setNextCursor(response.nextCursor);
      loadedOlderRef.current = true;
      acknowledgeIncoming(response.messages);
      requestAnimationFrame(() => {
        if (sequence !== loadSequence.current || !node) return;
        node.scrollTop = Math.max(0, node.scrollHeight - previousHeight + previousTop);
      });
    } catch (error) {
      if (sequence === loadSequence.current) {
        setOlderError(getAuthErrorMessage(error, "Unable to load older messages."));
      }
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [acknowledgeIncoming, friend.id, hasMore, nextCursor]);

  const handleScroll = () => {
    const node = messagesRef.current;
    if (!node) return;
    stickToBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 90;
    if (node.scrollTop <= 48) void loadOlder();
  };

  const handleDraftChange = (value: string) => {
    setDraft(value);
    if (!value.trim()) {
      stopTyping();
      return;
    }

    if (!typingSentRef.current) {
      sendChatTyping(friend.id, true);
      typingSentRef.current = true;
    }
    if (typingStopTimer.current !== null) clearTimeout(typingStopTimer.current);
    typingStopTimer.current = setTimeout(() => {
      typingStopTimer.current = null;
      stopTyping();
    }, TYPING_STOP_MS);
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sendingRef.current) return;
    const draftAtSend = draft;

    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    stopTyping();

    try {
      const response = await chatApi.sendMessage(friend.id, text, createClientMessageId());
      setHasMessages(true);
      setMessages((current) => mergeMessages(current, [response.message]));
      // Do not erase a new draft the reader started typing while this send was
      // in flight. Only the exact text that was submitted is cleared.
      setDraft((current) => (current === draftAtSend ? "" : current));
      stickToBottomRef.current = true;
      requestAnimationFrame(() => scrollToBottom("smooth"));
      notifyChatChanged("chat-modal");
    } catch (error) {
      setSendError(getAuthErrorMessage(error, "Message could not be sent. Please try again."));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void handleSend();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void handleSend();
  };

  const pendingRequestExists = clearRequest !== null;
  const clearDisabled = !clearStateLoaded
    || pendingRequestExists
    || hasMessages !== true
    || messages.length === 0
    || confirmBusy;
  const clearDisabledReason = !clearStateLoaded
    ? "Checking whether Clear Chat is available."
    : pendingRequestExists
      ? "A Clear Chat Request for this chat is already pending."
      : hasMessages !== true || messages.length === 0
        ? "There are no messages to clear."
        : undefined;

  const openClearConfirm = () => {
    if (clearDisabled) return;
    setMenuOpen(false);
    setClearBoth(false);
    setConfirmError(null);
    setConfirmOpen(true);
  };

  const handleConfirmClear = async () => {
    if (confirmBusyRef.current) return;
    if (clearBoth && pendingRequestExists) {
      setConfirmError("A Clear Chat Request for this chat is already pending.");
      return;
    }
    if (clearBoth && (hasMessages !== true || messages.length === 0)) {
      setConfirmError("There are no messages to clear.");
      return;
    }

    const targetFriendId = friend.id;
    confirmBusyRef.current = true;
    setConfirmBusy(true);
    setConfirmError(null);
    try {
      if (clearBoth) {
        // Nothing is deleted yet: the friend has to accept first.
        const response = await chatApi.requestClearForBoth(friend.id);
        if (friendIdRef.current !== targetFriendId) return;
        setClearRequest(response.request);
        setClearOutcome(null);
        setClearActionError(null);
      } else {
        const response = await chatApi.clearForMe(friend.id);
        if (friendIdRef.current !== targetFriendId) return;
        clearedAtRef.current = Date.parse(response.clearedAt) || Date.now();
        resetHistory();
        showClearNotice("success", `Chat cleared for you. ${friend.username} still has the full history.`);
      }
      notifyChatChanged("chat-modal");
      setConfirmOpen(false);
    } catch (error) {
      if (friendIdRef.current !== targetFriendId) return;
      setConfirmError(getAuthErrorMessage(error, "The chat could not be cleared. Please try again."));
      // A 409 means a request appeared meanwhile; show the real state.
      void loadClearState();
    } finally {
      confirmBusyRef.current = false;
      setConfirmBusy(false);
    }
  };

  const runClearAction = async (action: ClearAction, run: () => Promise<void>, fallback: string) => {
    if (clearActionRef.current) return;
    const targetFriendId = friend.id;
    clearActionRef.current = true;
    setClearAction(action);
    setClearActionError(null);
    try {
      await run();
      if (friendIdRef.current !== targetFriendId) return;
      notifyChatChanged("chat-modal");
    } catch (error) {
      if (friendIdRef.current !== targetFriendId) return;
      setClearActionError(getAuthErrorMessage(error, fallback));
      // Restore whatever the server now holds (for example, the requester
      // cancelled while this answer was in flight).
      void loadClearState();
    } finally {
      clearActionRef.current = false;
      setClearAction(null);
    }
  };

  const handleAcceptClear = () => {
    const request = clearRequest;
    if (!request) return;
    const targetFriendId = friend.id;
    void runClearAction("accept", async () => {
      await chatApi.acceptClearRequest(request.id);
      if (friendIdRef.current !== targetFriendId) return;
      clearedAtRef.current = null;
      setHasMessages(false);
      resetHistory();
      setClearRequest(null);
      showClearNotice("success", "Chat cleared for both users");
    }, "The chat could not be cleared. Please try again.");
  };

  const handleDeclineClear = () => {
    const request = clearRequest;
    if (!request) return;
    const targetFriendId = friend.id;
    void runClearAction("decline", async () => {
      await chatApi.declineClearRequest(request.id);
      if (friendIdRef.current !== targetFriendId) return;
      setClearRequest(null);
      showClearNotice("info", "You declined the Clear Chat Request. Your messages are unchanged.");
    }, "Your answer could not be sent. Please try again.");
  };

  const handleCancelClear = () => {
    const request = clearRequest;
    if (!request) return;
    const targetFriendId = friend.id;
    void runClearAction("cancel", async () => {
      await chatApi.cancelClearRequest(request.id);
      if (friendIdRef.current !== targetFriendId) return;
      setClearRequest(null);
      showClearNotice("info", "Clear Chat Request cancelled.");
    }, "The request could not be cancelled. Please try again.");
  };

  const handleDismissOutcome = () => {
    const outcome = clearOutcome;
    if (!outcome) return;
    const targetFriendId = friend.id;
    void runClearAction("dismiss", async () => {
      await chatApi.acknowledgeClearRequest(outcome.id);
      if (friendIdRef.current !== targetFriendId) return;
      setClearOutcome(null);
    }, "This message could not be dismissed. Please try again.");
  };

  const messageNodes = messages.map((message, index) => {
    const mine = message.senderId === currentUserId;
    const previous = messages[index - 1];
    const showDate = !previous
      || dateKey(message.createdAt) !== dateKey(previous.createdAt);

    return (
      <div key={message.id}>
        {showDate && (
          <div className="chat-date-separator">
            <span>{dateLabel(message.createdAt)}</span>
          </div>
        )}
        <div className={`chat-message-row ${mine ? "chat-message-row--mine" : "chat-message-row--friend"}`}>
          <div className={`chat-bubble ${mine ? "chat-bubble--mine" : "chat-bubble--friend"}`}>
            <p>{message.text}</p>
            <span className="chat-message-meta">
              <time dateTime={message.createdAt}>{messageTime(message.createdAt)}</time>
              {mine && <MessageStatus status={message.status} />}
            </span>
          </div>
        </div>
      </div>
    );
  });

  return createPortal(
    <div
      className="chat-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="chat-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="chat-header">
          <div className="chat-friend">
            <FriendAvatar player={friend} className="chat-avatar" />
            <div className="chat-friend-copy">
              <h2 id="chat-modal-title">{friend.username}</h2>
              <span className="chat-friend-presence">
                <OnlineStatusIndicator online={friend.online} showLabel />
              </span>
            </div>
          </div>
          <div className="chat-header-actions">
            <div className="chat-menu" ref={menuRef}>
              <button
                type="button"
                className="chat-menu-trigger arcadia-modal-close"
                aria-label="Chat options"
                title="Chat options"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-controls="chat-options-menu"
                onClick={() => setMenuOpen((open) => !open)}
              >
                <MoreVertical aria-hidden="true" />
              </button>
              {menuOpen && (
                <div className="chat-menu-list" id="chat-options-menu" role="menu" aria-label="Chat options">
                  <button
                    type="button"
                    role="menuitem"
                    className="chat-menu-item"
                    disabled={clearDisabled}
                    aria-disabled={clearDisabled}
                    title={clearDisabledReason}
                    onClick={openClearConfirm}
                    autoFocus
                  >
                    <Eraser aria-hidden="true" />
                    Clear Chat
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              className="chat-close arcadia-modal-close"
              aria-label="Close chat"
              title="Close chat"
              onClick={onClose}
            >
              <X aria-hidden="true" />
            </button>
          </div>
        </header>

        <div
          className="chat-messages"
          ref={messagesRef}
          onScroll={handleScroll}
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-label={`Conversation with ${friend.username}`}
        >
          {loading ? (
            <div className="chat-loading" role="status">
              <span className="chat-spinner" aria-hidden="true" />
              Loading conversation…
            </div>
          ) : loadError ? (
            <div className="chat-load-error" role="alert">
              <p>{loadError}</p>
              <button type="button" onClick={() => {
                const sequence = ++loadSequence.current;
                setLoading(true);
                setLoadError(null);
                chatApi.listMessages(friend.id, { limit: PAGE_SIZE })
                  .then((response) => {
                    if (sequence !== loadSequence.current) return;
                    conversationIdRef.current = response.conversationId ?? null;
                    clearedAtRef.current = response.clearedAt ? Date.parse(response.clearedAt) : null;
                    setHasMessages(response.hasMessages ?? response.messages.length > 0);
                    setMessages((current) => mergeMessages(current.filter(keepForConversation), response.messages));
                    setHasMore(response.hasMore);
                    setNextCursor(response.nextCursor);
                    setLoading(false);
                    acknowledgeIncoming(response.messages);
                    requestAnimationFrame(() => scrollToBottom());
                    scheduleMarkRead(0);
                  })
                  .catch((error) => {
                    if (sequence !== loadSequence.current) return;
                    setLoading(false);
                    setLoadError(getAuthErrorMessage(error, "Unable to load this conversation."));
                  });
              }}>
                Retry
              </button>
            </div>
          ) : messages.length === 0 ? (
            <div className="chat-empty">
              <span className="chat-empty-icon" aria-hidden="true"><MessageSquare /></span>
              <h3>No messages yet</h3>
              <p>Say hello to {friend.username} and start the conversation.</p>
            </div>
          ) : (
            <>
              {loadingOlder && (
                <div className="chat-loading chat-loading--older" role="status">
                  <span className="chat-spinner" aria-hidden="true" />
                  Loading older messages…
                </div>
              )}
              {olderError && <p className="chat-older-error" role="alert">{olderError}</p>}
              {messageNodes}
            </>
          )}
        </div>

        {friendTyping && (
          <div className="chat-typing" role="status" aria-live="polite">
            <span className="chat-typing-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            {friend.username} is typing…
          </div>
        )}

        <div className="chat-clear-region">
          {clearStateError && !clearRequest && !clearOutcome && (
            <p className="chat-clear-state-error" role="alert">
              {clearStateError}
              <button type="button" onClick={() => void loadClearState()}>Retry</button>
            </p>
          )}
          {clearNotice && (
            <p className={`chat-clear-notice chat-clear-notice--${clearNotice.tone}`} role="status">
              {clearNotice.message}
            </p>
          )}
          <ClearRequestBanner
            request={clearRequest}
            outcome={clearOutcome}
            currentUserId={currentUserId}
            action={clearAction}
            error={clearActionError}
            onAccept={handleAcceptClear}
            onDecline={handleDeclineClear}
            onCancel={handleCancelClear}
            onDismiss={handleDismissOutcome}
          />
        </div>

        <form className="chat-composer" onSubmit={handleSubmit}>
          {sendError && <p className="chat-send-error" role="alert">{sendError}</p>}
          <div className="chat-composer-row">
            <textarea
              ref={inputRef}
              className="chat-input"
              value={draft}
              onChange={(event) => handleDraftChange(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${friend.username}`}
              aria-label={`Message ${friend.username}`}
              rows={1}
              maxLength={2000}
              autoFocus
              spellCheck
            />
            <button
              type="submit"
              className="chat-send-button"
              disabled={!draft.trim() || sending}
              aria-label="Send message"
              title="Send message"
            >
              {sending ? <span className="chat-spinner" aria-hidden="true" /> : <Send aria-hidden="true" />}
            </button>
          </div>
        </form>
      </section>

      {confirmOpen && (
        <ConfirmDialog
          title="Clear Chat"
          message="Are you sure you want to clear this conversation?"
          confirmLabel="Clear Chat"
          busyLabel={clearBoth ? "Sending…" : "Clearing…"}
          tone="danger"
          busy={confirmBusy}
          error={confirmError}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => void handleConfirmClear()}
        >
          <label className="confirm-dialog-option">
            <input
              type="checkbox"
              checked={clearBoth}
              disabled={confirmBusy || pendingRequestExists}
              onChange={(event) => setClearBoth(event.target.checked)}
            />
            <span>
              Also delete chat from both ends
              <span className="confirm-dialog-option-hint">
                {pendingRequestExists
                  ? "A Clear Chat Request for this chat is already pending."
                  : `${friend.username} must accept before anything is deleted.`}
              </span>
            </span>
          </label>
        </ConfirmDialog>
      )}
    </div>,
    document.body,
  );
}

export default ChatModal;
