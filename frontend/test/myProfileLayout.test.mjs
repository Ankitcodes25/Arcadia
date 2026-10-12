import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import postcss from "postcss";

const css = readFileSync(
  fileURLToPath(new URL("../src/pages/Myprofile/MyProfileModal.css", import.meta.url)),
  "utf8",
);
const root = postcss.parse(css);

/**
 * Every declaration of `prop` on `selector`, in source order, each paired with
 * the media query it sits inside (or null for an unconditional rule).
 */
function declarationsFor(selector, prop) {
  const found = [];
  root.walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return;
    const media = rule.parent.type === "atrule" && rule.parent.name === "media"
      ? rule.parent.params
      : null;
    rule.walkDecls(prop, (decl) => {
      found.push({ value: decl.value.trim(), media, line: decl.source.start.line });
    });
  });
  return found;
}

test("the My Profile modal is widened by a desktop-only rule", () => {
  const widths = declarationsFor(".mpm-modal", "width");

  // The base width is unchanged, and it is the only unconditional one.
  const unconditional = widths.filter((entry) => entry.media === null);
  assert.equal(unconditional.length, 1, "exactly one unconditional modal width");
  assert.equal(unconditional[0].value, "min(100%, 660px)", "the base width is untouched");

  // The wider width exists, and only inside a min-width query, so it cannot
  // match at or below the tablet breakpoint.
  const widened = widths.filter((entry) => entry.value === "min(100%, 880px)");
  assert.equal(widened.length, 1, "one widened desktop width");
  assert.match(widened[0].media, /min-width/, `the widening must be min-width, got ${widened[0].media}`);

  // Nothing else touches the modal width.
  assert.deepEqual(
    widths.map((entry) => entry.value),
    ["min(100%, 660px)", "min(100%, 880px)"],
    "no other width was introduced or removed",
  );
});

test("no max-width query changes the modal width, so tablet and mobile are preserved", () => {
  const offenders = declarationsFor(".mpm-modal", "width")
    .filter((entry) => entry.media && entry.media.includes("max-width"));
  assert.deepEqual(offenders, [], "the tablet and mobile widths are exactly as they were");
});

test("Account Info is a 2x2 grid on desktop and collapses only on small phones", () => {
  const columns = declarationsFor(".mpm-info-grid", "grid-template-columns");
  const desktop = columns.find((entry) => entry.media === null);
  assert.ok(desktop, "the grid has a base column count");
  assert.equal(desktop.value, "repeat(2, minmax(0, 1fr))", "2x2 by default, so 2x2 on laptop and desktop");

  // The single-column fallback is the pre-existing small-phone breakpoint and
  // does not touch the tablet range.
  for (const entry of columns.filter((e) => e.media)) {
    assert.match(entry.media, /max-width:\s*560px/, `unexpected breakpoint ${entry.media}`);
  }
});

test("the removed action row and avatar picker have no styles left behind", () => {
  for (const selector of [
    ".mpm-actions",
    ".mpm-save",
    ".mpm-reset",
    ".mpm-pending-pill",
    ".mpm-identity-value--pending",
    ".mpm-avatar-picker",
    ".mpm-avatar-picker-grid",
    ".mpm-avatar-picker-cancel",
    ".mpm-avatar-option",
    ".mpm-avatar-option--selected",
    ".mpm-avatar-option--google",
    ".mpm-avatar-google-preview",
  ]) {
    const found = [];
    root.walkRules((rule) => {
      if (rule.selectors.includes(selector)) found.push(rule.source.start.line);
    });
    assert.deepEqual(found, [], `${selector} is no longer rendered, so it has no styles`);
  }
});

test("each Account Info item has its own icon and the active tone is a green accent", () => {
  const selectors = [];
  root.walkRules((rule) => selectors.push(...rule.selectors));

  for (const selector of [
    ".mpm-info-icon",
    ".mpm-info-label",
    ".mpm-info-value",
    ".mpm-info-hint",
    ".mpm-info-card",
    ".mpm-info-grid",
  ]) {
    assert.ok(selectors.includes(selector), `${selector} is styled`);
  }
  assert.ok(selectors.includes(".mpm-info-value--active"), "the active status tone exists");
  assert.ok(selectors.includes(".mpm-info-value--inactive"), "the inactive status tone exists");

  const active = declarationsFor(".mpm-info-value--active", "color");
  assert.equal(active.length, 1, "one active colour");
  assert.match(active[0].value, /#6ee7b7/i, "a restrained green");
});

test("the profile body scrolls below a fixed header and stays centred", () => {
  assert.deepEqual(
    declarationsFor(".mpm-modal", "overflow").map((e) => e.value),
    ["hidden"],
    "the modal clips overflow instead of scrolling the header",
  );
  assert.deepEqual(
    declarationsFor(".mpm-body", "overflow-y").map((e) => e.value),
    ["auto"],
    "the profile body scrolls internally",
  );
  assert.deepEqual(
    declarationsFor(".mpm-header", "flex").map((e) => e.value),
    ["none"],
    "the header stays outside the scroll area",
  );
  assert.deepEqual(
    declarationsFor(".mpm-backdrop", "justify-content").map((e) => e.value),
    ["center"],
    "the backdrop still centres the dialog",
  );
});

test("the identity hierarchy types the Player ID below the username", () => {
  // The username inherits the base identity size; the Player ID overrides it.
  const name = declarationsFor(".mpm-identity-value", "font-size");
  const player = declarationsFor(".mpm-identity-value--player", "font-size");

  assert.equal(name.length, 1, "the username has an explicit size");
  assert.equal(player.length, 1, "the Player ID has an explicit size");
  assert.ok(
    parseFloat(player[0].value) < parseFloat(name[0].value),
    `the Player ID (${player[0].value}) must be smaller than the username (${name[0].value})`,
  );

  // The Player ID keeps the secondary accent colour, the username is white.
  assert.match(
    declarationsFor(".mpm-identity-value--player", "color")[0].value,
    /#d9a9ff/i,
    "the Player ID stays a muted accent",
  );
  assert.match(
    declarationsFor(".mpm-identity-value--name", "color")[0].value,
    /white/i,
    "the username is the bright value",
  );
});

test("My Profile is layered above the Profile Popup that opens it", () => {
  const popupCss = readFileSync(
    fileURLToPath(new URL("../src/components/ProfilePopupmodal.css", import.meta.url)),
    "utf8",
  );
  const popupRoot = postcss.parse(popupCss);

  const zIndexes = (root) => {
    const found = [];
    root.walkRules((rule) => {
      rule.walkDecls("z-index", (decl) => {
        found.push({ selector: rule.selector, value: Number(decl.value.trim()) });
      });
    });
    return found;
  };

  const backdrop = zIndexes(root).find((entry) => entry.selector === ".mpm-backdrop");
  const popup = zIndexes(popupRoot).find((entry) => entry.selector === ".profile-popup");

  assert.ok(backdrop, "the My Profile backdrop declares a z-index");
  assert.ok(popup, "the Profile Popup declares a z-index");
  assert.ok(
    backdrop.value > popup.value,
    `My Profile (${backdrop.value}) must sit above the Profile Popup (${popup.value}), otherwise the popup would float over the dialog`,
  );
});

test("the Account Info cards use the Game Breakdown luminous edge treatment", () => {
  // The Game Breakdown container is the reference treatment.
  const reference = declarationsFor(".mpm-section--highlight .mpm-table-scroll", "box-shadow")[0];
  assert.ok(reference, "the Game Breakdown glow exists");

  const card = declarationsFor(".mpm-info-card", "box-shadow")[0];
  assert.ok(card, "the Account Info cards declare a glow too");

  // Same outer glow and inset wash, so the two read as one system.
  assert.match(card.value, /0 0 22px rgba\(224, 105, 255, 0\.2\)/, "the same outer purple glow");
  assert.match(card.value, /inset 0 0 16px rgba\(224, 105, 255, 0\.06\)/, "the same inset wash");

  // Same border weight and brightness family, and the same radius family. The
  // Game Breakdown uses a longhand override, so compare the resolved colour.
  const cardBorder = declarationsFor(".mpm-info-card", "border")[0].value;
  assert.match(cardBorder, /^1px solid /, "the same 1px border weight");
  const cardAlpha = Number(cardBorder.match(/rgba\(224, 105, 255, ([\d.]+)\)/)[1]);
  const tableBorder = declarationsFor(".mpm-section--highlight .mpm-table-scroll", "border-color")[0].value;
  assert.equal(
    cardAlpha,
    Number(tableBorder.match(/rgba\(224, 105, 255, ([\d.]+)\)/)[1]),
    "the card border alpha matches the Game Breakdown border",
  );

  const cardRadius = parseFloat(declarationsFor(".mpm-info-card", "border-radius")[0].value);
  const tableRadius = parseFloat(declarationsFor(".mpm-table-scroll", "border-radius")[0].value);
  assert.equal(cardRadius, tableRadius, "the same corner-radius family");

  // The interior stays dark purple, and the glow is restrained rather than loud.
  assert.match(declarationsFor(".mpm-info-card", "background")[0].value, /rgba\(28, 13, 52/, "a dark purple interior");
  const alpha = Number(card.value.match(/0 0 22px rgba\(224, 105, 255, ([\d.]+)\)/)[1]);
  assert.ok(alpha <= 0.3, `the glow must stay restrained, got alpha ${alpha}`);
});

test("the removed identity wrapper has no styles left behind", () => {
  for (const selector of [".mpm-identity-fields", ".mpm-identity-field"]) {
    const found = [];
    root.walkRules((rule) => {
      if (rule.selectors.includes(selector)) found.push(rule.source.start.line);
    });
    assert.deepEqual(found, [], `${selector} is no longer rendered, so it has no styles`);
  }
});

/* ==================================================================
   Avatar Modal stylesheet

   The Avatar Modal is a child of My Profile, so it must stay layered above
   it, and the grid is now a single continuous run of tiles.
   ================================================================== */

const avatarsCss = readFileSync(
  fileURLToPath(new URL("../src/pages/Myprofile/AvatarsModal.css", import.meta.url)),
  "utf8",
);
const avatarsRoot = postcss.parse(avatarsCss);

function avatarDeclarations(selector, prop) {
  const found = [];
  avatarsRoot.walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return;
    const media = rule.parent.type === "atrule" && rule.parent.name === "media"
      ? rule.parent.params
      : null;
    rule.walkDecls(prop, (decl) => found.push({ value: decl.value.trim(), media }));
  });
  return found;
}

test("the Avatar Modal is layered above the My Profile dialog it sits on", () => {
  const zOf = (target, selector) => {
    let value = null;
    target.walkRules((rule) => {
      if (rule.selectors.includes(selector)) {
        rule.walkDecls("z-index", (decl) => {
          value = Number(decl.value.trim());
        });
      }
    });
    return value;
  };

  const backdrop = zOf(avatarsRoot, ".avm-backdrop");
  const parent = zOf(root, ".mpm-backdrop");
  assert.ok(backdrop !== null && parent !== null, "both backdrops declare a z-index");
  assert.ok(
    backdrop > parent,
    `the Avatar Modal (${backdrop}) must sit above My Profile (${parent})`,
  );
});

test("an unavailable avatar tile never gets the blocking cursor", () => {
  // A disabled button would be painted with the browser's prohibited cursor, so
  // the rule that caused it must not exist.
  assert.deepEqual(
    avatarDeclarations(".avm-tile:disabled", "cursor"),
    [],
    "no disabled-tile cursor rule, so no prohibited cursor is painted",
  );

  for (const selector of [".avm-tile--locked", ".avm-tile--unavailable"]) {
    const cursor = avatarDeclarations(selector, "cursor");
    assert.equal(cursor.length, 1, `${selector} sets a cursor`);
    assert.equal(cursor[0].value, "default", `${selector} uses a normal cursor`);
  }
});

test("an unavailable avatar tile has no hover transition or lift", () => {
  for (const selector of [".avm-tile--locked", ".avm-tile--unavailable"]) {
    assert.deepEqual(
      avatarDeclarations(selector, "transition"),
      [{ value: "none", media: null }],
      `${selector} takes part in no hover transition`,
    );
    assert.deepEqual(avatarDeclarations(selector, "transform"), [], `${selector} never moves`);
  }

  // No hover rule anywhere targets an unavailable tile.
  const hoverRules = [];
  avatarsRoot.walkRules((rule) => {
    if (rule.selectors.some((selector) => selector.includes(":hover"))) {
      hoverRules.push(...rule.selectors);
    }
  });
  for (const selector of hoverRules) {
    assert.ok(
      !/avm-tile--locked|avm-tile--unavailable/.test(selector),
      `${selector} must not react to hover`,
    );
  }
});

test("the section headings and the back control have no styles left behind", () => {
  for (const selector of [
    ".avm-section-title",
    ".avm-section-title--locked",
    ".avm-back",
    ".avm-header-icon",
    ".avm-header-right",
  ]) {
    const found = [];
    avatarsRoot.walkRules((rule) => {
      if (rule.selectors.includes(selector)) found.push(rule.source.start.line);
    });
    assert.deepEqual(found, [], `${selector} is no longer rendered, so it has no styles`);
  }
});

test("the Arcadia logo is styled to match the other Arcadia brand marks", () => {
  // Only the base rule; the small-phone query legitimately shrinks it.
  const size = avatarDeclarations(".avm-header-logo", "width").filter((e) => e.media === null);
  assert.equal(size.length, 1, "the logo has an explicit base width");
  assert.equal(
    avatarDeclarations(".avm-header-logo", "height").filter((e) => e.media === null)[0].value,
    size[0].value,
    "and a square box",
  );
  assert.match(
    avatarDeclarations(".avm-header-logo", "filter")[0].value,
    /drop-shadow\(0 0 8px rgba\(202, 65, 255, 0\.9\)\)/,
    "the same purple glow the login modal and Navbar use",
  );
  // The logo and the heading share one flex row, so they align.
  assert.equal(
    avatarDeclarations(".avm-header-title", "align-items")[0].value,
    "center",
    "the logo and heading are centred on one row",
  );
});

test("the unlock label is allowed to wrap so the full sentence is readable", () => {
  assert.deepEqual(
    avatarDeclarations(".avm-tile-req", "white-space"),
    [],
    "the unlock label is never clipped to one line",
  );
  assert.deepEqual(
    avatarDeclarations(".avm-tile-req", "text-overflow"),
    [],
    "and never ellipsised",
  );
  // Tiles are wide enough for "Unlocks at level 30" to read.
  const min = avatarDeclarations(".avm-grid", "grid-template-columns")[0].value;
  const px = Number(min.match(/minmax\((\d+)px/)[1]);
  assert.ok(px >= 96, `tiles must be at least 96px wide, got ${px}`);
});

test("the disabled Save Changes button carries no red glow or blocking cursor", () => {
  // The dimmed gradient alone marks it disabled. The neon halo used to bleed a
  // red-pink ring around the button, and `not-allowed` painted the browser's
  // prohibited symbol on top of it.
  const disabled = avatarDeclarations(".avm-confirm:disabled", "box-shadow");
  assert.deepEqual(disabled, [{ value: "none", media: null }], "no glow around a disabled button");

  const cursor = avatarDeclarations(".avm-confirm:disabled", "cursor");
  assert.equal(cursor.length, 1, "the disabled state still sets a cursor");
  assert.equal(cursor[0].value, "default", "and it is a normal arrow, never a prohibited one");

  // The enabled button keeps the Arcadia purple gradient and its neon glow.
  const enabled = avatarDeclarations(".avm-confirm", "background");
  assert.equal(enabled.length, 1, "one background for the button");
  assert.match(enabled[0].value, /#d83bff/, "the Arcadia purple gradient is untouched");
  assert.equal(
    avatarDeclarations(".avm-confirm", "box-shadow")[0].value,
    "0 6px 20px rgba(224, 105, 255, 0.38)",
    "and the enabled neon glow is untouched",
  );

  // A genuine save error is still reported, in its own place.
  assert.match(
    avatarDeclarations(".avm-error", "color")[0].value,
    /#fecdd3/,
    "the real error message keeps its own styling",
  );
});

/* ==================================================================
   Modal layering and scroll locking

   The hierarchy is Profile Popup -> My Profile -> Username or Avatar Modal, and
   each child has to be able to sit above its parent without the parent moving.
   ================================================================== */

function modalZIndex(stylesheetPath) {
  const tree = postcss.parse(readFileSync(fileURLToPath(new URL(stylesheetPath, import.meta.url)), "utf8"));
  let value = null;
  tree.walkRules((rule) => {
    if (rule.selectors.includes(".unm-backdrop") || rule.selectors.includes(".avm-backdrop")) {
      rule.walkDecls("z-index", (decl) => {
        value = Number(decl.value.trim());
      });
    }
  });
  return value;
}

test("both child modals are layered above My Profile and below each other", () => {
  const popup = zIndexOf(root, ".profile-popup");
  const parent = zIndexOf(root, ".mpm-backdrop");
  const username = modalZIndex("../src/components/UsernameModal.css");
  const avatar = zIndexOf(avatarsRoot, ".avm-backdrop");

  assert.ok(popup < parent, `Profile Popup (${popup}) sits below My Profile (${parent})`);
  assert.ok(
    username > parent,
    `the Username Modal (${username}) must sit above My Profile (${parent}), or it opens hidden behind it`,
  );
  assert.ok(
    avatar > parent,
    `the Avatar Modal (${avatar}) must sit above My Profile (${parent})`,
  );
  assert.ok(
    Math.abs(username - avatar) >= 1,
    "the two child layers have distinct stacking values so they can never fight",
  );
});

function zIndexOf(tree, selector) {
  let value = null;
  tree.walkRules((rule) => {
    if (rule.selectors.includes(selector)) {
      rule.walkDecls("z-index", (decl) => {
        value = Number(decl.value.trim());
      });
    }
  });
  return value;
}

test("the modal scroll lock reserves the scrollbar gutter so nothing shifts", () => {
  // Hiding the document overflow removes the scrollbar, which would narrow the
  // space a fixed, centred dialog sits in and make it jump sideways. The gutter
  // is reserved for exactly as long as the lock is held, so the width is
  // identical either side of it.
  const globalCss = readFileSync(
    fileURLToPath(new URL("../src/index.css", import.meta.url)),
    "utf8",
  );
  const globalRoot = postcss.parse(globalCss);

  const selectors = [];
  let gutter = null;
  globalRoot.walkRules((rule) => {
    selectors.push(...rule.selectors);
    if (rule.selectors.includes("html.has-modal-scroll-lock")) {
      rule.walkDecls("scrollbar-gutter", (decl) => {
        gutter = decl.value.trim();
      });
    }
  });

  assert.equal(gutter, "stable", "the gutter is held stable while a modal is open");
  assert.ok(
    selectors.includes("html.has-modal-scroll-lock"),
    "and it is scoped to the locked state, so the page layout is untouched otherwise",
  );

  // Every scrollbar-gutter declaration in the global sheet must live inside that
  // gated rule, so none of them applies while no modal is open.
  const ungated = [];
  globalRoot.walkDecls("scrollbar-gutter", (decl) => {
    if (decl.parent.type !== "rule" || !decl.parent.selectors.includes("html.has-modal-scroll-lock")) {
      ungated.push(decl.parent.selector);
    }
  });
  assert.deepEqual(ungated, [], "no ungated scrollbar-gutter rule applies to the page");
});
