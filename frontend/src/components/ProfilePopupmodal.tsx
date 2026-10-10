import { useEffect, useRef, useState } from "react";
import type { AuthUser } from "../auth/authTypes";
import SettingsModal from "../pages/Settings/SettingsModal";
import AvatarPreview from "../pages/Myprofile/AvatarPreview";
import CopyButton from "../auth/CopyButton";
import { getUserProgressionView } from "../auth/progression";
import { getBadgeDisplay, getCompletedMatches } from "../auth/tierEligibility";
import "./ProfilePopupmodal.css";

type ProfilePopupModalProps = {
  user: AuthUser;
  /**
   * Whether My Profile is currently open on top of this menu.
   *
   * My Profile is a layer above the menu rather than a replacement for it, so
   * while it is open this menu must stop reacting to the document: every click
   * lands outside the menu, and Escape belongs to the layer on top. Suspending
   * the listeners here is what lets the menu survive My Profile being opened
   * and closed again.
   */
  isMyProfileOpen: boolean;
  onClose: () => void;
  onOpenMyProfile: () => void;
  /** Leaves for the Match History page. The menu closes as the page opens. */
  onOpenMatchHistory: () => void;
  /** Leaves for the Leaderboard page. The menu closes as the page opens. */
  onOpenLeaderboard: () => void;
  onLogout: () => void | Promise<unknown>;
  isLoggingOut: boolean;
};

/*
 * The approved menu options. This list is fixed: the identity area above it
 * carries the account details, and nothing else is added to this menu.
 *
 * Match History and Leaderboards are separate pages, not another layer of this
 * menu, so each leaves through the normal navigation helper and Return brings
 * this popup back.
 */
const MENU_ITEMS = [
  { key: "my-profile", label: "My Profile", Icon: UserIcon, action: "my-profile" },
  { key: "leaderboards", label: "Leaderboards", Icon: TrophyIcon, action: "leaderboard" },
  { key: "match-history", label: "Match History", Icon: HistoryIcon, action: "match-history" },
  { key: "settings", label: "Settings", Icon: GearIcon, action: "settings" },
  { key: "help", label: "Help & Support", Icon: HelpIcon, action: "close" },
] as const;

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3.6 12a8.4 8.4 0 1 0 2.6-6.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path d="M3.4 4.2v4.2h4.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 7.6V12l3 1.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8.4" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4.8 19.4c.9-3.4 3.7-5.3 7.2-5.3s6.3 1.9 7.2 5.3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 4.5h8v4.2a4 4 0 0 1-8 0V4.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M8 6.2H5.6v1.4A3 3 0 0 0 8.4 10.6M16 6.2h2.4v1.4a3 3 0 0 1-2.8 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 12.8v3.4M9 19.2h6M10.2 16.2h3.6l.6 3H9.6l.6-3Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.9" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9.7 9.4a2.4 2.4 0 0 1 4.6.8c0 1.6-2.3 1.9-2.3 3.3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M12 16.6h.01" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.4 7.2V5.6A1.6 1.6 0 0 0 12.8 4H6.4A1.6 1.6 0 0 0 4.8 5.6v12.8A1.6 1.6 0 0 0 6.4 20h6.4a1.6 1.6 0 0 0 1.6-1.6v-1.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M10 12h9.4M16.6 8.8 20 12l-3.4 3.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ProfilePopupModal({
  user,
  isMyProfileOpen,
  onClose,
  onOpenMyProfile,
  onOpenMatchHistory,
  onOpenLeaderboard,
  onLogout,
  isLoggingOut,
}: ProfilePopupModalProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  /*
   * Settings opens as its own modal layer above this menu, the same way My
   * Profile does, so the flag is tracked here to suspend the document
   * listeners while that layer is on top.
   */
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isLayerOpen = isMyProfileOpen || settingsOpen;

  useEffect(() => {
    /*
     * While My Profile or Settings is open the menu is inert. It is not
     * dismissed and it does not claim the Escape key, because both of those
     * belong to the layer on top of it. The menu is still mounted, so it is
     * simply still there when the layer closes.
     */
    if (isLayerOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!popupRef.current?.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isLayerOpen, onClose]);

  // The badge and title come from the progression the backend already sent. The
  // same eligibility rule My Profile and the Avatar Modal use is applied here, so
  // all three surfaces always show the same tier in the same state.
  const progression = getUserProgressionView(user);
  /*
   * The signed-in `AuthUser` carries no gaming stats, so a completed-match count
   * is never available on this surface. That is safe for the badge: it can only
   * withhold the Rookie tier, and every other tier is level gated, so an account
   * above Level 0 still shows its correct badge here. A Level 0 account shows
   * the neutral unearned state, which is also what it would show with a real
   * count of zero.
   */
  const badge = getBadgeDisplay(progression, getCompletedMatches(undefined));
  const accountStatusLabel = user.status === "ACTIVE" ? "Active" : user.status;

  const handleItemClick = (action: (typeof MENU_ITEMS)[number]["action"]) => {
    if (action === "my-profile") onOpenMyProfile();
    else if (action === "match-history" || action === "leaderboard") {
      /*
        The menu is dismissed FIRST and the navigation happens second. A click
        that leaves the menu must always end with the menu gone, so the order
        here is what guarantees that rather than whatever the navigation does
        next. It also means the Match History and Leaderboard pages are never
        rendered behind a still-open Profile Popup, which would be a second
        copy of the same menu.
      */
      onClose();
      if (action === "match-history") onOpenMatchHistory();
      else onOpenLeaderboard();
    } else if (action === "settings") setSettingsOpen(true);
    else onClose();
  };

  return (
    <div
      ref={popupRef}
      className="profile-popup"
      role="menu"
      aria-label="Profile menu"
      /* A click inside the menu is never a request to dismiss the menu, and
          while My Profile is open it must not reach an ancestor handler. */
      onClick={(event) => event.stopPropagation()}
    >
      <div className="profile-popup-header">
        {/*
          The identity block deliberately shows no email address. The
          permanent Player ID leads because it is the
          one identifier that can never change, the username is the account's
          visible name, and the badge title underneath is the existing
          progression value.
        */}
        <div className="profile-popup-identity">
          <div className="profile-popup-avatar-wrap">
            <AvatarPreview user={user} className="profile-popup-avatar" />
          </div>

          <div className="profile-popup-identity-body">
            <span className="profile-popup-label">Player ID</span>
            <span className="profile-popup-player-row">
              <span className="profile-popup-player" data-field="playerId">
                {user.playerId ?? "—"}
              </span>
              <CopyButton
                value={user.playerId ?? ""}
                label="Copy player ID"
                copiedLabel="Player ID copied"
              />
            </span>

            <span className="profile-popup-username" data-field="username">
              {user.username ?? ""}
            </span>
            <span
              className={`profile-popup-badge profile-popup-badge--${badge.themeKey}`}
              data-field="progressionTitle"
              data-badge={progression.badgeKey}
              data-earned={badge.isEarned ? "true" : "false"}
            >
              {badge.title}
            </span>
          </div>
        </div>

        {/* The account status stays a compact pill. It is not a second copy of
            the Account Info section, which lives in My Profile. */}
        <p className={`profile-popup-status status-${user.status.toLowerCase()}`}>
          <span className="profile-popup-status-label">Account Status:</span>
          <span className="profile-popup-status-value">
            {accountStatusLabel}
            <span className="profile-popup-status-dot" aria-hidden="true" />
          </span>
        </p>
      </div>

      <nav className="profile-popup-nav">
        {MENU_ITEMS.map((item) => {
          const Icon = item.Icon;
          return (
            <button
              key={item.key}
              type="button"
              className="profile-popup-item"
              role="menuitem"
              onClick={() => handleItemClick(item.action)}
            >
              <span className="profile-popup-icon" aria-hidden="true"><Icon /></span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="profile-popup-footer">
        <button
          type="button"
          className="profile-popup-item logout"
          role="menuitem"
          onClick={() => void onLogout()}
          disabled={isLoggingOut}
        >
          <span className="profile-popup-icon" aria-hidden="true"><LogoutIcon /></span>
          <span>{isLoggingOut ? "Logging out…" : "Logout"}</span>
        </button>
      </div>

      {/*
        Settings is a modal layer portaled above this menu, not an expansion
        of it. The popup stays mounted underneath, which is what makes the
        modal's close a back action that returns to this menu.
      */}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

export default ProfilePopupModal;