// Sanity tests for src/lib/palette-note-tail.ts — the in-page
// palette's note-tail formatter.
//
// Run with: node .cron-state/sanity-palette-note-tail.mjs

import assert from "node:assert/strict";
import { build } from "esbuild";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "ctxclip-pnt-"));
try {
  await build({
    entryPoints: ["src/lib/palette-note-tail.ts"],
    bundle: true,
    format: "esm",
    outfile: join(tmp, "palette-note-tail.mjs"),
    platform: "neutral",
    target: "es2022",
    logLevel: "silent",
  });
  const {
    paletteNoteTail,
    paletteNoteTailAvailable,
    PALETTE_NOTE_TAIL_DEFAULT_CAP,
  } = await import(join(tmp, "palette-note-tail.mjs"));

  let pass = 0;
  const t = (msg, fn) => {
    try {
      fn();
      pass++;
    } catch (e) {
      console.error(`FAIL ${msg}: ${e.message}`);
      process.exit(1);
    }
  };

  // -------------------- defensive --------------------
  t("non-string note -> empty string", () => {
    assert.equal(paletteNoteTail(undefined), "");
    assert.equal(paletteNoteTail(null), "");
    assert.equal(paletteNoteTail(42), "");
    assert.equal(paletteNoteTail({}), "");
    assert.equal(paletteNoteTail([]), "");
  });

  t("empty string -> empty string", () => {
    assert.equal(paletteNoteTail(""), "");
  });

  t("whitespace-only -> empty string", () => {
    assert.equal(paletteNoteTail("    "), "");
    assert.equal(paletteNoteTail("\t\n\r "), "");
  });

  // -------------------- basic passthrough --------------------
  t("short note -> unchanged after trim", () => {
    assert.equal(paletteNoteTail("be careful"), "be careful");
  });

  t("trims outer whitespace", () => {
    assert.equal(paletteNoteTail("  staging only  "), "staging only");
  });

  // -------------------- whitespace collapse --------------------
  t("collapses internal newlines to single spaces", () => {
    assert.equal(
      paletteNoteTail("first line\nsecond line"),
      "first line second line",
    );
  });

  t("collapses tabs to single spaces", () => {
    assert.equal(
      paletteNoteTail("col1\tcol2\tcol3"),
      "col1 col2 col3",
    );
  });

  t("collapses runs of whitespace", () => {
    assert.equal(
      paletteNoteTail("a    b\n\n\nc"),
      "a b c",
    );
  });

  // -------------------- truncation --------------------
  t("default cap = 80", () => {
    assert.equal(PALETTE_NOTE_TAIL_DEFAULT_CAP, 80);
  });

  t("note at cap length unchanged", () => {
    const exact = "a".repeat(80);
    assert.equal(paletteNoteTail(exact), exact);
  });

  t("note above cap truncates with ellipsis", () => {
    const long = "a".repeat(120);
    const out = paletteNoteTail(long);
    // Hard-slice (no spaces) + ellipsis
    assert.equal(out, "a".repeat(80) + "…");
  });

  t("word-boundary truncation inside cap window", () => {
    // 100-char string with spaces; word boundary in last 40% of
    // window should be honored.
    const note =
      "the staging api endpoint is not the production one and you should never paste this into prod systems without verifying";
    const out = paletteNoteTail(note);
    // Should end with ellipsis
    assert(out.endsWith("…"));
    // Should NOT end mid-word (i.e. last char before ellipsis is a
    // letter that belongs to a complete word — check via last
    // visible word ending at a boundary)
    const beforeEllipsis = out.slice(0, -1);
    assert(/\b\S+$/.test(beforeEllipsis)); // ends with a complete word
    // Should be no longer than cap + ellipsis char
    assert(out.length <= 81);
  });

  t("hard slice when first cap chars are one giant word", () => {
    const giant = "x".repeat(100); // no spaces
    const out = paletteNoteTail(giant);
    // No word boundary inside cap → hard slice
    assert.equal(out, "x".repeat(80) + "…");
  });

  t("falls back to hard-slice when last-space too early in cap window", () => {
    // Space at char 30 → less than 60% of cap (48), so we hard-slice
    const note = "short " + "x".repeat(120);
    const out = paletteNoteTail(note);
    // Should NOT word-break at the early space — hard slice instead
    assert.equal(out.length, 81); // 80 chars + ellipsis
  });

  // -------------------- custom cap --------------------
  t("custom cap option respected", () => {
    const note = "this note has more than ten characters";
    const out = paletteNoteTail(note, { cap: 10 });
    assert(out.length <= 11);
    assert(out.endsWith("…"));
  });

  t("invalid cap falls back to default", () => {
    const note = "a".repeat(120);
    assert.equal(paletteNoteTail(note, { cap: 0 }).length, 81);
    assert.equal(paletteNoteTail(note, { cap: -5 }).length, 81);
    assert.equal(paletteNoteTail(note, { cap: NaN }).length, 81);
    assert.equal(paletteNoteTail(note, { cap: Infinity }).length, 81);
  });

  t("decimal cap is floored", () => {
    const note = "abcdefghij";
    const out = paletteNoteTail(note, { cap: 5.7 });
    // floor(5.7) = 5 → "abcde" or ellipsis variant
    assert(out.length <= 6);
  });

  // -------------------- predicate --------------------
  t("paletteNoteTailAvailable: non-string -> false", () => {
    assert.equal(paletteNoteTailAvailable(undefined), false);
    assert.equal(paletteNoteTailAvailable(null), false);
    assert.equal(paletteNoteTailAvailable(42), false);
  });

  t("paletteNoteTailAvailable: empty/whitespace -> false", () => {
    assert.equal(paletteNoteTailAvailable(""), false);
    assert.equal(paletteNoteTailAvailable("   "), false);
  });

  t("paletteNoteTailAvailable: real note -> true", () => {
    assert.equal(paletteNoteTailAvailable("staging only"), true);
    assert.equal(paletteNoteTailAvailable("  trimmable  "), true);
  });

  // -------------------- predicate matches formatter --------------------
  t("predicate matches formatter: empty input -> empty output", () => {
    const fixtures = [undefined, null, "", "   ", 42, {}];
    for (const f of fixtures) {
      const formatted = paletteNoteTail(f);
      const available = paletteNoteTailAvailable(f);
      assert.equal(!!formatted, available, "predicate must match formatter");
    }
  });

  t("predicate matches formatter: real input -> non-empty output", () => {
    const fixtures = [
      "x",
      "staging only",
      "a".repeat(200),
      "multi\nline\nnote",
    ];
    for (const f of fixtures) {
      const formatted = paletteNoteTail(f);
      const available = paletteNoteTailAvailable(f);
      assert.equal(formatted.length > 0, available);
    }
  });

  // -------------------- realistic --------------------
  t("realistic note: short caveat", () => {
    assert.equal(
      paletteNoteTail("staging URL only - don't use in prod"),
      "staging URL only - don't use in prod",
    );
  });

  t("realistic note: paragraph collapses + truncates", () => {
    const note = `This is a draft staging endpoint that returns mock data.

Do not use in production - call the prod API documented in
/docs/api/v2 instead. Last updated: June 2026.`;
    const out = paletteNoteTail(note);
    assert(out.length <= 81);
    // No raw newlines in the output
    assert(!out.includes("\n"));
    // First few words preserved
    assert(out.startsWith("This is a draft staging"));
  });

  console.log(`palette-note-tail sanity: ${pass}/${pass} pass`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
