/*
 * DEVELOPMENT-ONLY DUMMY PLAYERS — NOT REAL ACCOUNTS.
 *
 * Arcadia's leaderboard, player-profile preview and admin preview screens need
 * sample players while the real player APIs are being built. This module is the
 * ONE place those samples live. Nothing here is written to MongoDB, nothing is
 * registered, and nothing is merged into a signed-in account: the public
 * backend profile and the admin session always win.
 *
 * The data is gated by `DUMMY_PLAYERS_ENABLED`, which is only true in a Vite
 * development build and can be switched off with VITE_ENABLE_DUMMY_PLAYERS=false.
 * A production build therefore renders no dummy players at all.
 *
 * The profile shape is deliberately compatible with the real API types
 * (`PublicPlayerProfile`, `Progression`, `AuthStatus`), so a dummy profile can
 * be rendered by the same component as a real one without a second model.
 *
 * Progression is mirrored from the backend (utils/progression.js and
 * config/levelBadges.js) ONLY to derive a consistent level/badge for the fixed
 * fixture XP values. This is not a second source of truth for real accounts:
 * every real progression value still comes from the backend response.
 */

import type { AuthStatus, Progression, PublicPlayerProfile } from "../../auth/authTypes";
import { LOCAL_AVATARS } from "../../auth/avatarCatalog";

/** Visible marker used anywhere dummy data can reach the screen. */
export const DUMMY_PLAYER_DATA_NOTICE =
  "Development demo data — these are sample players, not real Arcadia accounts.";

/**
 * The only switch that enables the fixtures. A production build has
 * `import.meta.env.DEV === false`, so dummy players are impossible there even
 * if the optional environment flag is missing or set to "true".
 */
export const DUMMY_PLAYERS_ENABLED =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_DUMMY_PLAYERS !== "false";

export type DummyGameId =
  | "ludo"
  | "tic-tac-toe"
  | "rock-paper-scissors"
  | "snake-ladder"
  | "memory";

export type DummyGameDefinition = {
  id: DummyGameId;
  name: string;
  emoji: string;
};

/** The same five games the account screens use, so every fixture lines up. */
export const DUMMY_GAMES: readonly DummyGameDefinition[] = Object.freeze([
  { id: "ludo", name: "Ludo", emoji: "🎲" },
  { id: "tic-tac-toe", name: "Tic Tac Toe", emoji: "#" },
  { id: "rock-paper-scissors", name: "Rock Paper Scissors", emoji: "✂️" },
  { id: "snake-ladder", name: "Snake & Ladder", emoji: "🐍" },
  { id: "memory", name: "Memory", emoji: "🧠" },
]);

export type DummyGameStats = {
  played: number;
  wins: number;
  draws: number;
  totalScore: number;
  highestScore: number;
};

export type DummyArcadionStats = {
  matches: number;
  wins: number;
  bestScore: number;
  winRatePercent: number;
};

export type DummyPlayerStats = {
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  totalScore: number;
  bestScore: number;
  winRatePercent: number;
  arcadion: DummyArcadionStats;
  games: Record<DummyGameId, DummyGameStats>;
};

type DummyArcadionSeed = Omit<DummyArcadionStats, "winRatePercent">;

type DummyStatsSeed = Omit<DummyPlayerStats, "winRatePercent" | "arcadion"> & {
  arcadion: DummyArcadionSeed;
};

type DummyPlayerBase = {
  /** Stable frontend-only slug. Never a backend ObjectId. */
  id: string;
  username: string;
  displayName: string;
  playerId: string;
  avatarId: string;
  totalXp: number;
  joinedAt: string;
  lastActiveAt: string;
  status: AuthStatus;
  favoriteGame: DummyGameId;
  moderation: {
    warnings: number;
    reportsAgainst: number;
    lastAction: string | null;
  };
};

type DummyPlayerSeed = DummyPlayerBase & {
  stats: DummyStatsSeed;
};

export type DummyPlayer = DummyPlayerBase & {
  progression: Progression;
  stats: DummyPlayerStats;
};

/* ------------------------------------------------------------------
   Progression mirror (fixtures only)

   These constants and helpers are the exact closed form used by the
   backend. They exist solely to turn the fixed fixture XP totals below
   into a level, badge and progress percentage that the UI can render.
   ------------------------------------------------------------------ */

type BadgeTier = {
  badgeKey: Progression["badgeKey"];
  title: string;
  themeKey: Progression["themeKey"];
  minLevel: number;
  maxLevel: number | null;
};

const BADGE_TIERS: readonly BadgeTier[] = Object.freeze([
  { badgeKey: "bronze", title: "Arcadia Rookie", themeKey: "bronze", minLevel: 0, maxLevel: 4 },
  { badgeKey: "silver", title: "Arcadia Challenger", themeKey: "silver", minLevel: 5, maxLevel: 9 },
  { badgeKey: "gold", title: "Arcadia Veteran", themeKey: "gold", minLevel: 10, maxLevel: 14 },
  { badgeKey: "diamond", title: "Arcadia Master", themeKey: "diamond", minLevel: 15, maxLevel: 19 },
  { badgeKey: "crown", title: "Arcadia Legend", themeKey: "crown", minLevel: 20, maxLevel: 29 },
  { badgeKey: "flame", title: "Arcadia Supreme", themeKey: "flame", minLevel: 30, maxLevel: null },
]);

const BASE_LEVEL_XP_STEP = 100;
const FIRST_STEPPED_LEVEL = 5;
const STEPPED_LEVEL_XP_STEP = 50;
const STEPPED_LEVEL_BASE_XP = 550;
const CUMULATIVE_XP_AT_FIRST_STEPPED_LEVEL = 1500;
const STEPPED_LEVEL_QUAD = STEPPED_LEVEL_XP_STEP / 2;
const STEPPED_LEVEL_LINEAR = STEPPED_LEVEL_BASE_XP - STEPPED_LEVEL_QUAD;

function normalizeTotalXp(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

function getXpToAdvanceFromLevel(level: number): number {
  const normalized = Math.max(0, Math.floor(level));
  if (normalized < FIRST_STEPPED_LEVEL) {
    return BASE_LEVEL_XP_STEP * (normalized + 1);
  }
  return STEPPED_LEVEL_BASE_XP + STEPPED_LEVEL_XP_STEP * (normalized - FIRST_STEPPED_LEVEL);
}

function getCumulativeXpForLevel(level: number): number {
  const normalized = Math.max(0, Math.floor(level));
  if (normalized === 0) return 0;
  if (normalized <= FIRST_STEPPED_LEVEL) {
    return BASE_LEVEL_XP_STEP * ((normalized * (normalized + 1)) / 2);
  }
  const steppedLevels = normalized - FIRST_STEPPED_LEVEL;
  return (
    CUMULATIVE_XP_AT_FIRST_STEPPED_LEVEL
    + STEPPED_LEVEL_QUAD * steppedLevels * steppedLevels
    + STEPPED_LEVEL_LINEAR * steppedLevels
  );
}

function getLevelFromTotalXp(totalXp: number): number {
  const xp = normalizeTotalXp(totalXp);
  if (xp < BASE_LEVEL_XP_STEP) return 0;

  if (xp < CUMULATIVE_XP_AT_FIRST_STEPPED_LEVEL) {
    let level = 1;
    while (getCumulativeXpForLevel(level + 1) <= xp) level += 1;
    return level;
  }

  const remaining = xp - CUMULATIVE_XP_AT_FIRST_STEPPED_LEVEL;
  const discriminant =
    STEPPED_LEVEL_LINEAR * STEPPED_LEVEL_LINEAR + 4 * STEPPED_LEVEL_QUAD * remaining;
  let steppedLevels = Math.max(
    0,
    Math.floor((Math.sqrt(discriminant) - STEPPED_LEVEL_LINEAR) / (2 * STEPPED_LEVEL_QUAD)),
  );

  while (
    steppedLevels > 0
    && getCumulativeXpForLevel(FIRST_STEPPED_LEVEL + steppedLevels) > xp
  ) {
    steppedLevels -= 1;
  }
  while (getCumulativeXpForLevel(FIRST_STEPPED_LEVEL + steppedLevels + 1) <= xp) {
    steppedLevels += 1;
  }

  return FIRST_STEPPED_LEVEL + steppedLevels;
}

function getBadgeTier(level: number): BadgeTier {
  for (const tier of BADGE_TIERS) {
    if (level < tier.minLevel) break;
    if (tier.maxLevel === null || level <= tier.maxLevel) return tier;
  }
  return BADGE_TIERS[0];
}

/** Builds the same progression shape the backend returns. */
export function getDummyProgression(totalXp: number): Progression {
  const safeTotalXp = normalizeTotalXp(totalXp);
  const level = getLevelFromTotalXp(safeTotalXp);
  const currentLevelXp = safeTotalXp - getCumulativeXpForLevel(level);
  const nextLevelXp = getXpToAdvanceFromLevel(level);
  const badge = getBadgeTier(level);

  return {
    totalXp: safeTotalXp,
    level,
    currentLevelXp,
    nextLevelXp,
    progressPercent:
      nextLevelXp > 0
        ? Math.min(100, Math.max(0, Math.round((currentLevelXp / nextLevelXp) * 100)))
        : 0,
    title: badge.title,
    badgeKey: badge.badgeKey,
    themeKey: badge.themeKey,
  };
}

/* ------------------------------------------------------------------
   Fixtures
   ------------------------------------------------------------------ */

const PLAYER_SEEDS: readonly DummyPlayerSeed[] = Object.freeze([
  {
    id: "dummy-novarider",
    username: "NovaRider",
    displayName: "Nova Rider",
    playerId: "ARC-4H7N2K9Q",
    avatarId: "avatar-03",
    totalXp: 240,
    joinedAt: "2026-08-14T09:15:00.000Z",
    lastActiveAt: "2026-10-30T18:40:00.000Z",
    status: "ACTIVE",
    favoriteGame: "ludo",
    moderation: { warnings: 0, reportsAgainst: 0, lastAction: null },
    stats: {
      gamesPlayed: 12,
      wins: 5,
      losses: 6,
      draws: 1,
      totalScore: 3_550,
      bestScore: 620,
      arcadion: { matches: 8, wins: 4, bestScore: 620 },
      games: {
        ludo: { played: 4, wins: 2, draws: 0, totalScore: 1_650, highestScore: 620 },
        "tic-tac-toe": { played: 3, wins: 1, draws: 0, totalScore: 720, highestScore: 300 },
        "rock-paper-scissors": { played: 2, wins: 1, draws: 0, totalScore: 380, highestScore: 210 },
        "snake-ladder": { played: 2, wins: 1, draws: 0, totalScore: 540, highestScore: 320 },
        memory: { played: 1, wins: 0, draws: 1, totalScore: 260, highestScore: 260 },
      },
    },
  },
  {
    id: "dummy-bytebard",
    username: "ByteBard",
    displayName: "Byte Bard",
    playerId: "ARC-8M3R5T1W",
    avatarId: "avatar-06",
    totalXp: 870,
    joinedAt: "2026-06-03T14:20:00.000Z",
    lastActiveAt: "2026-10-30T12:05:00.000Z",
    status: "ACTIVE",
    favoriteGame: "tic-tac-toe",
    moderation: { warnings: 0, reportsAgainst: 1, lastAction: null },
    stats: {
      gamesPlayed: 24,
      wins: 11,
      losses: 10,
      draws: 3,
      totalScore: 7_890,
      bestScore: 880,
      arcadion: { matches: 15, wins: 8, bestScore: 880 },
      games: {
        ludo: { played: 8, wins: 4, draws: 1, totalScore: 3_520, highestScore: 880 },
        "tic-tac-toe": { played: 6, wins: 3, draws: 1, totalScore: 1_620, highestScore: 420 },
        "rock-paper-scissors": { played: 4, wins: 2, draws: 0, totalScore: 960, highestScore: 300 },
        "snake-ladder": { played: 4, wins: 1, draws: 1, totalScore: 1_180, highestScore: 460 },
        memory: { played: 2, wins: 1, draws: 0, totalScore: 610, highestScore: 340 },
      },
    },
  },
  {
    id: "dummy-quasarkid",
    username: "QuasarKid",
    displayName: "Quasar Kid",
    playerId: "ARC-2C6V9B4L",
    avatarId: "avatar-02",
    totalXp: 2_450,
    joinedAt: "2026-03-22T11:05:00.000Z",
    lastActiveAt: "2026-10-29T21:10:00.000Z",
    status: "ACTIVE",
    favoriteGame: "rock-paper-scissors",
    moderation: { warnings: 0, reportsAgainst: 0, lastAction: null },
    stats: {
      gamesPlayed: 48,
      wins: 25,
      losses: 18,
      draws: 5,
      totalScore: 17_670,
      bestScore: 1_020,
      arcadion: { matches: 30, wins: 18, bestScore: 1_020 },
      games: {
        ludo: { played: 16, wins: 9, draws: 2, totalScore: 7_840, highestScore: 1_020 },
        "tic-tac-toe": { played: 12, wins: 6, draws: 1, totalScore: 3_660, highestScore: 540 },
        "rock-paper-scissors": { played: 8, wins: 4, draws: 1, totalScore: 2_140, highestScore: 380 },
        "snake-ladder": { played: 7, wins: 4, draws: 1, totalScore: 2_450, highestScore: 620 },
        memory: { played: 5, wins: 2, draws: 0, totalScore: 1_580, highestScore: 480 },
      },
    },
  },
  {
    id: "dummy-ludolynx",
    username: "LudoLynx",
    displayName: "Ludo Lynx",
    playerId: "ARC-7P1D8F3S",
    avatarId: "avatar-05",
    totalXp: 3_750,
    joinedAt: "2026-01-09T19:30:00.000Z",
    lastActiveAt: "2026-10-30T08:25:00.000Z",
    status: "ACTIVE",
    favoriteGame: "ludo",
    moderation: { warnings: 0, reportsAgainst: 2, lastAction: null },
    stats: {
      gamesPlayed: 72,
      wins: 39,
      losses: 26,
      draws: 7,
      totalScore: 28_940,
      bestScore: 1_180,
      arcadion: { matches: 44, wins: 28, bestScore: 1_180 },
      games: {
        ludo: { played: 24, wins: 14, draws: 2, totalScore: 12_720, highestScore: 1_180 },
        "tic-tac-toe": { played: 18, wins: 10, draws: 2, totalScore: 5_940, highestScore: 620 },
        "rock-paper-scissors": { played: 12, wins: 6, draws: 1, totalScore: 3_480, highestScore: 430 },
        "snake-ladder": { played: 10, wins: 6, draws: 1, totalScore: 4_120, highestScore: 720 },
        memory: { played: 8, wins: 3, draws: 1, totalScore: 2_680, highestScore: 560 },
      },
    },
  },
  {
    id: "dummy-echowarden",
    username: "EchoWarden",
    displayName: "Echo Warden",
    playerId: "ARC-9Q5J2N7H",
    avatarId: "avatar-04",
    totalXp: 5_700,
    joinedAt: "2025-11-18T07:45:00.000Z",
    lastActiveAt: "2026-10-29T16:50:00.000Z",
    status: "ACTIVE",
    favoriteGame: "snake-ladder",
    moderation: { warnings: 1, reportsAgainst: 0, lastAction: "Warning — chat conduct (2026-09-30)" },
    stats: {
      gamesPlayed: 110,
      wins: 61,
      losses: 39,
      draws: 10,
      totalScore: 48_180,
      bestScore: 1_320,
      arcadion: { matches: 66, wins: 42, bestScore: 1_320 },
      games: {
        ludo: { played: 36, wins: 22, draws: 3, totalScore: 21_240, highestScore: 1_320 },
        "tic-tac-toe": { played: 28, wins: 16, draws: 3, totalScore: 9_880, highestScore: 740 },
        "rock-paper-scissors": { played: 18, wins: 9, draws: 2, totalScore: 5_760, highestScore: 500 },
        "snake-ladder": { played: 16, wins: 9, draws: 1, totalScore: 6_840, highestScore: 840 },
        memory: { played: 12, wins: 5, draws: 1, totalScore: 4_460, highestScore: 640 },
      },
    },
  },
  {
    id: "dummy-pixelsage",
    username: "PixelSage",
    displayName: "Pixel Sage",
    playerId: "ARC-3W8K6M1Z",
    avatarId: "avatar-01",
    totalXp: 7_950,
    joinedAt: "2025-09-05T16:10:00.000Z",
    lastActiveAt: "2026-10-30T06:35:00.000Z",
    status: "ACTIVE",
    favoriteGame: "memory",
    moderation: { warnings: 0, reportsAgainst: 0, lastAction: null },
    stats: {
      gamesPlayed: 156,
      wins: 88,
      losses: 55,
      draws: 13,
      totalScore: 72_920,
      bestScore: 1_480,
      arcadion: { matches: 94, wins: 60, bestScore: 1_480 },
      games: {
        ludo: { played: 52, wins: 32, draws: 4, totalScore: 32_240, highestScore: 1_480 },
        "tic-tac-toe": { played: 40, wins: 23, draws: 3, totalScore: 14_960, highestScore: 820 },
        "rock-paper-scissors": { played: 26, wins: 13, draws: 2, totalScore: 8_840, highestScore: 560 },
        "snake-ladder": { played: 22, wins: 13, draws: 2, totalScore: 10_240, highestScore: 960 },
        memory: { played: 16, wins: 7, draws: 2, totalScore: 6_640, highestScore: 720 },
      },
    },
  },
  {
    id: "dummy-titanvale",
    username: "TitanVale",
    displayName: "Titan Vale",
    playerId: "ARC-6B4T9R2V",
    avatarId: "avatar-04",
    totalXp: 10_500,
    joinedAt: "2025-06-27T10:00:00.000Z",
    lastActiveAt: "2026-10-28T22:15:00.000Z",
    status: "ACTIVE",
    favoriteGame: "ludo",
    moderation: { warnings: 0, reportsAgainst: 1, lastAction: null },
    stats: {
      gamesPlayed: 220,
      wins: 128,
      losses: 74,
      draws: 18,
      totalScore: 106_920,
      bestScore: 1_620,
      arcadion: { matches: 132, wins: 90, bestScore: 1_620 },
      games: {
        ludo: { played: 72, wins: 46, draws: 5, totalScore: 47_520, highestScore: 1_620 },
        "tic-tac-toe": { played: 56, wins: 34, draws: 4, totalScore: 21_840, highestScore: 900 },
        "rock-paper-scissors": { played: 38, wins: 18, draws: 3, totalScore: 12_920, highestScore: 620 },
        "snake-ladder": { played: 32, wins: 20, draws: 3, totalScore: 14_960, highestScore: 1_040 },
        memory: { played: 22, wins: 10, draws: 3, totalScore: 9_680, highestScore: 780 },
      },
    },
  },
  {
    id: "dummy-crownless",
    username: "Crownless",
    displayName: "Crownless",
    playerId: "ARC-1L7S3Q8D",
    avatarId: "avatar-03",
    totalXp: 13_100,
    joinedAt: "2025-03-12T13:40:00.000Z",
    lastActiveAt: "2026-10-27T22:41:00.000Z",
    status: "SUSPENDED",
    favoriteGame: "tic-tac-toe",
    moderation: { warnings: 2, reportsAgainst: 3, lastAction: "7-day suspension (2026-10-27)" },
    stats: {
      gamesPlayed: 300,
      wins: 178,
      losses: 99,
      draws: 23,
      totalScore: 152_520,
      bestScore: 1_780,
      arcadion: { matches: 180, wins: 124, bestScore: 1_780 },
      games: {
        ludo: { played: 98, wins: 64, draws: 6, totalScore: 68_600, highestScore: 1_780 },
        "tic-tac-toe": { played: 76, wins: 47, draws: 5, totalScore: 30_780, highestScore: 980 },
        "rock-paper-scissors": { played: 52, wins: 26, draws: 4, totalScore: 18_460, highestScore: 680 },
        "snake-ladder": { played: 44, wins: 28, draws: 4, totalScore: 21_120, highestScore: 1_120 },
        memory: { played: 30, wins: 13, draws: 4, totalScore: 13_560, highestScore: 840 },
      },
    },
  },
  {
    id: "dummy-astralfox",
    username: "AstralFox",
    displayName: "Astral Fox",
    playerId: "ARC-5N2H8P6C",
    avatarId: "avatar-05",
    totalXp: 19_500,
    joinedAt: "2024-12-01T08:30:00.000Z",
    lastActiveAt: "2026-10-30T09:55:00.000Z",
    status: "ACTIVE",
    favoriteGame: "snake-ladder",
    moderation: { warnings: 0, reportsAgainst: 0, lastAction: null },
    stats: {
      gamesPlayed: 420,
      wins: 254,
      losses: 134,
      draws: 32,
      totalScore: 222_720,
      bestScore: 1_960,
      arcadion: { matches: 252, wins: 180, bestScore: 1_960 },
      games: {
        ludo: { played: 138, wins: 92, draws: 8, totalScore: 101_200, highestScore: 1_960 },
        "tic-tac-toe": { played: 106, wins: 67, draws: 7, totalScore: 44_520, highestScore: 1_080 },
        "rock-paper-scissors": { played: 72, wins: 38, draws: 6, totalScore: 26_780, highestScore: 760 },
        "snake-ladder": { played: 62, wins: 40, draws: 6, totalScore: 30_580, highestScore: 1_220 },
        memory: { played: 42, wins: 17, draws: 5, totalScore: 19_640, highestScore: 920 },
      },
    },
  },
  {
    id: "dummy-solarisprime",
    username: "SolarisPrime",
    displayName: "Solaris Prime",
    playerId: "ARC-0F9V4K7M",
    avatarId: "avatar-02",
    totalXp: 51_000,
    joinedAt: "2024-07-19T17:25:00.000Z",
    lastActiveAt: "2026-10-30T07:15:00.000Z",
    status: "ACTIVE",
    favoriteGame: "ludo",
    moderation: { warnings: 0, reportsAgainst: 0, lastAction: null },
    stats: {
      gamesPlayed: 612,
      wins: 401,
      losses: 168,
      draws: 43,
      totalScore: 369_080,
      bestScore: 2_480,
      arcadion: { matches: 366, wins: 276, bestScore: 2_480 },
      games: {
        ludo: { played: 200, wins: 146, draws: 11, totalScore: 168_000, highestScore: 2_480 },
        "tic-tac-toe": { played: 154, wins: 106, draws: 9, totalScore: 73_920, highestScore: 1_320 },
        "rock-paper-scissors": { played: 106, wins: 58, draws: 8, totalScore: 44_520, highestScore: 920 },
        "snake-ladder": { played: 90, wins: 62, draws: 8, totalScore: 50_400, highestScore: 1_480 },
        memory: { played: 62, wins: 29, draws: 7, totalScore: 32_240, highestScore: 1_080 },
      },
    },
  },
]);

function toWinRatePercent(wins: number, played: number): number {
  if (played <= 0) return 0;
  return Math.round((wins / played) * 1_000) / 10;
}

function buildPlayer(seed: DummyPlayerSeed): DummyPlayer {
  return {
    ...seed,
    progression: getDummyProgression(seed.totalXp),
    stats: {
      ...seed.stats,
      winRatePercent: toWinRatePercent(seed.stats.wins, seed.stats.gamesPlayed),
      arcadion: {
        ...seed.stats.arcadion,
        winRatePercent: toWinRatePercent(
          seed.stats.arcadion.wins,
          seed.stats.arcadion.matches,
        ),
      },
    },
  };
}

export const DUMMY_PLAYERS: readonly DummyPlayer[] = Object.freeze(
  PLAYER_SEEDS.map(buildPlayer),
);

export const DUMMY_PLAYERS_BY_XP: readonly DummyPlayer[] = Object.freeze(
  [...DUMMY_PLAYERS].sort(
    (a, b) => b.totalXp - a.totalXp || a.username.localeCompare(b.username),
  ),
);

export const DUMMY_PLAYERS_BY_SCORE: readonly DummyPlayer[] = Object.freeze(
  [...DUMMY_PLAYERS].sort(
    (a, b) => b.stats.totalScore - a.stats.totalScore || a.username.localeCompare(b.username),
  ),
);

/* ------------------------------------------------------------------
   Lookups and adapters
   ------------------------------------------------------------------ */

function normalizeName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function getDummyPlayerById(id: string | null | undefined): DummyPlayer | null {
  const needle = (id ?? "").trim();
  if (!needle) return null;
  return DUMMY_PLAYERS.find((player) => player.id === needle) ?? null;
}

export function getDummyPlayerByUsername(username: string | null | undefined): DummyPlayer | null {
  const needle = normalizeName(username);
  if (!needle) return null;
  return DUMMY_PLAYERS.find((player) => normalizeName(player.username) === needle) ?? null;
}

export function getDummyPlayerByPlayerId(playerId: string | null | undefined): DummyPlayer | null {
  const needle = (playerId ?? "").trim().toUpperCase();
  if (!needle) return null;
  return DUMMY_PLAYERS.find((player) => player.playerId === needle) ?? null;
}

/** Converts a fixture into the exact public profile shape the API returns. */
export function toDummyPublicProfile(player: DummyPlayer): PublicPlayerProfile {
  return {
    id: `preview:${player.id}`,
    username: player.username,
    playerId: player.playerId,
    avatar: { type: "local", value: player.avatarId },
    avatarUrl: null,
    progression: player.progression,
    completedMatches: player.stats.gamesPlayed,
    createdAt: player.joinedAt,
  };
}

/**
 * Resolves the fixture behind a public profile. It only ever accepts a profile
 * that was itself created by `toDummyPublicProfile`, so a real backend profile
 * can never be replaced by demo statistics.
 */
export function getDummyPlayerForPublicProfile(
  profile: Pick<PublicPlayerProfile, "id" | "username" | "playerId"> | null | undefined,
): DummyPlayer | null {
  if (!profile || !profile.id.startsWith("preview:")) return null;
  return (
    getDummyPlayerById(profile.id.slice("preview:".length))
    ?? getDummyPlayerByUsername(profile.username)
    ?? getDummyPlayerByPlayerId(profile.playerId)
  );
}

/* ------------------------------------------------------------------
   Integrity validation
   ------------------------------------------------------------------ */

export function validateDummyPlayers(
  players: readonly DummyPlayer[] = DUMMY_PLAYERS,
): string[] {
  const errors: string[] = [];
  const avatarIds = new Set(LOCAL_AVATARS.map((avatar) => avatar.id));

  if (players.length !== 10) {
    errors.push(`expected exactly 10 dummy players, found ${players.length}`);
  }

  const ids = new Set<string>();
  const playerIds = new Set<string>();
  const usernames = new Set<string>();

  for (const player of players) {
    const label = player.username || player.id;

    if (ids.has(player.id)) errors.push(`${label}: duplicate internal id ${player.id}`);
    ids.add(player.id);

    if (playerIds.has(player.playerId)) {
      errors.push(`${label}: duplicate player id ${player.playerId}`);
    }
    playerIds.add(player.playerId);

    if (usernames.has(player.username.toLowerCase())) {
      errors.push(`${label}: duplicate username`);
    }
    usernames.add(player.username.toLowerCase());

    if (!/^ARC-[A-Z0-9]{8}$/.test(player.playerId)) {
      errors.push(`${label}: player id ${player.playerId} does not match ARC-XXXXXXXX`);
    }
    if (!avatarIds.has(player.avatarId)) {
      errors.push(`${label}: avatar ${player.avatarId} is not in the avatar catalogue`);
    }
    if (!Number.isInteger(player.totalXp) || player.totalXp <= 0) {
      errors.push(`${label}: totalXp must be a positive integer`);
    }
    if (player.status !== "ACTIVE" && player.status !== "SUSPENDED") {
      errors.push(`${label}: unsupported account status ${player.status}`);
    }
    if (Number.isNaN(Date.parse(player.joinedAt))) {
      errors.push(`${label}: joinedAt is not a valid date`);
    }

    const expectedProgression = getDummyProgression(player.totalXp);
    if (player.progression.level !== expectedProgression.level) {
      errors.push(`${label}: level does not match totalXp`);
    }
    if (player.progression.badgeKey !== expectedProgression.badgeKey) {
      errors.push(`${label}: badge does not match level`);
    }
    const levelFloor = getCumulativeXpForLevel(player.progression.level);
    const levelCeiling = getCumulativeXpForLevel(player.progression.level + 1);
    if (player.totalXp < levelFloor || player.totalXp >= levelCeiling) {
      errors.push(`${label}: totalXp is outside the level ${player.progression.level} band`);
    }

    const { stats } = player;
    if (stats.wins + stats.losses + stats.draws !== stats.gamesPlayed) {
      errors.push(`${label}: wins + losses + draws must equal gamesPlayed`);
    }
    if (stats.gamesPlayed <= 0) errors.push(`${label}: gamesPlayed must be positive`);
    if (stats.bestScore > stats.totalScore) {
      errors.push(`${label}: bestScore cannot exceed totalScore`);
    }
    if (stats.winRatePercent !== toWinRatePercent(stats.wins, stats.gamesPlayed)) {
      errors.push(`${label}: win rate does not match wins / gamesPlayed`);
    }

    let played = 0;
    let wins = 0;
    let draws = 0;
    let totalScore = 0;
    let bestScore = 0;

    for (const game of DUMMY_GAMES) {
      const gameStats = stats.games[game.id];
      if (!gameStats) {
        errors.push(`${label}: missing ${game.id} breakdown`);
        continue;
      }
      played += gameStats.played;
      wins += gameStats.wins;
      draws += gameStats.draws;
      totalScore += gameStats.totalScore;
      bestScore = Math.max(bestScore, gameStats.highestScore);

      if (
        gameStats.played < 0
        || gameStats.wins < 0
        || gameStats.draws < 0
        || gameStats.totalScore < 0
        || gameStats.highestScore < 0
      ) {
        errors.push(`${label}: ${game.id} has a negative stat`);
      }
      if (gameStats.wins + gameStats.draws > gameStats.played) {
        errors.push(`${label}: ${game.id} wins + draws exceed games played`);
      }
      if (gameStats.highestScore > gameStats.totalScore) {
        errors.push(`${label}: ${game.id} highestScore exceeds totalScore`);
      }
    }

    if (played !== stats.gamesPlayed) {
      errors.push(`${label}: per-game games played do not sum to gamesPlayed`);
    }
    if (wins !== stats.wins) errors.push(`${label}: per-game wins do not sum to wins`);
    if (draws !== stats.draws) errors.push(`${label}: per-game draws do not sum to draws`);
    if (totalScore !== stats.totalScore) {
      errors.push(`${label}: per-game scores do not sum to totalScore`);
    }
    if (bestScore !== stats.bestScore) {
      errors.push(`${label}: bestScore is not the highest per-game score`);
    }

    if (stats.arcadion.matches > stats.gamesPlayed) {
      errors.push(`${label}: Arcadion matches exceed games played`);
    }
    if (stats.arcadion.wins > stats.arcadion.matches || stats.arcadion.wins > stats.wins) {
      errors.push(`${label}: Arcadion wins exceed matches or overall wins`);
    }
    if (stats.arcadion.bestScore > stats.bestScore) {
      errors.push(`${label}: Arcadion best score exceeds overall best score`);
    }
    if (
      stats.arcadion.winRatePercent
      !== toWinRatePercent(stats.arcadion.wins, stats.arcadion.matches)
    ) {
      errors.push(`${label}: Arcadion win rate does not match its record`);
    }
  }

  return errors;
}
