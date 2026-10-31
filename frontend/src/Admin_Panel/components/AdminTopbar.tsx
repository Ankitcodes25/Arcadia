/*
 * Fixed top navbar for the Admin Panel: page title, admin identity with the
 * Super Admin label, and logout. The menu button appears on tablet/mobile to
 * open the sidebar drawer. No notification control is rendered — it is
 * deliberately omitted until there is a meaningful implementation.
 */

import { LogOut, Menu } from "lucide-react";
import { getInitials } from "../utils/formatters";

interface AdminTopbarProps {
  pageTitle: string;
  adminUsername: string;
  adminDisplayName: string;
  isSubmitting: boolean;
  onOpenMenu: () => void;
  onLogout: () => void;
}

function AdminTopbar({
  pageTitle,
  adminUsername,
  adminDisplayName,
  isSubmitting,
  onOpenMenu,
  onLogout,
}: AdminTopbarProps) {
  return (
    <header className="adm-topbar">
      <div className="adm-topbar__left">
        <button type="button" className="adm-topbar__menu-btn" aria-label="Open menu" onClick={onOpenMenu}>
          <Menu size={20} />
        </button>
        <div className="adm-topbar__titles">
          <span className="adm-topbar__crumb">Admin</span>
          <h1 className="adm-topbar__title">{pageTitle}</h1>
        </div>
      </div>

      <div className="adm-topbar__right">
        <div className="adm-topbar__identity">
          <span className="adm-avatar adm-avatar--initials" aria-hidden="true">
            {getInitials(adminDisplayName || adminUsername)}
          </span>
          <div className="adm-topbar__identity-text">
            <span className="adm-topbar__identity-name">{adminDisplayName || adminUsername}</span>
            <span className="adm-topbar__identity-role">Super Admin</span>
          </div>
        </div>
        <button
          type="button"
          className="adm-btn adm-btn--danger adm-btn--sm adm-topbar__logout"
          onClick={onLogout}
          disabled={isSubmitting}
        >
          <LogOut size={14} />
          <span>Logout</span>
        </button>
      </div>
    </header>
  );
}

export default AdminTopbar;
