import "./Footer.css";
import logo from "../assets/ArcadialogoA.png";

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
      <span className="copyright">© 2026 Arcadia</span>
    </footer>
  );
}

export default Footer;
