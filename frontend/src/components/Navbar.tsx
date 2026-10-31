import "./Navbar.css";
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import logo from "../assets/ArcadialogoA.png";
import {
  MATCH_HISTORY_PATH,
  LEADERBOARD_PATH,
  consumeLoginOnNextMount,
  consumeProfilePopupReopenRequest,
  consumeLeaderboardOrigin,
  navigateTo,
  onNavigation,
  rememberMatchHistoryReturnPath,
  rememberLeaderboardReturnPath,
  rememberLeaderboardOrigin,
  rememberReturningToProfilePopup,
} from "../lib/navigation";
import { useAuth } from "../auth/AuthContext";
import { resolveLoginAccount } from "../auth/loginResolution";
import AvatarPreview from "../pages/Myprofile/AvatarPreview";
import { getUserProgressionView } from "../auth/progression";
import type { AuthFormValues } from "../auth/authTypes";
import LoginSignupModal from "./LoginSignupModal";
import MyProfileContainer from "../pages/Myprofile/MyProfileContainer";
import ProfilePopupModal from "./ProfilePopupmodal";

type NavItem = "home" | "games" | "popular" | "about";

/* -------------------------------------------------------
   Initial active navigation item
------------------------------------------------------- */

function getInitialNavItem(): NavItem {
  const pathname = window.location.pathname;
  const hash = window.location.hash;

  if (pathname === "/games") {
    return "games";
  }

  if (hash === "#popular") {
    return "popular";
  }

  if (hash === "#about") {
    return "about";
  }

  return "home";
}

type NavbarProps = {
  /**
   * Whether the bar is shown.
   *
   * The Match History page is a full page of its own and does not display the
   * Navbar. It is still MOUNTED there, though, and that is deliberate: this
   * component owns the Profile Popup state and the navigation listener that the
   * Match History back button depends on. Hiding the bar rather than unmounting
   * it is what lets the reader leave the page and find the popup exactly as they
   * left it, with no timer and no second copy of the menu.
   */
  isVisible?: boolean;
};

function Navbar({ isVisible = true }: NavbarProps = {}) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMyProfileOpen, setIsMyProfileOpen] = useState(false);
  const {
    user,
    isAuthenticated,
    isSubmitting,
    authError,
    authErrorKind,
    authMode,
    openAuthMode,
    closeAuthMode,
    clearError,
    login,
    register,
    forgotPassword,
    loginWithGoogle,
    logout,
  } = useAuth();

  /*
   * Login-account resolution state. The shared modal does not decide admin vs
   * player — it relays the attempt to the server-side resolver, which answers
   * with an explicit accountType. These hold that answer's UI side-effects: a
   * definitive failure (e.g. wrong admin password) is surfaced here so it merges
   * into the SAME error slot the player auth flow already uses, and the busy
   * flag keeps the modal's submit button disabled while resolving.
   */
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  const [activeNavItem, setActiveNavItem] =
    useState<NavItem>(getInitialNavItem);

  /*
   * The whole identity block reads the progression the backend already returned
   * with the authenticated user. The badge tier title stays in My Profile; the
   * navbar shows the level and the XP toward the next one instead.
   */
  const identity = getUserProgressionView(user);

  const navbarNavRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleOpenLogin = () => {
      openAuthMode("login");
    };

    window.addEventListener("arcadia:open-login", handleOpenLogin);
    return () => window.removeEventListener("arcadia:open-login", handleOpenLogin);
  }, [openAuthMode]);

  /*
   * Admin sign-out and unauthenticated admin routes both redirect here first,
   * so the modal has to be opened once, on the mount that follows. The intent
   * is parked in navigation.ts (it survives the redirect) and consumed exactly
   * once here.
   */
  useEffect(() => {
    if (consumeLoginOnNextMount()) {
      openAuthMode("login");
    }
  }, [openAuthMode]);

  /* A stale resolution error must not linger across closing, reopening or
     switching the modal — it only ever describes the attempt that produced it. */
  useEffect(() => {
    setResolutionError(null);
  }, [authMode]);

  const isGamesPage = window.location.pathname === "/games";

  const goHome = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    window.history.pushState({}, "", "/");
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    window.dispatchEvent(new Event("arcadia:navigate"));
  };

  /* -------------------------------------------------------
     ACTIVE NAVIGATION

     Home page behavior:

     Hero                  -> Home
     Popular Games         -> Popular
     Continue Playing     -> Home
     Daily Challenge      -> Home
     Other sections       -> Home
     About                 -> About
  ------------------------------------------------------- */

  useEffect(() => {
    if (isGamesPage) {
      setActiveNavItem("games");
      return;
    }

    const updateActiveSection = () => {
      const navbar = document.querySelector<HTMLElement>(".navbar");

      const navbarHeight = navbar?.offsetHeight ?? 60;

      /*
       * This is the point on the screen used to decide
       * which navigation area we are currently in.
       *
       * We intentionally use a fixed percentage instead of
       * "closest section", because Popular must NOT become
       * active while the user is still inside the Hero.
       */
      const referencePoint =
        window.scrollY + navbarHeight + window.innerHeight * 0.35;

      const popularSection = document.getElementById("popular");
      const continuePlayingSection =
        document.getElementById("continue-playing");
      const aboutSection = document.getElementById("about");

      const popularTop =
        popularSection?.offsetTop ?? Number.POSITIVE_INFINITY;

      const continuePlayingTop =
        continuePlayingSection?.offsetTop ?? Number.POSITIVE_INFINITY;

      const aboutTop =
        aboutSection?.offsetTop ?? Number.POSITIVE_INFINITY;

      /* ---------------------------------------------------
         ABOUT

         Once About reaches the reference point,
         About becomes active.
      --------------------------------------------------- */

      if (aboutTop <= referencePoint) {
        setActiveNavItem("about");
        return;
      }

      /* ---------------------------------------------------
         CONTINUE PLAYING

         Once Continue Playing reaches the reference point,
         we deliberately return to HOME.

         This means:
         Popular -> Popular
         Continue Playing -> Home
         Daily Challenge -> Home
         --------------------------------------------------- */

      if (continuePlayingTop <= referencePoint) {
        setActiveNavItem("home");
        return;
      }

      /* ---------------------------------------------------
         POPULAR

         Popular becomes active only after its own section
         reaches the reference point.
      --------------------------------------------------- */

      if (popularTop <= referencePoint) {
        setActiveNavItem("popular");
        return;
      }

      /* ---------------------------------------------------
         HERO + ALL OTHER HOME SECTIONS
      --------------------------------------------------- */

      setActiveNavItem("home");
    };

    updateActiveSection();

    window.addEventListener("scroll", updateActiveSection, {
      passive: true,
    });

    window.addEventListener("resize", updateActiveSection);

    return () => {
      window.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("resize", updateActiveSection);
    };
  }, [isGamesPage]);

  /* -------------------------------------------------------
     NAVBAR ACTIVE INDICATOR
  ------------------------------------------------------- */

  useLayoutEffect(() => {
    const nav = navbarNavRef.current;

    if (!nav) return;

    const activeLink = nav.querySelector<HTMLElement>(
      `[data-nav-item="${activeNavItem}"]`
    );

    const indicator =
      nav.querySelector<HTMLElement>(".navbar-indicator");

    if (!activeLink || !indicator) return;

    indicator.style.width = `${activeLink.offsetWidth}px`;
    indicator.style.transform = `translateX(${activeLink.offsetLeft}px)`;
    indicator.style.opacity = "1";
  }, [activeNavItem]);

  /* -------------------------------------------------------
     AUTH
  ------------------------------------------------------- */

  const handleAuthSubmit = async (values: AuthFormValues) => {
    if (authMode !== "login") {
      const registered = await register(values);
      if (registered) closeAuthMode();
      return registered;
    }

    /*
     * LOGIN: server-side account resolution. The browser never compares
     * credentials — it sends them once to the admin backend's resolver, which
     * reports the account type (or a definitive failure). Branching on that
     * server-issued accountType is what routes admin vs player.
     */
    setResolutionError(null);
    setIsResolving(true);
    try {
      const resolution = await resolveLoginAccount(values.email, values.password);

      // Definitive failure (e.g. wrong admin password or rate limit): surface
      // it in the modal and STOP — never retried as a player login.
      if (resolution.kind === "failed") {
        setResolutionError(resolution.message);
        return false;
      }

      // Admin: the session cookie is already set by the admin backend. Close
      // the modal and mount ONLY the Admin Portal — never player UI.
      if (resolution.kind === "admin") {
        closeAuthMode();
        navigateTo("/admin/dashboard");
        return true;
      }

      // Player: not the admin account — continue the existing player login
      // flow completely unchanged.
      const success = await login({ email: values.email, password: values.password });
      if (success) closeAuthMode();
      return success;
    } finally {
      setIsResolving(false);
    }
  };

  const handleGoogleLogin = () => {
    clearError();
    loginWithGoogle();
  };

  const handleLogout = async () => {
    const result = await logout();
    if (result.success) {
      setIsProfileOpen(false);
      navigateTo("/");
    }
  };

  /*
   * Match History is a separate page. Leaving through the normal navigation
   * helper is what keeps the app's single page state machine in charge, rather
   * than a second, overlapping copy of this menu.
   *
   * The reopen marker is deliberately NOT armed here. It is armed by the page's
   * Return button alone, so leaving closes the popup and nothing on the way out
   * can bring it straight back.
   */
  const openMatchHistory = () => {
    // Where Return should go back to, so the reader lands where they were.
    rememberMatchHistoryReturnPath(
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
    );
    navigateTo(MATCH_HISTORY_PATH);
  };

  /* The Leaderboard leaves for its separate page the same way. */
  const openLeaderboard = () => {
    // Where Return should go back to, so the reader lands where they were.
    rememberLeaderboardReturnPath(
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
    );
    // This visit came from the popup, so coming back may bring the popup with
    // it. The Landing page's Top 10 "View more" records "landing" instead, and
    // that visit lands back on the page alone. The Navbar reads this on the
    // navigation that opens the page.
    rememberLeaderboardOrigin("profile");
    navigateTo(LEADERBOARD_PATH);
  };

  /*
   * Return from Match History restores this popup.
   *
   * The intent is a transient flag parked by the navigation helper, and it is
   * consumed on read. Consuming it here, inside the same navigation callback
   * that swapped the page, is what makes this work without a timer: the popup is
   * opened because the reader asked to come back, not because enough time
   * passed. A later unrelated navigation finds the flag already cleared.
   *
   * The Leaderboard restores this popup on the very same flag, but whether it
   * may do so is decided by the ORIGIN and parked when the page opens: the
   * navigation that arrives here from the Profile Popup arms the flag for the
   * length of this visit, so the FIRST navigation away — the page's own arrow
   * or the browser's back button, whichever it is — puts the popup back. The
   * visit from the Landing page's Top 10 "View more" recorded "landing", so
   * nothing is armed and that return is just the page.
   *
   * The origin is consumed on every navigation, whatever it was, so no visit
   * can inherit the answer of an earlier one.
   */
  useEffect(() => onNavigation(() => {
    const origin = consumeLeaderboardOrigin();

    if (consumeProfilePopupReopenRequest()) {
      setIsProfileOpen(true);
    }

    if (
      window.location.pathname.startsWith(LEADERBOARD_PATH) &&
      origin === "profile"
    ) {
      rememberReturningToProfilePopup();
    }
  }), []);

  /* -------------------------------------------------------
     RENDER
  ------------------------------------------------------- */

  return (
    <header className={`navbar${isVisible ? "" : " navbar--hidden"}`}>
      <div className="navbar-inner">

        {/* -------------------------------------------------
            LOGO
        ------------------------------------------------- */}

        <a
          href="/"
          className="navbar-brand"
          aria-label="Arcadia Home"
          onClick={goHome}
        >
          <div className="brand-logo">
            <span className="brand-ray"></span>

            <img
              src={logo}
              alt=""
              className="brand-image"
            />
          </div>

          <span className="brand-name">
            ARCADIA
          </span>
        </a>

        {/* -------------------------------------------------
            NAVIGATION
        ------------------------------------------------- */}

        <nav
          className="navbar-nav"
          ref={navbarNavRef}
        >
          {/* HOME */}

          <a
            className={
              activeNavItem === "home"
                ? "active"
                : ""
            }
            data-nav-item="home"
            href="/"
            onClick={goHome}
          >
            Home
          </a>

          {/* GAMES */}

          <a
            className={
              activeNavItem === "games"
                ? "active"
                : ""
            }
            data-nav-item="games"
            href="/games"
            onClick={(event) =>
              navigateTo("/games", event)
            }
          >
            Games
          </a>

          {/* POPULAR */}

          <a
            className={
              activeNavItem === "popular"
                ? "active"
                : ""
            }
            data-nav-item="popular"
            href="/#popular"
            onClick={(event) =>
              navigateTo("/#popular", event)
            }
          >
            Popular
          </a>

          {/* ABOUT */}

          <a
            className={
              activeNavItem === "about"
                ? "active"
                : ""
            }
            data-nav-item="about"
            href="/#about"
            onClick={(event) =>
              navigateTo("/#about", event)
            }
          >
            About
          </a>

          {/* ACTIVE UNDERLINE */}

          <span
            className="navbar-indicator"
            aria-hidden="true"
          />
        </nav>

        {/* -------------------------------------------------
            AUTH / PROFILE
        ------------------------------------------------- */}

        <div className="navbar-actions">

          {isAuthenticated && user ? (
            <div className="profile-menu-wrapper">
              <div className="navbar-profile-identity">
                {/*
                  Username, level/XP and the XP bar are a pure view of the
                  progression the backend already put on the authenticated user.
                  Nothing here calculates a level or an XP requirement.
                */}
                <button
                  type="button"
                  className="navbar-identity-button"
                  aria-label="Open account menu"
                  aria-haspopup="menu"
                  aria-expanded={isProfileOpen}
                  onClick={() =>
                    setIsProfileOpen(
                      (open) => !open
                    )
                  }
                >
                  <span className="navbar-username">{user.username}</span>

                  <span className="navbar-identity-meta">
                    <span className="navbar-level">Lv. {identity.level}</span>
                    <span className="navbar-identity-divider" aria-hidden="true" />
                    <span className="navbar-xp">{identity.xpLabel}</span>
                  </span>

                  <span
                    className="navbar-xp-track"
                    role="progressbar"
                    aria-label={`XP toward Level ${identity.level + 1}`}
                    aria-valuemin={0}
                    aria-valuemax={identity.nextLevelXp}
                    aria-valuenow={identity.currentLevelXp}
                  >
                    <span
                      className="navbar-xp-fill"
                      style={{ width: `${identity.progressPercent}%` }}
                    />
                  </span>
                </button>

                <button
                  type="button"
                  className="avatar-button"
                  aria-label="Open account menu"
                  aria-haspopup="menu"
                  aria-expanded={isProfileOpen}
                  onPointerDown={(event) =>
                    event.stopPropagation()
                  }
                  onClick={() =>
                    setIsProfileOpen(
                      (open) => !open
                    )
                  }
                >
                  <AvatarPreview user={user} className="navbar-avatar" />
                </button>
              </div>

              {isProfileOpen && (
                <ProfilePopupModal
                  user={user}
                  isMyProfileOpen={isMyProfileOpen}
                  onClose={() =>
                    setIsProfileOpen(false)
                  }
                  /*
                    My Profile is a layer above this menu, not a replacement for
                    it, so opening it deliberately leaves the menu open. Closing
                    My Profile only clears its own flag, which brings the still
                    open menu back into view underneath.
                  */
                  onOpenMyProfile={() =>
                    setIsMyProfileOpen(true)
                  }
                  /*
                    Match History and the Leaderboard are separate pages, so each
                    leaves through the normal navigation helper. The page it
                    opens records where the reader was, and its Return button
                    brings this popup back.
                  */
                  onOpenMatchHistory={openMatchHistory}
                  onOpenLeaderboard={openLeaderboard}
                  onLogout={handleLogout}
                  isLoggingOut={isSubmitting}
                />
              )}
            </div>
          ) : (
            <div className="auth-actions">

              <button
                type="button"
                className="auth-button auth-button-primary"
                onClick={() =>
                  openAuthMode("signup")
                }
              >
                Sign up
              </button>

              <button
                type="button"
                className="auth-button"
                onClick={() =>
                  openAuthMode("login")
                }
              >
                Log in
                <span className="auth-arrow">
                  →
                </span>
              </button>

            </div>
          )}

        </div>
      </div>

      {/* My Profile always re-reads the account profile from the backend, and
          a save updates the shared auth state, so this Navbar and the modal
          never disagree about the username or the avatar. Its X is a back
          action: it clears only this flag, and the Profile Popup that is still
          mounted above stays open. */}
      {isMyProfileOpen && user && (
        <MyProfileContainer onClose={() => setIsMyProfileOpen(false)} />
      )}

      {/* ---------------------------------------------------
          AUTH MODAL
      --------------------------------------------------- */}

      {authMode && (
        <LoginSignupModal
          authMode={authMode}
          onClose={closeAuthMode}
          onSubmit={handleAuthSubmit}
          onGoogleLogin={handleGoogleLogin}
          onClearError={() => {
            setResolutionError(null);
            clearError();
          }}
          onForgotPassword={forgotPassword}
          onSwitchMode={() =>
            openAuthMode(
              authMode === "login"
                ? "signup"
                : "login"
            )
          }
          isSubmitting={isResolving || isSubmitting}
          error={resolutionError ?? (authErrorKind === "form" ? authError : null)}
          oauthError={authErrorKind === "oauth" ? authError : null}
        />
      )}
    </header>
  );
}

export default Navbar;