import { ArrowLeft, Play } from "lucide-react";
import { getLudoStartState } from "./ludoPermissions";
import type { LudoMode } from "./types";

type LudoSetupFooterProps = {
  mode: LudoMode;
  isHost: boolean;
  onBack: () => void;
};

function LudoSetupFooter({ mode, isHost, onBack }: LudoSetupFooterProps) {
  const start = getLudoStartState();
  const isOnlineGuest = mode === "ONLINE_FRIENDS" && !isHost;

  return (
    <footer className="ludo-footer">
      <div className="ludo-footer-actions">
        <button type="button" className="ludo-button ludo-button--ghost" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          {isOnlineGuest ? "Leave lobby" : "Back"}
        </button>
        <button
          type="button"
          className="ludo-button ludo-button--start"
          disabled={start.disabled}
          aria-disabled={start.disabled}
        >
          <Play aria-hidden="true" />
          {start.label}
        </button>
      </div>
    </footer>
  );
}

export default LudoSetupFooter;
