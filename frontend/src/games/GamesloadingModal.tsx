import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { acquireModalScrollLock } from "../auth/modalScrollLock";
import GameLogo from "../pages/Allgames/Sections/GameLogo";
import "./GamesloadingModal.css";

type GamesloadingModalProps = {
  gameName: string;
  onClose: () => void;
};

type GamesloadingContentProps = {
  gameName: string;
  titleId: string;
};

export function GamesloadingContent({ gameName, titleId }: GamesloadingContentProps) {
  return (
    <div className="games-loading" aria-live="polite" aria-busy="true">
      <div className="games-loading-topline">
        <span className="games-loading-signal" aria-hidden="true" />
        <span>GAME STARTING</span>
      </div>
      <div className="games-loading-stage" aria-hidden="true">
        <span className="games-loading-orbit games-loading-orbit--outer" />
        <span className="games-loading-orbit games-loading-orbit--inner" />
        <div className="games-loading-logo">
          <GameLogo gameName={gameName} />
        </div>
      </div>
      <div className="games-loading-copy">
        <h2 id={titleId}>Starting {gameName}...</h2>
        <p>Getting everything ready for you</p>
      </div>
      <div
        className="games-loading-progress"
        role="progressbar"
        aria-label={`Loading ${gameName}`}
      >
        <span />
      </div>
      <div className="games-loading-status">
        <span>LOADING...</span>
      </div>
    </div>
  );
}

function GamesloadingModal({ gameName, onClose }: GamesloadingModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => acquireModalScrollLock(), []);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const focusDialog = () => dialog.focus();
    const animationFrame = window.requestAnimationFrame(focusDialog);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
      } else if (event.key === "Tab") {
        event.preventDefault();
        dialogRef.current?.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.cancelAnimationFrame(animationFrame);
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    createPortal(
      <div
        className="games-loading-backdrop"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeRef.current();
        }}
      >
        <section
          ref={dialogRef}
          className="games-loading-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
        >
          <GamesloadingContent gameName={gameName} titleId={titleId} />
        </section>
      </div>,
      document.body,
    )
  );
}

export default GamesloadingModal;

