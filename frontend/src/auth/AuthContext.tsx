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
import { AuthApiError, authApi, setAccessToken, setRefreshHandler } from "./authApi";
import {
  consumeAuthQuery,
  getAuthErrorMessage,
  getOAuthErrorMessage,
} from "./authUtils";
import { getOAuthErrorAuthMode } from "./oauthErrorMessages.js";
import type {
  AccountAction,
  AuthErrorKind,
  AuthMode,
  AuthResponse,
  AuthUser,
  LoginValues,
  LogoutOtherSessionsResponse,
  ProfileUpdate,
  ProfileUpdateResult,
  RegisterValues,
  RevokeSessionResponse,
} from "./authTypes";

type LogoutResult = {
  success: boolean;
  message?: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isSubmitting: boolean;
  authError: string | null;
  authErrorKind: AuthErrorKind | null;
  authMode: AuthMode | null;
  accountAction: AccountAction | null;
  /**
   * Raised by a confirmed password change and cleared again when the reader
   * acknowledges it. The change signs every session out server-side, so this
   * flag is what carries the confirmation across that sign-out instead of
   * leaving the reader on a signed-out screen with no explanation.
   */
  passwordChangeSuccess: boolean;
  openAuthMode: (mode: AuthMode) => void;
  closeAuthMode: () => void;
  clearError: () => void;
  dismissAccountAction: () => void;
  dismissPasswordChangeSuccess: () => void;
  updateUser: (user: AuthUser) => void;
  updateProfile: (changes: ProfileUpdate) => Promise<ProfileUpdateResult>;
  login: (values: LoginValues) => Promise<boolean>;
  register: (values: RegisterValues) => Promise<boolean>;
  forgotPassword: (email: string) => Promise<string>;
  submitPasswordReset: (password: string, confirmation: string) => Promise<boolean>;
  changePassword: (
    currentPassword: string,
    newPassword: string,
    confirmation: string,
  ) => Promise<{ success: boolean; message: string }>;
  revokeSession: (sessionId: string) => Promise<RevokeSessionResponse>;
  logoutOtherSessions: () => Promise<LogoutOtherSessionsResponse>;
  /**
   * Permanently deletes the signed-in account. On success local auth is
   * cleared without a signed-out broadcast error, because the account no
   * longer exists anywhere and there is nothing left to sign out of.
   */
  deleteAccount: (values: { confirmation: string; password?: string }) => Promise<LogoutResult>;
  loginWithGoogle: () => void;
  logout: () => Promise<LogoutResult>;
  logoutAll: () => Promise<LogoutResult>;
  refresh: () => Promise<AuthResponse | null>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthProviderProps = {
  children: ReactNode;
};

type AuthBroadcast = { type: "signed-in" | "signed-out" };
type LockManagerLike = {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
};

function isInactiveAccountError(error: unknown) {
  return error instanceof AuthApiError
    && error.status === 403
    && /inactive|suspended/i.test(error.message);
}

function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authErrorKind, setAuthErrorKind] = useState<AuthErrorKind | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [accountAction, setAccountAction] = useState<AccountAction | null>(null);
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState(false);
  const refreshPromiseRef = useRef<Promise<AuthResponse | null> | null>(null);
  const generationRef = useRef(0);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const bootstrapStartedRef = useRef(false);

  const broadcast = useCallback((message: AuthBroadcast) => {
    channelRef.current?.postMessage(message);
  }, []);

  const clearLocalAuth = useCallback((notify = true) => {
    generationRef.current += 1;
    setAccessToken(null);
    setUser(null);
    if (notify) broadcast({ type: "signed-out" });
  }, [broadcast]);

  const applyAuthResponse = useCallback((response: AuthResponse, expectedGeneration?: number) => {
    if (expectedGeneration !== undefined && expectedGeneration !== generationRef.current) {
      return false;
    }
    setAccessToken(response.token);
    setUser(response.user);
    setAuthError(null);
    setAuthErrorKind(null);
    broadcast({ type: "signed-in" });
    return true;
  }, [broadcast]);

  const updateUser = useCallback((nextUser: AuthUser) => {
    if (nextUser.status !== "ACTIVE") {
      clearLocalAuth();
      return;
    }
    setUser(nextUser);
  }, [clearLocalAuth]);

  /*
   * The single account profile write used by My Profile and by Account Settings.
   *
   * The backend persists the change first and returns the stored profile, which
   * is then pushed into the auth state. Because Navbar, the profile popup and
   * My Profile all read that one state, they update from the same persisted
   * values instead of from local component state.
   *
   * A failure resolves with `ok: false`, the server's safe message and the HTTP
   * status, leaving the previous state untouched, so no surface can show an
   * unsaved change. The status is what lets a caller recognise a 409 uniqueness
   * conflict and report it as "already taken" rather than as a generic failure.
   */
  const updateProfile = useCallback(async (
    changes: ProfileUpdate,
  ): Promise<ProfileUpdateResult> => {
    try {
      const response = await authApi.updateProfile(changes);
      updateUser(response.user);
      return { ok: true, message: null, status: null, user: response.user };
    } catch (requestError) {
      return {
        ok: false,
        message: getAuthErrorMessage(
          requestError,
          "Your profile could not be saved. Please try again.",
        ),
        status: requestError instanceof AuthApiError ? requestError.status : null,
        user: null,
      };
    }
  }, [updateUser]);

  const setVisibleError = useCallback((message: string, kind: AuthErrorKind) => {
    setAuthError(message);
    setAuthErrorKind(kind);
  }, []);

  /*
   * The auth modal is opened from here instead of from the Navbar so a
   * `account_exists` OAuth error can bring the modal back after the Google
   * redirect. The modal is never left open behind a successful login because a
   * successful OAuth response runs on a fresh page load.
   */
  const openAuthMode = useCallback((mode: AuthMode) => {
    setAuthError(null);
    setAuthErrorKind(null);
    setAuthMode(mode);
  }, []);

  const closeAuthMode = useCallback(() => {
    setAuthMode(null);
    setAuthError(null);
    setAuthErrorKind(null);
  }, []);

  // Opens the modal first (which clears any stale error) and only then shows the
  // warning, so the notice is rendered inside the modal that is already open.
  const showOAuthError = useCallback((message: string, mode: AuthMode | null) => {
    if (mode) openAuthMode(mode);
    setVisibleError(message, "oauth");
  }, [openAuthMode, setVisibleError]);

  const refresh = useCallback(async () => {
    if (!refreshPromiseRef.current) {
      const generation = generationRef.current;
      const performRefresh = async () => {
        const lockManager = (navigator as Navigator & { locks?: LockManagerLike }).locks;
        const response = lockManager
          ? await lockManager.request("arcadia-auth-refresh", () => authApi.refresh())
          : await authApi.refresh();
        if (generation !== generationRef.current) return null;
        if (!applyAuthResponse(response, generation)) return null;
        return response;
      };

      const promise = performRefresh()
        .catch((error: unknown) => {
          if (generation === generationRef.current && (error instanceof AuthApiError && error.status === 401 || isInactiveAccountError(error))) {
            clearLocalAuth();
            if (isInactiveAccountError(error)) {
              setVisibleError("This account is inactive. Contact support for help.", "form");
            }
          }
          return null;
        })
        .finally(() => {
          refreshPromiseRef.current = null;
        });
      refreshPromiseRef.current = promise;
    }

    return refreshPromiseRef.current;
  }, [applyAuthResponse, clearLocalAuth, setVisibleError]);

  useEffect(() => {
    setRefreshHandler(async () => Boolean(await refresh()));
    return () => setRefreshHandler(null);
  }, [refresh]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return undefined;
    const channel = new BroadcastChannel("arcadia-auth-events");
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent<AuthBroadcast>) => {
      if (event.data?.type === "signed-out") {
        clearLocalAuth(false);
      } else if (event.data?.type === "signed-in") {
        void refresh();
      }
    };
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [clearLocalAuth, refresh]);

  const bootstrap = useCallback(async () => {
    setIsLoading(true);
    const {
      code,
      error,
      resetToken,
      ambiguous,
    } = consumeAuthQuery();

    try {
      if (ambiguous) {
        clearLocalAuth();
        setVisibleError("Multiple account links were provided. Start again from one link.", "form");
      } else if (resetToken) {
        setAccountAction({
          kind: "reset",
          status: "form",
          token: resetToken,
          message: "",
        });
      } else if (code) {
        const response = await authApi.exchangeGoogleCode(code);
        applyAuthResponse(response);
      } else if (error) {
        // A Google error can only be the result of a Google attempt started from
        // the auth modal, so the modal is reopened with the warning inside it.
        showOAuthError(getOAuthErrorMessage(error), getOAuthErrorAuthMode(error));
        await refresh();
      } else {
        await refresh();
      }
    } catch (requestError) {
      if (
        requestError instanceof AuthApiError
        && (requestError.status === 401 || isInactiveAccountError(requestError))
      ) {
        clearLocalAuth();
      }
      showOAuthError(
        getAuthErrorMessage(requestError, "Authentication could not be completed. Please try again."),
        "login",
      );
    } finally {
      setIsLoading(false);
    }
  }, [applyAuthResponse, clearLocalAuth, refresh, setVisibleError, showOAuthError]);

  useEffect(() => {
    if (bootstrapStartedRef.current) return;
    bootstrapStartedRef.current = true;
    void bootstrap();
  }, [bootstrap]);

  const login = useCallback(async (values: LoginValues) => {
    setIsSubmitting(true);
    setAuthError(null);
    setAuthErrorKind(null);
    const generation = generationRef.current;
    try {
      const response = await authApi.login(values);
      return applyAuthResponse(response, generation);
    } catch (requestError) {
      setVisibleError(
        getAuthErrorMessage(requestError, "Unable to log in. Please try again."),
        "form",
      );
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [applyAuthResponse, setVisibleError]);

  const register = useCallback(async (values: RegisterValues) => {
    setIsSubmitting(true);
    setAuthError(null);
    setAuthErrorKind(null);
    const generation = generationRef.current;
    try {
      const response = await authApi.register(values);
      return applyAuthResponse(response, generation);
    } catch (requestError) {
      setVisibleError(
        getAuthErrorMessage(requestError, "Unable to create your account. Please try again."),
        "form",
      );
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [applyAuthResponse, setVisibleError]);

  const forgotPassword = useCallback(async (email: string) => {
    const response = await authApi.forgotPassword(email);
    return response.message;
  }, []);

  const submitPasswordReset = useCallback(async (password: string, confirmation: string) => {
    const currentAction = accountAction;
    if (currentAction?.kind !== "reset") return false;
    if (password !== confirmation) {
      setAccountAction({ ...currentAction, status: "error", message: "Passwords do not match." });
      return false;
    }

    setAccountAction({ ...currentAction, status: "submitting", message: "" });
    try {
      const response = await authApi.resetPassword({
        token: currentAction.token,
        password,
      });
      clearLocalAuth();
      setAuthError(null);
      setAuthErrorKind(null);
      setAccountAction({
        kind: "reset",
        status: "success",
        token: "",
        message: response.message,
      });
      return true;
    } catch (requestError) {
      setAccountAction((current) => current?.kind === "reset"
        ? {
          ...current,
          status: "error",
          message: getAuthErrorMessage(requestError, "Password could not be reset. Please request a new link."),
        }
        : current);
      return false;
    }
  }, [accountAction, clearLocalAuth]);

  const changePassword = useCallback(async (
    currentPassword: string,
    newPassword: string,
    confirmation: string,
  ) => {
    if (newPassword !== confirmation) {
      return { success: false, message: "Passwords do not match." };
    }
    const pendingRefresh = refreshPromiseRef.current;
    if (pendingRefresh) await pendingRefresh;
    const generation = generationRef.current;
    try {
      const response = await authApi.changePassword({ currentPassword, newPassword });
      if (generation === generationRef.current) {
        /*
         * A password change is meant to end every session: the backend bumps
         * the token version, revokes the refresh sessions and clears the
         * refresh cookie in the same response, so nothing is left to sign out
         * of and no second logout request is made here. Local auth goes with
         * them, and the confirmation is raised in the same commit — that is
         * what lets the success dialog still appear once the signed-out
         * surface has replaced Settings.
         */
        clearLocalAuth();
        setPasswordChangeSuccess(true);
      }
      return { success: true, message: response.message };
    } catch (requestError) {
      return {
        success: false,
        message: getAuthErrorMessage(requestError, "Password could not be changed. Please try again."),
      };
    }
  }, [clearLocalAuth]);

  const revokeSession = useCallback(async (sessionId: string) => {
    const response = await authApi.revokeSession(sessionId);
    if (response.current) clearLocalAuth();
    return response;
  }, [clearLocalAuth]);

  const logoutOtherSessions = useCallback(async () => authApi.logoutOtherSessions(), []);

  const loginWithGoogle = useCallback(() => {
    setAuthError(null);
    setAuthErrorKind(null);
    authApi.startGoogleLogin();
  }, []);

  const waitForRefresh = useCallback(async () => {
    const pending = refreshPromiseRef.current;
    if (pending) await pending;
  }, []);

  /*
   * Permanent account deletion.
   *
   * Success clears local auth silently — no error banner, because the account
   * is gone and there is nothing to report — which unmounts every protected
   * surface and lands the browser on the logged-out screen. A failure leaves
   * the session exactly as it was: the account still exists, so signing the
   * user out of a live account would be wrong.
   */
  const deleteAccount = useCallback(async (values: { confirmation: string; password?: string }) => {
    setIsSubmitting(true);
    generationRef.current += 1;
    await waitForRefresh();
    try {
      await authApi.deleteAccount(values);
      clearLocalAuth();
      return { success: true };
    } catch (requestError) {
      return {
        success: false,
        message: getAuthErrorMessage(
          requestError,
          "Your account could not be deleted. Please try again.",
        ),
      };
    } finally {
      setIsSubmitting(false);
    }
  }, [clearLocalAuth, waitForRefresh]);

  const logout = useCallback(async () => {
    setIsSubmitting(true);
    generationRef.current += 1;
    await waitForRefresh();
    try {
      await authApi.logout();
      clearLocalAuth();
      return { success: true };
    } catch (requestError) {
      const message = getAuthErrorMessage(
        requestError,
        "Sign-out could not be completed. This device may still be signed in.",
      );
      clearLocalAuth();
      setVisibleError(message, "form");
      return { success: false, message };
    } finally {
      setIsSubmitting(false);
    }
  }, [clearLocalAuth, setVisibleError, waitForRefresh]);

  const logoutAll = useCallback(async () => {
    setIsSubmitting(true);
    generationRef.current += 1;
    await waitForRefresh();
    try {
      await authApi.logoutAll();
      clearLocalAuth();
      return { success: true };
    } catch (requestError) {
      const message = getAuthErrorMessage(
        requestError,
        "Sign-out could not be completed. This device may still be signed in.",
      );
      clearLocalAuth();
      setVisibleError(message, "form");
      return { success: false, message };
    } finally {
      setIsSubmitting(false);
    }
  }, [clearLocalAuth, setVisibleError, waitForRefresh]);

  const clearError = useCallback(() => {
    setAuthError(null);
    setAuthErrorKind(null);
  }, []);

  const dismissAccountAction = useCallback(() => setAccountAction(null), []);

  /*
   * Dismissing the confirmation touches auth state only: it never restores the
   * session the change ended, so a dismissed dialog still leaves the reader
   * signed out.
   */
  const dismissPasswordChangeSuccess = useCallback(
    () => setPasswordChangeSuccess(false),
    [],
  );

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isAuthenticated: Boolean(user && user.status === "ACTIVE"),
    isLoading,
    isSubmitting,
    authError,
    authErrorKind,
    authMode,
    accountAction,
    passwordChangeSuccess,
    openAuthMode,
    closeAuthMode,
    clearError,
    dismissAccountAction,
    dismissPasswordChangeSuccess,
    updateUser,
    updateProfile,
    login,
    register,
    forgotPassword,
    submitPasswordReset,
    changePassword,
    revokeSession,
    logoutOtherSessions,
    deleteAccount,
    loginWithGoogle,
    logout,
    logoutAll,
    refresh,
  }), [
    accountAction,
    authError,
    authErrorKind,
    authMode,
    changePassword,
    clearError,
    closeAuthMode,
    deleteAccount,
    dismissAccountAction,
    dismissPasswordChangeSuccess,
    forgotPassword,
    isLoading,
    isSubmitting,
    login,
    loginWithGoogle,
    logout,
    logoutAll,
    logoutOtherSessions,
    openAuthMode,
    passwordChangeSuccess,
    refresh,
    register,
    revokeSession,
    submitPasswordReset,
    updateProfile,
    updateUser,
    user,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

export { AuthProvider, useAuth };
export default AuthContext;
