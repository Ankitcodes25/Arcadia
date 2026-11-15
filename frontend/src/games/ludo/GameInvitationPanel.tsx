import { Check, Swords, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { ludoSocket, onChatEvent } from "../../chat/chatSocket";
import FriendAvatar from "../../friends/FriendAvatar";
import type { LudoInvitation } from "./types";

/**
 * A narrow, non-blocking invitation drawer. It is mounted once for the whole
 * authenticated application, so an invited player can respond from any page.
 * Accepting is completed by the backend's `ludo:lobby-joined` event, which the
 * launch controller uses to open the lobby view.
 */
function GameInvitationPanel() {
  const { isAuthenticated } = useAuth();
  const [invitations, setInvitations] = useState<LudoInvitation[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setInvitations([]);
      return undefined;
    }

    const unsubscribeInvitation = onChatEvent("ludo:invitation", ({ invitation }) => {
      setError(null);
      setInvitations((current) => (
        current.some((entry) => entry.id === invitation.id)
          ? current
          : [...current, invitation]
      ));
    });

    const unsubscribeExpired = onChatEvent("ludo:invitation-expired", ({ inviteId }) => {
      setInvitations((current) => current.filter((entry) => entry.id !== inviteId));
    });

    const unsubscribeClosed = onChatEvent("ludo:lobby-closed", () => {
      setInvitations([]);
    });

    return () => {
      unsubscribeInvitation();
      unsubscribeExpired();
      unsubscribeClosed();
    };
  }, [isAuthenticated]);

  const current = invitations[0] ?? null;

  useEffect(() => {
    if (!current) return undefined;
    const expiresAt = Date.parse(current.expiresAt);
    if (!Number.isFinite(expiresAt)) return undefined;

    const timer = window.setTimeout(() => {
      setInvitations((entries) => entries.filter((entry) => entry.id !== current.id));
    }, Math.max(0, expiresAt - Date.now()));

    return () => window.clearTimeout(timer);
  }, [current]);

  if (!isAuthenticated || !current) return null;

  const dismiss = (inviteId: string) => {
    setInvitations((entries) => entries.filter((entry) => entry.id !== inviteId));
  };

  const respond = (accept: boolean) => {
    const sent = ludoSocket.respondToInvitation(current.id, accept);
    if (!sent) {
      setError("The invitation service is reconnecting. Try again in a moment.");
      return;
    }
    dismiss(current.id);
  };

  return (
    <aside
      className="ludo-invitation-panel"
      role="region"
      aria-label={`Ludo invitation from ${current.inviter.displayName}`}
      aria-live="assertive"
    >
      <span className="ludo-invitation-glow" aria-hidden="true" />
      <div className="ludo-invitation-top">
        <span className="ludo-invitation-kicker">
          <Swords aria-hidden="true" />
          GAME INVITATION
        </span>
        {invitations.length > 1 && (
          <span className="ludo-invitation-count">+{invitations.length - 1} more</span>
        )}
      </div>

      <div className="ludo-invitation-body">
        <FriendAvatar
          player={{
            avatar: current.inviter.avatar,
            avatarUrl: current.inviter.avatarUrl,
            username: current.inviter.displayName,
          }}
          className="ludo-invitation-avatar"
        />
        <div className="ludo-invitation-copy">
          <strong>{current.inviter.displayName}</strong>
          <span>invited you to play</span>
          <span className="ludo-invitation-game">{current.gameName.toUpperCase()}</span>
        </div>
      </div>

      {error && <p className="ludo-invitation-error" role="alert">{error}</p>}

      <div className="ludo-invitation-actions">
        <button
          type="button"
          className="ludo-invitation-accept"
          onClick={() => respond(true)}
        >
          <Check aria-hidden="true" />
          Accept
        </button>
        <button
          type="button"
          className="ludo-invitation-decline"
          onClick={() => respond(false)}
        >
          <X aria-hidden="true" />
          Decline
        </button>
      </div>
    </aside>
  );
}

export default GameInvitationPanel;
