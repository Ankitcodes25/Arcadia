/*
 * Admin API client for the Admin Panel sign-in routes (/api/admin/auth/*).
 *
 * The admin auth routes live on the main Arcadia backend, so this client uses
 * the same origin (VITE_API_URL) and request-verification header
 * (X-Arcadia-Request) as the player authApi, but its own session: the
 * HTTP-only admin cookie, never the player access token. It never touches
 * localStorage or sessionStorage.
 */

import { getApiBaseUrl } from "../../auth/authApi";
import type { AdminIdentity } from "../types/adminTypes";

const REQUEST_TIMEOUT_MS = 15000;

export class AdminApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
  }
}

/** The backend origin (VITE_API_URL; http://localhost:4000 in development). */
export function getAdminApiBaseUrl(): string {
  try {
    return getApiBaseUrl();
  } catch {
    // Fail closed: never silently call an unintended origin.
    throw new AdminApiError("API URL is misconfigured", 0);
  }
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
        // Required by the backend's CSRF check on cookie-authenticated writes.
        "X-Arcadia-Request": "1",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      // The HTTP-only admin session cookie travels with every call.
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    throw new AdminApiError("Could not reach the Arcadia server", 0);
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
