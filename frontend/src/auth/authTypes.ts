export type AuthRole = "USER" | "ADMIN";

export type AuthStatus = "ACTIVE" | "SUSPENDED" | "DELETED";

export type AuthMode = "login" | "signup";

export type AuthErrorKind = "form" | "oauth";

export type AuthProvider = "PASSWORD" | "GOOGLE";

export type AvatarType = "local" | "google";

export type AuthAvatar = {
  type: AvatarType;
  value: string;
};

/**
 * Stable badge identifiers owned by the backend. The badge artwork and any
 * animation stay a frontend concern; the key is all the backend decides.
 */
export type LevelBadgeKey = "bronze" | "silver" | "gold" | "diamond" | "crown" | "flame";

/** Stable visual theme identifiers owned by the backend. */
/**
 * A tier's theme names the same material as its badge, so the two can never
 * disagree. `unearned` is not a tier: it is the neutral treatment used to show a
 * tier the account has not actually earned yet.
 */
export type LevelThemeKey =
  | "bronze"
  | "silver"
  | "gold"
  | "diamond"
  | "crown"
  | "flame"
  | "unearned";

/**
 * Progression is always derived on the backend from the account's total Arcadion
 * XP, so it is read-only here. There is no client-side level calculation and no
 * way to set a level, a title or a badge from the frontend.
 */
export type Progression = {
  totalXp: number;
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progressPercent: number;
  title: string;
  badgeKey: LevelBadgeKey;
  themeKey: LevelThemeKey;
};

/**
 * Gaming statistics stay neutral zeros until the game systems exist. They are
 * owned by the backend account profile so real values can replace them in one
 * place, and XP progression never reads from them.
 */
export type GamingStatsSummary = {
  gamesPlayed: number;
  gamesWon: number;
  totalScore: number;
  bestScore: number;
  currentStreak: number;
  winRatePercent: number;
  /**
   * Total gameplay time in minutes. The backend does not track playtime yet, so
   * this is intentionally optional and normally absent: the profile then shows a
   * neutral placeholder instead of an invented number. When real gameplay
   * tracking lands, the backend populates this one field and Total Hours Played
   * becomes a real value with no other change.
   */
  totalMinutesPlayed?: number | null;
};

export type AuthUser = {
  id: string;
  name: string;
  username: string | null;
  usernameSetupRequired: boolean;
  /**
   * The permanent public Arcadia Player ID, e.g. ARC-7K4M2P9Q. It is generated
   * and stored by the server and is never editable, so the client only ever
   * displays the value it was given. It is `null` for an account whose ID has
   * not been issued yet, and it is not an authorization credential.
   */
  playerId: string | null;
  displayName: string;
  avatar: AuthAvatar;
  avatarSource: AvatarType;
  googleAvatarAvailable: boolean;
  googleAvatarUrl: string | null;
  authProvider: AuthProvider;
  email: string;
  progression: Progression;
  role: AuthRole;
  status: AuthStatus;
  createdAt: string | null;
  updatedAt: string | null;
  lastLoginAt: string | null;
};

export type AccountProfileUser = AuthUser & {
  googleAvatarUrl: string | null;
  gamingStats: GamingStatsSummary;
};

/** The identity fields My Profile is allowed to change. */
export type ProfileUpdate = {
  displayName?: string;
  username?: string;
  avatar?: AuthAvatar;
};

export type ProfileUpdateResult = {
  ok: boolean;
  message: string | null;
  /** HTTP status of a rejected write, so a 409 uniqueness conflict is detectable. */
  status: number | null;
  user: AccountProfileUser | null;
};

export type AuthResponse = {
  token: string;
  user: AuthUser;
};

export type AuthFormValues = {
  username: string;
  email: string;
  password: string;
};

export type LoginValues = Pick<AuthFormValues, "email" | "password">;

export type RegisterValues = AuthFormValues;

export type AuthMessageResponse = {
  message: string;
};

export type AccountProfileResponse = {
  user: AccountProfileUser;
};

export type AccountSettingsResponse = {
  settings: AccountProfileUser;
};

/* ------------------------------------------------------------------
   Account preferences

   Sound and privacy choices, persisted by the backend. Every value here is
   only ever written by a preferences endpoint response: the modal renders
   what the server confirms and never a locally invented default.
   ------------------------------------------------------------------ */

/** Who else may view the account's profile. Enforced server-side. */
export type ProfileVisibility = "PUBLIC" | "FRIENDS" | "NO_ONE";

/** Whether the account appears on the public leaderboard. Enforced server-side. */
export type LeaderboardVisibility = "SHOW" | "HIDE";

export type AccountPreferences = {
  soundEffects: boolean;
  /** 0–100, whole numbers only. The backend rejects anything else. */
  soundVolume: number;
  profileVisibility: ProfileVisibility;
  leaderboardVisibility: LeaderboardVisibility;
};

export type AccountPreferencesResponse = {
  preferences: AccountPreferences;
};

/** Only the keys actually changed are sent; the backend applies them together. */
export type AccountPreferencesUpdate = Partial<AccountPreferences>;

/* ------------------------------------------------------------------
   Match history

   Read-only. The backend has no route that creates a match, so a client can
   never report a result, an opponent or a timestamp for itself. Every value
   here comes from a genuine completed match recorded server-side.
   ------------------------------------------------------------------ */

/** Who the account played against. The backend allowlists exactly these. */
export type MatchOpponentType = "ARCADION" | "ONLINE_FRIEND" | "LOCAL";

/** How the completed match ended for this account. */
export type MatchResult = "WIN" | "LOSS" | "DRAW";

export type MatchRecord = {
  /** The stable public id, used as the list key. */
  matchId: string;
  game: string;
  opponentType: MatchOpponentType;
  /** A public display label, only when the opponent has one. Never account data. */
  opponentName: string | null;
  result: MatchResult;
  /** When the match actually finished, as an ISO instant. */
  completedAt: string;
  /** Only present when the game system measured it. */
  durationMinutes: number | null;
};

export type MatchHistoryFilters = {
  /** Inclusive `YYYY-MM-DD` calendar dates, or null for an open bound. */
  from?: string | null;
  to?: string | null;
  opponentType?: MatchOpponentType | "ALL" | null;
  /**
   * Filters on the STORED result. The page shows `DRAW` as "Tie", but the value
   * that is sent and matched is the one that was recorded.
   */
  result?: MatchResult | "ALL" | null;
  /** The reader's UTC offset, so the day bounds are the reader's own days. */
  tzOffsetMinutes?: number;
  limit?: number;
  /** How many matches to skip, so the whole history can be walked. */
  offset?: number;
};

export type MatchHistoryResponse = {
  matches: MatchRecord[];
  /** The real count across every page, not just this one. */
  total: number;
  limit: number;
  offset: number;
  /** Whether anything is left below this page. Never implied from the count. */
  hasMore: boolean;
  filters: {
    from: string | null;
    to: string | null;
    opponentType: MatchOpponentType | null;
    result: MatchResult | null;
  };
};

export type UsernameAvailabilityResponse = {
  available: boolean;
};

export type AccountSession = {
  id: string;
  createdAt: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  current: boolean;
  device: string;
};

export type AccountSessionsResponse = {
  sessions: AccountSession[];
};

export type RevokeSessionResponse = {
  current: boolean;
  message: string;
};

export type LogoutOtherSessionsResponse = {
  revokedCount: number;
  message: string;
};

export type AccountAction =
  {
    kind: "reset";
    status: "form" | "submitting" | "success" | "error";
    token: string;
    message: string;
  };
