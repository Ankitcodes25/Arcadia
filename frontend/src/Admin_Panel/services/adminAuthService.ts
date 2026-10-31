/*
 * Admin API client for the separate Admin Backend.
 *
 * This is the ONLY module in the Admin Panel that talks to the admin backend.
 * It mirrors the player-side authApi conventions: JSON in/out, credentials
 * included for the HTTP-only cookie, a custom header for the backend's request
 * verification, an abort timeout, and generic safe error messages.
 *
 * The session token lives exclusively in the HTTP-only cookie set by the
 * admin backend — this client never touches localStorage or sessionStorage.
 */

import type { AdminIdentity } from "../types/adminTypes";

const DEV_FALLBACK_BASE_URL = "http://localhost:4100";
const REQUEST_TIMEOUT_MS = 15000;

export class AdminApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
  }
}

/**
 * Base URL resolution. In development the admin backend runs on port 4100 by
 * default; production builds must set VITE_ADMIN_API_URL to the deployed
 * admin backend origin.
 */
export function getAdminApiBaseUrl(): string {
  const configured = import.meta.env.VITE_ADMIN_API_URL?.trim();

  if (configured) {
    let parsed: URL;
    try {
      parsed = new URL(configured);
    } catch {
      throw new AdminApiError("Admin API URL is misconfigured", 0);
    }
    if (parsed.protocol !== "https:" && import.meta.env.PROD) {
      throw new AdminApiError("Admin API URL must use HTTPS in production", 0);
    }
    return configured.replace(/\/+$/, "");
  }

  if (import.meta.env.PROD) {
    // Fail closed in production: never silently call an unintended origin.
    throw new AdminApiError("Admin API URL is not configured", 0);
  }

  return DEV_FALLBACK_BASE_URL;
}

interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
}

/**
 * Shared request wrapper. Throws AdminApiError with a safe message; the raw
 * response body is only used for known `{ error }` shapes from the backend.
 */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body } = options;
  const baseUrl = getAdminApiBaseUrl();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        // Required by the admin backend's request-verification layer on writes.
        "X-Admin-Request": "1",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      // The HTTP-only admin session cookie travels with every call.
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    throw new AdminApiError("Could not reach the admin service", 0);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let message = "Request failed";
    try {
      const payload: unknown = await response.json();
      if (
        payload
        && typeof payload === "object"
        && "error" in payload
        && typeof (payload as { error: unknown }).error === "string"
      ) {
        message = (payload as { error: string }).error;
      }
    } catch {
      // Non-JSON error body: keep the generic message.
    }
    throw new AdminApiError(message, response.status);
  }

  return (await response.json()) as T;
}

/* ---- Auth endpoints (the only backend-connected feature today) ----------- */

/**
 * The login resolver's response. It reports the explicit account type decided
 * server-side: "admin" only after the admin credentials verified (plus the safe
 * identity, with the session in the cookie), or "player" as a pure routing
 * signal meaning "this is not the admin account — continue the player flow".
 */
interface LoginResponse {
  accountType: "admin" | "player";
  admin?: AdminIdentity;
}

interface MeResponse {
  admin: AdminIdentity;
}

interface LogoutResponse {
  success: boolean;
}

export const adminApi = {
  /**
   * POST /api/admin/auth/login — the server-side login resolver.
   * On an admin account it sets the HTTP-only session cookie and returns
   * `accountType: "admin"`; on any other email it returns
   * `accountType: "player"` with no session.
   */
  login(email: string, password: string): Promise<LoginResponse> {
    return request<LoginResponse>("/api/admin/auth/login", {
      method: "POST",
      body: { email, password },
    });
  },

  /** GET /api/admin/auth/me — verifies the cookie session (used on refresh). */
  me(): Promise<MeResponse> {
    return request<MeResponse>("/api/admin/auth/me");
  },

  /** POST /api/admin/auth/logout — clears cookie + revokes the session. */
  logout(): Promise<LogoutResponse> {
    return request<LogoutResponse>("/api/admin/auth/logout", { method: "POST" });
  },
};
