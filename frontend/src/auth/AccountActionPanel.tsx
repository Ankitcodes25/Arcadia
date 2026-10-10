import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "./AuthContext";
import "./AccountActionPanel.css";

function AccountActionPanel() {
  const {
    accountAction,
    dismissAccountAction,
    submitPasswordReset,
  } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const clearPasswordState = useCallback(() => {
    setPassword("");
    setConfirmation("");
    setLocalError(null);
  }, []);

  useEffect(() => {
    if (accountAction?.kind === "reset" && accountAction.status === "form") {
      clearPasswordState();
    }
    if (
      accountAction?.kind === "reset"
      && (accountAction.status === "success" || accountAction.status === "error")
    ) {
      clearPasswordState();
    }
  }, [accountAction, clearPasswordState]);

  useEffect(() => () => {
    setPassword("");
    setConfirmation("");
  }, []);

  if (!accountAction) {
    return null;
  }

  if (accountAction.status === "success") {
    const handleContinueToLogin = () => {
      clearPasswordState();
      window.dispatchEvent(new Event("arcadia:open-login"));
      dismissAccountAction();
    };

    return (
      <section className="account-action-panel" aria-live="polite">
        <div className="account-action-kicker">ARCADIA ACCOUNT</div>
        <h2>Password updated</h2>
        <p>{accountAction.message || "Your password has been reset. You can now log in."}</p>
        <button type="button" className="account-action-button" onClick={handleContinueToLogin}>
          Continue to login
        </button>
      </section>
    );
  }

  const isSubmitting = accountAction.status === "submitting";
  const actionMessage = accountAction.message;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);

    if (password !== confirmation) {
      setLocalError("Passwords do not match.");
      return;
    }

    await submitPasswordReset(password, confirmation);
  }

  return (
    <section className="account-action-panel" aria-labelledby="reset-password-title">
      <div className="account-action-kicker">ARCADIA ACCOUNT</div>
      <h2 id="reset-password-title">Create a new password</h2>
      <p>Use a new password to secure your Arcadia account. You will need to log in again afterward.</p>
      <form onSubmit={handleSubmit} className="account-action-form" aria-busy={isSubmitting}>
        <label>
          New password
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            disabled={isSubmitting}
          />
        </label>
        <label>
          Confirm password
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            required
            disabled={isSubmitting}
          />
        </label>
        {(localError || actionMessage) && (
          <p className="account-action-error" role="alert">{localError || actionMessage}</p>
        )}
        <div className="account-action-actions">
          <button type="button" className="account-action-secondary" onClick={() => { clearPasswordState(); dismissAccountAction(); }} disabled={isSubmitting}>
            Cancel
          </button>
          <button type="submit" className="account-action-button" disabled={isSubmitting}>
            {isSubmitting ? "Updating…" : "Update password"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default AccountActionPanel;
