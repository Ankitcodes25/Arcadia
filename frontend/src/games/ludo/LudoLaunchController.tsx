import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import "./LudoSetup.css";
import { onChatEvent } from "../../chat/chatSocket";
import GameInvitationPanel from "./GameInvitationPanel";
import GamesloadingModal from "../GamesloadingModal";
import LudoModalFrame from "./LudoModalFrame";
import LudoSetupModal from "./LudoSetupModal";
import { LUDO_LAUNCH_EVENT, isLudoGame, type LudoLaunchDetail } from "./ludoLaunch";
import { LUDO_GAME_NAME, type LudoLobbyState } from "./types";

type LudoStage = "idle" | "loading" | "setup";

const LOADING_TRANSITION_MS = 1100;

/**
 * One global launch surface. Every Ludo card, wherever it lives, asks for this
 * controller through `arcadia:ludo-launch` (or the existing generic
 * `arcadia:game-opened` event), so the loading beat and setup dialog are never
 * duplicated per page.
 */
function LudoLaunchController() {
  const { isAuthenticated, openAuthMode } = useAuth();
  const [stage, setStage] = useState<LudoStage>("idle");
  const [gameName, setGameName] = useState(LUDO_GAME_NAME);
  const [initialLobby, setInitialLobby] = useState<LudoLobbyState | null>(null);
  const [closedNotice, setClosedNotice] = useState<string | null>(null);
  const transitionTimerRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const stageRef = useRef<LudoStage>("idle");

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  const clearTransitionTimer = () => {
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
  };

  const showClosedNotice = (message: string) => {
    setClosedNotice(message);
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setClosedNotice(null), 4200);
  };

  const launch = useCallback((nextGameName: string) => {
    if (!isAuthenticated) {
      openAuthMode("login");
      return;
    }
    if (stageRef.current !== "idle") return;

    clearTransitionTimer();
    stageRef.current = "loading";
    setGameName(nextGameName || LUDO_GAME_NAME);
    setInitialLobby(null);
    setStage("loading");
    transitionTimerRef.current = window.setTimeout(() => {
      transitionTimerRef.current = null;
      stageRef.current = "setup";
      setStage("setup");
    }, LOADING_TRANSITION_MS);
  }, [isAuthenticated, openAuthMode]);

  const close = useCallback(() => {
    clearTransitionTimer();
    stageRef.current = "idle";
    setStage("idle");
    setInitialLobby(null);
  }, []);

  useEffect(() => {
    const onLaunch = (event: Event) => {
      const detail = (event as CustomEvent<LudoLaunchDetail>).detail;
      launch(detail?.gameName || LUDO_GAME_NAME);
    };
    const onGenericGameOpened = (event: Event) => {
      const detail = (event as CustomEvent<{ gameName?: string }>).detail;
      if (isLudoGame(detail?.gameName)) launch(detail?.gameName ?? LUDO_GAME_NAME);
    };

    window.addEventListener(LUDO_LAUNCH_EVENT, onLaunch);
    window.addEventListener("arcadia:game-opened", onGenericGameOpened);
    return () => {
      window.removeEventListener(LUDO_LAUNCH_EVENT, onLaunch);
      window.removeEventListener("arcadia:game-opened", onGenericGameOpened);
      clearTransitionTimer();
      if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    };
  }, [launch]);

  useEffect(() => onChatEvent("ludo:lobby-joined", ({ lobby }) => {
    if (!isAuthenticated) return;
    clearTransitionTimer();
    setGameName(LUDO_GAME_NAME);
    setInitialLobby(lobby);
    setStage("setup");
  }), [isAuthenticated]);

  const handleLobbyClosed = (reason: string) => {
    close();
    showClosedNotice(
      reason === "HOST_LEFT"
        ? "The host closed the lobby."
        : "The lobby is no longer available.",
    );
  };

  return (
    <>
      <GameInvitationPanel />

      {closedNotice && (
        <div className="ludo-toast" role="status">{closedNotice}</div>
      )}

      {stage === "loading" && (
        <GamesloadingModal gameName={gameName} onClose={close} />
      )}

      {stage === "setup" && (
        <LudoModalFrame
          ariaLabel={`${gameName} setup`}
          labelledBy="ludo-modal-title"
          onClose={close}
        >
          <LudoSetupModal
            key={initialLobby?.id ?? "host"}
            gameName={gameName}
            initialLobby={initialLobby}
            onClose={close}
            onLobbyClosed={handleLobbyClosed}
          />
        </LudoModalFrame>
      )}
    </>
  );
}

export default LudoLaunchController;
