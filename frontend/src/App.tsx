import { useEffect, useState } from "react";
import Navbar from "./components/Navbar";
import LandingPage from "./pages/Landingpage/Landingpage";
import Allgames from "./pages/Allgames/Allgames";
import {
  onNavigation,
  MATCH_HISTORY_PATH,
  LEADERBOARD_PATH,
  getMatchHistoryReturnPath,
  getLeaderboardReturnPath,
} from "./lib/navigation";
import MatchHistory from "./pages/MatchHistory/MatchHistory";
import Leaderboard from "./pages/Leaderboard/Leaderboard";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { shouldShowGlobalAuthNotice } from "./auth/authUtils";
import { NOTICE_FADING_CLASS, useAutoDismissNotice } from "./auth/authNotice";
import AccountActionPanel from "./auth/AccountActionPanel";
import PasswordChangeSuccessModal from "./auth/PasswordChangeSuccessModal";
import AuthLoading from "./auth/AuthLoading";
import UsernameOnboarding from "./auth/UsernameOnboarding";
import AdminPanelApp from "./Admin_Panel/AdminPanelApp";
import { isAdminPath } from "./Admin_Panel/hooks/adminRouting";

function AuthNotice() {
  const { authError, authErrorKind, authMode, clearError } = useAuth();
  // While the auth modal is open the same warning is rendered inside the modal,
  // so this component stays hidden and its timer stays stopped.
  const isVisible = shouldShowGlobalAuthNotice({ authError, authErrorKind, authMode });
  const isFading = useAutoDismissNotice(
    isVisible ? authError : null,
    clearError,
  );

  if (!isVisible || !authError) {
    return null;
  }

  return (
    <div className={`auth-global-notice${isFading ? ` ${NOTICE_FADING_CLASS}` : ""}`} role="alert">
      <span>{authError}</span>
      <button type="button" aria-label="Dismiss authentication message" onClick={clearError}>
        ×
      </button>
    </div>
  );
}

function AppContent() {
  const getLocationKey = () => {
    const url = new URL(window.location.href);
    const authKeys = ["oauth_code", "oauth_error", "reset_token"];
    authKeys.forEach((key) => url.searchParams.delete(key));
    const fragment = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
    authKeys.forEach((key) => fragment.delete(key));
    const remainingFragment = fragment.toString();
    url.hash = remainingFragment ? `#${remainingFragment}` : "";
    return `${url.pathname}${url.search}${url.hash}`;
  };
  const [path, setPath] = useState(getLocationKey);
  const { isLoading, user, isAuthenticated } = useAuth();

  useEffect(() => onNavigation(() => setPath(getLocationKey())), []);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      return;
    }

    requestAnimationFrame(() => {
      const targetSection = document.getElementById(hash.slice(1));
      if (!targetSection) return;
      const navbarHeight = document.querySelector<HTMLElement>(".navbar")?.offsetHeight ?? 60;
      const topOffset = navbarHeight + 38;
      window.scrollTo({
        top: window.scrollY + targetSection.getBoundingClientRect().top - topOffset,
        behavior: "smooth",
      });
    });
  }, [path]);

  /*
   * The Admin Panel (/admin/*) is a self-contained application with its own
   * authentication (/api/admin/auth, its own session cookie). It is mounted here,
   * ahead of the player-session gates below, so admin login/refresh is never
   * blocked by (and never blocks) the player auth bootstrap — a player
   * session grants no admin access, and vice versa.
   */
  const currentPathname = new URL(path, window.location.origin).pathname;
  if (isAdminPath(currentPathname)) {
    return <AdminPanelApp />;
  }

  if (isLoading) {
    return <AuthLoading />;
  }

  /*
   * An account created through Google has no Arcadia username yet. Until one is
   * stored the application is not reachable at all: the onboarding modal is the
   * only thing rendered, and it has no close button, so signing in with Google
   * alone can never be mistaken for finishing setup. A Google sign-in that
   * already has a username falls straight through to the normal application.
   */
  const needsUsernameSetup = isAuthenticated && Boolean(user?.usernameSetupRequired);

  if (needsUsernameSetup) {
    return <UsernameOnboarding />;
  }

  const isGamesPage = path.startsWith("/games");
  const isMatchHistoryPage = path.startsWith(MATCH_HISTORY_PATH);
  const isLeaderboardPage = path.startsWith(LEADERBOARD_PATH);

  return (
    <>
      <Navbar isVisible={!isMatchHistoryPage} />
      <AccountActionPanel />
      <AuthNotice />
      <div
        key={isMatchHistoryPage
          ? "match-history-page"
          : isLeaderboardPage
            ? "leaderboard-page"
            : isGamesPage
              ? "games-page"
              : "home-page"}
        className="page-transition"
      >
        {isMatchHistoryPage
          ? <MatchHistory returnPath={getMatchHistoryReturnPath()} />
          : isLeaderboardPage
            ? <Leaderboard returnPath={getLeaderboardReturnPath()} />
            : isGamesPage
              ? <Allgames />
              : <LandingPage />}
      </div>
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
      {/*
        Deliberately outside AppContent instead of inside Settings: a confirmed
        password change signs the session out, so by the time this confirmation
        has to appear AppContent may be rendering the signed-out surface — or
        one of its early returns — and Settings has already unmounted with the
        profile popup.
      */}
      <PasswordChangeSuccessModal />
    </AuthProvider>
  );
}

export default App;
