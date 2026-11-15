import { Send } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  LUDO_CHAT_MAX_LENGTH,
  LUDO_CHAT_QUICK_MESSAGES,
  normaliseLudoChatText,
} from "./ludoChat";

type LudoLobbyChatProps = {
  open: boolean;
  canSend: boolean;
  onSend: (text: string) => boolean;
};

function LudoLobbyChat({ open, canSend, onSend }: LudoLobbyChatProps) {
  const [draft, setDraft] = useState("");

  if (!open) return null;

  const send = (text: string) => {
    const normalised = normaliseLudoChatText(text);
    if (!normalised || !canSend) return;
    if (onSend(normalised)) setDraft("");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    send(draft);
  };

  return (
    <section className="ludo-chat-panel" aria-label="Temporary lobby chat">
      <div className="ludo-chat-quick" role="group" aria-label="Quick messages">
        {LUDO_CHAT_QUICK_MESSAGES.map((message) => (
          <button
            key={message}
            type="button"
            className="ludo-chat-quick-button"
            onClick={() => send(message)}
            disabled={!canSend}
          >
            {message}
          </button>
        ))}
      </div>

      <form className="ludo-chat-form" onSubmit={handleSubmit}>
        <label className="ludo-chat-input-wrap">
          <span className="ludo-chat-sr-only">Chat message</span>
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={LUDO_CHAT_MAX_LENGTH}
            placeholder={canSend ? "Message the lobby..." : "Waiting for the lobby..."}
            disabled={!canSend}
          />
        </label>
        <button
          type="submit"
          className="ludo-chat-send"
          disabled={!canSend || !normaliseLudoChatText(draft)}
        >
          <Send aria-hidden="true" />
          Send
        </button>
      </form>

    </section>
  );
}

export default LudoLobbyChat;
