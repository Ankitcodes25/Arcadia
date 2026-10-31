/*
 * Server-side login account resolution (frontend side of the hand-off).
 *
 * The frontend NEVER compares credentials. On login it relays the submitted
 * email + password ONCE to the backend's admin login resolver, which decides —
 * server-side — whether the attempt belongs to the single admin account or to
 * a player, and answers with an explicit accountType (or a failure). This
 * module just relays that decision and maps backend outcomes to a routing
 * intent the shared login modal can act on:
 *
 *   "admin"   → the admin session cookie was set; mount the Admin Portal only.
 *   "player"  → not the admin account; continue the existing player login flow.
 *   "failed"  → stop and show the normal login error in the modal. This is what
 *               a wrong admin password (401) produces — a failed admin login is
 *               NEVER retried as a player login.
 *
 * No admin credential, hash or session value is handled or persisted here; the
 * session itself lives only in the backend's HTTP-only admin cookie.
 */

import { adminApi, AdminApiError } from "../Admin_Panel/services/adminAuthService";

export type LoginResolution =
  | { kind: "admin" }
  | { kind: "player" }
  | { kind: "failed"; message: string };

const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password.";
const RATE_LIMIT_MESSAGE = "Too many login attempts. Please try again later.";
const RESOLUTION_ERROR_MESSAGE = "Unable to verify your account right now. Please try again.";

/**
 * Asks the backend's admin login resolver which kind of account this login attempt
 * belongs to. The account type is only ever reported by the server, after it
 * has resolved the credentials — never inferred in the browser.
 */
export async function resolveLoginAccount(
  email: string,
  password: string,
): Promise<LoginResolution> {
  try {
    const result = await adminApi.login(email, password);

    if (result.accountType === "admin") {
      return { kind: "admin" };
    }

    if (result.accountType === "player") {
      return { kind: "player" };
    }

    return { kind: "failed", message: RESOLUTION_ERROR_MESSAGE };
  } catch (error) {
    if (error instanceof AdminApiError) {
      // 401 = the admin account with a wrong password. This is a definitive
      // auth failure: show the error and do NOT fall through to player login.
      // (This is the one case that must never be treated as a player login.)
      if (error.status === 401) {
        return { kind: "failed", message: INVALID_CREDENTIALS_MESSAGE };
      }
      // 429 = the resolver is rate limiting this account/IP: stop so we don't
      // keep hammering it.
      if (error.status === 429) {
        return { kind: "failed", message: RATE_LIMIT_MESSAGE };
      }
    }

    // A player login is allowed only after an explicit server-side account
    // resolution. A network/configuration failure must never route admin
    // credentials to the player authentication handler.
    return { kind: "failed", message: RESOLUTION_ERROR_MESSAGE };
  }
}
