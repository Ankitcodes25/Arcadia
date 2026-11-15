import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import {
  connectChatSocket,
  isChatSocketConnected,
  ludoSocket,
  onChatEvent,
} from "../../chat/chatSocket";
import type { Friend } from "../../friends/friendsTypes";
import {
  canAddLudoBot,
  canHostConfigureLudo,
  canInviteFriendToColour,
  countLudoParticipants,
  countLudoReservedSeats,
  findLudoSeat,
  getAvailableLudoColours,
  getInviteEligibility,
  isLudoHost,
} from "./ludoPermissions";
import {
  addPassPlayBot,
  assignPassPlayFriend,
  buildArcadionSeats,
  createInitialLudoSetupState,
  getLudoSetupValidation,
  hasPassPlayBot,
  removePassPlayBot,
  removePassPlayFriend,
  selectArcadionColour,
  setArcadionDifficulty,
  setArcadionPlayerCount,
  setArcadionPower,
  setLudoMode,
  setOnlinePlayerCount,
  setOnlinePreferredColour,
  setPassPlayName,
  setPassPlayPlayerCount,
  setPassPlayPower,
  type LudoSetupState,
} from "./ludoSetupState";
import {
  LUDO_COLOURS,
  type ArcadionPower,
  type LudoColour,
  type LudoFriendSummary,
  type LudoLobbyState,
  type LudoPlayerCount,
  type LudoSeat,
} from "./types";

type UseLudoSetupOptions = {
  initialLobby?: LudoLobbyState | null;
  onLobbyClosed?: (reason: string) => void;
};

type LudoSetupNotice = {
  tone: "info" | "error";
  message: string;
};

function toFriendSummary(friend: Friend): LudoFriendSummary {
  return {
    id: friend.id,
    username: friend.username,
    avatar: friend.avatar,
    avatarUrl: friend.avatarUrl,
    online: friend.online,
  };
}

function normaliseLobby(lobby: LudoLobbyState): LudoLobbyState {
  return {
    ...lobby,
    arcadionPower: "MEDIUM",
    pendingInvites: Array.isArray(lobby.pendingInvites) ? lobby.pendingInvites : [],
  };
}

export function useLudoSetup({
  initialLobby = null,
  onLobbyClosed,
}: UseLudoSetupOptions = {}) {
  const { user } = useAuth();
  const [state, setState] = useState<LudoSetupState>(() => {
    const initial = createInitialLudoSetupState(initialLobby ? "ONLINE_FRIENDS" : "ARCADION");
    if (!initialLobby) return initial;
    return {
      ...initial,
      online: {
        ...initial.online,
        playerCount: initialLobby.playerCount,
        arcadionPower: "MEDIUM",
        preferredColour:
          initialLobby.seats.find((seat) => seat.playerId === user?.id)?.colour
          ?? initial.online.preferredColour,
      },
    };
  });
  const [lobby, setLobby] = useState<LudoLobbyState | null>(
    initialLobby ? normaliseLobby(initialLobby) : null,
  );
  const lobbyRef = useRef<LudoLobbyState | null>(initialLobby ? normaliseLobby(initialLobby) : null);
  const [onlineLoading, setOnlineLoading] = useState(!initialLobby);
  const [notice, setNotice] = useState<LudoSetupNotice | null>(null);
  const [isSocketReady, setIsSocketReady] = useState(() => isChatSocketConnected());

  const lobbyIdRef = useRef<string | null>(initialLobby?.id ?? null);
  const pendingPlayerCountRef = useRef<LudoPlayerCount | null>(null);
  const requestedLobbyRef = useRef<string | null>(null);
  const modeRef = useRef(state.mode);
  const onLobbyClosedRef = useRef(onLobbyClosed);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    modeRef.current = state.mode;
  }, [state.mode]);

  useEffect(() => {
    onLobbyClosedRef.current = onLobbyClosed;
  }, [onLobbyClosed]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  const humanName = user?.displayName || user?.username || "You";
  const arcadionSeats = useMemo(
    () => buildArcadionSeats(state.arcadion, humanName),
    [state.arcadion, humanName],
  );

  const provisionalSeats = useMemo<LudoSeat[]>(() => (
    LUDO_COLOURS.map((colour) => (
      user && colour === state.online.preferredColour
        ? {
          colour,
          type: "HUMAN",
          playerId: user.id,
          displayName: humanName,
          isHost: true,
          avatar: user.avatar,
          avatarUrl: user.googleAvatarUrl,
        }
        : { colour, type: "EMPTY" }
    ))
  ), [humanName, state.online.preferredColour, user]);

  const onlineSeats = lobby?.seats ?? provisionalSeats;
  const onlinePendingInvites = lobby?.pendingInvites ?? [];
  const ownSeat = useMemo(
    () => findLudoSeat(lobby, user?.id ?? null)
      ?? onlineSeats.find((seat) => seat.playerId === user?.id)
      ?? null,
    [lobby, onlineSeats, user?.id],
  );
  const isHost = lobby
    ? isLudoHost(lobby, user?.id ?? null)
    : true;
  const playerCount = state.online.playerCount;
  const arcadionPower: ArcadionPower = "MEDIUM";
  const validation = useMemo(() => getLudoSetupValidation(state), [state]);
  const passPlayHasBot = useMemo(() => hasPassPlayBot(state), [state]);
  const onlineHasBot = useMemo(
    () => onlineSeats.some((seat) => seat.type === "ARCADION"),
    [onlineSeats],
  );
  const availableOwnColours = useMemo(
    () => getAvailableLudoColours(lobby, user?.id ?? null),
    [lobby, user?.id],
  );
  const onlineOccupiedCount = useMemo(
    () => countLudoParticipants(lobby) + countLudoReservedSeats(lobby),
    [lobby],
  );

  const syncOnlineStateFromLobby = useCallback((nextLobby: LudoLobbyState) => {
    const ownColour = nextLobby.seats.find((seat) => seat.playerId === user?.id)?.colour;
    const pendingPlayerCount = pendingPlayerCountRef.current;
    let playerCount = pendingPlayerCount ?? nextLobby.playerCount;
    if (pendingPlayerCount === nextLobby.playerCount) {
      pendingPlayerCountRef.current = null;
      playerCount = nextLobby.playerCount;
    }
    setState((current) => ({
      ...current,
      online: {
        playerCount,
        arcadionPower: "MEDIUM",
        preferredColour: ownColour ?? current.online.preferredColour,
      },
    }));
  }, [user?.id]);

  const applyLobby = useCallback((incomingLobby: LudoLobbyState) => {
    const nextLobby = normaliseLobby(incomingLobby);
    lobbyIdRef.current = nextLobby.id;
    lobbyRef.current = nextLobby;
    setLobby(nextLobby);
    syncOnlineStateFromLobby(nextLobby);
    setOnlineLoading(false);
  }, [syncOnlineStateFromLobby]);

  /**
   * Creates the host's temporary lobby exactly once per open modal. The backend
   * treats this event as idempotent for the same host, so a reconnect or a
   * StrictMode remount never leaves a duplicate lobby behind.
   */
  const ensureHostLobby = useCallback(() => {
    if (!user || initialLobby || lobby || modeRef.current !== "ONLINE_FRIENDS") return;
    connectChatSocket(user.id);
    if (!isChatSocketConnected()) {
      setOnlineLoading(true);
      return;
    }

    const requestKey = [
      user.id,
      state.online.playerCount,
      state.online.preferredColour,
    ].join(":");
    if (requestedLobbyRef.current === requestKey) return;
    requestedLobbyRef.current = requestKey;
    setOnlineLoading(true);

    const sent = ludoSocket.createLobby({
      playerCount: state.online.playerCount,
      colour: state.online.preferredColour,
    });

    if (!sent) {
      requestedLobbyRef.current = null;
      setOnlineLoading(false);
      setNotice({
        tone: "error",
        message: "The realtime lobby is still connecting. Try again in a moment.",
      });
    }
  }, [initialLobby, lobby, state.online, user]);

  useEffect(() => {
    if (!isChatSocketConnected()) {
      setIsSocketReady(false);
      return undefined;
    }
    setIsSocketReady(true);
    return undefined;
  }, [state.mode, lobby]);

  useEffect(() => {
    if (state.mode !== "ONLINE_FRIENDS" || initialLobby) return;
    ensureHostLobby();
  }, [ensureHostLobby, initialLobby, state.mode]);

  useEffect(() => {
    if (!user?.id) return undefined;
    if (state.mode === "ONLINE_FRIENDS") connectChatSocket(user.id);
    return undefined;
  }, [state.mode, user?.id]);

  useEffect(() => {
    const unsubscribeConnected = onChatEvent("chat:changed", ({ reason }) => {
      if (reason !== "refresh") return;
      setIsSocketReady(true);
      // A fresh connection gets a fresh create attempt. The backend treats
      // lobby creation as idempotent per host, so this recovers a lost event
      // without ever producing a duplicate lobby.
      requestedLobbyRef.current = null;
      if (modeRef.current === "ONLINE_FRIENDS") ensureHostLobby();
    });

    const unsubscribeState = onChatEvent("ludo:lobby-state", ({ lobby: nextLobby }) => {
      const currentId = lobbyIdRef.current;
      const belongsToViewer = nextLobby.hostId === user?.id;
      if (currentId && currentId !== nextLobby.id && !belongsToViewer) return;
      if (!currentId && !belongsToViewer) return;
      applyLobby(nextLobby);
    });

    const unsubscribeJoined = onChatEvent("ludo:lobby-joined", ({ lobby: nextLobby }) => {
      applyLobby(nextLobby);
      setState((current) => ({ ...current, mode: "ONLINE_FRIENDS" }));
    });

    const unsubscribeClosed = onChatEvent("ludo:lobby-closed", ({ lobbyId, reason }) => {
      if (lobbyIdRef.current !== lobbyId) return;
      lobbyIdRef.current = null;
      lobbyRef.current = null;
      pendingPlayerCountRef.current = null;
      requestedLobbyRef.current = null;
      setLobby(null);
      setOnlineLoading(false);
      onLobbyClosedRef.current?.(reason);
    });

    const unsubscribeSent = onChatEvent("ludo:invitation-sent", ({ invitation }) => {
      setNotice({
        tone: "info",
        message: `Invitation sent to ${invitation.inviteeName}.`,
      });
    });

    const unsubscribeDeclined = onChatEvent("ludo:invitation-declined", ({ inviteeName }) => {
      setNotice({
        tone: "info",
        message: `${inviteeName} declined the invitation.`,
      });
    });

    const unsubscribeError = onChatEvent("ludo:error", ({ message }) => {
      setNotice({ tone: "error", message });
      const currentLobby = lobbyRef.current;
      if (currentLobby && pendingPlayerCountRef.current !== null) {
        pendingPlayerCountRef.current = null;
        setState((current) => current.online.playerCount === currentLobby.playerCount
          ? current
          : {
            ...current,
            online: { ...current.online, playerCount: currentLobby.playerCount },
          });
      }
      if (!lobbyIdRef.current) setOnlineLoading(false);
    });

    const unsubscribePlayerJoined = onChatEvent("ludo:player-joined", ({ lobbyId, playerName }) => {
      if (lobbyIdRef.current !== lobbyId) return;
      setNotice({ tone: "info", message: `${playerName} joined the arena.` });
    });

    return () => {
      unsubscribeConnected();
      unsubscribeState();
      unsubscribeJoined();
      unsubscribeClosed();
      unsubscribeSent();
      unsubscribeDeclined();
      unsubscribeError();
      unsubscribePlayerJoined();
    };
  }, [applyLobby, ensureHostLobby, user?.id]);

  useEffect(() => {
    // React StrictMode mounts, cleans up and mounts again in development. A
    // deferred leave can therefore be cancelled by the immediate remount,
    // while a real unmount still tells the backend to remove this participant.
    if (leaveTimerRef.current !== null) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }

    return () => {
      const lobbyId = lobbyIdRef.current;
      if (!lobbyId) return;

      leaveTimerRef.current = setTimeout(() => {
        leaveTimerRef.current = null;
        if (lobbyIdRef.current !== lobbyId) return;
        lobbyIdRef.current = null;
        ludoSocket.leaveLobby(lobbyId);
      }, 0);
    };
  }, []);

  const changeMode = useCallback((mode: LudoSetupState["mode"]) => {
    setState((current) => setLudoMode(current, mode));
  }, []);

  const changeArcadionPlayerCount = useCallback((count: LudoPlayerCount) => {
    setState((current) => setArcadionPlayerCount(current, count));
  }, []);

  const changeArcadionColour = useCallback((colour: LudoColour) => {
    setState((current) => selectArcadionColour(current, colour));
  }, []);

  const changeArcadionDifficulty = useCallback((difficulty: LudoSetupState["arcadion"]["difficulty"]) => {
    setState((current) => setArcadionDifficulty(current, difficulty));
  }, []);

  const changeArcadionPower = useCallback((power: ArcadionPower) => {
    setState((current) => setArcadionPower(current, power));
  }, []);

  const changePassPlayPlayerCount = useCallback((count: LudoPlayerCount) => {
    setState((current) => setPassPlayPlayerCount(current, count));
  }, []);

  const changePassPlayName = useCallback((colour: LudoColour, name: string) => {
    setState((current) => setPassPlayName(current, colour, name));
  }, []);

  const addPassPlaySeatBot = useCallback((colour: LudoColour) => {
    setState((current) => addPassPlayBot(current, colour));
  }, []);

  const removePassPlaySeatBot = useCallback((colour: LudoColour) => {
    setState((current) => removePassPlayBot(current, colour));
  }, []);

  const assignPassPlaySeatFriend = useCallback((colour: LudoColour, friend: Friend) => {
    setState((current) => assignPassPlayFriend(current, colour, toFriendSummary(friend)));
  }, []);

  const removePassPlaySeatFriend = useCallback((colour: LudoColour) => {
    setState((current) => removePassPlayFriend(current, colour));
  }, []);

  const changePassPlayPower = useCallback((power: ArcadionPower) => {
    setState((current) => setPassPlayPower(current, power));
  }, []);

  const hostConfiguration = useCallback((nextPlayerCount: LudoPlayerCount): boolean => {
    if (!canHostConfigureLudo(lobby, user?.id ?? null) || !lobbyIdRef.current || !isHost) {
      return false;
    }
    const sent = ludoSocket.updateConfig(lobbyIdRef.current, {
      playerCount: nextPlayerCount,
    });
    if (!sent) {
      setNotice({ tone: "error", message: "The lobby is reconnecting. Please try again." });
    }
    return sent;
  }, [isHost, lobby, user?.id]);

  const changeOnlinePlayerCount = useCallback((count: LudoPlayerCount) => {
    if (!isHost) return;
    if (count < onlineOccupiedCount) {
      setNotice({
        tone: "error",
        message: "Remove players or invited seats before lowering the match size.",
      });
      return;
    }
    if (lobby && lobbyIdRef.current) pendingPlayerCountRef.current = count;
    setState((current) => setOnlinePlayerCount(current, count));
    if (!hostConfiguration(count) && lobby && lobbyIdRef.current) {
      pendingPlayerCountRef.current = null;
      setState((current) => ({
        ...current,
        online: { ...current.online, playerCount: lobby.playerCount },
      }));
    }
  }, [hostConfiguration, isHost, lobby, onlineOccupiedCount]);

  const changeOnlineBot = useCallback((colour: LudoColour) => {
    if (!isHost || !lobby || !lobbyIdRef.current) return;
    const seat = lobby.seats.find((candidate) => candidate.colour === colour);
    const enabling = seat?.type !== "ARCADION";
    if (enabling && !canAddLudoBot(lobby, colour)) {
      setNotice({ tone: "error", message: "There is no free seat for another Arcadion bot." });
      return;
    }
    const sent = ludoSocket.toggleBot(lobbyIdRef.current, colour, enabling);
    if (!sent) {
      setNotice({ tone: "error", message: "The lobby is reconnecting. Please try again." });
    }
  }, [isHost, lobby]);

  const changeOwnColour = useCallback((colour: LudoColour) => {
    if (!user) return;
    if (!lobby || !lobbyIdRef.current) {
      setState((current) => setOnlinePreferredColour(current, colour));
      return;
    }
    if (!availableOwnColours.includes(colour)) {
      setNotice({ tone: "error", message: "That colour is already taken." });
      return;
    }
    const sent = ludoSocket.setColour(lobbyIdRef.current, colour);
    if (!sent) {
      setNotice({ tone: "error", message: "The lobby is reconnecting. Please try again." });
    }
  }, [availableOwnColours, lobby, user]);

  const inviteFriend = useCallback((friend: Friend, colour: LudoColour) => {
    if (!isHost || !lobby || !lobbyIdRef.current) {
      setNotice({ tone: "error", message: "Open an online lobby before inviting friends." });
      return;
    }
    const eligibility = getInviteEligibility(friend, lobby, lobby.pendingInviteeIds);
    if (eligibility !== "ELIGIBLE") {
      setNotice({
        tone: "error",
        message: eligibility === "OFFLINE"
          ? `${friend.username} is offline.`
          : eligibility === "INVITED"
            ? `${friend.username} already has a pending invitation.`
            : eligibility === "ALREADY_IN_LOBBY"
              ? `${friend.username} is already seated.`
              : "That friend cannot be invited right now.",
      });
      return;
    }
    if (!canInviteFriendToColour(lobby, colour, friend.id)) {
      setNotice({ tone: "error", message: "That seat is no longer available." });
      return;
    }
    const sent = ludoSocket.inviteFriend(lobbyIdRef.current, friend.id, colour);
    if (!sent) {
      setNotice({ tone: "error", message: "The lobby is reconnecting. Please try again." });
    }
  }, [isHost, lobby]);

  const removeOnlinePlayer = useCallback((playerId: string) => {
    if (!isHost || !lobbyIdRef.current) return;
    const sent = ludoSocket.removePlayer(lobbyIdRef.current, playerId);
    if (!sent) {
      setNotice({ tone: "error", message: "The lobby is reconnecting. Please try again." });
    }
  }, [isHost]);

  const leaveOnlineLobby = useCallback(() => {
    const lobbyId = lobbyIdRef.current;
    if (!lobbyId) return;
    const sent = ludoSocket.leaveLobby(lobbyId);
    if (!sent) {
      setNotice({ tone: "error", message: "The lobby is reconnecting. Please try again." });
      return;
    }
    lobbyIdRef.current = null;
  }, []);

  const sendLobbyChat = useCallback((text: string) => {
    if (!lobbyIdRef.current) return false;
    const sent = ludoSocket.sendLobbyChat(lobbyIdRef.current, text);
    if (!sent) {
      setNotice({ tone: "error", message: "Chat is reconnecting. Please try again." });
    }
    return sent;
  }, []);

  const dismissNotice = useCallback(() => setNotice(null), []);

  return {
    user,
    state,
    lobby,
    isHost,
    playerCount,
    arcadionPower,
    ownSeat,
    onlineSeats,
    onlinePendingInvites,
    onlineOccupiedCount,
    onlineLoading,
    isSocketReady,
    notice,
    validation,
    arcadionSeats,
    passPlayHasBot,
    onlineHasBot,
    availableOwnColours,
    changeMode,
    changeArcadionPlayerCount,
    changeArcadionColour,
    changeArcadionDifficulty,
    changeArcadionPower,
    changePassPlayPlayerCount,
    changePassPlayName,
    addPassPlaySeatBot,
    removePassPlaySeatBot,
    assignPassPlaySeatFriend,
    removePassPlaySeatFriend,
    changePassPlayPower,
    changeOnlinePlayerCount,
    changeOnlineBot,
    changeOwnColour,
    inviteFriend,
    removeOnlinePlayer,
    leaveOnlineLobby,
    sendLobbyChat,
    dismissNotice,
  };
}

export type LudoSetupController = ReturnType<typeof useLudoSetup>;
