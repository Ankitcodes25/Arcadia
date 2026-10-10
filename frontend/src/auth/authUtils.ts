import { AuthApiError } from "./authApi";
import type { AuthErrorKind, AuthMode, AuthUser } from "./authTypes";

const AUTH_KEYS = ["oauth_code", "oauth_error", "reset_token"] as const;
type AuthKey = (typeof AUTH_KEYS)[number];

export function getAuthErrorMessage(error: unknown, fallback: string) {
  if (error instanceof AuthApiError && error.message.trim()) return error.message;
  return fallback;
}

/**
 * An OAuth notice is rendered in exactly one place: inside the auth modal while
 * it is open, and as the global notice once the modal is closed. Showing both
 * at the same time would duplicate the same warning on screen.
 */
export function shouldShowGlobalAuthNotice({
  authError,
  authErrorKind,
  authMode,
}: {
  authError: string | null;
  authErrorKind: AuthErrorKind | null;
  authMode: AuthMode | null;
}) {
  return authErrorKind === "oauth" && Boolean(authError) && !authMode;
}

export function getInitials(user: AuthUser | null) {
  if (!user) return "A";
  const source = user.displayName?.trim()
    || user.username?.trim()
    || (typeof user.name === "string" ? user.name.trim() : "")
    || (typeof user.email === "string" ? user.email : "");
  if (!source) return "A";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export { getOAuthErrorMessage } from "./oauthErrorMessages.js";

function readAuthParams(url: URL) {
  const fragment = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  const values: Partial<Record<AuthKey, string>> = {};
  let ambiguous = false;

  for (const key of AUTH_KEYS) {
    const queryValue = url.searchParams.get(key);
    const fragmentValue = fragment.get(key);
    if (queryValue !== null && fragmentValue !== null && queryValue !== fragmentValue) {
      ambiguous = true;
    }
    const value = fragmentValue ?? queryValue;
    if (value !== null) values[key] = value;
  }

  return { values, fragment, ambiguous };
}

export function consumeAuthQuery() {
  const url = new URL(window.location.href);
  const { values, fragment, ambiguous } = readAuthParams(url);
  const hasAuthParameter = AUTH_KEYS.some((key) => url.searchParams.has(key) || fragment.has(key));

  if (hasAuthParameter) {
    for (const key of AUTH_KEYS) {
      url.searchParams.delete(key);
      fragment.delete(key);
    }
    const remainingFragment = fragment.toString();
    const nextUrl = `${url.pathname}${url.search}${remainingFragment ? `#${remainingFragment}` : ""}`;
    window.history.replaceState({}, document.title, nextUrl);
  }

  return {
    code: values.oauth_code || null,
    error: values.oauth_error || null,
    resetToken: values.reset_token || null,
    ambiguous,
  };
}
