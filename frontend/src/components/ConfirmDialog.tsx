import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { acquireModalScrollLock } from "../auth/modalScrollLock";
import "./ConfirmDialog.css";

type ConfirmDialogProps = {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  busyLabel: string;
  /** Destructive confirmations use the danger treatment on the confirm button. */
  tone?: "default" | "danger";
  busy?: boolean;
  error?: string | null;
  /** Extra controls between the message and the actions (e.g. a checkbox). */
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
};

const FOCUSABLE = "button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex='-1'])";

/*
 * The one confirmation surface for actions that change something on the
 * server (clearing a chat, removing or blocking a friend). It stacks above
 * every Arcadia modal, owns Escape and Tab while open so the modal underneath
 * never reacts, and cannot be dismissed while the action is in flight.
 */
function ConfirmDialog({
  title,
  message,
  confirmLabel,
  busyLabel,
  tone = "default",
  busy = false,
  error = null,
  children,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const messageId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(busy);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    busyRef.current = busy;
    onCancelRef.current = onCancel;
  }, [busy, onCancel]);

  useEffect(() => acquireModalScrollLock(), []);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();

    // Capture phase on window runs before every other keydown listener, so
    // stopping here keeps Escape from also closing the chat or Friends modal.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // stopImmediatePropagation also covers a keydown targeted at window
        // itself, where other window listeners share the same phase.
        event.stopImmediatePropagation();
        event.preventDefault();
        if (!busyRef.current) onCancelRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, []);

  return createPortal(
    <div
      className="confirm-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        ref={dialogRef}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        aria-busy={busy}
      >
        <h2 id={titleId} className="confirm-dialog-title">{title}</h2>
        <p id={messageId} className="confirm-dialog-message">{message}</p>
        {children}
        {error && <p className="confirm-dialog-error" role="alert">{error}</p>}
        <div className="confirm-dialog-actions">
          <button
            ref={cancelRef}
            type="button"
            className="confirm-dialog-button"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`confirm-dialog-button confirm-dialog-button--confirm${tone === "danger" ? " confirm-dialog-button--danger" : ""}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy && <span className="confirm-dialog-spinner" aria-hidden="true" />}
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

export default ConfirmDialog;
