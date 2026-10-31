/*
 * Shared admin modal. Follows the Arcadia portal-modal pattern (see
 * components/LoginSignupModal.tsx) including the reference-counted document
 * scroll lock from src/auth/modalScrollLock.ts, and closes on Escape.
 */

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { acquireModalScrollLock } from "../../auth/modalScrollLock";

interface AdminModalProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

function AdminModal({ title, subtitle, onClose, children, footer, wide }: AdminModalProps) {
  useEffect(() => acquireModalScrollLock(), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="adm-modal-layer"
      onMouseDown={(event) => {
        // Close only when the backdrop itself (not the panel) is clicked.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`adm-modal${wide ? " adm-modal--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="adm-modal__header">
          <div>
            <h2 className="adm-modal__title">{title}</h2>
            {subtitle ? <p className="adm-modal__subtitle">{subtitle}</p> : null}
          </div>
          <button type="button" className="adm-modal__close" aria-label="Close dialog" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="adm-modal__body">{children}</div>
        {footer ? <footer className="adm-modal__footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}

export default AdminModal;
