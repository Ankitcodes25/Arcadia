import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { createPortal } from "react-dom";
import { NOTICE_FADING_CLASS, useAutoDismissNotice } from "../auth/authNotice";
import { acquireModalScrollLock } from "../auth/modalScrollLock";
import { getUsernameLengthWarning, USERNAME_SAVE_FAILED_MESSAGE } from "../auth/usernameAvailability";
import {
  getUsernameLength,
  resolveUsernameInput,
  USERNAME_MAX_LENGTH,
  USERNAME_MAX_REACHED_MESSAGE,
} from "../auth/usernameRules";
import "./UsernameModal.css";

/* ===========================================================
   ICONS — same inline-SVG style as MyProfileModal
   =========================================================== */

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4.5 19.5c1.6-3.4 4.6-5 7.5-5s5.9 1.6 7.5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 11v5.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="7.8" r="1" fill="currentColor" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12h15.2M13.5 5.5 20 12l-6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5 19 19M19 5 5 19" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

/* ===========================================================
   USERNAME MODAL
   - mode="onboarding": used right after a Google sign-up where
     no username exists yet. No close button — the user must
     pick a username before continuing into the app.
   - mode="edit": used from inside My Profile to change an
     existing username. Shows a close (X) button; the caller
     (MyProfileModal) is expected to blur/disable itself while
     this is open, e.g. via a `mpm-modal--blurred` class.
   =========================================================== */

type UsernameModalProps = {
  mode?: "onboarding" | "edit";
  initialUsername?: string;
  /**
   * Maximum length in Unicode code points, not UTF-16 units. It is enforced by
   * the shared `usernameRules` helpers rather than by a native `maxLength`
   * attribute, which the browser would count in UTF-16 units.
   */
  maxLength?: number;
  isSubmitting?: boolean;
  /** Test seam: production always uses the shared 5 second lifecycle. */
  noticeDurationMs?: number;
  /**
   * Accepts the username, or refuses it by returning the warning to show.
   *
   * A returned string means the username was not accepted: the modal stays open,
   * the input keeps the entered value, and the warning runs the shared notice
   * lifecycle. Returning `null` means the caller accepted it and is responsible
   * for closing the modal.
   */
  onSubmit: (username: string) => Promise<string | null> | string | null;
  onClose?: () => void;
};

function UsernameModal({
  mode = "onboarding",
  initialUsername = "",
  maxLength = USERNAME_MAX_LENGTH,
  isSubmitting = false,
  noticeDurationMs,
  onSubmit,
  onClose,
}: UsernameModalProps) {
  const [username, setUsername] = useState(initialUsername);
  // One warning channel for both the length rules and a refused username, so
  // they share the single existing notice lifecycle.
  const [warning, setWarning] = useState<string | null>(null);
  // Local guard so a second click cannot start a second availability lookup.
  const [isChecking, setIsChecking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const closable = mode === "edit" && !!onClose;

  /*
   * The same shared warning lifecycle the signup form uses: fully visible, then
   * fading, then removed, with a new warning restarting it. No second timer
   * system is introduced here.
   */
  const dismissWarning = useCallback(() => setWarning(null), []);
  const isWarningFading = useAutoDismissNotice(warning, dismissWarning, noticeDurationMs);

  const isBusy = isSubmitting || isChecking;

  useEffect(() => {
    inputRef.current?.focus();
    /*
     * The shared, reference counted lock. It keeps this layer from being
     * scrolled behind, and because it is counted, opening it on top of a parent
     * dialog that already holds the lock neither locks nor unlocks the document
     * again, so the centred parent stays exactly where it is.
     */
    const release = acquireModalScrollLock();
    return release;
  }, []);

  useEffect(() => {
    if (!closable) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closable, onClose]);

  // The counter counts the same code points the server validates.
  const usernameLength = getUsernameLength(username);
  const trimmed = username.trim();

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const { value, exceededMax } = resolveUsernameInput(event.target.value, {
      isComposing: (event.nativeEvent as InputEvent)?.isComposing,
      maxLength,
    });

    setUsername(value);

    if (exceededMax) {
      // A refused code point starts the shared warning lifecycle.
      setWarning(USERNAME_MAX_REACHED_MESSAGE);
      return;
    }

    // Typing again clears the previous warning, so another username can be
    // entered immediately after a rejection.
    setWarning(null);
  }

  function handleBackdropMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    if (closable && event.target === event.currentTarget) onClose?.();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isBusy) return;

    /*
     * A value that breaks the shared 3-20 code point rule is reported in place.
     * The modal is never closed because of a validation error.
     */
    const lengthWarning = getUsernameLengthWarning(trimmed);
    if (lengthWarning) {
      setWarning(lengthWarning);
      return;
    }

    setIsChecking(true);
    try {
      // Only surrounding whitespace is removed; the visible username is
      // otherwise passed on exactly as entered, the same as the backend stores.
      const refusal = await onSubmit(trimmed);
      if (refusal) {
        // The caller refused it, so the modal stays open with the value intact.
        setWarning(refusal);
      }
    } catch {
      setWarning(USERNAME_SAVE_FAILED_MESSAGE);
    } finally {
      setIsChecking(false);
    }
  }

  const hint = warning
    ? (
      <p
        className={`unm-hint unm-hint--error${isWarningFading ? ` ${NOTICE_FADING_CLASS}` : ""}`}
        role="alert"
      >
        {warning}
      </p>
    )
    : (
      <p className="unm-hint">
        <InfoIcon />
        Your username will be visible to other players.
      </p>
    );

  return createPortal(
    <div className="unm-backdrop" onMouseDown={handleBackdropMouseDown}>
      <div className="unm-modal" role="dialog" aria-modal="true" aria-label="Enter your username">
        {closable && (
          <button type="button" className="unm-close arcadia-modal-close" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        )}

        <h2 className="unm-title">Enter Your Username</h2>

        <form onSubmit={handleSubmit} noValidate>
          <div className={`unm-input-box${warning ? " unm-input-box--error" : ""}`}>
            <PersonIcon />
            <input
              ref={inputRef}
              className="unm-input"
              value={username}
              // No native maxLength: it would count UTF-16 units and reject a
              // valid 20 code point emoji username. The code point maximum is
              // enforced by the shared username rules in handleChange.
              placeholder="e.g. gamer123"
              autoComplete="off"
              spellCheck={false}
              onChange={handleChange}
            />
            <span className="unm-counter">{usernameLength} / {maxLength}</span>
          </div>

          {hint}

          {/*
            The primary action of this modal. It validates, checks availability
            and persists through the existing account profile write; the modal
            only closes once that succeeded.
          */}
          <button type="submit" className="unm-continue" disabled={isBusy}>
            {isBusy ? "Saving…" : (
              <>
                Save Changes
                <ArrowIcon />
              </>
            )}
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}

export default UsernameModal;