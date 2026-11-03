import { useCallback, useEffect, useRef, useState } from "react";
import {
  navigateTo,
  rememberReturningToProfilePopup,
} from "../../lib/navigation";
import Footer from "../../components/Footer";
import pageArt from "../../assets/PrivacyandPolicyArcadion.png";
import pageRingBg from "../../assets/ArcadionpickBG.png";
import "./PrivacyPolicy.css";

/* ===========================================================
   PRIVACY POLICY

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
  | { type: "contact" };

type PolicySection = {
  id: string;
  title: string;
  blocks: Block[];
};

const EFFECTIVE_DATE = "[To be added before launch]";
const LAST_UPDATED = "[To be added before launch]";

const INTRO = [
  "Welcome to Arcadia. This Privacy Policy explains what personal information Arcadia handles, how it is used and stored, who it may be shared with, and the choices available to you.",
  "By creating an account or using Arcadia, you acknowledge the practices described here. Please read this Policy together with our Terms of Service and Cookie Policy.",
];

const CONTACT_FIELDS: { label: string; value: string }[] = [
  { label: "Contact", value: "Arcadia Support" },
  { label: "Legal Operator", value: "[Insert Legal Name]" },
  { label: "Privacy Email", value: "[Insert Official Privacy Contact Email]" },
  { label: "Address", value: "[Insert Official Address]" },
];

const CLOSING_NOTE =
  "By using Arcadia, you acknowledge that you have read and understood this Privacy Policy.";

const SECTIONS: PolicySection[] = [
  {
    id: "introduction",
    title: "Introduction",
    blocks: [
      { type: "sub", text: "Purpose of this Privacy Policy" },
      { type: "p", text: "This Privacy Policy explains how Arcadia collects, uses, stores, protects, and shares personal information when you use the platform. It is written to help you understand what happens to your information and what control you have over it." },
      { type: "sub", text: "Scope of this policy" },
      { type: "p", text: "This Policy applies to the Arcadia platform and its currently available features, including accounts, profiles, friends, private messaging, Match History, and experience points. It does not apply to independent third-party services such as Google; those are governed by their own policies. Our Cookie Policy gives more detail about cookies." },
      { type: "sub", text: "Effective date and last updated" },
      { type: "p", text: "The Effective Date and the Last Updated date are shown at the top of this page. If you do not agree with this Policy, please do not use the platform." },
    ],
  },
  {
    id: "information-we-collect",
    title: "Information We Collect",
    blocks: [
      { type: "p", text: "Depending on how you use Arcadia, we collect the following information:" },
      {
        type: "ul",
        items: [
          { label: "Account information:", text: "your email address, username, display name, and a Player ID that Arcadia generates for you. If you sign up with a password, we store it only as a bcrypt hash and never in readable form. We also keep your account status and role, your XP total, and your settings (sound effects, volume, profile visibility, and leaderboard visibility)." },
          { label: "Google authentication information:", text: "if you use Google sign-in, we receive your Google account identifier, your verified email address, your name, and your profile picture address. While you sign in, we also keep short-lived security data (a state value, a nonce, and a one-time code) to make sure the request is genuine." },
          { label: "Profile information:", text: "your username, display name, and avatar, which can be an Arcadia avatar or your Google profile picture if you choose it." },
          { label: "Friends and social information:", text: "friend requests, accepted friendships, and the users you have blocked." },
          { label: "Chat information:", text: "the text of your messages, who sent and received them, when they were sent, delivered, and read, a preview of the latest message in each conversation, your Clear Chat settings, and Clear Chat requests." },
          { label: "Gaming activity and Match History:", text: "records of matches, such as the game, the type of opponent or opponent name, the result, when it finished, and how long it lasted, together with your experience points (XP). These features are still being developed, so some records may not exist yet." },
          { label: "Support request information:", text: "the category, subject, and description you submit, together with your email address, username, and Player ID so that we can reply to you." },
          { label: "Authentication and session information:", text: "records of your signed-in sessions, including the IP address and browser details (user agent) of each session, and the time, IP address, and browser details of your last login. To limit abuse, we also keep rate-limit counters that store hashed identifiers instead of raw IP addresses or email addresses." },
        ],
      },
      { type: "p", text: "We do not ask for your date of birth." },
    ],
  },
  {
    id: "how-we-use",
    title: "How We Use Your Information",
    blocks: [
      { type: "p", text: "We use the information we collect to operate and protect Arcadia, including to:" },
      {
        type: "ul",
        items: [
          { label: "Create and manage accounts:", text: "set up your account and keep its details accurate." },
          { label: "Authenticate users:", text: "verify who you are when you sign in with a password or with Google." },
          { label: "Manage profiles and Player IDs:", text: "show your profile and assign and display your Player ID." },
          { label: "Manage friends and blocks:", text: "process friend requests, friendships, and blocking." },
          { label: "Provide private messaging:", text: "deliver one-to-one messages between accepted friends." },
          { label: "Keep chat history and read receipts:", text: "store conversations and record when messages are delivered and read." },
          { label: "Process Clear Chat requests:", text: "carry out Clear for Me and Clear for Both." },
          { label: "Record Match History and XP:", text: "keep your match records and experience points where these features apply." },
          { label: "Provide support and account communication:", text: "reply to support requests and send account emails: a welcome email when you register, a welcome-back email if you return after a period of inactivity, and password-reset emails. There is currently no setting to opt out of these emails. [Confirm.]" },
          { label: "Protect platform security:", text: "detect abuse, limit repeated requests, and protect accounts and sessions." },
        ],
      },
      { type: "p", text: "We use your information for purposes connected with providing and securing the platform, or as otherwise described in this Policy." },
    ],
  },
  {
    id: "cookies",
    title: "Cookies and Similar Technologies",
    blocks: [
      { type: "p", text: "Arcadia uses a small number of first-party cookies that are needed for sign-in and security. We have not found any advertising or analytics cookies in the platform. [Confirm for the live deployment.]" },
      { type: "sub", text: "Authentication cookies" },
      { type: "p", text: "After you sign in, a refresh cookie called arcadia_refresh keeps your session active for up to 30 days, unless you sign out or end the session. It is marked HttpOnly, so scripts on the page cannot read it, and Secure in production." },
      { type: "sub", text: "Session management" },
      { type: "p", text: "Your short-lived access token is kept in your browser's memory rather than in permanent storage. A temporary cookie called arcadia_oauth_state protects Google sign-in for about 10 minutes. Staff who use the Admin Panel receive a separate admin session cookie." },
      { type: "sub", text: "Cookie purposes and behaviour" },
      { type: "p", text: "Our Cookie Policy lists every cookie, its purpose, and its lifetime. You can clear or block cookies in your browser settings, but you may then be signed out or unable to sign in." },
    ],
  },
  {
    id: "chat-privacy",
    title: "Chat Privacy and Message Encryption",
    blocks: [
      { type: "sub", text: "How messages are transmitted" },
      { type: "p", text: "Messages are sent between accepted friends through the Arcadia backend. Your device uses secure requests and a real-time connection to send and receive them. Typing indicators are passed along in real time and are not stored." },
      { type: "sub", text: "How messages are stored" },
      { type: "p", text: "Messages are stored in the Arcadia database in plaintext. Each conversation also keeps a plaintext copy of its latest message for the conversation preview." },
      { type: "sub", text: "Current absence of end-to-end encryption" },
      { type: "callout", text: "Arcadia's current private chat system does not use end-to-end encryption." },
      { type: "p", text: "This means the server-side system can access message contents, and people with technical access to the database could in principle read stored messages. [Confirm how such access is restricted.] Please avoid sharing passwords, authentication codes, financial information, or other highly sensitive information through chat. Arcadia's administrator tools do not currently include a feature for reading private chats." },
      { type: "sub", text: "Message delivery and read status" },
      { type: "p", text: "A message is marked delivered when the recipient's device confirms it received it, and read when the recipient opens the conversation. We store these times, and the sender can see the status." },
      { type: "sub", text: "Clear for Me and Clear for Both" },
      {
        type: "ul",
        items: [
          { label: "Clear for Me:", text: "hides the earlier messages of the conversation from your view. The messages are not deleted, and the other participant's history is not affected." },
          { label: "Clear for Both:", text: "sends a request to the other participant. Nothing is deleted unless they approve. Once they approve, all messages in the conversation are permanently deleted for both participants. The empty conversation itself remains." },
        ],
      },
      { type: "sub", text: "Mutual deletion requests" },
      { type: "p", text: "If the other participant declines a Clear for Both request, the messages stay as they were. Completed requests are kept for 90 days after the response. Removing or blocking a friend stops further messaging but does not delete previously stored messages. Arcadia does not currently let you edit a message or delete a single message." },
    ],
  },
  {
    id: "storage",
    title: "How We Store Your Information",
    blocks: [
      { type: "p", text: "We store your information in the Arcadia database and its supporting systems. In broad terms:" },
      {
        type: "ul",
        items: [
          { label: "Account and profile data:", text: "your email, username, display name, Player ID, password hash, preferences, XP, and last-login details." },
          { label: "Chat and conversation data:", text: "message text, timestamps, delivery and read status, conversation previews, and Clear Chat requests." },
          { label: "Authentication and session data:", text: "session records keep a hash of the refresh token rather than the token itself, together with the IP address and browser details of the session." },
          { label: "Support information:", text: "support requests are stored in the database and are also emailed to our support inbox." },
          { label: "Email logs:", text: "a log of emails sent by the platform. Each entry has the type of email, a masked version of the recipient address, the outcome, and a provider message ID. It does not contain the email text." },
        ],
      },
      { type: "p", text: "[Insert hosting provider, database provider, and storage region.]" },
      { type: "p", text: "[Insert backup location, encryption, and backup retention.]" },
    ],
  },
  {
    id: "data-security",
    title: "Data Security",
    blocks: [
      { type: "p", text: "We take reasonable technical and organizational measures to protect personal information, including:" },
      {
        type: "ul",
        items: [
          { label: "Password hashing:", text: "passwords are stored as bcrypt hashes, not in readable form." },
          { label: "Authentication and session protection:", text: "access tokens are short-lived (15 minutes), refresh tokens are stored only as hashes, sessions can be revoked, and resetting or changing your password ends other sessions." },
          { label: "Cookie and request protections:", text: "our cookies are HttpOnly, requests that change data from a signed-in browser must include a protective header, and the server accepts requests only from approved origins." },
          { label: "API and Socket.IO access controls:", text: "every request and real-time connection is authenticated, and live connections are re-checked against the database every 15 seconds. They are disconnected if the account is suspended, deleted, or signed out." },
          { label: "Friends-only messaging restrictions:", text: "private messages can only be exchanged between accepted friends, and this is re-checked on every chat action." },
          { label: "Blocking protections:", text: "blocking can prevent further friend requests and communication between the affected accounts." },
          { label: "Rate limiting and security headers:", text: "we limit repeated requests to sensitive actions and send protective security headers." },
          { label: "Administrative access controls:", text: "the Admin Panel has its own sign-in and session. Administrators can see account details, including email addresses, and support requests, but cannot read private chats through the admin tools." },
        ],
      },
      { type: "sub", text: "Security limitations" },
      { type: "p", text: "No online system can guarantee absolute security. Because chat is not end-to-end encrypted, message contents are readable by the server-side system. Whether data in transit is protected also depends on the HTTPS configuration of our hosting. [Confirm HTTPS is enforced in production.] Please use a strong, unique password, and tell us if you suspect unauthorized access to your account." },
    ],
  },
  {
    id: "sharing",
    title: "How We Share Information",
    blocks: [
      { type: "p", text: "We share personal information only in the limited situations below:" },
      {
        type: "ul",
        items: [
          { label: "Third-party service providers:", text: "hosting, database, and email companies that process data on our behalf, only to the extent needed to run the platform. [Insert provider names.]" },
          { label: "Google authentication:", text: "if you use Google sign-in, information is exchanged with Google to verify your identity." },
          { label: "Google fonts and images:", text: "when your browser loads Google Fonts or a Google-hosted profile picture, Google receives your IP address and browser details." },
          { label: "Email delivery services:", text: "your email address, your name, and the email contents (including password-reset links and support requests) pass through our email provider." },
          { label: "Legal requirements:", text: "where we are required to do so by law, regulation, or valid legal process." },
          { label: "Security-related disclosures:", text: "where reasonably necessary to protect the platform, our users, or others from fraud, abuse, or security threats." },
        ],
      },
      { type: "p", text: "Other signed-in users can see your public profile, which shows your username, Player ID, avatar, level and progress, number of completed matches, and when you joined. New accounts are public by default, and you can change your profile visibility and leaderboard visibility in Settings. Your accepted friends can also see whether you are online. Your email address is not shown to other players. Your private messages are visible to the other participant in the conversation." },
    ],
  },
  {
    id: "third-party",
    title: "Third-Party Services",
    blocks: [
      { type: "sub", text: "Google OAuth" },
      { type: "p", text: "Arcadia lets you sign in with Google. Google handles your Google credentials, and Arcadia does not receive your Google password." },
      { type: "sub", text: "Google Fonts and Google-hosted images" },
      { type: "p", text: "Some pages load fonts from Google Fonts, and Google-hosted profile pictures are loaded directly from Google when you choose one. This sends your IP address and browser details to Google. Whether Google sets its own cookies or identifiers for these requests is governed by Google's policies." },
      { type: "sub", text: "Email delivery provider" },
      { type: "p", text: "Arcadia uses an email delivery service to send account emails and to deliver support requests to our support inbox. [Insert provider name and region.]" },
      { type: "sub", text: "Hosting and database provider" },
      { type: "p", text: "[Insert hosting provider, database provider, and any content delivery network.]" },
      { type: "sub", text: "Third-party privacy policies" },
      { type: "p", text: "These services have their own terms and privacy policies, which apply to your use of them. Arcadia does not control independent third-party services or guarantee their availability." },
    ],
  },
  {
    id: "retention",
    title: "Data Retention",
    blocks: [
      { type: "p", text: "We keep information only for as long as it is needed to provide Arcadia, meet legal obligations, resolve disputes, and keep the platform secure." },
      {
        type: "ul",
        items: [
          { label: "Account data:", text: "kept until you delete your account. There is no automatic expiry." },
          { label: "Sessions and tokens:", text: "refresh sessions last up to 30 days, password-reset links expire after 1 hour, and the temporary data used during Google sign-in expires within minutes." },
          { label: "Chat messages:", text: "kept until a Clear for Both request is approved or your account is deleted. Clear for Me only hides messages and does not delete them. There is no automatic expiry." },
          { label: "Pending Clear Chat requests:", text: "remain pending until the other participant approves or declines." },
          { label: "Completed Clear Chat requests:", text: "the request record is kept for 90 days after the response and then removed. When a request is approved, the messages are deleted straight away." },
          { label: "Match records and support requests:", text: "kept until you delete your account. There is no automatic expiry. [Insert any retention period you adopt.]" },
          { label: "Rate-limit data:", text: "expires when the short rate-limit window ends." },
          { label: "Email logs:", text: "kept for about 90 days. [Confirm the production setting.]" },
          { label: "Backups:", text: "[Insert backup retention.]" },
        ],
      },
    ],
  },
  {
    id: "account-deletion",
    title: "Account Deletion and Data Removal",
    blocks: [
      { type: "sub", text: "Account deletion process" },
      { type: "p", text: "You can permanently delete your account in Settings by typing DELETE. If you sign in with a password, you are also asked to enter it. [Insert how requests made by email are handled and how identity is checked.]" },
      { type: "sub", text: "Data removed during deletion" },
      {
        type: "ul",
        items: [
          { label: "Account and profile:", text: "your account, profile, preferences, and XP are deleted." },
          { label: "Sessions and tokens:", text: "your sessions, password-reset tokens, and sign-in handoffs are removed and you are signed out." },
          { label: "Friendship and session removal:", text: "your friend requests, friendships, and blocks are removed." },
          { label: "Chat and conversation deletion:", text: "every message you sent or received and your conversations are deleted. This also removes them from the other person's chat history." },
          { label: "Clear Chat request removal:", text: "Clear Chat requests involving your account are removed." },
          { label: "Match records and support requests:", text: "these are deleted with your account." },
        ],
      },
      { type: "sub", text: "What may remain" },
      { type: "p", text: "Email delivery logs are not part of account deletion and are kept for their own retention period (about 90 days). Short-lived technical data, such as rate-limit counters, expires by itself. Copies held by our email provider and in backups are outside the deletion process. [Insert how long these copies remain.]" },
      { type: "sub", text: "Legal retention exceptions" },
      { type: "p", text: "Certain information may be retained where required by law or reasonably necessary for security, dispute resolution, or legal compliance." },
    ],
  },
  {
    id: "your-rights",
    title: "Your Privacy Rights and Choices",
    blocks: [
      { type: "p", text: "You have the following choices and rights, subject to applicable law:" },
      {
        type: "ul",
        items: [
          { label: "Access to personal information:", text: "you can see your profile, settings, sessions, and match history in the app. Arcadia does not currently offer a one-click data export. To request a copy of other information, contact us. [Insert the process.]" },
          { label: "Correction of information:", text: "you can edit your display name, username, and avatar in Settings. For anything else, contact us." },
          { label: "Data deletion requests:", text: "you can delete your account yourself (see Section 11)." },
          { label: "Profile management:", text: "you can choose your profile visibility and leaderboard visibility." },
          { label: "Sessions and password:", text: "you can see your signed-in sessions, end one of them, sign out of all other sessions, and change your password." },
          { label: "Friend and block controls:", text: "you can remove friends and block or unblock users." },
          { label: "Chat-clearing controls:", text: "you can use Clear for Me and Clear for Both." },
          { label: "Privacy complaints and requests:", text: "you can raise a privacy concern or request with us at any time." },
        ],
      },
      { type: "p", text: "To use a right that is not available in the app, contact us using Section 15. We may need to verify your identity first. The rights available to you depend on where you live and on applicable law. [Add jurisdiction-specific rights and legal bases after legal review.]" },
    ],
  },
  {
    id: "children",
    title: "Children's Privacy",
    blocks: [
      { type: "sub", text: "Minimum age requirement" },
      { type: "p", text: "Arcadia is intended for people who are at least [Insert minimum age] years old. Arcadia does not currently ask for your date of birth. [Confirm the age-gate approach.]" },
      { type: "sub", text: "Information relating to younger users" },
      { type: "p", text: "We do not knowingly collect personal information from anyone below the minimum age. If we learn that we have, we will take steps to delete it." },
      { type: "sub", text: "Reporting privacy concerns" },
      { type: "p", text: "If you believe a child below the minimum age has created an account, or you have any other privacy concern about a young user, please contact us using Section 15." },
    ],
  },
  {
    id: "changes",
    title: "Changes to This Privacy Policy",
    blocks: [
      { type: "sub", text: "Policy updates" },
      { type: "p", text: "We may update this Privacy Policy when the platform's functionality, operations, or applicable legal requirements change." },
      { type: "sub", text: "Notification of material changes" },
      { type: "p", text: "Material changes will be communicated through appropriate channels where reasonably practical." },
      { type: "sub", text: "Effective and updated dates" },
      { type: "p", text: "The updated version will display its revised effective or last-updated date." },
    ],
  },
  {
    id: "contact",
    title: "Contact Us",
    blocks: [
      { type: "p", text: "For questions, requests, or complaints about privacy, contact:" },
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
      <mark key={index} className="pp-placeholder">
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

type PrivacyPolicyProps = {
  /** Optional explicit destination; otherwise return to the previous page. */
  returnPath?: string;
  /**
   * Match History arms the "reopen Profile popup" marker on Return because it
   * is only ever reached from that popup. Privacy Policy can be reached from other
   * places (sign-up, footer), so this stays off unless the caller says this
   * visit really did come from the popup.
   */
  returnsToProfilePopup?: boolean;
};

function PrivacyPolicy({ returnPath, returnsToProfilePopup = false }: PrivacyPolicyProps) {
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
    <main className="pp-page app">
      <div className="pp-page-inner">
        <button type="button" className="pp-return" onClick={handleReturn} aria-label="Go back" title="Go back">
          <span className="pp-return-icon" aria-hidden="true"><ArrowLeftIcon /></span>
        </button>

        {/* ---------------- Hero (same layout as Match History) ---------------- */}
        <section className="pp-hero" aria-labelledby="pp-hero-title">
          <div className="pp-hero-stage" aria-hidden="true">
            <div className="pp-hero-ring">
              <img src={pageRingBg} alt="" draggable={false} />
            </div>
            <div className="pp-hero-character-glow" />
            {/* dark silhouette: stops the ring showing through Arcadion */}
            <img
              className="pp-hero-character-shadow"
              src={pageArt}
              alt=""
              draggable={false}
            />
            <img
              className="pp-hero-character"
              src={pageArt}
              alt=""
              draggable={false}
            />
          </div>

          <div className="pp-hero-note" aria-hidden="true">
            <CrownIcon className="pp-hero-note-crown" />
            <span>
              Your
              <br />
              data,
              <br />
              your call
            </span>
            <svg viewBox="0 0 60 60" className="pp-hero-note-arrow">
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

          <div className="pp-hero-heading">
            <span className="pp-hero-kicker">YOUR DATA, YOUR CALL</span>

            <h1 id="pp-hero-title">
              PRIVACY <span data-text="POLICY">POLICY</span>
            </h1>

            <p>What we collect, why we collect it, and how Arcadion keeps it safe.</p>
          </div>
        </section>

        {/* ---------------- Meta panel (sits over Arcadion's hand) ---------------- */}
        <section className="pp-meta" aria-label="About this policy">
          <div className="pp-meta-dates">
            <div className="pp-meta-item">
              <span className="pp-meta-icon" aria-hidden="true"><CalendarIcon /></span>
              <span className="pp-meta-text">
                <span className="pp-meta-label">Effective date</span>
                <span className="pp-meta-value">{renderText(EFFECTIVE_DATE)}</span>
              </span>
            </div>
            <div className="pp-meta-item">
              <span className="pp-meta-icon" aria-hidden="true"><ShieldIcon /></span>
              <span className="pp-meta-text">
                <span className="pp-meta-label">Last updated</span>
                <span className="pp-meta-value">{renderText(LAST_UPDATED)}</span>
              </span>
            </div>
          </div>

          <div className="pp-meta-intro">
            {INTRO.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </section>

        {/* ---------------- Contents + sections ---------------- */}
        <div className="pp-layout">
          <nav className="pp-toc" aria-label="Privacy Policy contents">
            <span className="pp-toc-heading">
              <ListIcon />
              Contents
            </span>
            <ol className="pp-toc-list">
              {SECTIONS.map((section, index) => (
                <li key={section.id}>
                  <button
                    type="button"
                    className={`pp-toc-link${activeId === section.id ? " pp-toc-link--active" : ""}`}
                    aria-current={activeId === section.id ? "true" : undefined}
                    onClick={() => handleJump(section.id)}
                  >
                    <span className="pp-toc-num">{pad(index + 1)}</span>
                    <span className="pp-toc-title">{section.title}</span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          <div className="pp-body">
            {SECTIONS.map((section, index) => (
              <section
                key={section.id}
                id={section.id}
                className="pp-section"
                aria-labelledby={`${section.id}-title`}
                ref={(node) => {
                  sectionRefs.current[section.id] = node;
                }}
              >
                <header className="pp-section-head">
                  <span className="pp-section-num" aria-hidden="true">{pad(index + 1)}</span>
                  <h2 id={`${section.id}-title`}>{section.title}</h2>
                </header>

                <div className="pp-section-body">
                  {section.blocks.map((block, blockIndex) => {
                    switch (block.type) {
                      case "p":
                        return <p key={blockIndex}>{renderText(block.text)}</p>;

                      case "sub":
                        return <h3 key={blockIndex} className="pp-sub">{block.text}</h3>;

                      case "ul":
                        return (
                          <ul key={blockIndex} className="pp-list">
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
                          <div key={blockIndex} className="pp-callout" role="note">
                            <span className="pp-callout-icon" aria-hidden="true"><WarningIcon /></span>
                            <p>{block.text}</p>
                          </div>
                        );

                      case "contact":
                        return (
                          <dl key={blockIndex} className="pp-contact">
                            {CONTACT_FIELDS.map((field) => (
                              <div key={field.label} className="pp-contact-row">
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

            <p className="pp-closing">{CLOSING_NOTE}</p>
          </div>
        </div>
      </div>
    </main>
    <Footer />
    </>
  );
}

export default PrivacyPolicy;