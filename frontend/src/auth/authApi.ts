import type {
  AccountProfileResponse,
  AccountPreferencesResponse,
  AccountPreferencesUpdate,
  AccountSessionsResponse,
  AccountSettingsResponse,
  AuthMessageResponse,
  AuthResponse,
  AuthUser,
  MatchHistoryFilters,
  MatchHistoryResponse,
  LevelBadgeKey,
  LevelThemeKey,
  LoginValues,
  LogoutOtherSessionsResponse,
  ProfileUpdate,
  PublicPlayerProfileResponse,
  RegisterValues,
  RevokeSessionResponse,
  UsernameAvailabilityResponse,
} from "./authTypes";

function getApiBaseUrl() {
  const configured = import.meta.env.VITE_API_URL?.trim();
  if (!configured && import.meta.env.PROD) {
    throw new Error("VITE_API_URL must be configured for a production frontend build");
  }

  const value = configured || "http://localhost:4000";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("VITE_API_URL must be an absolute HTTP(S) URL");
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("VITE_API_URL must be an absolute HTTP(S) origin");
  }
  if (import.meta.env.PROD && url.protocol !== "https:") {
    throw new Error("VITE_API_URL must use HTTPS in production");
  }

  return value.replace(/\/+$/, "");
}

const API_BASE_URL = getApiBaseUrl();
const googleAuthFlag = import.meta.env.VITE_GOOGLE_AUTH_ENABLED?.trim().toLowerCase();
export const isGoogleAuthEnabled = googleAuthFlag === 'true'
  || (import.meta.env.DEV && googleAuthFlag !== 'false');
const REQUEST_TIMEOUT_MS = 15_000;

let accessToken: string | null = null;
let refreshHandler: (() => Promise<boolean>) | null = null;
let refreshPromise: Promise<boolean> | null = null;

type RequestOptions = {
  skipAuth?: boolean;
  skipAuthRefresh?: boolean;
  retryOnUnauthorized?: boolean;
  credentials?: RequestCredentials;
  timeoutMs?: number;
};

type RequestInput = Omit<RequestInit, "body"> & {
  body?: BodyInit | Record<string, unknown>;
};

export class AuthApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthApiError";
    this.status = status;
  }
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function setRefreshHandler(handler: (() => Promise<boolean>) | null) {
  refreshHandler = handler;
}

async function refreshOnce() {
  if (!refreshHandler) return false;
  if (!refreshPromise) {
    refreshPromise = Promise.resolve(refreshHandler())
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

const BADGE_KEYS: readonly LevelBadgeKey[] = [
  "bronze",
  "silver",
  "gold",
  "diamond",
  "crown",
  "flame",
];

/* The six tier themes, matching the backend tier table. `unearned` is not a
   tier: it is the neutral treatment used to show a tier that is not yet earned,
   so it is accepted on the wire but never chosen here. */
const THEME_KEYS: readonly LevelThemeKey[] = [
  "bronze",
  "silver",
  "gold",
  "diamond",
  "crown",
  "flame",
];

/**
 * Progression is read-only, backend-derived data. It is validated rather than
 * trusted so a malformed payload is rejected instead of being rendered, and it
 * is never accepted back from the client on a write.
 */
function isProgression(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return Number.isFinite(value.totalXp)
    && Number.isFinite(value.level)
    && Number.isInteger(value.level)
    && (value.level as number) >= 0
    && Number.isFinite(value.currentLevelXp)
    && Number.isFinite(value.nextLevelXp)
    && Number.isFinite(value.progressPercent)
    && (value.progressPercent as number) >= 0
    && (value.progressPercent as number) <= 100
    && typeof value.title === "string"
    && BADGE_KEYS.includes(value.badgeKey as LevelBadgeKey)
    && THEME_KEYS.includes(value.themeKey as LevelThemeKey);
}

function isAuthUser(value: unknown): value is AuthUser {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.email === "string"
    && typeof value.name === "string"
    && (value.role === "USER" || value.role === "ADMIN")
    && ["ACTIVE", "SUSPENDED", "DELETED"].includes(String(value.status))
    && (value.authProvider === "PASSWORD" || value.authProvider === "GOOGLE")
    && isRecord(value.avatar)
    && (value.avatar.type === "local" || value.avatar.type === "google")
    && typeof value.avatar.value === "string"
    && (value.playerId === null || typeof value.playerId === "string")
    && isProgression(value.progression);
}

function isAuthResponse(value: unknown): value is AuthResponse {
  return isRecord(value) && typeof value.token === "string" && isAuthUser(value.user);
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (isRecord(payload) && typeof payload.error === "string" && payload.error.trim()) {
    return payload.error;
  }
  return fallback;
}

function combineAbortSignals(controller: AbortController, externalSignal?: AbortSignal | null) {
  if (!externalSignal) return () => {};
  if (externalSignal.aborted) {
    controller.abort(externalSignal.reason);
    return () => {};
  }
  const abort = () => controller.abort(externalSignal.reason);
  externalSignal.addEventListener("abort", abort, { once: true });
  return () => externalSignal.removeEventListener("abort", abort);
}

async function request<T>(
  path: string,
  input: RequestInput = {},
  options: RequestOptions = {},
): Promise<T> {
  const headers = new Headers(input.headers);
  let body = input.body;
  const method = (input.method || "GET").toUpperCase();

  if (body !== undefined && body !== null && typeof body !== "string") {
    headers.set("content-type", "application/json");
    body = JSON.stringify(body);
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    headers.set("X-Arcadia-Request", "1");
  }
  if (accessToken && !options.skipAuth) {
    headers.set("authorization", `Bearer ${accessToken}`);
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(new DOMException("Request timed out", "TimeoutError")),
    options.timeoutMs || REQUEST_TIMEOUT_MS,
  );
  const removeExternalAbort = combineAbortSignals(controller, input.signal);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...input,
      body,
      headers,
      cache: "no-store",
      credentials: options.credentials || "omit",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new AuthApiError("The authentication service took too long to respond. Please try again.", 0);
    }
    throw new AuthApiError("Unable to reach the authentication service. Please try again.", 0);
  } finally {
    window.clearTimeout(timeout);
    removeExternalAbort();
  }

  const payload = await parseResponse<unknown>(response);
  if (
    response.status === 401
    && !options.skipAuth
    && !options.skipAuthRefresh
    && options.retryOnUnauthorized !== false
  ) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      return request<T>(path, input, {
        ...options,
        retryOnUnauthorized: false,
      });
    }
  }

  if (!response.ok) {
    throw new AuthApiError(
      getErrorMessage(payload, "Unable to complete the authentication request."),
      response.status,
    );
  }

  if (path.endsWith("/refresh") || path.endsWith("/login") || path.endsWith("/register") || path.endsWith("/google/exchange")) {
    if (!isAuthResponse(payload)) {
      throw new AuthApiError("The authentication service returned an invalid response.", response.status);
    }
    return payload as T;
  }

  if (path.endsWith("/sessions") && response.ok) {
    if (!isRecord(payload) || !Array.isArray(payload.sessions)) {
      throw new AuthApiError("The authentication service returned an invalid session response.", response.status);
    }
  }

  return payload as T;
}

export const authApi = {
  register(values: RegisterValues) {
    return request<AuthResponse>(
      "/api/v1/auth/register",
      { method: "POST", body: values },
      { skipAuth: true, skipAuthRefresh: true, credentials: "include" },
    );
  },

  login(values: LoginValues) {
    return request<AuthResponse>(
      "/api/v1/auth/login",
      { method: "POST", body: values },
      { skipAuth: true, skipAuthRefresh: true, credentials: "include" },
    );
  },

  me() {
    return request<AuthUser>("/api/v1/auth/me", {}, { credentials: "omit" });
  },

  refresh() {
    return request<AuthResponse>(
      "/api/v1/auth/refresh",
      { method: "POST" },
      { skipAuth: true, skipAuthRefresh: true, credentials: "include" },
    );
  },

  logout() {
    return request<AuthMessageResponse>(
      "/api/v1/auth/logout",
      { method: "POST" },
      { skipAuth: true, skipAuthRefresh: true, credentials: "include" },
    );
  },

  logoutAll() {
    return request<AuthMessageResponse>(
      "/api/v1/auth/logout-all",
      { method: "POST" },
      { skipAuthRefresh: true, credentials: "omit" },
    );
  },

  forgotPassword(email: string) {
    return request<AuthMessageResponse>(
      "/api/v1/auth/forgot-password",
      { method: "POST", body: { email } },
      { skipAuth: true, skipAuthRefresh: true, credentials: "omit" },
    );
  },

  resetPassword(values: { token: string; password: string }) {
    return request<AuthMessageResponse>(
      "/api/v1/auth/reset-password",
      { method: "POST", body: values },
      { skipAuth: true, skipAuthRefresh: true, credentials: "include" },
    );
  },

  getProfile() {
    return request<AccountProfileResponse>(
      "/api/v1/account/profile",
      {},
      { credentials: "omit" },
    );
  },

  getPublicPlayerProfile(identifier: { playerId: string } | { username: string }) {
    const query = new URLSearchParams();
    if ("playerId" in identifier) query.set("playerId", identifier.playerId);
    else query.set("username", identifier.username);

    return request<PublicPlayerProfileResponse>(
      `/api/v1/players/profile?${query.toString()}`,
      {},
      { credentials: "omit" },
    );
  },

  getSettings() {
    return request<AccountSettingsResponse>(
      "/api/v1/account/settings",
      {},
      { credentials: "omit" },
    );
  },

  /*
   * Account preferences (sound + privacy). Every response is the stored set
   * the backend confirmed, so the Settings modal only ever renders persisted
   * values. Writes send only the changed keys and the backend validates and
   * applies them together.
   */
  getPreferences() {
    return request<AccountPreferencesResponse>(
      "/api/v1/account/preferences",
      {},
      { credentials: "omit" },
    );
  },

  updatePreferences(changes: AccountPreferencesUpdate) {
    const body: Record<string, unknown> = {};
    if (changes.soundEffects !== undefined) body.soundEffects = changes.soundEffects;
    if (changes.soundVolume !== undefined) body.soundVolume = changes.soundVolume;
    if (changes.profileVisibility !== undefined) body.profileVisibility = changes.profileVisibility;
    if (changes.leaderboardVisibility !== undefined) body.leaderboardVisibility = changes.leaderboardVisibility;

    return request<AccountPreferencesResponse>(
      "/api/v1/account/preferences",
      { method: "PATCH", body },
      { credentials: "omit" },
    );
  },

  resetPreferences() {
    return request<AccountPreferencesResponse>(
      "/api/v1/account/preferences/reset",
      { method: "POST" },
      { credentials: "omit" },
    );
  },

  /*
   * Permanent account deletion. The confirmation word plus the password (for
   * password accounts) are re-verified server-side; the account id is never
   * sent, because it comes from the access token.
   */
  deleteAccount(values: { confirmation: string; password?: string }) {
    return request<AuthMessageResponse>(
      "/api/v1/account",
      { method: "DELETE", body: values },
      { credentials: "omit" },
    );
  },

  checkUsernameAvailability(username: string) {
    return request<UsernameAvailabilityResponse>(
      `/api/v1/account/username-availability?username=${encodeURIComponent(username)}`,
      { method: "GET" },
      { skipAuth: true, skipAuthRefresh: true, credentials: "omit" },
    );
  },

  setUsername(username: string) {
    return request<AccountProfileResponse>(
      "/api/v1/account/username",
      { method: "PATCH", body: { username } },
      { credentials: "omit" },
    );
  },

  /*
   * The one account profile write. Only the fields that were actually changed
   * are sent, and the backend applies them together and returns the persisted
   * profile. XP, level, title and badge are never part of a request body.
   */
  updateProfile(changes: ProfileUpdate) {
    const body: Record<string, unknown> = {};
    if (changes.displayName !== undefined) body.displayName = changes.displayName;
    if (changes.username !== undefined) body.username = changes.username;
    if (changes.avatar !== undefined) body.avatar = changes.avatar;

    return request<AccountProfileResponse>(
      "/api/v1/account/profile",
      { method: "PATCH", body },
      { credentials: "omit" },
    );
  },

  setAvatar(values: { type: "local" | "google"; value?: string }) {
    return request<AccountProfileResponse>(
      "/api/v1/account/avatar",
      { method: "PATCH", body: values },
      { credentials: "omit" },
    );
  },

  changePassword(values: { currentPassword: string; newPassword: string }) {
    return request<AuthMessageResponse>(
      "/api/v1/account/change-password",
      { method: "POST", body: values },
      { credentials: "include" },
    );
  },

  /*
   * The signed-in account's own completed matches.
   *
   * GET only. There is deliberately no method here that creates a match, because
   * the backend exposes no such route: a client cannot report its own result,
   * opponent or timestamp. The account is taken from the access token, so this
   * always reads the caller's own history and nobody else's.
   */
  getMatchHistory(filters: MatchHistoryFilters = {}) {
    const query = new URLSearchParams();
    if (filters.from) query.set("from", filters.from);
    if (filters.to) query.set("to", filters.to);
    if (filters.opponentType && filters.opponentType !== "ALL") {
      query.set("opponentType", filters.opponentType);
    }
    if (filters.result && filters.result !== "ALL") {
      query.set("result", filters.result);
    }
    if (typeof filters.tzOffsetMinutes === "number") {
      query.set("tzOffsetMinutes", String(filters.tzOffsetMinutes));
    }
    if (typeof filters.limit === "number") {
      query.set("limit", String(filters.limit));
    }
    if (typeof filters.offset === "number") {
      query.set("offset", String(filters.offset));
    }

    const suffix = query.toString() ? `?${query.toString()}` : "";
    return request<MatchHistoryResponse>(
      `/api/v1/account/matches${suffix}`,
      {},
      { credentials: "omit" },
    );
  },

  listSessions() {
    return request<AccountSessionsResponse>(
      "/api/v1/account/sessions",
      {},
      { credentials: "include" },
    );
  },

  revokeSession(sessionId: string) {
    return request<RevokeSessionResponse>(
      `/api/v1/account/sessions/${encodeURIComponent(sessionId)}`,
      { method: "DELETE" },
      { credentials: "include" },
    );
  },

  logoutOtherSessions() {
    return request<LogoutOtherSessionsResponse>(
      "/api/v1/account/sessions/logout-others",
      { method: "POST" },
      { credentials: "include" },
    );
  },

  startGoogleLogin() {
    window.location.assign(`${API_BASE_URL}/api/v1/auth/google`);
  },

  exchangeGoogleCode(code: string) {
    return request<AuthResponse>(
      "/api/v1/auth/google/exchange",
      { method: "POST", body: { code } },
      { skipAuth: true, skipAuthRefresh: true, credentials: "omit" },
    );
  },
};
