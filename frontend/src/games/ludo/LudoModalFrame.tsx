import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { acquireModalScrollLock } from "../../auth/modalScrollLock";

type LudoModalFrameProps = {
  children: ReactNode;
  ariaLabel: string;
  labelledBy?: string;
  dismissible?: boolean;
  onClose: () => void;
  className?: string;
};

const FOCUSABLE = [
  "button:not(:disabled)",
  "input:not(:disabled)",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  "[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * Shared accessible layer for both the short loading transition and the setup
 * dialog. It owns the existing Arcadia scroll lock, moves focus into the
 * dialog, traps Tab, handles Escape and restores focus to the card that
 * launched Ludo when the layer goes away.
 */
function LudoModalFrame({
  children,
  ariaLabel,
  labelledBy,
  dismissible = true,
  onClose,
  className = "",
}: LudoModalFrameProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);
  const fallbackId = useId();
  const labelId = labelledBy ?? fallbackId;

  useEffect(() => {
    closeRef.current = onClose;
    dismissibleRef.current = dismissible;
  }, [dismissible, onClose]);

  useEffect(() => acquireModalScrollLock(), []);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const focusFirst = () => {
      const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const target = focusable[0] ?? dialog;
      target.focus();
    };

    const animationFrame = typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame(focusFirst)
      : window.setTimeout(focusFirst, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopImmediatePropagation();
        event.preventDefault();
        if (dismissibleRef.current) closeRef.current();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

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
      if (typeof window.cancelAnimationFrame === "function" && typeof animationFrame === "number") {
        window.cancelAnimationFrame(animationFrame);
      } else {
        window.clearTimeout(animationFrame);
      }
      previouslyFocused?.focus?.();
    };
  }, []);

  return createPortal(
    <div
      className="ludo-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && dismissible) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className={`ludo-modal ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={labelledBy ? labelId : undefined}
        tabIndex={-1}
      >
        {children}
      </section>
    </div>,
    document.body,
  );
}

export default LudoModalFrame;
