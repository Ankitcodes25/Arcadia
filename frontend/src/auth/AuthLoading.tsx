import { Gamepad2 } from "lucide-react";
import logoA from "../assets/ArcadialogoA.png"; // path adjust karna agar AuthLoading kisi aur folder me hai
import "./AuthLoading.css";

/* Ek crystal shard — facets alag opacity ke taaki 3D glass jaisa lage */
function Crystal({ className }: { className: string }) {
  return (
    <svg
      className={`auth-loading-crystal ${className}`}
      viewBox="0 0 120 200"
      aria-hidden="true"
    >
      <polygon points="60,0 100,60 60,92" className="f1" />
      <polygon points="60,0 20,70 60,92" className="f2" />
      <polygon points="60,92 100,60 86,200" className="f3" />
      <polygon points="60,92 20,70 34,200" className="f4" />
      <polygon points="60,92 86,200 34,200" className="f5" />
    </svg>
  );
}

function AuthLoading() {
  return (
    <main className="auth-loading-screen" aria-live="polite" aria-busy="true">
      {/* Screen reader ke liye ek hi stable line */}
      <span className="auth-loading-sr">Loading Arcadia. Restoring your session.</span>

      {/* ================= BACKGROUND ================= */}
      <div className="auth-loading-bg" aria-hidden="true">
        <span className="auth-loading-stars" />

        {/* fumes / nebula clouds */}
        <span className="auth-loading-fume fume-tr" />
        <span className="auth-loading-fume fume-tl" />
        <span className="auth-loading-fume fume-l" />
        <span className="auth-loading-fume fume-r" />
        <span className="auth-loading-fume fume-core" />

        {/* neeche se uthta hua smoke */}
        <span className="auth-loading-smoke smoke-1" />
        <span className="auth-loading-smoke smoke-2" />
        <span className="auth-loading-smoke smoke-3" />
        <span className="auth-loading-smoke smoke-4" />

        {/* sparkles */}
        <span className="auth-loading-spark spark-1" />
        <span className="auth-loading-spark spark-2" />
        <span className="auth-loading-spark spark-3" />

        {/* crystals */}
        <Crystal className="crystal-tl" />
        <Crystal className="crystal-tr" />
        <Crystal className="crystal-bl" />
        <Crystal className="crystal-bl2" />
        <Crystal className="crystal-br" />
        <Crystal className="crystal-br2" />

        {/* rocky ridge */}
        <span className="auth-loading-ridge ridge-l" />
        <span className="auth-loading-ridge ridge-r" />

        {/* bottom fume jo ridge ko blend karta hai */}
        <span className="auth-loading-fog" />
      </div>

      {/* ================= CORE ================= */}
      <div className="auth-loading-core" aria-hidden="true">
        <div className="auth-loading-logo-wrap">
          <span className="auth-loading-halo" />

          {/* logo ke around fumes */}
          <span className="auth-loading-logo-fume lf-1" />
          <span className="auth-loading-logo-fume lf-2" />
          <span className="auth-loading-logo-fume lf-3" />
          <span className="auth-loading-logo-fume lf-4" />

          {/* bahar ki halki dashed ring jo saans leti hai */}
          <span className="auth-loading-orbit-outer" />

          {/* piche wali orbit ring */}
          <span className="auth-loading-orbit orbit-back">
            <span className="auth-loading-orbit-sweep" />
          </span>

          <div className="auth-loading-tile">
            <img src={logoA} alt="" draggable={false} />
          </div>

          {/* aage wali orbit ring (sirf neeche ka aadha) */}
          <span className="auth-loading-orbit orbit-front">
            <span className="auth-loading-orbit-sweep" />
          </span>

          {/* ring par ghoomta hua chhota planet */}
          <span className="auth-loading-planet" />
        </div>

        <h3 className="auth-loading-title">
          Restoring your <em>Arcadia</em> session...
        </h3>

        <p className="auth-loading-sub">
          Just a moment, we&apos;re getting things ready for you <span>✨</span>
        </p>

        <div className="auth-loading-bar">
          <span />
        </div>

        {/* footer ab core ke andar hai, isliye bar se gap hamesha rahega */}
        <div className="auth-loading-footer">
        <div className="auth-loading-footer-icon">
          <i />
          <Gamepad2 />
          <i />
        </div>
        <p>
          <span className="auth-loading-footer-side">
            <span>Play</span>
            <b />
          </span>
          <span className="auth-loading-footer-center">Challenge</span>
          <span className="auth-loading-footer-side">
            <b />
            <span>Conquer</span>
          </span>
        </p>
        </div>
      </div>
    </main>
  );
}

export default AuthLoading;