import { useCallback, useEffect, useRef, useState } from "react";
import {
  navigateTo,
  rememberReturningToProfilePopup,
} from "../../lib/navigation";
import Footer from "../../components/Footer";
import termsArt from "../../assets/TermsofServiceArcadion.png";
import termsRingBg from "../../assets/ArcadionpickBG.png";
import "./TermsOfService.css";

/* ===========================================================
   TERMS OF SERVICE

   Same page shell as Match History: a full page (not a modal), a Return
   button, and the hero with Arcadion + the spinning ring behind him. The
   meta panel overlaps his hand exactly like the filter panel does there.

   The copy lives in TERMS below as plain data so it can be edited without
   touching the layout. Anything in [square brackets] is a placeholder and is
   rendered highlighted, so it cannot be missed before launch.
   =========================================================== */

type ListItem = string | { label: string; text: string };

type Block =
  | { type: "p"; text: string }
  | { type: "ul"; items: ListItem[] }
  | { type: "sub"; text: string }
  | { type: "callout"; text: string }
  | { type: "contact" };

type TermsSection = {
  id: string;
  title: string;
  blocks: Block[];
};

const EFFECTIVE_DATE = "[To be added before launch]";
const LAST_UPDATED = "[To be added before launch]";

const INTRO = [
  "Welcome to Arcadia. These Terms of Service govern your use of the Arcadia platform and its currently available features.",
  "By creating an account or using Arcadia, you agree to these Terms. If you do not agree, please do not use the platform.",
];

const CONTACT_FIELDS: { label: string; value: string }[] = [
  { label: "Contact", value: "Arcadia Support" },
  { label: "Legal Operator", value: "[Insert Legal Name]" },
  { label: "Email", value: "[Insert Official Contact Email]" },
  { label: "Address", value: "[Insert Official Address]" },
];

const CLOSING_NOTE =
  "By using Arcadia, you acknowledge that you have read and understood these Terms of Service.";

const TERMS: TermsSection[] = [
  {
    id: "about",
    title: "About Arcadia",
    blocks: [
      {
        type: "p",
        text: "Arcadia is a gaming community platform where users can create profiles, connect with friends, communicate through private chats, and access available gaming-related features.",
      },
      { type: "p", text: "The currently implemented features include:" },
      {
        type: "ul",
        items: [
          "Account registration and login.",
          "Google sign-in, where configured.",
          "User profiles and Player IDs.",
          "Friend requests and friend management.",
          "Online and offline presence indicators.",
          "One-to-one messaging between accepted friends.",
          "Message delivery and read receipts.",
          "Chat history and conversation management.",
          "Blocking and unblocking users.",
          "Match History.",
          "Experience points for supported and verified activity.",
          "Leaderboard interface.",
        ],
      },
      {
        type: "p",
        text: "The availability and behaviour of individual features may depend on the current state of the platform.",
      },
    ],
  },
  {
    id: "accounts",
    title: "User Accounts",
    blocks: [
      { type: "p", text: "Certain features require you to create an account." },
      { type: "p", text: "You agree to:" },
      {
        type: "ul",
        items: [
          "Provide accurate registration information.",
          "Use a username and profile information that do not impersonate another person.",
          "Keep your login credentials confidential.",
          "Not share or transfer your account to another person.",
          "Notify us if you suspect unauthorized access to your account.",
          "Use your account only for lawful purposes.",
        ],
      },
      {
        type: "p",
        text: "You are responsible for maintaining the security of your account.",
      },
    ],
  },
  {
    id: "profiles",
    title: "User Profiles and Player IDs",
    blocks: [
      {
        type: "p",
        text: "Each registered user may have a profile containing information such as:",
      },
      {
        type: "ul",
        items: [
          "Username.",
          "Player ID.",
          "Profile image.",
          "Other available profile information and preferences.",
        ],
      },
      {
        type: "p",
        text: "You are responsible for the information you provide in your profile.",
      },
      {
        type: "p",
        text: "You must not use profile information to impersonate another person, mislead users, or violate another person's rights.",
      },
    ],
  },
  {
    id: "friends",
    title: "Friends and User Interactions",
    blocks: [
      {
        type: "p",
        text: "Arcadia allows users to send, receive, accept, or reject friend requests.",
      },
      { type: "p", text: "Users may also:" },
      {
        type: "ul",
        items: [
          "View their accepted friends.",
          "Remove existing friends.",
          "Block and unblock users.",
          "View available online and offline presence information.",
        ],
      },
      {
        type: "p",
        text: "You agree to respect other users' decisions regarding friendship and communication.",
      },
      {
        type: "p",
        text: "You must not use these features to harass, spam, threaten, or repeatedly contact users against their wishes.",
      },
      {
        type: "p",
        text: "Blocking a user may prevent further friend requests and communication between the affected accounts.",
      },
    ],
  },
  {
    id: "messaging",
    title: "Private Messaging",
    blocks: [
      {
        type: "p",
        text: "Arcadia provides one-to-one messaging between accepted friends.",
      },
      {
        type: "p",
        text: "The chat system supports message history, delivery status, read receipts, timestamps, and conversation management.",
      },
      { type: "sub", text: "Message Storage and Encryption" },
      {
        type: "callout",
        text: "Arcadia's current private chat system does not use end-to-end encryption.",
      },
      {
        type: "p",
        text: "Messages are transmitted through the Arcadia backend and stored in the database in plaintext. This means the server-side system can access message contents.",
      },
      {
        type: "p",
        text: "Users should avoid sharing passwords, authentication codes, financial information, or other highly sensitive information through chat.",
      },
      {
        type: "p",
        text: "We take reasonable measures to protect information handled by the platform, but no online system can guarantee absolute security.",
      },
      { type: "sub", text: "Clear Chat" },
      { type: "p", text: "Arcadia provides conversation-clearing options:" },
      {
        type: "ul",
        items: [
          {
            label: "Clear for Me:",
            text: "Clears the conversation from your account without necessarily affecting the other participant's history.",
          },
          {
            label: "Clear for Both:",
            text: "Requires the other participant's approval before the conversation messages are permanently deleted for both participants.",
          },
        ],
      },
      {
        type: "p",
        text: "If a mutual deletion request is declined, the conversation remains available according to the existing chat history.",
      },
      {
        type: "p",
        text: "Removing or blocking a friend does not automatically delete previously stored messages.",
      },
    ],
  },
  {
    id: "match-history",
    title: "Match History and Experience Points",
    blocks: [
      {
        type: "p",
        text: "Arcadia includes Match History and experience-point functionality for supported platform activities.",
      },
      {
        type: "p",
        text: "Experience points are awarded according to the platform's implemented rules and verified activity.",
      },
      {
        type: "p",
        text: "You must not manipulate, falsify, or exploit activity records to obtain unfair advantages.",
      },
      {
        type: "p",
        text: "Arcadia may correct inaccurate records or remove improperly obtained points.",
      },
      {
        type: "p",
        text: "Experience points and other platform indicators do not represent money or a cash-equivalent balance.",
      },
    ],
  },
  {
    id: "acceptable-use",
    title: "Acceptable Use",
    blocks: [
      { type: "p", text: "You agree not to:" },
      {
        type: "ul",
        items: [
          "Harass, threaten, bully, or abuse other users.",
          "Impersonate another person.",
          "Send spam or misleading communications.",
          "Attempt to access another user's account or private information without authorization.",
          "Exploit bugs or vulnerabilities.",
          "Interfere with platform functionality or security.",
          "Use unauthorized automation to manipulate platform activity.",
          "Distribute unlawful or harmful content through the Services.",
          "Violate the intellectual property or other rights of Arcadia or another person.",
        ],
      },
      {
        type: "p",
        text: "We may investigate suspected violations and take appropriate action.",
      },
    ],
  },
  {
    id: "intellectual-property",
    title: "Intellectual Property",
    blocks: [
      {
        type: "p",
        text: "Arcadia's original branding, logos, interface designs, software, graphics, and other platform materials are owned by or licensed to the Arcadia operator.",
      },
      {
        type: "p",
        text: "You may use these materials only as necessary to access and use Arcadia for permitted purposes.",
      },
      {
        type: "p",
        text: "You must not copy, reproduce, distribute, modify, or commercially exploit Arcadia's materials without permission, except where permitted by applicable law.",
      },
      {
        type: "p",
        text: "You retain ownership of content you submit. You grant Arcadia permission to host, store, display, and process that content as necessary to provide and operate the platform.",
      },
    ],
  },
  {
    id: "third-party",
    title: "Third-Party Authentication and Services",
    blocks: [
      {
        type: "p",
        text: "Arcadia may use third-party services, including Google authentication and email delivery services, to support existing platform functionality.",
      },
      {
        type: "p",
        text: "Your use of those services may also be subject to their respective terms and privacy policies.",
      },
      {
        type: "p",
        text: "Arcadia does not control independent third-party services or guarantee their availability.",
      },
    ],
  },
  {
    id: "availability",
    title: "Platform Availability",
    blocks: [
      {
        type: "p",
        text: "Arcadia may require maintenance, updates, or technical changes.",
      },
      {
        type: "p",
        text: "We do not guarantee uninterrupted or error-free access to every feature.",
      },
      {
        type: "p",
        text: "We may modify, restrict, or temporarily disable existing functionality where reasonably necessary for maintenance, security, or operational reasons.",
      },
    ],
  },
  {
    id: "suspension",
    title: "Account Suspension and Deletion",
    blocks: [
      {
        type: "p",
        text: "You may request deletion of your Arcadia account through the available account controls or by contacting us.",
      },
      {
        type: "p",
        text: "We may restrict, suspend, or terminate an account if:",
      },
      {
        type: "ul",
        items: [
          "These Terms are materially violated.",
          "The account is involved in abusive or unauthorized activity.",
          "The account creates a security risk.",
          "We are required to do so by applicable law.",
        ],
      },
      {
        type: "p",
        text: "Account deletion may remove your profile, account information, sessions, friendships, and associated platform data.",
      },
      {
        type: "p",
        text: "Certain information may be retained where required by law or reasonably necessary for security, dispute resolution, or legal compliance.",
      },
    ],
  },
  {
    id: "privacy",
    title: "Privacy",
    blocks: [
      {
        type: "p",
        text: "Your use of Arcadia is also governed by our Privacy Policy.",
      },
      {
        type: "p",
        text: "The Privacy Policy explains the personal information handled by Arcadia, how it is used and stored, and the rights available to users.",
      },
      {
        type: "p",
        text: "Please review it to understand our data practices.",
      },
    ],
  },
  {
    id: "disclaimers",
    title: "Disclaimers",
    blocks: [
      { type: "p", text: "Arcadia is provided on an \u201Cas available\u201D basis." },
      {
        type: "p",
        text: "To the extent permitted by applicable law, we do not guarantee that the platform will always be available, uninterrupted, or free from technical errors.",
      },
      {
        type: "p",
        text: "We do not guarantee the accuracy of information provided by other users or the behaviour of individual users.",
      },
      {
        type: "p",
        text: "Nothing in these Terms excludes legal rights or protections that cannot be excluded under applicable law.",
      },
    ],
  },
  {
    id: "liability",
    title: "Limitation of Liability",
    blocks: [
      {
        type: "p",
        text: "To the extent permitted by applicable law, Arcadia and its operator will not be liable for indirect or consequential losses arising from your use of, or inability to use, the platform.",
      },
      {
        type: "p",
        text: "Nothing in these Terms limits liability where such limitation is prohibited by law.",
      },
    ],
  },
  {
    id: "changes",
    title: "Changes to These Terms",
    blocks: [
      {
        type: "p",
        text: "We may update these Terms when the platform's functionality, operations, or applicable legal requirements change.",
      },
      {
        type: "p",
        text: "Material changes will be communicated through appropriate channels where reasonably practical.",
      },
      {
        type: "p",
        text: "The updated version will display its revised effective or last-updated date.",
      },
    ],
  },
  {
    id: "governing-law",
    title: "Governing Law",
    blocks: [
      {
        type: "p",
        text: "These Terms will be governed by the laws of [Insert Applicable Jurisdiction], subject to mandatory legal protections applicable to users.",
      },
      {
        type: "p",
        text: "Any disputes will be handled in accordance with applicable law.",
      },
    ],
  },
  {
    id: "contact",
    title: "Contact Information",
    blocks: [
      {
        type: "p",
        text: "For questions or concerns regarding these Terms, contact:",
      },
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
      <mark key={index} className="tos-placeholder">
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

type TermsOfServiceProps = {
  /** Optional explicit destination; otherwise return to the previous page. */
  returnPath?: string;
  /**
   * Match History arms the "reopen Profile popup" marker on Return because it
   * is only ever reached from that popup. Terms can be reached from other
   * places (sign-up, footer), so this stays off unless the caller says this
   * visit really did come from the popup.
   */
  returnsToProfilePopup?: boolean;
};

function TermsOfService({ returnPath, returnsToProfilePopup = false }: TermsOfServiceProps) {
  const [activeId, setActiveId] = useState<string>(TERMS[0].id);
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

    TERMS.forEach((section) => {
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
      <main className="tos-page app">
        <div className="tos-page-inner">
        <button type="button" className="tos-return" onClick={handleReturn} aria-label="Go back" title="Go back">
          <span className="tos-return-icon" aria-hidden="true"><ArrowLeftIcon /></span>
        </button>

        {/* ---------------- Hero (same layout as Match History) ---------------- */}
        <section className="tos-hero" aria-labelledby="tos-hero-title">
          <div className="tos-hero-stage" aria-hidden="true">
            <div className="tos-hero-ring">
              <img src={termsRingBg} alt="" draggable={false} />
            </div>
            <div className="tos-hero-character-glow" />
            {/* dark silhouette: stops the ring showing through Arcadion */}
            <img
              className="tos-hero-character-shadow"
              src={termsArt}
              alt=""
              draggable={false}
            />
            <img
              className="tos-hero-character"
              src={termsArt}
              alt=""
              draggable={false}
            />
          </div>

          <div className="tos-hero-note" aria-hidden="true">
            <CrownIcon className="tos-hero-note-crown" />
            <span>
              Play
              <br />
              fair,
              <br />
              play on
            </span>
            <svg viewBox="0 0 60 60" className="tos-hero-note-arrow">
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

          <div className="tos-hero-heading">
            <span className="tos-hero-kicker">THE RULES OF THE ARENA</span>

            <h1 id="tos-hero-title">
              TERMS OF <span data-text="SERVICE">SERVICE</span>
            </h1>

            <p>Read these before you play. Arcadion keeps the arena fair for everyone.</p>
          </div>
        </section>

        {/* ---------------- Meta panel (sits over Arcadion's hand) ---------------- */}
        <section className="tos-meta" aria-label="About these terms">
          <div className="tos-meta-dates">
            <div className="tos-meta-item">
              <span className="tos-meta-icon" aria-hidden="true"><CalendarIcon /></span>
              <span className="tos-meta-text">
                <span className="tos-meta-label">Effective date</span>
                <span className="tos-meta-value">{renderText(EFFECTIVE_DATE)}</span>
              </span>
            </div>
            <div className="tos-meta-item">
              <span className="tos-meta-icon" aria-hidden="true"><ShieldIcon /></span>
              <span className="tos-meta-text">
                <span className="tos-meta-label">Last updated</span>
                <span className="tos-meta-value">{renderText(LAST_UPDATED)}</span>
              </span>
            </div>
          </div>

          <div className="tos-meta-intro">
            {INTRO.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </section>

        {/* ---------------- Contents + sections ---------------- */}
        <div className="tos-layout">
          <nav className="tos-toc" aria-label="Terms of Service contents">
            <span className="tos-toc-heading">
              <ListIcon />
              Contents
            </span>
            <ol className="tos-toc-list">
              {TERMS.map((section, index) => (
                <li key={section.id}>
                  <button
                    type="button"
                    className={`tos-toc-link${activeId === section.id ? " tos-toc-link--active" : ""}`}
                    aria-current={activeId === section.id ? "true" : undefined}
                    onClick={() => handleJump(section.id)}
                  >
                    <span className="tos-toc-num">{pad(index + 1)}</span>
                    <span className="tos-toc-title">{section.title}</span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          <div className="tos-body">
            {TERMS.map((section, index) => (
              <section
                key={section.id}
                id={section.id}
                className="tos-section"
                aria-labelledby={`${section.id}-title`}
                ref={(node) => {
                  sectionRefs.current[section.id] = node;
                }}
              >
                <header className="tos-section-head">
                  <span className="tos-section-num" aria-hidden="true">{pad(index + 1)}</span>
                  <h2 id={`${section.id}-title`}>{section.title}</h2>
                </header>

                <div className="tos-section-body">
                  {section.blocks.map((block, blockIndex) => {
                    switch (block.type) {
                      case "p":
                        return <p key={blockIndex}>{renderText(block.text)}</p>;

                      case "sub":
                        return <h3 key={blockIndex} className="tos-sub">{block.text}</h3>;

                      case "ul":
                        return (
                          <ul key={blockIndex} className="tos-list">
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
                          <div key={blockIndex} className="tos-callout" role="note">
                            <span className="tos-callout-icon" aria-hidden="true"><WarningIcon /></span>
                            <p>{block.text}</p>
                          </div>
                        );

                      case "contact":
                        return (
                          <dl key={blockIndex} className="tos-contact">
                            {CONTACT_FIELDS.map((field) => (
                              <div key={field.label} className="tos-contact-row">
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

            <p className="tos-closing">{CLOSING_NOTE}</p>
          </div>
        </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

export default TermsOfService;