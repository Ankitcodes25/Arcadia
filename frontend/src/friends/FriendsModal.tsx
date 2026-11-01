import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { Inbox, Search, Users, X } from "lucide-react";
import { getAuthErrorMessage } from "../auth/authUtils";
import { acquireModalScrollLock } from "../auth/modalScrollLock";
import PlayerProfileModal from "../components/PlayerProfileModal";
import ChatModal from "../chat/ChatModal";
import { chatApi, CHAT_CHANGED_EVENT } from "../chat/chatApi";
import { onChatEvent } from "../chat/chatSocket";
import type { ChatConversation } from "../chat/chatTypes";
import type {
  Friend,
  FriendRelationship,
  FriendRequestItem,
  FriendSearchResult,
} from "./friendsTypes";
import { friendsApi, notifyFriendsChanged } from "./friendsApi";
import FriendCard from "./FriendCard";
import FriendRequestCard from "./FriendRequestCard";
import FriendSearchResultCard from "./FriendSearchResult";
import "./FriendsModal.css";

type FriendsModalProps = {
  currentUserId: string;
  onClose: () => void;
  onIncomingCountChange: (count: number) => void;
};

type TabKey = "friends" | "requests" | "find";

const TABS: ReadonlyArray<{ key: TabKey; label: string; Icon: typeof Users }> = [
  { key: "friends", label: "Friends", Icon: Users },
  { key: "requests", label: "Requests", Icon: Inbox },
  { key: "find", label: "Find Friends", Icon: Search },
];

const SEARCH_DEBOUNCE_MS = 350;
const FEEDBACK_MS = 3500;

function sortByName<T extends { username: string }>(items: T[]) {
  return [...items].sort((left, right) => (
    left.username.localeCompare(right.username, "en", { sensitivity: "base" })
  ));
}

function FriendsModal({ currentUserId, onClose, onIncomingCountChange }: FriendsModalProps) {
  const [activeTab, setActiveTab] = useState<0 | 1 | 2>(0);

  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const [conversationsByFriendId, setConversationsByFriendId] = useState<Map<string, ChatConversation>>(new Map());
  const [activeChat, setActiveChat] = useState<Friend | null>(null);

  const [incoming, setIncoming] = useState<FriendRequestItem[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequestItem[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestsError, setRequestsError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FriendSearchResult[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchHasRun, setSearchHasRun] = useState(false);

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<{ playerId: string | null; username: string | null } | null>(null);

  const friendsSeq = useRef(0);
  const requestsSeq = useRef(0);
  const conversationsSeq = useRef(0);
  const searchSeq = useRef(0);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClickRef = useRef(false);
  const swipeRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    horizontal: boolean;
  } | null>(null);

  const showFeedback = useCallback((tone: "success" | "error", message: string) => {
    setFeedback({ tone, message });
    if (feedbackTimer.current !== null) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => {
      feedbackTimer.current = null;
      setFeedback(null);
    }, FEEDBACK_MS);
  }, []);

  const loadFriends = useCallback(async (silent = false) => {
    const sequence = ++friendsSeq.current;
    if (!silent) {
      setFriendsLoading(true);
      setFriendsError(null);
    }
    try {
      const response = await friendsApi.listFriends();
      if (sequence !== friendsSeq.current) return;
      setFriends(response.friends);
    } catch (error) {
      if (sequence !== friendsSeq.current) return;
      if (!silent) setFriendsError(getAuthErrorMessage(error, "Unable to load your friends."));
    } finally {
      if (sequence === friendsSeq.current && !silent) setFriendsLoading(false);
    }
  }, []);

  const loadRequests = useCallback(async (silent = false) => {
    const sequence = ++requestsSeq.current;
    if (!silent) {
      setRequestsLoading(true);
      setRequestsError(null);
    }
    try {
      const response = await friendsApi.listRequests();
      if (sequence !== requestsSeq.current) return;
      setIncoming(response.incoming);
      setOutgoing(response.outgoing);
      onIncomingCountChange(response.incomingCount);
    } catch (error) {
      if (sequence !== requestsSeq.current) return;
      if (!silent) setRequestsError(getAuthErrorMessage(error, "Unable to load friend requests."));
    } finally {
      if (sequence === requestsSeq.current && !silent) setRequestsLoading(false);
    }
  }, [onIncomingCountChange]);

  const loadConversations = useCallback(async (silent = false) => {
    const sequence = ++conversationsSeq.current;
    if (!silent) setConversationsByFriendId(new Map());
    try {
      const response = await chatApi.listConversations();
      if (sequence !== conversationsSeq.current) return;
      setConversationsByFriendId(new Map(
        response.conversations.map((conversation) => [conversation.friend.id, conversation]),
      ));
    } catch {
      // Chat history is an enhancement on top of the Friends list. A transient
      // chat read failure must not hide friends or requests.
    }
  }, []);

  const runSearch = useCallback(async (value: string) => {
    const query = value.trim();
    const sequence = ++searchSeq.current;
    setSearchLoading(true);
    setSearchError(null);
    try {
      const response = await friendsApi.searchPlayers(query);
      if (sequence !== searchSeq.current) return;
      setSearchResults(response.players);
      setSearchHasRun(true);
    } catch (error) {
      if (sequence !== searchSeq.current) return;
      setSearchResults(null);
      setSearchError(getAuthErrorMessage(error, "Unable to search for players."));
    } finally {
      if (sequence === searchSeq.current) setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFriends();
    void loadRequests();
    void loadConversations();
    return () => {
      friendsSeq.current += 1;
      requestsSeq.current += 1;
      conversationsSeq.current += 1;
      searchSeq.current += 1;
      if (feedbackTimer.current !== null) clearTimeout(feedbackTimer.current);
    };
  }, [loadFriends, loadRequests, loadConversations]);

  useEffect(() => {
    const refreshConversations = () => { void loadConversations(true); };
    const unsubscribeRealtime = onChatEvent("chat:changed", refreshConversations);
    window.addEventListener(CHAT_CHANGED_EVENT, refreshConversations);
    return () => {
      unsubscribeRealtime();
      window.removeEventListener(CHAT_CHANGED_EVENT, refreshConversations);
    };
  }, [loadConversations]);

  useEffect(() => acquireModalScrollLock(), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // A profile or chat opened above this modal owns Escape while visible.
      if (selectedPlayer || activeChat) return;
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeChat, onClose, selectedPlayer]);

  useEffect(() => {
    const query = searchQuery.trim();
    searchSeq.current += 1;
    if (query.length < 2) {
      setSearchResults(null);
      setSearchError(null);
      setSearchLoading(false);
      setSearchHasRun(false);
      return undefined;
    }

    setSearchLoading(true);
    setSearchError(null);
    const timer = setTimeout(() => {
      void runSearch(query);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [runSearch, searchQuery]);

  const updateSearchRelationship = useCallback((playerId: string, relationship: FriendRelationship) => {
    setSearchResults((current) => current?.map((player) => (
      player.id === playerId ? { ...player, relationship } : player
    )) ?? current);
  }, []);

  const refreshAfterChange = useCallback(() => {
    void loadFriends(true);
    void loadRequests(true);
    void loadConversations(true);
  }, [loadConversations, loadFriends, loadRequests]);

  const handleProfileRelationshipChange = useCallback((playerId: string, relationship: FriendRelationship) => {
    updateSearchRelationship(playerId, relationship);
    refreshAfterChange();
  }, [refreshAfterChange, updateSearchRelationship]);

  const handleSend = useCallback(async (result: FriendSearchResult) => {
    if (busyAction) return;
    setBusyAction(`send:${result.id}`);
    try {
      const response = await friendsApi.sendRequest(result.id);
      updateSearchRelationship(result.id, response.relationship);
      showFeedback("success", `Friend request sent to ${result.username}.`);
      refreshAfterChange();
      notifyFriendsChanged("friends-modal");
    } catch (error) {
      showFeedback("error", getAuthErrorMessage(error, "Unable to send the friend request."));
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, refreshAfterChange, showFeedback, updateSearchRelationship]);

  const handleAcceptSearch = useCallback(async (result: FriendSearchResult) => {
    if (busyAction || !result.relationship.requestId) return;
    const requestId = result.relationship.requestId;
    setBusyAction(`accept:${result.id}`);
    try {
      const response = await friendsApi.acceptRequest(requestId);
      updateSearchRelationship(result.id, response.relationship);
      setFriends((current) => (
        current.some((friend) => friend.id === response.friend.id)
          ? current
          : [...current, response.friend]
      ));
      const nextIncoming = incoming.filter((item) => item.id !== requestId);
      setIncoming(nextIncoming);
      onIncomingCountChange(nextIncoming.length);
      showFeedback("success", `You and ${result.username} are now friends.`);
      refreshAfterChange();
      notifyFriendsChanged("friends-modal");
    } catch (error) {
      showFeedback("error", getAuthErrorMessage(error, "Unable to accept the friend request."));
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, incoming, onIncomingCountChange, refreshAfterChange, showFeedback, updateSearchRelationship]);

  const handleAcceptRequest = useCallback(async (request: FriendRequestItem) => {
    if (busyAction) return;
    setBusyAction(`accept-request:${request.id}`);
    try {
      const response = await friendsApi.acceptRequest(request.id);
      setFriends((current) => (
        current.some((friend) => friend.id === response.friend.id)
          ? current
          : [...current, response.friend]
      ));
      const nextIncoming = incoming.filter((item) => item.id !== request.id);
      setIncoming(nextIncoming);
      onIncomingCountChange(nextIncoming.length);
      showFeedback("success", `You and ${request.user.username} are now friends.`);
      refreshAfterChange();
      notifyFriendsChanged("friends-modal");
    } catch (error) {
      showFeedback("error", getAuthErrorMessage(error, "Unable to accept the friend request."));
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, incoming, onIncomingCountChange, refreshAfterChange, showFeedback]);

  const handleRejectRequest = useCallback(async (request: FriendRequestItem) => {
    if (busyAction) return;
    setBusyAction(`reject:${request.id}`);
    try {
      await friendsApi.rejectRequest(request.id);
      const nextIncoming = incoming.filter((item) => item.id !== request.id);
      setIncoming(nextIncoming);
      onIncomingCountChange(nextIncoming.length);
      showFeedback("success", "Friend request rejected.");
      refreshAfterChange();
      notifyFriendsChanged("friends-modal");
    } catch (error) {
      showFeedback("error", getAuthErrorMessage(error, "Unable to reject the friend request."));
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, incoming, onIncomingCountChange, refreshAfterChange, showFeedback]);

  const handleBlockRequest = useCallback(async (request: FriendRequestItem) => {
    if (busyAction) return;
    setBusyAction(`block:${request.id}`);
    try {
      await friendsApi.blockRequest(request.id);
      const nextIncoming = incoming.filter((item) => item.id !== request.id);
      setIncoming(nextIncoming);
      onIncomingCountChange(nextIncoming.length);
      setOutgoing((current) => current.filter((item) => item.user.id !== request.user.id));
      setFriends((current) => current.filter((friend) => friend.id !== request.user.id));
      setConversationsByFriendId((current) => {
        const next = new Map(current);
        next.delete(request.user.id);
        return next;
      });
      setActiveChat((current) => (current?.id === request.user.id ? null : current));
      showFeedback("success", `${request.user.username} has been blocked.`);
      refreshAfterChange();
      notifyFriendsChanged("friends-modal");
    } catch (error) {
      showFeedback("error", getAuthErrorMessage(error, "Unable to block this player."));
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, incoming, onIncomingCountChange, refreshAfterChange, showFeedback]);

  const handleCancelRequest = useCallback(async (request: FriendRequestItem) => {
    if (busyAction) return;
    setBusyAction(`cancel:${request.id}`);
    try {
      await friendsApi.cancelRequest(request.id);
      setOutgoing((current) => current.filter((item) => item.id !== request.id));
      showFeedback("success", "Friend request cancelled.");
      refreshAfterChange();
      notifyFriendsChanged("friends-modal");
    } catch (error) {
      showFeedback("error", getAuthErrorMessage(error, "Unable to cancel the friend request."));
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, refreshAfterChange, showFeedback]);

  const openProfile = useCallback((player: { id: string; username: string }) => {
    setSelectedPlayer({ playerId: player.id, username: player.username });
  }, []);

  const goToTab = useCallback((index: number) => {
    setActiveTab(Math.max(0, Math.min(TABS.length - 1, index)) as 0 | 1 | 2);
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, textarea, select, [role='button'], [contenteditable='true']")) {
      return;
    }
    swipeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      horizontal: false,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const swipe = swipeRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    const dx = event.clientX - swipe.startX;
    const dy = event.clientY - swipe.startY;
    if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swipe.horizontal = true;
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const swipe = swipeRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    swipeRef.current = null;
    if (!swipe.horizontal) return;
    const dx = event.clientX - swipe.startX;
    if (Math.abs(dx) < 50) return;
    goToTab(activeTab + (dx < 0 ? 1 : -1));
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  };

  const handleClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  // One list, online first, then offline. The partition is only for ordering;
  // the UI renders a single uninterrupted card list with no section headings.
  const sortedFriends = [
    ...sortByName(friends.filter((friend) => friend.online)),
    ...sortByName(friends.filter((friend) => !friend.online)),
  ];
  const hasAnyRequests = incoming.length > 0 || outgoing.length > 0;

  return createPortal(
    <div
      className="friends-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="friends-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="friends-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="friends-header">
          <div className="friends-heading">
            <span className="friends-heading-icon" aria-hidden="true"><Users /></span>
            <div>
              <h2 id="friends-modal-title">Friends</h2>
              <p>Your Arcadia circle, requests and player discovery.</p>
            </div>
          </div>
          <button
            type="button"
            className="friends-close arcadia-modal-close"
            aria-label="Close friends"
            title="Close friends"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="friends-tabs" role="tablist" aria-label="Friends sections">
          {TABS.map((tab, index) => {
            const Icon = tab.Icon;
            const active = activeTab === index;
            return (
              <button
                key={tab.key}
                type="button"
                id={`friends-tab-${tab.key}`}
                className={`friends-tab${active ? " friends-tab--active" : ""}`}
                role="tab"
                aria-selected={active}
                aria-controls={`friends-panel-${tab.key}`}
                tabIndex={active ? 0 : -1}
                onClick={() => goToTab(index)}
              >
                <Icon aria-hidden="true" />
                <span>{tab.label}</span>
                {tab.key === "requests" && incoming.length > 0 && (
                  <span className="friends-tab-count" aria-label={`${incoming.length} incoming requests`}>
                    {incoming.length > 9 ? "9+" : incoming.length}
                  </span>
                )}
              </button>
            );
          })}
          <span
            className="friends-tab-indicator"
            style={{ transform: `translateX(${activeTab * 100}%)` }}
            aria-hidden="true"
          />
        </div>

        <div
          className="friends-tab-viewport"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => { swipeRef.current = null; }}
          onClickCapture={handleClickCapture}
        >
          <div
            className="friends-tab-track"
            style={{ transform: `translateX(-${activeTab * 100}%)` }}
          >
            <section
              id="friends-panel-friends"
              className="friends-tab-panel"
              role="tabpanel"
              aria-labelledby="friends-tab-friends"
              aria-hidden={activeTab !== 0}
              inert={activeTab !== 0}
            >
              {feedback && (
                <p className={`friends-feedback friends-feedback--${feedback.tone}`} role={feedback.tone === "error" ? "alert" : "status"}>
                  {feedback.message}
                </p>
              )}

              {friendsLoading ? (
                <div className="friends-loading" role="status">
                  <span className="friends-inline-spinner" aria-hidden="true" />
                  Loading friends…
                </div>
              ) : friendsError ? (
                <div className="friends-error" role="alert">
                  <span>{friendsError}</span>
                  <button type="button" onClick={() => void loadFriends()}>Retry</button>
                </div>
              ) : friends.length === 0 ? (
                <div className="friends-empty">
                  <span className="friends-empty-icon" aria-hidden="true"><Users /></span>
                  <h3>No friends yet</h3>
                  <p>Use Find Friends to search for players and send your first request.</p>
                  <button type="button" className="friends-empty-action" onClick={() => goToTab(2)}>
                    Find Friends
                  </button>
                </div>
              ) : (
                <div className="friends-card-list">
                  {sortedFriends.map((friend) => (
                    <FriendCard
                      key={friend.id}
                      friend={friend}
                      unreadCount={conversationsByFriendId.get(friend.id)?.unreadCount ?? 0}
                      onOpen={openProfile}
                      onChat={setActiveChat}
                    />
                  ))}
                </div>
              )}
            </section>

            <section
              id="friends-panel-requests"
              className="friends-tab-panel"
              role="tabpanel"
              aria-labelledby="friends-tab-requests"
              aria-hidden={activeTab !== 1}
              inert={activeTab !== 1}
            >
              {feedback && (
                <p className={`friends-feedback friends-feedback--${feedback.tone}`} role={feedback.tone === "error" ? "alert" : "status"}>
                  {feedback.message}
                </p>
              )}

              {requestsLoading ? (
                <div className="friends-loading" role="status">
                  <span className="friends-inline-spinner" aria-hidden="true" />
                  Loading requests…
                </div>
              ) : requestsError ? (
                <div className="friends-error" role="alert">
                  <span>{requestsError}</span>
                  <button type="button" onClick={() => void loadRequests()}>Retry</button>
                </div>
              ) : !hasAnyRequests ? (
                <div className="friends-empty">
                  <span className="friends-empty-icon" aria-hidden="true"><Inbox /></span>
                  <h3>No friend requests</h3>
                  <p>Incoming and sent requests will appear here.</p>
                </div>
              ) : (
                <>
                  <div className="friends-section-heading">
                    <h3>Incoming Requests</h3>
                    <span>{incoming.length}</span>
                  </div>
                  {incoming.length > 0 ? (
                    <div className="friends-card-list">
                      {incoming.map((request) => (
                        <FriendRequestCard
                          key={request.id}
                          request={request}
                          direction="incoming"
                          busy={busyAction === `accept-request:${request.id}`
                            || busyAction === `reject:${request.id}`
                            || busyAction === `block:${request.id}`}
                          disabled={busyAction !== null}
                          onOpen={(item) => openProfile(item.user)}
                          onAccept={(item) => void handleAcceptRequest(item)}
                          onReject={(item) => void handleRejectRequest(item)}
                          onBlock={(item) => void handleBlockRequest(item)}
                          onCancel={() => {}}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="friends-subtle-empty">No incoming requests.</p>
                  )}

                  <div className="friends-section-heading friends-section-heading--offline">
                    <h3>Sent Requests</h3>
                    <span>{outgoing.length}</span>
                  </div>
                  {outgoing.length > 0 ? (
                    <div className="friends-card-list">
                      {outgoing.map((request) => (
                        <FriendRequestCard
                          key={request.id}
                          request={request}
                          direction="outgoing"
                          busy={busyAction === `cancel:${request.id}`}
                          disabled={busyAction !== null}
                          onOpen={(item) => openProfile(item.user)}
                          onAccept={() => {}}
                          onReject={() => {}}
                          onBlock={() => {}}
                          onCancel={(item) => void handleCancelRequest(item)}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="friends-subtle-empty">No sent requests.</p>
                  )}
                </>
              )}
            </section>

            <section
              id="friends-panel-find"
              className="friends-tab-panel"
              role="tabpanel"
              aria-labelledby="friends-tab-find"
              aria-hidden={activeTab !== 2}
              inert={activeTab !== 2}
            >
              {feedback && (
                <p className={`friends-feedback friends-feedback--${feedback.tone}`} role={feedback.tone === "error" ? "alert" : "status"}>
                  {feedback.message}
                </p>
              )}

              <form
                className="friends-search-form"
                onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  if (searchQuery.trim().length >= 2) void runSearch(searchQuery);
                }}
              >
                <Search className="friends-search-icon" aria-hidden="true" />
                <input
                  type="search"
                  className="friends-search-input"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search players by username or Player ID"
                  aria-label="Search players by username or Player ID"
                  autoComplete="off"
                  spellCheck={false}
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="friends-search-clear"
                    onClick={() => setSearchQuery("")}
                    aria-label="Clear search"
                  >
                    <X aria-hidden="true" />
                  </button>
                )}
              </form>

              {searchQuery.trim().length < 2 ? (
                <div className="friends-empty friends-empty--search">
                  <span className="friends-empty-icon" aria-hidden="true"><Search /></span>
                  <h3>Find new friends</h3>
                  <p>Search registered players by username or permanent Player ID.</p>
                </div>
              ) : searchLoading ? (
                <div className="friends-loading" role="status">
                  <span className="friends-inline-spinner" aria-hidden="true" />
                  Searching players…
                </div>
              ) : searchError ? (
                <div className="friends-error" role="alert">
                  <span>{searchError}</span>
                  <button type="button" onClick={() => void runSearch(searchQuery)}>Retry</button>
                </div>
              ) : searchHasRun && searchResults && searchResults.length === 0 ? (
                <div className="friends-empty friends-empty--search">
                  <span className="friends-empty-icon" aria-hidden="true"><Search /></span>
                  <h3>No players found</h3>
                  <p>Try a different username or Player ID.</p>
                </div>
              ) : searchResults && searchResults.length > 0 ? (
                <div className="friends-card-list friends-search-results">
                  {searchResults.map((result) => (
                    <FriendSearchResultCard
                      key={result.id}
                      result={result}
                      busy={busyAction === `send:${result.id}` || busyAction === `accept:${result.id}`}
                      onOpen={openProfile}
                      onSend={(player) => void handleSend(player)}
                      onAccept={(player) => void handleAcceptSearch(player)}
                    />
                  ))}
                </div>
              ) : null}
            </section>
          </div>
        </div>
      </section>

      {selectedPlayer && (
        <PlayerProfileModal
          playerId={selectedPlayer.playerId}
          username={selectedPlayer.username}
          currentUserId={currentUserId}
          onClose={() => setSelectedPlayer(null)}
          onRelationshipChange={handleProfileRelationshipChange}
        />
      )}

      {activeChat && (
        <ChatModal
          friend={activeChat}
          currentUserId={currentUserId}
          onClose={() => {
            setActiveChat(null);
            void loadConversations(true);
          }}
        />
      )}
    </div>,
    document.body,
  );
}

export default FriendsModal;
