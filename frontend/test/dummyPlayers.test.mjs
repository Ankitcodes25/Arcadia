import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import { createServer } from "vite";

/*
 * The centralized development fixtures, exercised as data.
 *
 * These tests protect the invariants the UI relies on: exactly ten fictional
 * players, unique public ids, catalogue avatars, backend-derived levels/badges,
 * and arithmetic that never contradicts itself. They do not touch a database.
 */
const frontendRoot = fileURLToPath(new URL("../", import.meta.url));

let vite;
let dummy;
let avatars;

before(async () => {
  vite = await createServer({
    root: frontendRoot,
    logLevel: "silent",
    server: { middlewareMode: true },
    appType: "custom",
  });
  dummy = await vite.ssrLoadModule("/src/data/development/dummyPlayers.ts");
  avatars = await vite.ssrLoadModule("/src/auth/avatarCatalog.ts");
});

after(async () => {
  await vite?.close();
});

test("there are exactly ten dummy players with unique identities", () => {
  const players = dummy.DUMMY_PLAYERS;

  assert.equal(players.length, 10);
  assert.equal(new Set(players.map((player) => player.id)).size, 10, "unique internal ids");
  assert.equal(new Set(players.map((player) => player.playerId)).size, 10, "unique player ids");
  assert.equal(new Set(players.map((player) => player.username)).size, 10, "unique usernames");

  for (const player of players) {
    assert.match(player.playerId, /^ARC-[A-Z0-9]{8}$/);
    assert.ok(player.username.trim().length > 0);
    assert.ok(player.displayName.trim().length > 0);
    assert.ok(!["PlayerOne", "ShadowX", "PixelRogue", "ShadowByte"].includes(player.username));
  }
});

test("the fixtures are clearly development-only and gated", () => {
  assert.equal(dummy.DUMMY_PLAYERS_ENABLED, true, "Vite dev/test mode enables fixtures");
  assert.match(dummy.DUMMY_PLAYER_DATA_NOTICE, /development demo/i);
  assert.match(dummy.DUMMY_PLAYER_DATA_NOTICE, /not real/i);
});

test("every avatar id exists in the shared avatar catalogue", () => {
  const known = new Set(avatars.LOCAL_AVATARS.map((avatar) => avatar.id));

  for (const player of dummy.DUMMY_PLAYERS) {
    assert.ok(known.has(player.avatarId), `${player.username} uses ${player.avatarId}`);
  }
});

test("the tier mix covers two Rookie, two Challenger, two Veteran, two Master, one Legend and one Supreme", () => {
  const counts = dummy.DUMMY_PLAYERS.reduce((result, player) => {
    result[player.progression.badgeKey] = (result[player.progression.badgeKey] ?? 0) + 1;
    return result;
  }, {});

  assert.deepEqual(counts, {
    bronze: 2,
    silver: 2,
    gold: 2,
    diamond: 2,
    crown: 1,
    flame: 1,
  });
});

test("levels, titles and badges are derived from the fixture XP", () => {
  const expected = {
    NovaRider: { level: 1, badgeKey: "bronze", title: "Arcadia Rookie" },
    ByteBard: { level: 3, badgeKey: "bronze", title: "Arcadia Rookie" },
    QuasarKid: { level: 6, badgeKey: "silver", title: "Arcadia Challenger" },
    LudoLynx: { level: 8, badgeKey: "silver", title: "Arcadia Challenger" },
    EchoWarden: { level: 11, badgeKey: "gold", title: "Arcadia Veteran" },
    PixelSage: { level: 13, badgeKey: "gold", title: "Arcadia Veteran" },
    TitanVale: { level: 16, badgeKey: "diamond", title: "Arcadia Master" },
    Crownless: { level: 18, badgeKey: "diamond", title: "Arcadia Master" },
    AstralFox: { level: 23, badgeKey: "crown", title: "Arcadia Legend" },
    SolarisPrime: { level: 40, badgeKey: "flame", title: "Arcadia Supreme" },
  };

  for (const player of dummy.DUMMY_PLAYERS) {
    const tier = expected[player.username];
    assert.ok(tier, `unexpected fixture ${player.username}`);
    assert.equal(player.progression.level, tier.level, `${player.username} level`);
    assert.equal(player.progression.badgeKey, tier.badgeKey, `${player.username} badge`);
    assert.equal(player.progression.title, tier.title, `${player.username} title`);
    assert.equal(player.progression.themeKey, tier.badgeKey, `${player.username} theme`);
    assert.equal(player.progression.totalXp, player.totalXp);
    assert.ok(player.progression.currentLevelXp >= 0);
    assert.ok(player.progression.nextLevelXp > 0);
    assert.ok(player.progression.progressPercent >= 0);
    assert.ok(player.progression.progressPercent <= 100);
  }
});

test("overall stats add up and the win rate matches the record", () => {
  for (const player of dummy.DUMMY_PLAYERS) {
    const stats = player.stats;
    const expectedWinRate = Math.round((stats.wins / stats.gamesPlayed) * 1000) / 10;

    assert.equal(
      stats.wins + stats.losses + stats.draws,
      stats.gamesPlayed,
      `${player.username} result total`,
    );
    assert.ok(stats.gamesPlayed > 0);
    assert.ok(stats.wins >= 0 && stats.losses >= 0 && stats.draws >= 0);
    assert.ok(stats.bestScore > 0);
    assert.ok(stats.bestScore <= stats.totalScore);
    assert.equal(stats.winRatePercent, expectedWinRate, `${player.username} win rate`);
  }
});

test("per-game breakdowns sum to the overall record", () => {
  for (const player of dummy.DUMMY_PLAYERS) {
    const stats = player.stats;
    let played = 0;
    let wins = 0;
    let draws = 0;
    let totalScore = 0;
    let bestScore = 0;

    for (const game of dummy.DUMMY_GAMES) {
      const gameStats = stats.games[game.id];
      assert.ok(gameStats, `${player.username} has a ${game.id} row`);
      played += gameStats.played;
      wins += gameStats.wins;
      draws += gameStats.draws;
      totalScore += gameStats.totalScore;
      bestScore = Math.max(bestScore, gameStats.highestScore);
      assert.ok(gameStats.wins + gameStats.draws <= gameStats.played);
      assert.ok(gameStats.highestScore <= gameStats.totalScore);
    }

    assert.equal(played, stats.gamesPlayed, `${player.username} per-game games`);
    assert.equal(wins, stats.wins, `${player.username} per-game wins`);
    assert.equal(draws, stats.draws, `${player.username} per-game draws`);
    assert.equal(totalScore, stats.totalScore, `${player.username} per-game score`);
    assert.equal(bestScore, stats.bestScore, `${player.username} best score`);
  }
});

test("Arcadion numbers are a consistent subset of the player's record", () => {
  for (const player of dummy.DUMMY_PLAYERS) {
    const arcadion = player.stats.arcadion;
    assert.ok(arcadion.matches <= player.stats.gamesPlayed);
    assert.ok(arcadion.wins <= arcadion.matches);
    assert.ok(arcadion.wins <= player.stats.wins);
    assert.ok(arcadion.bestScore <= player.stats.bestScore);
    assert.equal(
      arcadion.winRatePercent,
      Math.round((arcadion.wins / arcadion.matches) * 1000) / 10,
    );
  }
});

test("the public-profile adapter produces the real API shape", () => {
  const player = dummy.getDummyPlayerByUsername("sol arisprime".replace(" ", ""));
  assert.ok(player);
  assert.equal(player.username, "SolarisPrime");

  const profile = dummy.toDummyPublicProfile(player);
  assert.equal(profile.id, `preview:${player.id}`);
  assert.equal(profile.username, player.username);
  assert.equal(profile.playerId, player.playerId);
  assert.deepEqual(profile.avatar, { type: "local", value: player.avatarId });
  assert.equal(profile.completedMatches, player.stats.gamesPlayed);
  assert.equal(profile.createdAt, player.joinedAt);
  assert.equal(dummy.getDummyPlayerForPublicProfile(profile), player);

  // A real backend profile is never replaced by demo statistics.
  assert.equal(dummy.getDummyPlayerForPublicProfile({
    id: "real-user-id",
    username: "SolarisPrime",
    playerId: player.playerId,
  }), null);
});

test("lookups are case-insensitive and reject unknown names", () => {
  assert.equal(dummy.getDummyPlayerByUsername("novarider").username, "NovaRider");
  assert.equal(dummy.getDummyPlayerByPlayerId("arc-4h7n2k9q").username, "NovaRider");
  assert.equal(dummy.getDummyPlayerByUsername("not-a-player"), null);
  assert.equal(dummy.getDummyPlayerById(null), null);
});

test("the fixtures pass their own integrity validator", () => {
  assert.deepEqual(dummy.validateDummyPlayers(), []);
  assert.equal(dummy.validateDummyPlayers(dummy.DUMMY_PLAYERS.slice(0, 9)).length > 0, true);
});
