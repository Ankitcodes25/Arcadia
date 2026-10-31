/*
 * Fixed left sidebar for the Admin Panel.
 *
 * Product spec fixes the section order — ADMIN_PAGE_PATHS in
 * hooks/adminRouting.ts is the single source of truth and renders in order.
 * On tablet/mobile the sidebar becomes an overlay drawer toggled by the
 * topbar's menu button (AdminLayout owns the open state).
 */

import { LayoutDashboard, Users, Flag, LifeBuoy, Gamepad2, Shield, Megaphone, Settings, X } from "lucide-react";
import type { ComponentType } from "react";
import { ADMIN_PAGE_PATHS, ADMIN_PAGE_TITLES } from "../hooks/adminRouting";
import type { AdminPageKey } from "../types/adminTypes";
import ArcadianLogo from "../../assets/Arcadianlogo.png";

const PAGE_ICONS: Record<AdminPageKey, ComponentType<{ size?: number; strokeWidth?: number }>> = {
  dashboard: LayoutDashboard,
  players: Users,
  reports: Flag,
  support: LifeBuoy,
  games: Gamepad2,
  moderation: Shield,
  announcements: Megaphone,
  settings: Settings,
};

interface AdminSidebarProps {
  activePage: AdminPageKey;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (path: string) => void;
}

function AdminSidebar({ activePage, isOpen, onClose, onNavigate }: AdminSidebarProps) {
  return (
    <>
      {/* Backdrop closes the mobile drawer. */}
      {isOpen ? <div className="adm-sidebar__backdrop" onClick={onClose} aria-hidden="true" /> : null}

      <nav className={`adm-sidebar${isOpen ? " adm-sidebar--open" : ""}`} aria-label="Admin navigation">
        <div className="adm-sidebar__brand">
          <img src={ArcadianLogo} alt="" className="adm-sidebar__logo" />
          <div className="adm-sidebar__brand-text">
            <span className="adm-sidebar__brand-name">ARCADIA</span>
            <span className="adm-sidebar__brand-sub">Admin Console</span>
          </div>
          <button type="button" className="adm-sidebar__close" aria-label="Close menu" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <ul className="adm-sidebar__nav">
          {ADMIN_PAGE_PATHS.map((entry) => {
            const Icon = PAGE_ICONS[entry.key];
            const isActive = entry.key === activePage;
            return (
              <li key={entry.key}>
                <button
                  type="button"
                  className={`adm-sidebar__item${isActive ? " adm-sidebar__item--active" : ""}`}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => {
                    onNavigate(entry.path);
                    onClose();
                  }}
                >
                  <Icon size={17} strokeWidth={2} />
                  <span>{ADMIN_PAGE_TITLES[entry.key]}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="adm-sidebar__footer">
          <span>Arcadia Admin Panel</span>
          <span>Preview build</span>
        </div>
      </nav>
    </>
  );
}

export default AdminSidebar;
