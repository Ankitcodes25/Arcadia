import {
  Loader2,
  Lock,
  MessageCircle,
  Palette,
  UsersRound,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FriendInviteList from "./FriendInviteList";
import LudoColourSelector from "./LudoColourSelector";
import LudoLobbyChat from "./LudoLobbyChat";
import OnlineSeatCard from "./OnlineSeatCard";
import PlayerCountTabs from "./PlayerCountTabs";
import type { LudoSetupController } from "./useLudoSetup";
import { getEnabledOnlineSeatColours } from "./ludoPermissions";
import {
  LUDO_COLOURS,
  type LudoChatBubble,
  type LudoPlayerCount,
} from "./types";

type OnlineFriendsSetupProps = {
  setup: LudoSetupController;
  bubbles: LudoChatBubble[];
  onSendChat: (text: string) => boolean;
};

const COUNTS: LudoPlayerCount[] = [2, 3, 4];

function OnlineFriendsSetup({ setup, bubbles, onSendChat }: OnlineFriendsSetupProps) {
  const {
    user,
    state,
    lobby,
    isHost,
    playerCount,
    ownSeat,
    onlineSeats,
    onlinePendingInvites,
    onlineOccupiedCount,
    onlineLoading,
    isSocketReady,
    notice,
    availableOwnColours,
    changeOnlinePlayerCount,
    changeOnlineBot,
    changeOwnColour,
    inviteFriend,
    removeOnlinePlayer,
    leaveOnlineLobby,
    dismissNotice,
  } = setup;
  const [chatOpen, setChatOpen] = useState(false);
  const [chatPosition, setChatPosition] = useState({ top: 0, left: 0, width: 0 });
  const chatAnchorRef = useRef<HTMLDivElement>(null);
  const chatButtonRef = useRef<HTMLButtonElement>(null);
  const chatPanelRef = useRef<HTMLDivElement>(null);
  const invitePlayersRef = useRef<HTMLDivElement>(null);
  const inviteHighlightTimerRef = useRef<number | null>(null);

  const selectedColour = ownSeat?.colour ?? state.online.preferredColour;
  const disabledColours = LUDO_COLOURS.filter(
    (colour) => !availableOwnColours.includes(colour),
  );
  const disabledCounts = COUNTS.filter((count) => count < onlineOccupiedCount);
  const humanParticipantCount = onlineSeats.filter((seat) => seat.type !== "EMPTY").length;
  const enabledSeatColours = new Set(
    getEnabledOnlineSeatColours(onlineSeats, onlinePendingInvites, playerCount),
  );
  const unavailableIds = useMemo(() => [
    ...onlineSeats
      .filter((seat) => seat.type === "HUMAN" && Boolean(seat.playerId))
      .map((seat) => seat.playerId!),
    ...onlinePendingInvites.map((invite) => invite.inviteeId),
  ], [onlinePendingInvites, onlineSeats]);

  const inviteSeatColour = onlineOccupiedCount < playerCount
    ? onlineSeats.find(
      (seat) => seat.type === "EMPTY"
        && !onlinePendingInvites.some((invite) => invite.colour === seat.colour),
    )?.colour ?? null
    : null;
  const handleInviteFriend = useCallback((friend: Parameters<typeof inviteFriend>[0]) => {
    if (inviteSeatColour) inviteFriend(friend, inviteSeatColour);
  }, [inviteFriend, inviteSeatColour]);

  useEffect(() => {
    if (!chatOpen) return;
    const updatePosition = () => {
      const button = chatButtonRef.current;
      if (!button) return;
      const bounds = button.getBoundingClientRect();
      const modalBounds = button.closest(".ludo-modal")?.getBoundingClientRect();
      const width = Math.min(
        Math.max(150, (modalBounds?.width ?? window.innerWidth) / 5),
        window.innerWidth - 32,
      );
      setChatPosition({
        top: Math.min(bounds.bottom + 5, window.innerHeight - 80),
        left: Math.max(16, Math.min(bounds.right - width, window.innerWidth - width - 16)),
        width,
      });
    };
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (chatAnchorRef.current?.contains(target) || chatPanelRef.current?.contains(target)) return;
      setChatOpen(false);
    };

    updatePosition();
    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [chatOpen]);

  useEffect(() => () => {
    if (inviteHighlightTimerRef.current !== null) {
      window.clearTimeout(inviteHighlightTimerRef.current);
    }
  }, []);

  const highlightInvitePlayers = () => {
    const inviteSection = invitePlayersRef.current;
    if (!inviteSection) return;

    if (inviteHighlightTimerRef.current !== null) {
      window.clearTimeout(inviteHighlightTimerRef.current);
    }
    inviteSection.scrollIntoView({ behavior: "instant", block: "nearest" });
    inviteSection.classList.remove("is-highlighted");
    void inviteSection.offsetWidth;
    inviteSection.classList.add("is-highlighted");
    inviteHighlightTimerRef.current = window.setTimeout(() => {
      inviteSection.classList.remove("is-highlighted");
      inviteHighlightTimerRef.current = null;
    }, 3000);
  };

  return (
    <div className="ludo-panel ludo-panel--online-friends">
      {notice && (
        <div
          className={`ludo-notice${notice.tone === "error" ? " is-error" : ""}`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          <span>{notice.message}</span>
          <button
            type="button"
            className="ludo-icon-button"
            onClick={dismissNotice}
            aria-label="Dismiss message"
          >
            <X aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="ludo-split ludo-online-setup-options">
        <section className="ludo-section" aria-labelledby="ludo-online-players">
          <div className="ludo-section-title">
            <UsersRound aria-hidden="true" />
            <span className="ludo-label" id="ludo-online-players">Number of players</span>
          </div>
          <PlayerCountTabs
            value={playerCount}
            onChange={changeOnlinePlayerCount}
            disabled={!isHost}
            disabledCounts={disabledCounts}
            label="Number of online players"
          />
        </section>

        <section className="ludo-section" aria-labelledby="ludo-online-colour">
          <div className="ludo-section-title">
            <Palette aria-hidden="true" />
            <span className="ludo-label" id="ludo-online-colour">Choose your token colour</span>
          </div>
          <LudoColourSelector
            selected={selectedColour}
            onSelect={changeOwnColour}
            disabledColours={disabledColours}
            label="Choose or change your online token colour"
          />
        </section>
      </div>

      {!lobby && (
        <div className={`ludo-inline-status${onlineLoading ? " is-loading" : ""}`} role="status">
          {onlineLoading ? (
            <>
              <Loader2 className="ludo-spin" aria-hidden="true" />
              Opening your temporary lobby...
            </>
          ) : (
            <>
              <Lock aria-hidden="true" />
              The lobby is unavailable. Close this dialog and try again.
            </>
          )}
        </div>
      )}

      <section className="ludo-section" aria-labelledby="ludo-online-seats">
        <div className="ludo-section-head">
          <div className="ludo-section-title">
            <UsersRound aria-hidden="true" />
            <span className="ludo-label" id="ludo-online-seats">Player seats</span>
          </div>
          <div className="ludo-seat-header-meta">
            <span className="ludo-seat-tally">
              {humanParticipantCount} / {playerCount} joined
              {onlinePendingInvites.length > 0 ? ` · ${onlinePendingInvites.length} invited` : ""}
            </span>
            {lobby && (
              <div className="ludo-quick-chat-anchor" ref={chatAnchorRef}>
                <button
                  ref={chatButtonRef}
                  type="button"
                  className={`ludo-chat-toggle${chatOpen ? " is-open" : ""}`}
                  onClick={() => setChatOpen((open) => !open)}
                  aria-expanded={chatOpen}
                  aria-controls="ludo-lobby-chat"
                >
                  <MessageCircle aria-hidden="true" />
                  Quick chat
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="ludo-seat-row">
          {onlineSeats.map((seat) => (
            <OnlineSeatCard
              key={seat.colour}
              seat={seat}
              isSelf={seat.playerId === user?.id}
              hostControls={isHost && Boolean(lobby)}
              inactive={seat.type === "EMPTY" && !enabledSeatColours.has(seat.colour)}
              pendingInvite={
                onlinePendingInvites.find((invite) => invite.colour === seat.colour) ?? null
              }
              bubbles={bubbles}
              onInvite={highlightInvitePlayers}
              onToggleBot={changeOnlineBot}
              onRemovePlayer={removeOnlinePlayer}
              onLeave={leaveOnlineLobby}
            />
          ))}
        </div>
      </section>

      {isHost && lobby && (
        <div
          className="ludo-online-invite-wrap"
          ref={invitePlayersRef}
        >
          <FriendInviteList
            colour={inviteSeatColour ?? LUDO_COLOURS[0]}
            mode="ONLINE_FRIENDS"
            title="Invite players"
            subtitle=""
            showAll
            inline
            hasOpenSeat={Boolean(inviteSeatColour)}
            lobby={lobby}
            unavailableIds={unavailableIds}
            onInvite={handleInviteFriend}
          />
        </div>
      )}

      {lobby && chatOpen && createPortal(
        <div
          id="ludo-lobby-chat"
          ref={chatPanelRef}
          className="ludo-chat-portal"
          style={{
            left: `${chatPosition.left}px`,
            top: `${chatPosition.top}px`,
            width: `${chatPosition.width}px`,
            maxHeight: `calc(100dvh - ${chatPosition.top + 16}px)`,
          }}
        >
          <LudoLobbyChat
            open
            canSend={isSocketReady}
            onSend={onSendChat}
          />
        </div>,
        document.body,
      )}

      {!isHost && (
        <p className="ludo-note">
          <Lock aria-hidden="true" />
          The host controls match size, invitations and Arcadion bots. You can change
          your own colour and use lobby chat.
        </p>
      )}
    </div>
  );
}

export default OnlineFriendsSetup;
