import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import logo from "../assets/ArcadialogoA.png";
import { isGoogleAuthEnabled } from "../auth/authApi";
import type { AuthFormValues, AuthMode } from "../auth/authTypes";
import {
  NOTICE_FADING_CLASS,
  useAutoDismissNotice,
} from "../auth/authNotice";
import {
  getTrimmedUsernameLength,
  getUsernameLength,
  resolveUsernameInput,
  USERNAME_MAX_LENGTH,
  USERNAME_MAX_REACHED_MESSAGE,
  USERNAME_MIN_LENGTH,
  USERNAME_TOO_SMALL_MESSAGE,
} from "../auth/usernameRules";
import "./LoginSignupModal.css";

type LoginSignupModalProps = {
  authMode: AuthMode;
  onClose: () => void;
  onSubmit: (values: AuthFormValues) => void | Promise<boolean>;
  onGoogleLogin: () => void;
  onSwitchMode: () => void;
  onClearError: () => void;
  onForgotPassword: (email: string) => Promise<string>;
  isSubmitting: boolean;
  error: string | null;
  /** Google sign-in warning, shown inside the still-open modal. */
  oauthError?: string | null;
  /** Test seam: production always uses the shared 5 second lifecycle. */
  noticeDurationMs?: number;
};

type ModalView = "form" | "forgot";
type WorkingAction = "forgot" | null;

/* eye / eye-off icon for the password field toggle */
function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M2 12C3.6 7.6 7.4 5 12 5s8.4 2.6 10 7c-1.6 4.4-5.4 7-10 7S3.6 16.4 2 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      {!open && (
        <path d="M4 4L20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      )}
    </svg>
  );
}

/* Google's official four-colour "G" mark. */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/* The same cross the Settings, My Profile and Avatars dialogs carry, so a
   close affordance never changes shape from one dialog to the next. */
function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5 19 19M19 5 5 19" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function LoginSignupModal({
  authMode,
  onClose,
  onSubmit,
  onGoogleLogin,
  onSwitchMode,
  onClearError,
  onForgotPassword,
  isSubmitting,
  error,
  oauthError = null,
  noticeDurationMs,
}: LoginSignupModalProps) {
  const [view, setView] = useState<ModalView>("form");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [workingAction, setWorkingAction] = useState<WorkingAction>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [usernameWarning, setUsernameWarning] = useState<string | null>(null);

  useEffect(() => {
    setView("form");
    setUsername("");
    setEmail("");
    setPassword("");
    setShowPassword(false);
    setLocalError(null);
    setInfoMessage(null);
    setUsernameWarning(null);
  }, [authMode]);

  const isBusy = isSubmitting || workingAction !== null;
  const isSignupForm = view === "form" && authMode === "signup";
  const usernameLength = getUsernameLength(username);

  const dismissUsernameWarning = useCallback(() => setUsernameWarning(null), []);
  const isUsernameWarningFading = useAutoDismissNotice(
    usernameWarning,
    dismissUsernameWarning,
    noticeDurationMs,
  );

  const dismissOauthError = useCallback(() => onClearError(), [onClearError]);
  const isOauthErrorFading = useAutoDismissNotice(
    oauthError,
    dismissOauthError,
    noticeDurationMs,
  );

  /*
   * The same shared resolver the username modals use, so the 20 character
   * maximum means 20 code points on every username field. No native `maxLength`
   * is set here either, because the browser counts it in UTF-16 units.
   */
  function handleUsernameChange(event: ChangeEvent<HTMLInputElement>) {
    const { value, exceededMax } = resolveUsernameInput(event.target.value, {
      isComposing: (event.nativeEvent as InputEvent)?.isComposing,
    });

    setUsername(value);

    if (exceededMax) {
      // A refused code point starts the shared warning lifecycle.
      setUsernameWarning(USERNAME_MAX_REACHED_MESSAGE);
      return;
    }

    // A usable value clears the previous warning. The counter already shows the
    // length, so nothing is shown while the user is still typing.
    setUsernameWarning(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    setInfoMessage(null);

    if (view === "forgot") {
      setWorkingAction("forgot");
      try {
        setInfoMessage(await onForgotPassword(email.trim()));
      } catch (requestError) {
        setLocalError(requestError instanceof Error
          ? requestError.message
          : "Unable to request a password reset email. Please try again.");
      } finally {
        setWorkingAction(null);
      }
      return;
    }

    // The modal stays open with the entered values when the username is not
    // usable yet. The backend validates the same rules independently.
    if (isSignupForm) {
      const trimmedLength = getTrimmedUsernameLength(username);
      if (trimmedLength < USERNAME_MIN_LENGTH) {
        setUsernameWarning(USERNAME_TOO_SMALL_MESSAGE);
        return;
      }
      if (trimmedLength > USERNAME_MAX_LENGTH) {
        setUsernameWarning(USERNAME_MAX_REACHED_MESSAGE);
        return;
      }
    }

    await onSubmit({
      username: username.trim(),
      email: email.trim(),
      password,
    });
  }

  const isForgotView = view === "forgot";
  const title = isForgotView
    ? "Reset your password"
    : authMode === "login"
      ? "Log in to Arcadia"
      : "Create your account";
  const description = isForgotView
    ? "Enter your email and we’ll send reset instructions if you’re eligible"
    : authMode === "login"
      ? "Enter your credentials to continue"
      : "Join Arcadia and start playing";

  /* document.body me render karo — TSX tree me modal chahe kitni bhi
     transform/filter wali ancestors ke andar ho, position: fixed
     hamesha asli screen ke relative rahega, isliye centering kabhi
     offset nahi hogi. */
  return createPortal(
    <div className="auth-modal-backdrop" role="presentation" onMouseDown={isBusy ? undefined : onClose}>
      <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="auth-modal-close" aria-label="Close authentication dialog" onClick={onClose} disabled={isBusy}><CloseIcon /></button>
        {oauthError && (
          <div
            className={`auth-modal-notice${isOauthErrorFading ? ` ${NOTICE_FADING_CLASS}` : ""}`}
            role="alert"
          >
            <span>{oauthError}</span>
            <button type="button" aria-label="Dismiss authentication message" onClick={onClearError}>×</button>
          </div>
        )}
        <div className="auth-modal-brand"><img src={logo} alt="" /><span>ARCADIA</span></div>
        <h2 id="auth-modal-title">{title}</h2>
        <p className="auth-modal-description">{description}</p>
        <form onSubmit={handleSubmit} aria-busy={isBusy}>
          {isSignupForm && (
            <label>
              <span className="auth-label-row">
                <span>Username</span>
                <span className="auth-username-counter">{usernameLength} / {USERNAME_MAX_LENGTH}</span>
              </span>
              <input
                name="username"
                type="text"
                placeholder="Letters, numbers, spaces, symbols"
                autoComplete="username"
                value={username}
                onChange={handleUsernameChange}
                required
              />
            </label>
          )}
          {isSignupForm && usernameWarning && (
            <p
              className={`auth-username-warning${isUsernameWarningFading ? ` ${NOTICE_FADING_CLASS}` : ""}`}
              role="alert"
            >
              {usernameWarning}
            </p>
          )}
          <label>Email<input name="email" type="email" placeholder="Enter email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          {!isForgotView && (
            <label>
              Password
              <span className="auth-password-field">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={authMode === "login" ? "Enter password" : "Create password"}
                  autoComplete={authMode === "login" ? "current-password" : "new-password"}
                  minLength={authMode === "signup" ? 8 : undefined}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  tabIndex={-1}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  <EyeIcon open={showPassword} />
                </button>
              </span>
            </label>
          )}
          {!isForgotView && authMode === "login" && (
            <div className="auth-form-options">
              <div className="auth-form-links">
                <button type="button" className="auth-link" disabled={isBusy} onClick={() => { onClearError(); setView("forgot"); setLocalError(null); setInfoMessage(null); }}>Forgot Password?</button>
              </div>
            </div>
          )}
          {isForgotView && <button type="button" className="auth-link auth-back-link" disabled={isBusy} onClick={() => { onClearError(); setView("form"); setLocalError(null); setInfoMessage(null); }}>Back to login</button>}
          {(error || localError) && <p className="auth-error" role="alert">{error || localError}</p>}
          {infoMessage && <p className="auth-info" role="status">{infoMessage}</p>}
          <button type="submit" className="auth-submit" disabled={isBusy}>{workingAction ? "Sending…" : isSubmitting ? (authMode === "login" ? "Logging in…" : "Creating account…") : (isForgotView ? "Send reset link" : authMode === "login" ? "Log In" : "Create Account")}</button>
        </form>
        {isGoogleAuthEnabled && !isForgotView && <div className="auth-divider"><span>OR</span></div>}
        {isGoogleAuthEnabled && !isForgotView && <button type="button" className="auth-google" onClick={onGoogleLogin} disabled={isBusy}><GoogleLogo /><span>{authMode === "login" ? "Continue with Google" : "Sign up with Google"}</span></button>}
        {!isForgotView && <p className="auth-bottom-switch">{authMode === "login" ? "Don't have an account?" : "Already have an account?"} <button type="button" className="auth-link" onClick={onSwitchMode} disabled={isBusy}>{authMode === "login" ? "Sign up" : "Log in"}</button></p>}
      </section>
    </div>,
    document.body,
  );
}

export default LoginSignupModal;