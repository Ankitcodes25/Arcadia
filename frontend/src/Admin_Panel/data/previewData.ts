/*
 * DEVELOPMENT-PREVIEW DATA — NOT REAL PRODUCTION DATA.
 *
 * Every value in this file is a hand-written sample used to lay out and
 * interaction-test the Admin Panel before real management APIs exist. None of
 * it is fetched from any backend, none of it is live, and none of it should be
 * presented as real Arcadia statistics. Pages that render preview data show a
 * visible "Preview data" notice.
 *
 * Player-facing rows are projected from the ONE centralized development
 * fixture (src/data/development/dummyPlayers.ts), so the admin table, the
 * reports, the support inbox and the moderation log all name the same ten
 * sample accounts. No extra hardcoded player profile lives here.
 *
 * When real admin APIs are built, pages should source their data through
 * src/Admin_Panel/services/ and this file can be deleted. The authenticated
 * admin identity is NEVER stored here — it comes only from the admin session.
 */

import { getLocalAvatarOption } from "../../auth/avatarCatalog";
import {
  DUMMY_GAMES,
  DUMMY_PLAYERS,
  getDummyPlayerByUsername,
  type DummyPlayer,
} from "../../data/development/dummyPlayers";
import type {
  PreviewAccountStatus,
  PreviewActivityEntry,
  PreviewAnnouncement,
  PreviewBadge,
  PreviewDashboardStats,
  PreviewGame,
  PreviewModerationAction,
  PreviewPlayer,
  PreviewReport,
  PreviewSupportRequest,
} from "../types/adminTypes";

export const PREVIEW_DATA_NOTICE =
  "Preview data — this page uses development samples until the admin management APIs are connected.";

const BADGE_LABELS: Record<PreviewBadge["tone"], string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  diamond: "Diamond",
  crown: "Crown",
  flame: "Flame",
};

function playerByUsername(username: string): DummyPlayer {
  const player = getDummyPlayerByUsername(username);
  if (!player) throw new Error(`Unknown development preview player: ${username}`);
  return player;
}

function accountStatus(player: DummyPlayer): PreviewAccountStatus {
  return player.status === "SUSPENDED" ? "Suspended" : "Active";
}

function playerIdentity(player: DummyPlayer) {
  return {
    username: player.username,
    playerId: player.playerId,
    displayName: player.displayName,
  };
}

function supportEmail(player: DummyPlayer): string {
  return `${player.username.toLowerCase()}@example.com`;
}

function gameName(player: DummyPlayer): string {
  return DUMMY_GAMES.find((game) => game.id === player.favoriteGame)?.name
    ?? player.favoriteGame;
}

function toPreviewPlayer(player: DummyPlayer): PreviewPlayer {
  return {
    id: `pv-${player.id}`,
    playerId: player.playerId,
    username: player.username,
    displayName: player.displayName,
    avatar: getLocalAvatarOption(player.avatarId).label.slice(0, 1).toUpperCase(),
    badge: {
      label: BADGE_LABELS[player.progression.badgeKey],
      tone: player.progression.badgeKey,
    },
    level: player.progression.level,
    totalXp: player.totalXp,
    xpIntoLevel: player.progression.currentLevelXp,
    xpPerLevel: player.progression.nextLevelXp,
    status: accountStatus(player),
    joinedDate: player.joinedAt,
    lastActive: player.lastActiveAt,
    stats: {
      matchesPlayed: player.stats.gamesPlayed,
      wins: player.stats.wins,
      losses: player.stats.losses,
      draws: player.stats.draws,
      favoriteGame: gameName(player),
      winRate: player.stats.winRatePercent,
    },
    moderation: { ...player.moderation },
  };
}

export const previewPlayers: PreviewPlayer[] = DUMMY_PLAYERS.map(toPreviewPlayer);

const recentPlayers = [...DUMMY_PLAYERS].sort(
  (a, b) => Date.parse(b.joinedAt) - Date.parse(a.joinedAt),
);

export const previewRecentActivity: PreviewActivityEntry[] = [
  {
    id: "act-1",
    icon: "user",
    text: `${recentPlayers[0].username} registered a new player account`,
    timestamp: "2026-10-30T09:12:00Z",
  },
  {
    id: "act-2",
    icon: "flag",
    text: `Report #R-1041 opened against ${playerByUsername("Crownless").username} by ${playerByUsername("SolarisPrime").username}`,
    timestamp: "2026-10-30T08:47:00Z",
  },
  {
    id: "act-3",
    icon: "shield",
    text: `Moderator note added for player ${playerByUsername("Crownless").playerId}`,
    timestamp: "2026-10-29T18:05:00Z",
  },
  {
    id: "act-4",
    icon: "megaphone",
    text: "Announcement 'Season 4 Kickoff' published",
    timestamp: "2026-10-29T15:30:00Z",
  },
  {
    id: "act-5",
    icon: "gamepad",
    text: "Memory set to Maintenance in Game Management",
    timestamp: "2026-10-29T11:20:00Z",
  },
  {
    id: "act-6",
    icon: "user",
    text: `${recentPlayers[1].username} registered a new player account`,
    timestamp: "2026-10-29T10:02:00Z",
  },
];

export const previewReports: PreviewReport[] = [
  {
    id: "R-1041",
    reportedPlayer: playerIdentity(playerByUsername("Crownless")),
    reportingPlayer: playerIdentity(playerByUsername("SolarisPrime")),
    reason: "Unsportsmanlike conduct",
    details: "Repeated abusive chat messages after every match in the Ludo queue on 29 October. Screenshots attached in the original ticket.",
    submittedDate: "2026-10-30T08:47:00Z",
    status: "Open",
  },
  {
    id: "R-1040",
    reportedPlayer: playerIdentity(playerByUsername("NovaRider")),
    reportingPlayer: playerIdentity(playerByUsername("TitanVale")),
    reason: "Suspected automation",
    details: "Player completes memory rounds in under two seconds with perfect accuracy every time.",
    submittedDate: "2026-10-29T20:14:00Z",
    status: "Under Review",
  },
  {
    id: "R-1039",
    reportedPlayer: playerIdentity(playerByUsername("ByteBard")),
    reportingPlayer: playerIdentity(playerByUsername("AstralFox")),
    reason: "Inappropriate username",
    details: "Name changes frequently to impersonate official Arcadion announcements in the leaderboard chat.",
    submittedDate: "2026-10-28T16:02:00Z",
    status: "Resolved",
  },
  {
    id: "R-1038",
    reportedPlayer: playerIdentity(playerByUsername("LudoLynx")),
    reportingPlayer: playerIdentity(playerByUsername("EchoWarden")),
    reason: "Exploit abuse",
    details: "Claimed the snake-head square grants double turns. Could not reproduce.",
    submittedDate: "2026-10-26T10:31:00Z",
    status: "Dismissed",
  },
  {
    id: "R-1037",
    reportedPlayer: playerIdentity(playerByUsername("QuasarKid")),
    reportingPlayer: playerIdentity(playerByUsername("PixelSage")),
    reason: "Harassment",
    details: "Reporter claims targeted rematch follows; match logs show random matchmaking. Needs a second look.",
    submittedDate: "2026-10-24T13:55:00Z",
    status: "Open",
  },
];

export const previewSupportRequests: PreviewSupportRequest[] = [
  {
    id: "S-2210",
    user: {
      username: playerByUsername("NovaRider").username,
      playerId: playerByUsername("NovaRider").playerId,
      email: supportEmail(playerByUsername("NovaRider")),
    },
    subject: "Cannot link Google account",
    category: "Account",
    message: "The Google sign-in button returns me to the landing page without linking. I already have a username.",
    submittedDate: "2026-10-30T07:58:00Z",
    status: "New",
    priority: "High",
  },
  {
    id: "S-2209",
    user: {
      username: playerByUsername("PixelSage").username,
      playerId: playerByUsername("PixelSage").playerId,
      email: supportEmail(playerByUsername("PixelSage")),
    },
    subject: "Sound settings do not persist",
    category: "Settings",
    message: "Turning sound effects off resets after every page reload on my tablet.",
    submittedDate: "2026-10-29T18:22:00Z",
    status: "In Progress",
    priority: "Normal",
  },
  {
    id: "S-2208",
    user: {
      username: playerByUsername("TitanVale").username,
      playerId: playerByUsername("TitanVale").playerId,
      email: supportEmail(playerByUsername("TitanVale")),
    },
    subject: "Match history shows a missing game",
    category: "Bug",
    message: "A Ludo match from 27 October never appeared in my history. Match ID if needed: MD-8841.",
    submittedDate: "2026-10-28T09:40:00Z",
    status: "Resolved",
    priority: "Normal",
  },
  {
    id: "S-2207",
    user: {
      username: playerByUsername("ByteBard").username,
      playerId: playerByUsername("ByteBard").playerId,
      email: supportEmail(playerByUsername("ByteBard")),
    },
    subject: "How do leaderboards work?",
    category: "Question",
    message: "Do weekly leaderboards reset every Monday? Where can I see my rank history?",
    submittedDate: "2026-10-27T15:12:00Z",
    status: "Closed",
    priority: "Low",
  },
];

export const previewGames: PreviewGame[] = [
  { id: "g-ludo", name: "Ludo", category: "Board Game", icon: "🎲", description: "Outplay Arcadion and rule the board.", status: "Live", totalMatches: 14230, activePlayers: 142 },
  { id: "g-snake", name: "Snake", category: "Arcade", icon: "🐍", description: "Grow longer and survive Arcadion's challenge.", status: "Live", totalMatches: 11980, activePlayers: 118 },
  { id: "g-tictactoe", name: "Tic Tac Toe", category: "Classic", icon: "⭕", description: "Outsmart Arcadion in the X and O battle.", status: "Live", totalMatches: 9640, activePlayers: 87 },
  { id: "g-rps", name: "Rock Paper Scissors", category: "Quick Play", icon: "✊", description: "Make your move and challenge Arcadion.", status: "Live", totalMatches: 6520, activePlayers: 54 },
  { id: "g-snakesladder", name: "Snake & Ladder", category: "Board Game", icon: "🪜", description: "Climb your way up and escape Arcadion.", status: "Live", totalMatches: 4210, activePlayers: 41 },
  { id: "g-memory", name: "Memory", category: "Puzzle", icon: "🧠", description: "Match the cards and outthink Arcadion.", status: "Maintenance", totalMatches: 1630, activePlayers: 0 },
];

export const previewModerationActions: PreviewModerationAction[] = [
  {
    id: "M-512",
    actionType: "Warning",
    targetType: "Player",
    targetReference: playerByUsername("PixelSage").playerId,
    targetUsername: playerByUsername("PixelSage").username,
    reason: "Chat conduct",
    details: "Friendly warning after an argument in leaderboard chat. Player acknowledged.",
    moderator: "admin",
    status: "Completed",
    createdDate: "2026-09-30T14:00:00Z",
  },
  {
    id: "M-511",
    actionType: "Report Review",
    targetType: "Report",
    targetReference: "R-1039",
    targetUsername: playerByUsername("ByteBard").username,
    reason: "Inappropriate username",
    details: "Username reviewed against policy; no violation found at this time. Report resolved with note.",
    moderator: "admin",
    status: "Completed",
    createdDate: "2026-10-28T17:10:00Z",
  },
  {
    id: "M-510",
    actionType: "Escalation",
    targetType: "Report",
    targetReference: "R-1040",
    targetUsername: playerByUsername("NovaRider").username,
    reason: "Suspected automation",
    details: "Gameplay telemetry requested from the game service before any action. Awaiting data.",
    moderator: "admin",
    status: "Pending",
    createdDate: "2026-10-29T21:30:00Z",
  },
  {
    id: "M-509",
    actionType: "Note",
    targetType: "Player",
    targetReference: playerByUsername("Crownless").playerId,
    targetUsername: playerByUsername("Crownless").username,
    reason: "Behaviour trend",
    details: "Third report in a month. Next offence should escalate to suspension per policy draft.",
    moderator: "admin",
    status: "Completed",
    createdDate: "2026-10-20T10:45:00Z",
  },
];

export const previewAnnouncements: PreviewAnnouncement[] = [
  {
    id: "A-104",
    title: "Season 4 Kickoff",
    body: "Season 4 begins this week! Fresh leaderboards, new daily challenges and a returning Arcadion gauntlet. Jump in and claim your placement matches.",
    status: "Published",
    author: "admin",
    createdDate: "2026-10-29T14:00:00Z",
    publishedDate: "2026-10-29T15:30:00Z",
  },
  {
    id: "A-103",
    title: "Scheduled maintenance — Memory",
    body: "The Memory game goes into maintenance while we tune the difficulty curve. All other games stay online.",
    status: "Published",
    author: "admin",
    createdDate: "2026-10-29T10:30:00Z",
    publishedDate: "2026-10-29T11:00:00Z",
  },
  {
    id: "A-102",
    title: "Community weekend teaser",
    body: "Something multiplayer-shaped is arriving next weekend. Details drop Friday.",
    status: "Scheduled",
    author: "admin",
    createdDate: "2026-10-28T16:20:00Z",
    publishedDate: null,
  },
  {
    id: "A-101",
    title: "Draft: fairness update",
    body: "Work-in-progress copy about matchmaking improvements. Not ready to publish.",
    status: "Draft",
    author: "admin",
    createdDate: "2026-10-26T09:05:00Z",
    publishedDate: null,
  },
];

/** Recent registrations shown on the dashboard (the four newest fixtures). */
export const previewRecentRegistrations: Array<{
  playerId: string;
  username: string;
  level: number;
  joinedDate: string;
  status: PreviewAccountStatus;
}> = recentPlayers.slice(0, 4).map((player) => ({
  playerId: player.playerId,
  username: player.username,
  level: player.progression.level,
  joinedDate: player.joinedAt,
  status: accountStatus(player),
}));

/** Headline counts, all derived from the same fixtures. */
export const previewDashboardStats: PreviewDashboardStats = {
  totalPlayers: previewPlayers.length,
  activePlayers: previewPlayers.filter((player) => player.status === "Active").length,
  totalMatches: previewPlayers.reduce(
    (total, player) => total + player.stats.matchesPlayed,
    0,
  ),
  pendingReports: previewReports.filter((report) => report.status === "Open").length,
};
