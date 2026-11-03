import { ArrowLeft } from "lucide-react";
import Footer from "./Footer";
import { navigateTo } from "../lib/navigation";
import "./LegalPage.css";

export type LegalSection = {
  heading: string;
  body: string;
};

type LegalPageLayoutProps = {
  title: string;
  intro: string;
  sections: readonly LegalSection[];
};

function goBackOrHome() {
  /*
   * Footer links are opened through navigateTo, which writes a history state.
   * A direct visit has no state for this page, so it falls back to the homepage
   * instead of leaving Arcadia when an unrelated browser entry happens to exist.
   */
  if (window.history.state !== null && window.history.length > 1) {
    window.history.back();
    return;
  }

  navigateTo("/");
}

function LegalPageLayout({ title, intro, sections }: LegalPageLayoutProps) {
  return (
    <div className="app legal-page">
      <div className="background-glow glow-one" aria-hidden="true" />
      <div className="background-glow glow-two" aria-hidden="true" />
      <div className="background-glow glow-three" aria-hidden="true" />

      <main className="legal-main">
        <div className="legal-shell">
          <button
            type="button"
            className="legal-back"
            onClick={goBackOrHome}
            aria-label="Go back"
            title="Go back"
          >
            <ArrowLeft aria-hidden="true" />
          </button>

          <header className="legal-header">
            <p className="legal-eyebrow">
              ARCADIA <span aria-hidden="true">•</span> LEGAL
            </p>
            <h1 className="legal-title">{title}</h1>
            <p className="legal-intro">{intro}</p>
          </header>

          <div className="legal-divider" aria-hidden="true" />

          <article className="legal-content">
            {sections.map((section) => (
              <section className="legal-section" key={section.heading}>
                <h2>{section.heading}</h2>
                <p>{section.body}</p>
              </section>
            ))}
          </article>

          <p className="legal-updated">
            <span className="legal-updated-label">Last updated</span>
            <span className="legal-updated-value">
              Placeholder — replace before publishing.
            </span>
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default LegalPageLayout;
