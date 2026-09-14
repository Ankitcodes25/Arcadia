import "./Navbar.css";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import logo from "../assets/ArcadialogoA.png";
import { navigateTo } from "../navigation";
import LoginSignupModal from "./LoginSignupModal";
import ProfilePopupModal from "./ProfilePopupmodal";

const AUTH_HISTORY_KEY = "arcadia-auth-history";
type NavItem = "home" | "games" | "popular" | "about";

function getInitialNavItem(): NavItem {
  if (window.location.pathname === "/games") return "games";
  if (window.location.hash === "#popular") return "popular";
  if (window.location.hash === "#about") return "about";
  return "home";
}

function Navbar() {
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [activeNavItem, setActiveNavItem] = useState<NavItem>(getInitialNavItem);
  const navbarNavRef = useRef<HTMLElement>(null);
  const isGamesPage = window.location.pathname === "/games";

  useEffect(() => {
    if (isGamesPage) {
      setActiveNavItem("games");
      return;
    }

    const updateActiveSection = () => {
      const navbarHeight = document.querySelector<HTMLElement>(".navbar")?.offsetHeight ?? 60;
      const scrollPosition = window.scrollY + navbarHeight + 16;
      const popularSection = document.getElementById("popular");
      const aboutSection = document.getElementById("about");

      if (aboutSection && scrollPosition >= aboutSection.offsetTop) {
        setActiveNavItem("about");
      } else if (popularSection && scrollPosition >= popularSection.offsetTop) {
        setActiveNavItem("popular");
      } else {
        setActiveNavItem("home");
      }
    };

    updateActiveSection();
    window.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("resize", updateActiveSection);

    return () => {
      window.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("resize", updateActiveSection);
    };
  }, [isGamesPage]);

  useLayoutEffect(() => {
    const nav = navbarNavRef.current;
    const activeLink = nav?.querySelector<HTMLElement>(`[data-nav-item="${activeNavItem}"]`);
    const indicator = nav?.querySelector<HTMLElement>(".navbar-indicator");
    if (!nav || !activeLink || !indicator) return;

    indicator.style.width = `${activeLink.offsetWidth}px`;
    indicator.style.transform = `translateX(${activeLink.offsetLeft}px)`;
    indicator.style.opacity = "1";
  }, [activeNavItem]);

  const handleAuthSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    window.localStorage.setItem(AUTH_HISTORY_KEY, "true");
    setIsSignedIn(true);
    setAuthMode(null);
  };

  const handleLogout = () => {
    setIsSignedIn(false);
    setIsProfileOpen(false);
  };

  return (
    <header className="navbar">
      <div className="navbar-inner">

        {/* LOGO */}
        <a href="/" className="navbar-brand" aria-label="Arcadia Home" onClick={(event) => navigateTo("/", event)}>
          <div className="brand-logo">
            <span className="brand-ray"></span>
            <img src={logo} alt="" className="brand-image" />
          </div>

          <span className="brand-name">ARCADIA</span>
        </a>

        {/* NAVIGATION */}
        <nav className="navbar-nav" ref={navbarNavRef}>
          <a className={activeNavItem === "home" ? "active" : ""} data-nav-item="home" href="/" onClick={(event) => navigateTo("/", event)}>Home</a>
          <a className={activeNavItem === "games" ? "active" : ""} data-nav-item="games" href="/games" onClick={(event) => navigateTo("/games", event)}>Games</a>
          <a className={activeNavItem === "popular" ? "active" : ""} data-nav-item="popular" href="/#popular" onClick={(event) => navigateTo("/#popular", event)}>Popular</a>
          <a className={activeNavItem === "about" ? "active" : ""} data-nav-item="about" href="/#about" onClick={(event) => navigateTo("/#about", event)}>About</a>
          <span className="navbar-indicator" aria-hidden="true" />
        </nav>

        {/* RIGHT SIDE */}
        <div className="navbar-actions">
          {isSignedIn ? (
            <div className="profile-menu-wrapper">
              <button
                type="button"
                className="avatar-button"
                aria-label="Open account menu"
                aria-haspopup="menu"
                aria-expanded={isProfileOpen}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setIsProfileOpen((open) => !open)}
              >
                A
              </button>
              {isProfileOpen && (
                <ProfilePopupModal
                  onClose={() => setIsProfileOpen(false)}
                  onLogout={handleLogout}
                />
              )}
            </div>
          ) : (
            <div className="auth-actions">
              <button type="button" className="auth-button auth-button-primary" onClick={() => setAuthMode("signup")}>Sign up</button>
              <button type="button" className="auth-button" onClick={() => setAuthMode("login")}>Log in <span className="auth-arrow">→</span></button>
            </div>
          )}
        </div>

      </div>

      {authMode && <LoginSignupModal authMode={authMode} onClose={() => setAuthMode(null)} onSubmit={handleAuthSubmit} onSwitchMode={() => setAuthMode(authMode === "login" ? "signup" : "login")} />}
    </header>
  );
}

export default Navbar;