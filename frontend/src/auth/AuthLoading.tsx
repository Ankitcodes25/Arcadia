import "./AuthLoading.css";

function AuthLoading() {
  return (
    <main className="auth-loading-screen" aria-live="polite" aria-busy="true">
      <div className="auth-loading-mark" aria-hidden="true" />
      <p>Restoring your Arcadia session…</p>
    </main>
  );
}

export default AuthLoading;
