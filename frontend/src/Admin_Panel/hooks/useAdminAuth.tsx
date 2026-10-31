/*
 * Admin authentication context.
 *
 * Connects ONLY to the backend's /api/admin/auth routes (see services/adminAuthService).
 * The session itself lives in an HTTP-only cookie — this context holds just
 * the safe identity returned by the backend, in memory, and never persists a
 * token anywhere in web storage.
 *
 * Bootstrap on mount calls GET /me so a page refresh keeps the session: the
 * cookie is sent automatically, and a 401 simply means "not signed in".
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { adminApi } from "../services/adminAuthService";
import type { AdminIdentity, AdminSessionStatus } from "../types/adminTypes";

interface AdminAuthContextValue {
  status: AdminSessionStatus;
  admin: AdminIdentity | null;
  /** Set while a logout request is in flight. */
  isSubmitting: boolean;
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AdminSessionStatus>("loading");
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Guards against a stale bootstrap response overwriting a newer logout state.
  const bootstrapGeneration = useRef(0);

  useEffect(() => {
    const generation = ++bootstrapGeneration.current;
    let cancelled = false;

    adminApi
      .me()
      .then((response) => {
        if (cancelled || generation !== bootstrapGeneration.current) return;
        setAdmin(response.admin);
        setStatus("authenticated");
      })
      .catch(() => {
        if (cancelled || generation !== bootstrapGeneration.current) return;
        // Any failure (401, network) means: treat as signed out. Login itself
        // happens in the shared Arcadia login modal, which reports connectivity
        // problems on the next attempt.
        setAdmin(null);
        setStatus("unauthenticated");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    setIsSubmitting(true);
    try {
      await adminApi.logout();
    } catch {
      // Even if the network call fails, drop the local session state — the
      // cookie may still exist but /me will gate access on the next load.
    } finally {
      bootstrapGeneration.current += 1;
      setAdmin(null);
      setStatus("unauthenticated");
      setIsSubmitting(false);
    }
  }, []);

  const value = useMemo<AdminAuthContextValue>(
    () => ({ status, admin, isSubmitting, logout }),
    [status, admin, isSubmitting, logout],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthContextValue {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error("useAdminAuth must be used within an AdminAuthProvider");
  }
  return context;
}
