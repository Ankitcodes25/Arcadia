import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Check, CheckCheck, MessageSquare, Send, X } from "lucide-react";
import { getAuthErrorMessage } from "../auth/authUtils";
import { acquireModalScrollLock } from "../auth/modalScrollLock";
import FriendAvatar from "../friends/FriendAvatar";
import OnlineStatusIndicator from "../friends/OnlineStatusIndicator";
import type { Friend } from "../friends/friendsTypes";
import { chatApi, notifyChatChanged } from "./chatApi";
import { acknowledgeChatDelivered, onChatEvent, sendChatTyping } from "./chatSocket";
import type { ChatMessage, ChatMessageStatus } from "./chatTypes";
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

function MessageStatus({ status }: { status: ChatMessageStatus }) {
  const label = status === "READ" ? "Read" : status === "DELIVERED" ? "Delivered" : "Sent";
  return (
    <span
      className={`chat-message-status chat-message-status--${status.toLowerCase()}`}
      role="img"
      title={label}
      aria-label={label}
    >
      {status === "SENT" ? <Check aria-hidden="true" /> : <CheckCheck aria-hidden="true" />}
    </span>
  );
}

function ChatModal({ friend, currentUserId, onClose }: ChatModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [friendTyping, setFriendTyping] = useState(false);

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
      setMessages((current) => mergeMessages(current, response.messages));
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
  }, [acknowledgeIncoming, friend.id, scheduleMarkRead, scrollToBottom]);

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
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleMarkRead(0);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [scheduleMarkRead]);

  useEffect(() => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setLoadError(null);
    setMessages([]);
    setHasMore(false);
    setNextCursor(null);
    setLoadingOlder(false);
    loadedOlderRef.current = false;
    setOlderError(null);
    setDraft("");
    setSendError(null);
    setFriendTyping(false);
    stickToBottomRef.current = true;

    chatApi.listMessages(friend.id, { limit: PAGE_SIZE })
      .then((response) => {
        if (sequence !== loadSequence.current) return;
        setMessages((current) => mergeMessages(current, response.messages));
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
  }, [acknowledgeIncoming, friend.id, scheduleMarkRead, scrollToBottom]);

  useEffect(() => {
    const belongsToConversation = (message: ChatMessage) => (
      (message.senderId === currentUserId && message.receiverId === friend.id)
      || (message.senderId === friend.id && message.receiverId === currentUserId)
    );

    const unsubscribeMessage = onChatEvent("chat:message", ({ message }) => {
      if (!belongsToConversation(message)) return;
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
      if (reason === "refresh") void refreshMessages();
    });

    return () => {
      unsubscribeMessage();
      unsubscribeStatus();
      unsubscribeRead();
      unsubscribeTyping();
      unsubscribeRefresh();
    };
  }, [currentUserId, friend.id, refreshMessages, scheduleMarkRead, scrollToBottom]);

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
          <button
            type="button"
            className="chat-close arcadia-modal-close"
            aria-label="Close chat"
            title="Close chat"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
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
                    setMessages((current) => mergeMessages(current, response.messages));
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
    </div>,
    document.body,
  );
}

export default ChatModal;
