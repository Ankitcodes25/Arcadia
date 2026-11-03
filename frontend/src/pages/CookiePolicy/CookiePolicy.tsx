import { useCallback, useEffect, useRef, useState } from "react";
import {
  navigateTo,
  rememberReturningToProfilePopup,
} from "../../lib/navigation";
import Footer from "../../components/Footer";
import pageArt from "../../assets/ArcadionHistory.png";
import pageRingBg from "../../assets/ArcadionpickBG.png";
import "./CookiePolicy.css";

/* ===========================================================
   COOKIE POLICY

   Same page shell as Match History: a full page (not a modal), a Return
   button, and the hero with Arcadion + the spinning ring behind him. The
   meta panel overlaps his hand exactly like the filter panel does there.

   The copy lives in SECTIONS below as plain data so it can be edited without
   touching the layout. Anything in [square brackets] is a placeholder and is
   rendered highlighted, so it cannot be missed before launch.
   =========================================================== */

type ListItem = string | { label: string; text: string };

type Block =
  | { type: "p"; text: string }
  | { type: "ul"; items: ListItem[] }
  | { type: "sub"; text: string }
  | { type: "callout"; text: string }
  | { type: "table"; columns: string[]; rows: string[][] }
  | { type: "contact" };

type PolicySection = {
  id: string;
  title: string;
  blocks: Block[];
};

const EFFECTIVE_DATE = "[To be added before launch]";
const LAST_UPDATED = "[To be added before launch]";

const INTRO = [
  "This Cookie Policy explains which cookies Arcadia sets, why we set them, and how long they last.",
  "Arcadia currently uses only essential first-party cookies for sign-in and security. Please read this page together with our Privacy Policy.",
];

const CONTACT_FIELDS: { label: string; value: string }[] = [
  { label: "Contact", value: "Arcadia Support" },
  { label: "Legal Operator", value: "[Insert Legal Name]" },
  { label: "Email", value: "[Insert Official Contact Email]" },
  { label: "Address", value: "[Insert Official Address]" },
];

const CLOSING_NOTE =
  "By using Arcadia, you acknowledge that you have read and understood this Cookie Policy.";

const SECTIONS: PolicySection[] = [
  {
    id: "about-cookies",
    title: "About This Cookie Policy",
    blocks: [
      { type: "sub", text: "What cookies are" },
      { type: "p", text: "Cookies are small text files that a website stores in your browser. They let a site remember things between requests, such as the fact that you are signed in." },
      { type: "sub", text: "Scope of this policy" },
      { type: "p", text: "This Cookie Policy explains which cookies the Arcadia platform sets, why, and for how long. It should be read with our Privacy Policy. It does not cover cookies that independent third-party services may set on their own." },
      { type: "sub", text: "Effective date and last updated" },
      { type: "p", text: "The Effective Date and the Last Updated date are shown at the top of this page." },
    ],
  },
  {
    id: "cookies-we-use",
    title: "Cookies We Use",
    blocks: [
      { type: "p", text: "Arcadia sets the following cookies. All of them are first-party cookies, meaning they are set by Arcadia itself, and all are essential for sign-in or security." },
      {
        type: "table",
        columns: ["Cookie", "Purpose", "Type", "Lifetime", "Set by"],
        rows: [
          ["arcadia_refresh", "Keeps you signed in by securing your player session and renewing your access.", "Essential. HttpOnly, Secure in production.", "Up to 30 days", "Arcadia backend"],
          ["arcadia_oauth_state", "Protects Google sign-in against forged requests while you sign in.", "Essential. HttpOnly, Secure in production, SameSite Lax.", "10 minutes", "Arcadia backend"],
          ["arcadia_admin_session", "Signs staff in to the Admin Panel. Players never receive it.", "Essential. HttpOnly, Secure in production.", "4 hours by default (configurable)", "Arcadia backend"],
        ],
      },
      { type: "p", text: "None of these cookies is used for advertising or for tracking you across other websites. They are host-only cookies, which means the browser sends them only to the site that set them. [Confirm the live cookie domain and SameSite setting.]" },
    ],
  },
  {
    id: "when-set",
    title: "When Cookies Are Set and Removed",
    blocks: [
      { type: "sub", text: "arcadia_refresh" },
      { type: "p", text: "Set when you register, sign in, return from Google sign-in, or when your session is renewed. It is cleared when you sign out, sign out of all devices, reset your password, delete your account, or when a renewal fails." },
      { type: "sub", text: "arcadia_oauth_state" },
      { type: "p", text: "Set when you start Google sign-in and cleared as soon as the sign-in finishes or fails. If it is not cleared earlier, it expires after 10 minutes." },
      { type: "sub", text: "arcadia_admin_session" },
      { type: "p", text: "Set when authorized staff sign in to the Admin Panel and cleared when they sign out." },
      { type: "sub", text: "Real-time chat connection" },
      { type: "p", text: "Your browser may send the refresh cookie when the chat connection starts. The connection itself is authenticated with your short-lived access token." },
    ],
  },
  {
    id: "essential-only",
    title: "Essential Cookies Only",
    blocks: [
      { type: "p", text: "We have not found any analytics, advertising, or tracking cookies in Arcadia, and the platform does not load third-party analytics or advertising scripts. [Confirm for the live deployment, including anything injected by hosting or a content delivery network.]" },
      { type: "p", text: "Because the cookies above are strictly needed to provide the sign-in you request and to keep it secure, Arcadia does not currently show a cookie consent banner. [Confirm with legal review whether a banner or consent record is required in your jurisdiction.]" },
    ],
  },
  {
    id: "third-party-requests",
    title: "Third-Party Requests",
    blocks: [
      { type: "p", text: "Some content on Arcadia is loaded from Google. These are not cookies that Arcadia sets, but they do involve your browser contacting Google:" },
      {
        type: "ul",
        items: [
          { label: "Google Fonts:", text: "some pages load fonts from Google, which receives your IP address and browser details." },
          { label: "Google-hosted profile pictures:", text: "if you choose your Google profile picture as your avatar, your browser loads it directly from Google." },
          { label: "Google sign-in:", text: "if you use Google sign-in, you are sent to Google, which handles your credentials under its own policies." },
        ],
      },
      { type: "p", text: "Whether Google sets its own cookies or identifiers for these requests is decided by Google. Please see Google's privacy policy for details. [Confirm after checking the deployed pages.]" },
    ],
  },
  {
    id: "other-storage",
    title: "Other Browser Storage",
    blocks: [
      { type: "p", text: "Your short-lived access token is kept only in your browser's memory and disappears when you close or reload the tab. Open tabs use a temporary in-memory channel to tell each other when you sign in or out. This is not stored on your device." },
      { type: "p", text: "Arcadia does not currently use localStorage, sessionStorage, or IndexedDB for its features. [Confirm before launch.]" },
    ],
  },
  {
    id: "your-choices",
    title: "Your Choices",
    blocks: [
      {
        type: "ul",
        items: [
          { label: "Browser settings:", text: "you can block or delete cookies in your browser. If you block the cookies above, you may be unable to sign in or stay signed in." },
          { label: "Sign out:", text: "signing out clears the refresh cookie from your browser." },
          { label: "End sessions:", text: "in Settings you can see your signed-in sessions and end one or all of the others." },
          { label: "Delete your account:", text: "deleting your account clears your cookie and removes your sessions." },
        ],
      },
      { type: "p", text: "If you change your browser settings, they apply to that browser only." },
    ],
  },
  {
    id: "changes",
    title: "Changes to This Cookie Policy",
    blocks: [
      { type: "p", text: "We may update this Cookie Policy when Arcadia's cookies, features, or legal requirements change. The updated version will show its revised effective or last-updated date, and material changes will be communicated through appropriate channels where reasonably practical." },
    ],
  },
  {
    id: "contact",
    title: "Contact Us",
    blocks: [
      { type: "p", text: "For questions about this Cookie Policy, contact:" },
      { type: "contact" },
    ],
  },
];

/* ===========================================================
   HELPERS
   =========================================================== */

/*
 * Anything in [square brackets] is an unfilled placeholder. It is wrapped so
 * it shows up highlighted on the page instead of passing for finished copy.
 */
function renderText(text: string) {
  return text.split(/(\[[^\]]+\])/g).map((part, index) =>
    /^\[[^\]]+\]$/.test(part) ? (
      <mark key={index} className="ck-placeholder">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/* ===========================================================
   ICONS
   =========================================================== */

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19 12H5.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M11 5.4 4.4 12l6.6 6.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CrownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5L3 8z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3.4 5 6v5.4c0 4.3 2.8 7.4 7 9.2 4.2-1.8 7-4.9 7-9.2V6l-7-2.6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="m9 12 2.2 2.2L15.2 10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.5 9.5h17M8 3.4v3.2M16 3.4v3.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6.5h16M7 12h10M10 17.5h4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 4 2.8 19.6h18.4L12 4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M12 10v4.2M12 16.9v.2" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

/* ===========================================================
   PAGE
   =========================================================== */

type CookiePolicyProps = {
  /** Optional explicit destination; otherwise return to the previous page. */
  returnPath?: string;
  /**
   * Match History arms the "reopen Profile popup" marker on Return because it
   * is only ever reached from that popup. Cookie Policy can be reached from other
   * places (sign-up, footer), so this stays off unless the caller says this
   * visit really did come from the popup.
   */
  returnsToProfilePopup?: boolean;
};

function CookiePolicy({ returnPath, returnsToProfilePopup = false }: CookiePolicyProps) {
  const [activeId, setActiveId] = useState<string>(SECTIONS[0].id);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  // While a TOC click is smooth-scrolling, ignore the observer so the
  // highlight does not flicker through every section on the way down.
  const lockUntilRef = useRef(0);

  const handleReturn = useCallback(() => {
    if (returnsToProfilePopup) rememberReturningToProfilePopup();

    if (returnPath) {
      navigateTo(returnPath);
      return;
    }

    if (window.history.state !== null && window.history.length > 1) {
      window.history.back();
      return;
    }

    navigateTo("/");
  }, [returnPath, returnsToProfilePopup]);

  /* Scroll-spy: highlight the section currently near the top of the viewport. */
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (Date.now() < lockUntilRef.current) return;
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-18% 0px -66% 0px", threshold: 0 },
    );

    SECTIONS.forEach((section) => {
      const node = sectionRefs.current[section.id];
      if (node) observer.observe(node);
    });

    return () => observer.disconnect();
  }, []);

  const handleJump = useCallback((id: string) => {
    const node = sectionRefs.current[id];
    if (!node) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    lockUntilRef.current = Date.now() + (reduceMotion ? 0 : 700);
    setActiveId(id);
    node.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }, []);

  return (
    <>
    <main className="ck-page app">
      <div className="ck-page-inner">
        <button type="button" className="ck-return" onClick={handleReturn} aria-label="Go back" title="Go back">
          <span className="ck-return-icon" aria-hidden="true"><ArrowLeftIcon /></span>
        </button>

        {/* ---------------- Hero (same layout as Match History) ---------------- */}
        <section className="ck-hero" aria-labelledby="ck-hero-title">
          <div className="ck-hero-stage" aria-hidden="true">
            <div className="ck-hero-ring">
              <img src={pageRingBg} alt="" draggable={false} />
            </div>
            <div className="ck-hero-character-glow" />
            {/* dark silhouette: stops the ring showing through Arcadion */}
            <img
              className="ck-hero-character-shadow"
              src={pageArt}
              alt=""
              draggable={false}
            />
            <img
              className="ck-hero-character"
              src={pageArt}
              alt=""
              draggable={false}
            />
          </div>

          <div className="ck-hero-note" aria-hidden="true">
            <CrownIcon className="ck-hero-note-crown" />
            <span>
              Only
              <br />
              the
              <br />
              essentials
            </span>
            <svg viewBox="0 0 60 60" className="ck-hero-note-arrow">
              <path
                d="M44 4c2 20-10 34-32 44m0 0l14-2m-14 2l4-13"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div className="ck-hero-heading">
            <span className="ck-hero-kicker">THE FINE PRINT</span>

            <h1 id="ck-hero-title">
              COOKIE <span data-text="POLICY">POLICY</span>
            </h1>

            <p>Which cookies Arcadia sets, why, and how you stay in control.</p>
          </div>
        </section>

        {/* ---------------- Meta panel (sits over Arcadion's hand) ---------------- */}
        <section className="ck-meta" aria-label="About this policy">
          <div className="ck-meta-dates">
            <div className="ck-meta-item">
              <span className="ck-meta-icon" aria-hidden="true"><CalendarIcon /></span>
              <span className="ck-meta-text">
                <span className="ck-meta-label">Effective date</span>
                <span className="ck-meta-value">{renderText(EFFECTIVE_DATE)}</span>
              </span>
            </div>
            <div className="ck-meta-item">
              <span className="ck-meta-icon" aria-hidden="true"><ShieldIcon /></span>
              <span className="ck-meta-text">
                <span className="ck-meta-label">Last updated</span>
                <span className="ck-meta-value">{renderText(LAST_UPDATED)}</span>
              </span>
            </div>
          </div>

          <div className="ck-meta-intro">
            {INTRO.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </section>

        {/* ---------------- Contents + sections ---------------- */}
        <div className="ck-layout">
          <nav className="ck-toc" aria-label="Cookie Policy contents">
            <span className="ck-toc-heading">
              <ListIcon />
              Contents
            </span>
            <ol className="ck-toc-list">
              {SECTIONS.map((section, index) => (
                <li key={section.id}>
                  <button
                    type="button"
                    className={`ck-toc-link${activeId === section.id ? " ck-toc-link--active" : ""}`}
                    aria-current={activeId === section.id ? "true" : undefined}
                    onClick={() => handleJump(section.id)}
                  >
                    <span className="ck-toc-num">{pad(index + 1)}</span>
                    <span className="ck-toc-title">{section.title}</span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          <div className="ck-body">
            {SECTIONS.map((section, index) => (
              <section
                key={section.id}
                id={section.id}
                className="ck-section"
                aria-labelledby={`${section.id}-title`}
                ref={(node) => {
                  sectionRefs.current[section.id] = node;
                }}
              >
                <header className="ck-section-head">
                  <span className="ck-section-num" aria-hidden="true">{pad(index + 1)}</span>
                  <h2 id={`${section.id}-title`}>{section.title}</h2>
                </header>

                <div className="ck-section-body">
                  {section.blocks.map((block, blockIndex) => {
                    switch (block.type) {
                      case "p":
                        return <p key={blockIndex}>{renderText(block.text)}</p>;

                      case "sub":
                        return <h3 key={blockIndex} className="ck-sub">{block.text}</h3>;

                      case "ul":
                        return (
                          <ul key={blockIndex} className="ck-list">
                            {block.items.map((item) =>
                              typeof item === "string" ? (
                                <li key={item}>{renderText(item)}</li>
                              ) : (
                                <li key={item.label}>
                                  <strong>{item.label}</strong> {renderText(item.text)}
                                </li>
                              ),
                            )}
                          </ul>
                        );

                      case "callout":
                        return (
                          <div key={blockIndex} className="ck-callout" role="note">
                            <span className="ck-callout-icon" aria-hidden="true"><WarningIcon /></span>
                            <p>{block.text}</p>
                          </div>
                        );

                      case "table":
                        return (
                          <div
                            key={blockIndex}
                            className="ck-table-wrap"
                            role="region"
                            aria-label="Cookies used by Arcadia"
                            tabIndex={0}
                          >
                            <table className="ck-table">
                              <thead>
                                <tr>
                                  {block.columns.map((column) => (
                                    <th key={column} scope="col">{column}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {block.rows.map((row) => (
                                  <tr key={row[0]}>
                                    {row.map((cell, cellIndex) =>
                                      cellIndex === 0 ? (
                                        <th key={cellIndex} scope="row"><code>{cell}</code></th>
                                      ) : (
                                        <td key={cellIndex}>{renderText(cell)}</td>
                                      ),
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );

                      case "contact":
                        return (
                          <dl key={blockIndex} className="ck-contact">
                            {CONTACT_FIELDS.map((field) => (
                              <div key={field.label} className="ck-contact-row">
                                <dt>{field.label}</dt>
                                <dd>{renderText(field.value)}</dd>
                              </div>
                            ))}
                          </dl>
                        );

                      default:
                        return null;
                    }
                  })}
                </div>
              </section>
            ))}

            <p className="ck-closing">{CLOSING_NOTE}</p>
          </div>
        </div>
      </div>
    </main>
    <Footer />
    </>
  );
}

export default CookiePolicy;