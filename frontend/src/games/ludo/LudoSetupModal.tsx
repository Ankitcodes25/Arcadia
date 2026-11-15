import { Dices, X } from "lucide-react";
import { useEffect } from "react";
import { onChatEvent } from "../../chat/chatSocket";
import ArcadionSetup from "./LudoSetup";
import GameModeSelector from "./GameModeSelector";
import LudoSetupFooter from "./LudoSetupFooter";
import OnlineFriendsSetup from "./OnlineFriendsSetup";
import PassAndPlaySetup from "./PassAndPlaySetup";
import GameLogo from "../../pages/Allgames/Sections/GameLogo";
import { useLudoChatBubbles } from "./useLudoChatBubbles";
import { useLudoSetup } from "./useLudoSetup";
import type { LudoLobbyState } from "./types";

type LudoSetupModalProps = {
  gameName: string;
  initialLobby?: LudoLobbyState | null;
  onClose: () => void;
  onLobbyClosed?: (reason: string) => void;
};

/**
 * Single-screen Ludo setup with a fixed header and footer. Only an expanded
 * friends picker scrolls, keeping the setup layout close to the Profile modal.
 */
function LudoSetupModal({
  gameName,
  initialLobby = null,
  onClose,
  onLobbyClosed,
}: LudoSetupModalProps) {
  const setup = useLudoSetup({ initialLobby, onLobbyClosed });
  const { bubbles, addBubble, clearBubbles } = useLudoChatBubbles();
  const { state, lobby, isHost, changeMode, sendLobbyChat } = setup;
  const lobbyId = lobby?.id ?? null;

  useEffect(() => onChatEvent("ludo:lobby-chat", ({ message }) => {
    if (lobbyId && message.lobbyId !== lobbyId) return;
    addBubble(message);
  }), [addBubble, lobbyId]);

  useEffect(() => {
    if (!lobbyId) clearBubbles();
  }, [clearBubbles, lobbyId]);

  return (
    <div className="ludo-setup">
      <header className="ludo-header">
        <span className="ludo-header-icon" aria-hidden="true">
          <span className="ludo-header-dice-container">
            <GameLogo gameName="Ludo" />
          </span>
        </span>
        <div className="ludo-header-copy">
          <h2 className="ludo-title" id="ludo-modal-title">{gameName.toUpperCase()}</h2>
          <span className="ludo-header-sub">Board game · setup</span>
        </div>
        <button
          type="button"
          className="ludo-close arcadia-modal-close"
          onClick={onClose}
          aria-label="Close Ludo setup"
        >
          <X aria-hidden="true" />
        </button>
      </header>

      <div className={`ludo-body${state.mode === "ONLINE_FRIENDS" ? " ludo-body--online-friends" : ""}`}>
        <GameModeSelector mode={state.mode} onChange={changeMode} />

        {state.mode === "ARCADION" && <ArcadionSetup setup={setup} />}

        {state.mode === "PASS_PLAY" && <PassAndPlaySetup setup={setup} />}

        {state.mode === "ONLINE_FRIENDS" && (
          <div className="ludo-body-scroll--online-friends">
            <OnlineFriendsSetup
              setup={setup}
              bubbles={bubbles}
              onSendChat={sendLobbyChat}
            />
          </div>
        )}
      </div>

      <LudoSetupFooter
        mode={state.mode}
        isHost={isHost}
        onBack={onClose}
      />
    </div>
  );
}

export default LudoSetupModal;
