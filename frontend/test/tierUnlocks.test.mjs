import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath, URL } from "node:url";
import postcss from "postcss";
import { readFileSync } from "node:fs";

/*
 * Badge and level-avatar eligibility.
 *
 * The badge in My Profile and the level avatars in the Avatar Modal are two
 * presentations of one progression state. These tests pin that they can never
 * disagree, that the Rookie gate really is a completed-match gate rather than a
 * level gate, and that the tier themes are the ones the backend tier table names.
 */

const frontendRoot = fileURLToPath(new URL("../", import.meta.url));

// The modules under test are TypeScript, so they are loaded through the same
// vite instance the other suites use.
const { createServer } = await import("vite");
const server = await createServer({
  root: frontendRoot,
  logLevel: "silent",
  server: { middlewareMode: true },
  appType: "custom",
});
const modules = {
  progression: await server.ssrLoadModule("/src/auth/progression.ts"),
  eligibility: await server.ssrLoadModule("/src/auth/tierEligibility.ts"),
  catalog: await server.ssrLoadModule("/src/auth/avatarCatalog.ts"),
};
await server.close();

const { getProgressionView: view } = modules.progression;
const {
  getCompletedMatches,
  isTierEarned,
  getBadgeDisplay,
  getEarnedTier,
  getTierRequirement,
  MIN_COMPLETED_MATCHES_FOR_ROOKIE,
} = modules.eligibility;
const { LEVEL_AVATARS } = modules.catalog;

/* ------------------------------------------------------------------
   Fixtures: exactly the payload the backend tier table produces.
   ------------------------------------------------------------------ */

/*
 * The avatar tier ids are the human names (rookie, challenger...) while the
 * badge keys are the materials (bronze, silver...). They are the same tiers in
 * the same order, so this is the authoritative pairing between the two lists.
 */
const TIER_ID_BY_BADGE_KEY = {
  bronze: "rookie",
  silver: "challenger",
  gold: "veteran",
  diamond: "master",
  crown: "legend",
  flame: "supreme",
};

function backendProgression(level) {
  const tiers = [
    { maxLevel: 4, title: "Arcadia Rookie", badgeKey: "bronze", themeKey: "bronze" },
    { maxLevel: 9, title: "Arcadia Challenger", badgeKey: "silver", themeKey: "silver" },
    { maxLevel: 14, title: "Arcadia Veteran", badgeKey: "gold", themeKey: "gold" },
    { maxLevel: 19, title: "Arcadia Master", badgeKey: "diamond", themeKey: "diamond" },
    { maxLevel: 29, title: "Arcadia Legend", badgeKey: "crown", themeKey: "crown" },
    { maxLevel: null, title: "Arcadia Supreme", badgeKey: "flame", themeKey: "flame" },
  ];
  const tier = tiers.find((t) => t.maxLevel === null || level <= t.maxLevel);
  return {
    totalXp: 0,
    level,
    currentLevelXp: 0,
    nextLevelXp: 100,
    progressPercent: 0,
    title: tier.title,
    badgeKey: tier.badgeKey,
    themeKey: tier.themeKey,
  };
}

const stats = (gamesPlayed) => ({
  gamesPlayed,
  gamesWon: 0,
  totalScore: 0,
  bestScore: 0,
  currentStreak: 0,
  winRatePercent: 0,
});

/* ==================================================================
   The tier table itself
   ================================================================== */

test("every tier's theme names the same material as its badge", () => {
  for (const level of [0, 5, 10, 15, 20, 30]) {
    const result = view(backendProgression(level));
    assert.equal(
      result.themeKey,
      result.badgeKey,
      `level ${level}: theme ${result.themeKey} must match badge ${result.badgeKey}`,
    );
  }
});

test("the level ranges resolve to the documented tiers", () => {
  const expected = [
    [0, "Arcadia Rookie", "bronze"],
    [4, "Arcadia Rookie", "bronze"],
    [5, "Arcadia Challenger", "silver"],
    [9, "Arcadia Challenger", "silver"],
    [10, "Arcadia Veteran", "gold"],
    [14, "Arcadia Veteran", "gold"],
    [15, "Arcadia Master", "diamond"],
    [19, "Arcadia Master", "diamond"],
    [20, "Arcadia Legend", "crown"],
    [29, "Arcadia Legend", "crown"],
    [30, "Arcadia Supreme", "flame"],
  ];

  for (const [level, title, badgeKey] of expected) {
    const result = view(backendProgression(level));
    assert.equal(result.level, level);
    assert.equal(result.title, title, `level ${level}`);
    assert.equal(result.badgeKey, badgeKey, `level ${level}`);
  }
});

test("the level avatar catalog matches the backend tier unlock levels", () => {
  // The avatar tiers are a separate list, so they are pinned to the same
  // boundaries the badge table uses. This is what stops the two from drifting.
  const catalogLevels = Object.fromEntries(LEVEL_AVATARS.map((tier) => [tier.id, tier.minLevel]));
  assert.deepEqual(catalogLevels, {
    rookie: 0,
    challenger: 5,
    veteran: 10,
    master: 15,
    legend: 20,
    supreme: 30,
  });

  // And each catalog tier is the badge tier at that same level.
  for (const tier of LEVEL_AVATARS) {
    const badgeKey = view(backendProgression(tier.minLevel)).badgeKey;
    assert.equal(
      TIER_ID_BY_BADGE_KEY[badgeKey],
      tier.id,
      `${tier.label} unlocks exactly when its badge does`,
    );
  }
});

/* ==================================================================
   Rookie is gated on a completed match, not on a level
   ================================================================== */

test("Rookie stays unearned at every level until a completed match is recorded", () => {
  for (const level of [0, 1, 2, 3, 4]) {
    const progression = view(backendProgression(level));
    const badge = getBadgeDisplay(progression, 0);
    assert.equal(badge.isEarned, false, `level ${level} with no match: Rookie is unearned`);
    assert.equal(badge.themeKey, "unearned", `level ${level}: it uses the neutral treatment`);
    assert.equal(badge.title, "Arcadia Rookie", "the tier is still identified");

    const tier = getEarnedTier(progression, 0);
    assert.equal(tier.isEarned, false, "the badge and avatar gate agree");
  }
});

test("Rookie unlocks for the badge and the avatar together at one completed match", () => {
  const progression = view(backendProgression(0));
  const rookie = LEVEL_AVATARS.find((t) => t.id === "rookie");

  // The badge, from exactly the threshold.
  assert.equal(getBadgeDisplay(progression, MIN_COMPLETED_MATCHES_FOR_ROOKIE - 1).isEarned, false);
  assert.equal(getBadgeDisplay(progression, MIN_COMPLETED_MATCHES_FOR_ROOKIE).isEarned, true);

  // The avatar, from exactly the same threshold, decided by the same helper.
  const atZero = isTierEarned(rookie, progression, 0);
  const atOne = isTierEarned(rookie, progression, MIN_COMPLETED_MATCHES_FOR_ROOKIE);
  assert.equal(atZero.isEarned, false, "the avatar is locked below the threshold");
  assert.equal(atOne.isEarned, true, "and unlocked at it");
  assert.equal(atOne.requirement, "1 completed match", "the same requirement the badge states");
});

test("a missing, malformed or negative match count never unlocks Rookie", () => {
  for (const gamingStats of [
    stats(0),
    stats(null),
    stats(undefined),
    stats(Number.NaN),
    stats(-3),
    stats("2"),
  ]) {
    const count = getCompletedMatches(gamingStats);
    assert.ok(count === 0, `an unusable count reads as 0, got ${count}`);
    assert.equal(
      getBadgeDisplay(view(backendProgression(0)), count).isEarned,
      false,
      "and it never unlocks anything",
    );
  }
});

test("every tier above Rookie unlocks on level alone", () => {
  const progression = view(backendProgression(0));
  for (const tier of LEVEL_AVATARS.filter((t) => t.id !== "rookie")) {
    const result = isTierEarned(tier, progression, 0);
    assert.equal(
      result.isEarned,
      progression.level >= tier.minLevel,
      `${tier.label} is level gated only`,
    );
  }
});

/* ==================================================================
   Every tier boundary unlocks badge and avatar together
   ================================================================== */

test("each tier boundary unlocks its badge and its avatar at the same level", () => {
  for (const tier of LEVEL_AVATARS) {
    const below = view(backendProgression(Math.max(0, tier.minLevel - 1)));
    const at = view(backendProgression(tier.minLevel));

    const avatarBelow = isTierEarned(tier, below, tier.id === "rookie" ? 1 : 0);
    const avatarAt = isTierEarned(tier, at, tier.id === "rookie" ? 1 : 0);

    // Rookie is the only tier whose badge can be unearned above level 0, and it
    // is level 0 anyway, so the badge and the avatar must move together.
    const badgeBelow = getEarnedTier(below, tier.id === "rookie" ? 1 : 0);
    const badgeAt = getEarnedTier(at, tier.id === "rookie" ? 1 : 0);

    if (tier.id === "rookie") {
      assert.equal(avatarAt.isEarned, true, "Rookie unlocks with a completed match");
      assert.equal(badgeAt.isEarned, true, "and its badge is earned at the same time");
      continue;
    }

    assert.equal(avatarAt.isEarned, true, `${tier.label} unlocks at level ${tier.minLevel}`);
    assert.equal(
      avatarBelow.isEarned,
      false,
      `${tier.label} is still locked one level below ${tier.minLevel}`,
    );
    assert.equal(
      badgeAt.title,
      at.title,
      `${tier.label}: the badge is the tier the avatar just unlocked`,
    );
    assert.notEqual(
      badgeBelow.title,
      badgeAt.title,
      `${tier.label}: the badge really does change at the boundary`,
    );
  }
});

test("one level below each boundary does not unlock that tier", () => {
  for (const tier of LEVEL_AVATARS.filter((t) => t.minLevel > 0)) {
    const justBelow = view(backendProgression(tier.minLevel - 1));
    assert.equal(
      isTierEarned(tier, justBelow, 0).isEarned,
      false,
      `level ${tier.minLevel - 1} must not unlock ${tier.label}`,
    );
  }
});

test("no client state can promote a tier beyond the level it sits at", () => {
  // The helpers only read the level the backend derived. A level below a tier's
  // requirement keeps it locked no matter what else is supplied.
  const low = view(backendProgression(0));
  for (const tier of LEVEL_AVATARS) {
    const result = isTierEarned(tier, low, 999);
    if (tier.id === "rookie") {
      assert.equal(result.isEarned, true, "Rookie responds to matches, not level");
    } else {
      assert.equal(result.isEarned, false, `${tier.label} ignores anything but the level`);
    }
  }
});

test("every tier states the same requirement in the badge and the avatar", () => {
  // Rookie reports a completed match, every other tier its level. This is the
  // shared rule, so the two surfaces cannot word them differently.
  assert.equal(getTierRequirement("rookie", 0), "1 completed match");
  for (const [tierId, minLevel] of [["challenger", 5], ["veteran", 10], ["master", 15], ["legend", 20], ["supreme", 30]]) {
    assert.equal(getTierRequirement(tierId, minLevel), `level ${minLevel}`, tierId);
  }
});

/* ==================================================================
   The themes actually exist in the stylesheets
   ================================================================== */

const stylesheets = {
  "MyProfileModal.css": fileURLToPath(
    new URL("../src/pages/Myprofile/MyProfileModal.css", import.meta.url),
  ),
  "ProfilePopupmodal.css": fileURLToPath(
    new URL("../src/components/ProfilePopupmodal.css", import.meta.url),
  ),
  "PlayerProfile.css": fileURLToPath(
    new URL("../src/components/PlayerProfile.css", import.meta.url),
  ),
};

const TIERS = ["bronze", "silver", "gold", "diamond", "crown", "flame"];

test("every tier theme is styled wherever a badge is displayed", () => {
  for (const [name, path] of Object.entries(stylesheets)) {
    const selectors = [];
    postcss.parse(readFileSync(path, "utf8")).walkRules((rule) => selectors.push(...rule.selectors));
    for (const tier of TIERS) {
      assert.ok(
        selectors.some((selector) => selector.includes(`--${tier}`)),
        `${name} has no styles for the ${tier} theme`,
      );
    }
  }
});

test("the retired colour themes have no styles left behind", () => {
  const retired = ["neutral-grey", "bright-green", "deep-cyan", "crimson-red", "electric-purple", "neon-golden"];
  for (const [name, path] of Object.entries(stylesheets)) {
    const css = readFileSync(path, "utf8");
    for (const theme of retired) {
      assert.doesNotMatch(
        css,
        new RegExp(`--${theme}`),
        `${name} still styles the retired ${theme} theme`,
      );
    }
  }
});

test("the unearned theme exists and is neutral rather than a tier colour", () => {
  const css = readFileSync(stylesheets["MyProfileModal.css"], "utf8");
  const root = postcss.parse(css);
  let found = null;
  root.walkRules((rule) => {
    if (rule.selectors.includes(".mpm-identity-title--unearned")) {
      rule.walkDecls("color", (decl) => {
        found = decl.value.trim();
      });
    }
  });
  assert.equal(found, "#d5dae3", "the unearned pill uses the neutral grey, not a tier colour");
});

test("Player Profile badges use the same earned and unearned palettes as My Profile", () => {
  const myProfileRoot = postcss.parse(readFileSync(stylesheets["MyProfileModal.css"], "utf8"));
  const playerProfileRoot = postcss.parse(readFileSync(stylesheets["PlayerProfile.css"], "utf8"));
  const themes = [...TIERS, "unearned"];

  for (const theme of themes) {
    const myProfileRule = myProfileRoot.nodes.find(
      (node) => node.type === "rule" && node.selectors.includes(`.mpm-identity-title--${theme}`),
    );
    let playerProfileRule;
    playerProfileRoot.walkRules((rule) => {
      if (rule.selectors.includes(`.player-profile-progression-badges .mpm-identity-title--${theme}`)) {
        playerProfileRule = rule;
      }
    });
    assert.ok(myProfileRule, `My Profile has the ${theme} badge theme`);
    assert.ok(playerProfileRule, `Player Profile has the ${theme} badge theme`);

    for (const property of ["border-color", "background", "color"]) {
      const expected = myProfileRule.nodes.find(
        (node) => node.type === "decl" && node.prop === property,
      )?.value;
      const actual = playerProfileRule.nodes.find(
        (node) => node.type === "decl" && node.prop === property,
      )?.value;
      assert.equal(actual, expected, `${theme} badge ${property} matches My Profile`);
    }
  }
});

test("the flame theme keeps the existing animated badge treatment", () => {
  const css = readFileSync(stylesheets["MyProfileModal.css"], "utf8");
  // The animation is driven off the badge key, and its keyframes are unchanged.
  assert.match(css, /\.mpm-level-card--animated \.mpm-level-badge-wrap \{\s*animation: mpmFlameBadge 2\.4s/);
  assert.match(css, /@keyframes mpmFlameBadge/);
  assert.match(css, /@keyframes mpmFlameBadgeText/);
  // And it is still disabled under reduced motion.
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation: none/);
});
