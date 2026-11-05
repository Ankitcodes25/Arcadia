/*
 * Admin shell: fixed sidebar + fixed topbar + scrollable content area.
 * The content offset accounts for both fixed elements so nothing overlaps.
 */

import { useEffect, useState, type ReactNode } from "react";
import AdminSidebar from "./AdminSidebar";
import AdminTopbar from "./AdminTopbar";
import { ADMIN_PAGE_TITLES } from "../hooks/adminRouting";
import type { AdminPageKey } from "../types/adminTypes";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { usePanelPreferences } from "../hooks/panelPreferences";
import { navigateTo, requestLoginOnNextMount } from "../../lib/navigation";
import { acquireModalScrollLock } from "../../auth/modalScrollLock";
import "./AdminLayout.css";
import "./Adminchrome.css"; // look of sidebar, topbar and modal; must stay after AdminLayout.css

interface AdminLayoutProps {
  activePage: AdminPageKey;
  children: ReactNode;
}

function AdminLayout({ activePage, children }: AdminLayoutProps) {
  const { admin, isSubmitting, logout } = useAdminAuth();
  const { compactTables } = usePanelPreferences();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  /*
   * The mobile sidebar is an overlay drawer. It holds the same shared lock as
   * every other modal layer, and closes itself if the viewport grows past the
   * drawer breakpoint so a resize can never leave the document locked.
   */
  useEffect(() => {
    if (!isDrawerOpen) return;

    const release = acquireModalScrollLock();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsDrawerOpen(false);
    };
    const onResize = () => {
      if (window.innerWidth > 960) setIsDrawerOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      release();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [isDrawerOpen]);

  const handleLogout = async () => {
    await logout();
    // No admin login page: sign-out lands on the landing page with the shared
    // Arcadia login modal opened (never the player dashboard).
    requestLoginOnNextMount();
    navigateTo("/");
  };

  return (
    <div
      className={
        compactTables ? "adm-shell adm-shell--compact" : "adm-shell"
      }
    >
      <AdminSidebar
        activePage={activePage}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onNavigate={navigateTo}
      />

      <AdminTopbar
        pageTitle={ADMIN_PAGE_TITLES[activePage]}
        adminUsername={admin?.username ?? ""}
        adminDisplayName={admin?.displayName ?? ""}
        isSubmitting={isSubmitting}
        onOpenMenu={() => setIsDrawerOpen(true)}
        onLogout={handleLogout}
      />

      <main className="adm-content">{children}</main>
    </div>
  );
}

export default AdminLayout;