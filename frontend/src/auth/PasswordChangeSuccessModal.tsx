import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "./AuthContext";
import { navigateTo } from "../lib/navigation";
import logo from "../assets/ArcadialogoA.png";
/*
 * The panel, backdrop and base typography come from the auth modal's own
 * sheet: this dialog and the Landing Page's Login/Signup dialog are one
 * family, so they share those tokens instead of restyling them twice.
 * Importing it leaves the login dialog exactly as it is — the few things that
 * differ here (one-line centred heading, centred Login button, the close
 * button used by the other modals) are written in this component's own sheet.
 */
import "../components/LoginSignupModal.css";
import "./PasswordChangeSuccessModal.css";

/** Where the reader goes once this dialog is done, in either case. */
const LANDING_PATH = "/";

/* The same cross the Settings and My Profile dialogs carry, so a close
   affordance never changes shape from one dialog to the next. */
function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5 19 19M19 5 5 19" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The confirmation a password change raises once the backend has confirmed it.
 *
 * It is rendered next to App's other auth surfaces rather than inside Settings,
 * because a password change signs the session out: Settings unmounts with the
 * signed-out state, and this dialog has to outlive it to explain what happened.
 * Nothing here can be shown before the request succeeds — AuthContext raises
 * the flag only after the change is confirmed.
 */
function PasswordChangeSuccessModal() {
  const {
    passwordChangeSuccess,
    dismissPasswordChangeSuccess,
    closeAuthMode,
    openAuthMode,
  } = useAuth();
  const dismissStartedRef = useRef(false);

  /*
   * Closing the dialog — with the cross, on the backdrop or with Escape —
   * sends the reader to the Landing Page and stops there: no sign-in dialog is
   * opened, because they chose to leave rather than to sign back in. The
   * session the change ended stays ended either way; nothing here touches auth
   * state beyond clearing the confirmation.
   */
  const handleDismiss = useCallback(() => {
    if (dismissStartedRef.current) return;
    dismissStartedRef.current = true;
    navigateTo(LANDING_PATH);
    dismissPasswordChangeSuccess();
    closeAuthMode();
  }, [closeAuthMode, dismissPasswordChangeSuccess]);

  /*
   * The session is already gone by the time this is shown: the backend bumped
   * the token version, revoked the refresh sessions and cleared the refresh
   * cookie, and AuthContext dropped local auth with them. So there is no
   * logout request left to make — this only closes the dialog, returns to the
   * Landing Page through the normal navigation helper and opens the existing
   * Login/Signup dialog in login mode. Both are plain state updates in one
   * handler, so they land in a single render with no delay in between.
   */
  const handleLogin = useCallback(() => {
    dismissPasswordChangeSuccess();
    navigateTo(LANDING_PATH);
    openAuthMode("login");
  }, [dismissPasswordChangeSuccess, openAuthMode]);

  /* Escape behaves like the cross, same as the other Arcadia dialogs. */
  useEffect(() => {
    if (!passwordChangeSuccess) return;
    dismissStartedRef.current = false;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleDismiss();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [passwordChangeSuccess, handleDismiss]);

  if (!passwordChangeSuccess) {
    return null;
  }

  return createPortal(
    /*
     * Backdrop dismissal uses the same guard as Settings and My Profile:
     * only a press that lands on the backdrop itself dismisses, so a press
     * that starts on the dialog can never end up closing it by accident.
     * Clicks are stopped here so they never reach an ancestor handler.
     */
    <div
      className="auth-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleDismiss();
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <section
        className="auth-modal password-change-success"
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-changed-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {/*
          A sibling of the Login button, never inside it and never inside a
          form, so a close can only ever close: no handler of the Login button
          and no submission is reachable from here.
        */}
        <a
          href={LANDING_PATH}
          className="password-change-close arcadia-modal-close"
          aria-label="Close dialog and return to the landing page"
        >
          <CloseIcon />
        </a>

        <div className="auth-modal-brand">
          <img src={logo} alt="" />
          <span>ARCADIA</span>
        </div>

        <h2 id="password-changed-title">Password Changed Successfully</h2>
        <p className="auth-modal-description">
          Your password has been changed successfully. Please log in again using
          your new password.
        </p>

        <button
          type="button"
          className="auth-submit password-change-login"
          onClick={handleLogin}
        >
          Login
        </button>
      </section>
    </div>,
    document.body,
  );
}

export default PasswordChangeSuccessModal;