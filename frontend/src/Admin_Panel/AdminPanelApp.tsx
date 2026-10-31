/*
 * Admin Panel root: session bootstrap, route protection and page dispatch.
 *
 * Behaviour (see product spec):
 *   - successful admin login (in the shared Arcadia login modal) → lands on
 *     /admin/dashboard and mounts only this portal
 *   - refresh → session restored via the HTTP-only cookie + GET /me
 *   - /admin while logged out, or any unauthenticated deep link → redirected
 *     to the landing page with the ONE existing Arcadia login modal opened
 *   - logout → session cleared, back to the landing page + shared login modal
 *
 * There is deliberately no admin login page: the single login/signup modal
 * serves players and the admin alike, and the server reports which account type
 * the attempt belongs to. The player authentication system is untouched: this
 * tree talks only to the separate Admin Backend, and a player session grants
 * nothing here.
 */

import { useEffect } from "react";
import { AdminAuthProvider, useAdminAuth } from "./hooks/useAdminAuth";
import {
  ADMIN_PAGE_PATHS,
  resolveAdminPageKey,
  useAdminPathname,
} from "./hooks/adminRouting";
import { navigateTo, requestLoginOnNextMount } from "../lib/navigation";
import DashboardPage from "./pages/DashboardPage";
import PlayersPage from "./pages/PlayersPage";
import ReportsPage from "./pages/ReportsPage";
import SupportPage from "./pages/SupportPage";
import GameManagementPage from "./pages/GameManagementPage";
import ModerationPage from "./pages/ModerationPage";
import AnnouncementsPage from "./pages/AnnouncementsPage";
import SettingsPage from "./pages/SettingsPage";
import "./styles/adminTheme.css";
import "./AdminPanel.css";

/** Full-screen splash while the session is being verified against /me. */
function AdminLoading() {
  return (
    <div className="adm-loading" aria-live="polite" aria-busy="true">
      <div className="adm-loading__mark" aria-hidden="true" />
      <p>Verifying admin session…</p>
    </div>
  );
}

function AdminRoutes() {
  const { status } = useAdminAuth();
  const pathname = useAdminPathname();

  /*
   * Gate: while the session check runs, hold on the splash. Once signed out
   * there is no admin login page — any admin path leaves the admin tree, lands
   * on the landing page and opens the ONE existing Arcadia login modal (the
   * intent is parked in navigation.ts so the Navbar opens it on mount). Once
   * signed in, the normalizer above owns unknown paths.
   */
  useEffect(() => {
    if (status === "unauthenticated") {
      requestLoginOnNextMount();
      navigateTo("/");
    }
  }, [status]);

  if (status !== "authenticated") {
    // "loading" → splash while /me verifies the cookie; "unauthenticated" → the
    // effect above is already redirecting, hold the splash for this frame.
    return <AdminLoading />;
  }

  const pageKey = resolveAdminPageKey(pathname);

  switch (pageKey) {
    case "players":
      return <PlayersPage />;
    case "reports":
      return <ReportsPage />;
    case "support":
      return <SupportPage />;
    case "games":
      return <GameManagementPage />;
    case "moderation":
      return <ModerationPage />;
    case "announcements":
      return <AnnouncementsPage />;
    case "settings":
      return <SettingsPage />;
    case "dashboard":
    default:
      return <DashboardPage />;
  }
}

/** Normalizes /admin and unknown /admin/* paths onto the canonical routes. */
function AdminPathNormalizer() {
  const pathname = useAdminPathname();
  const { status } = useAdminAuth();

  useEffect(() => {
    // While signed out the auth gate owns all redirects (to the landing page +
    // shared login modal), so normalization only runs for an authenticated
    // session.
    if (status !== "authenticated") return;

    const isKnown = ADMIN_PAGE_PATHS.some((entry) => pathname === entry.path);

    if (pathname === "/admin" || !isKnown) {
      navigateTo("/admin/dashboard");
    }
  }, [pathname, status]);

  return null;
}

function AdminPanelApp() {
  return (
    <AdminAuthProvider>
      <div className="adm-root">
        <AdminPathNormalizer />
        <AdminRoutes />
      </div>
    </AdminAuthProvider>
  );
}

export default AdminPanelApp;
