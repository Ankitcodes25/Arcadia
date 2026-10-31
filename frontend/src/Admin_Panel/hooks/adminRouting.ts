/*
 * Admin Panel internal routing.
 *
 * The Arcadia frontend has no router library — App.tsx routes by pathname via
 * the custom History-API helpers in src/lib/navigation.ts. The admin panel
 * reuses those same helpers (single source of truth for SPA navigation) and
 * maps /admin/* paths to page keys with this module.
 */

import { useEffect, useState } from "react";
import { onNavigation } from "../../lib/navigation";
import type { AdminPageKey } from "../types/adminTypes";

export const ADMIN_ROOT_PATH = "/admin";

/** Sidebar order is fixed by product spec — this array IS the order. */
export const ADMIN_PAGE_PATHS: ReadonlyArray<{ key: AdminPageKey; path: string }> = [
  { key: "dashboard", path: "/admin/dashboard" },
  { key: "players", path: "/admin/players" },
  { key: "reports", path: "/admin/reports" },
  { key: "support", path: "/admin/support" },
  { key: "games", path: "/admin/games" },
  { key: "moderation", path: "/admin/moderation" },
  { key: "announcements", path: "/admin/announcements" },
  { key: "settings", path: "/admin/settings" },
];

export const ADMIN_PAGE_TITLES: Record<AdminPageKey, string> = {
  dashboard: "Dashboard",
  players: "All Players",
  reports: "Player Reports",
  support: "Help & Support",
  games: "Game Management",
  moderation: "Moderation",
  announcements: "Announcements",
  settings: "Settings",
};

/** True when a pathname belongs to the admin area (used by App.tsx). */
export function isAdminPath(pathname: string): boolean {
  return pathname === ADMIN_ROOT_PATH || pathname.startsWith(`${ADMIN_ROOT_PATH}/`);
}

/** Maps a pathname to a page key; anything unknown resolves to the dashboard. */
export function resolveAdminPageKey(pathname: string): AdminPageKey {
  const match = ADMIN_PAGE_PATHS.find((entry) => pathname.startsWith(entry.path));
  return match ? match.key : "dashboard";
}

export function adminPathForKey(key: AdminPageKey): string {
  const match = ADMIN_PAGE_PATHS.find((entry) => entry.key === key);
  return match ? match.path : "/admin/dashboard";
}

/**
 * Subscribes to SPA navigation and returns the current pathname. Mirrors how
 * AppContent tracks the player-app path.
 */
export function useAdminPathname(): string {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => onNavigation(() => setPathname(window.location.pathname)), []);

  return pathname;
}
