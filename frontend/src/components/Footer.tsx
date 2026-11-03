import "./Footer.css";
import logo from "../assets/ArcadialogoA.png";
import {
  COOKIE_POLICY_PATH,
  navigateTo,
  PRIVACY_POLICY_PATH,
  TERMS_OF_SERVICE_PATH,
} from "../lib/navigation";

function Footer() {
  return (
    <footer id="about">
      <div className="footer-brand">
        <div className="footer-logo">
          <span className="footer-ray" />
          <img src={logo} alt="" />
        </div>
        <span>ARCADIA</span>
      </div>
      <p>A small place for big fun.</p>
      <nav className="footer-legal" aria-label="Legal">
        <a
          href={TERMS_OF_SERVICE_PATH}
          onClick={(event) => navigateTo(TERMS_OF_SERVICE_PATH, event)}
        >
          Terms of Service
        </a>
        <a
          href={PRIVACY_POLICY_PATH}
          onClick={(event) => navigateTo(PRIVACY_POLICY_PATH, event)}
        >
          Privacy Policy
        </a>
        <a
          href={COOKIE_POLICY_PATH}
          onClick={(event) => navigateTo(COOKIE_POLICY_PATH, event)}
        >
          Cookie Policy
        </a>
      </nav>
      <span className="copyright">© 2026 Arcadia</span>
    </footer>
  );
}

export default Footer;
