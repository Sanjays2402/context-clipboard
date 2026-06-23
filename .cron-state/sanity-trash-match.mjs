// Sanity: trash-match helper — find live re-capture by hash + format tooltip
//
// When a clip is trashed, the user may have already re-captured the
// same content (re-copy after trash, or duplicate that already had a
// live twin). Surfacing this in the hover-tooltip removes the "what
// if I lose this forever?" friction from trash housekeeping.
//
// Also covers the note-tail tooltip extension (this tick): when the
// trashed clip carries a free-form note, it tails either tooltip
// shape so the user sees their own commentary at the moment they're
// about to permanently lose the clip.
//
// Run with: node .cron-state/sanity-trash-match.mjs

import assert from "node:assert/strict";
import { build } from "esbuild";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "ctxclip-trashmatch-"));
try {
  await build({
    entryPoints: ["src/lib/trash-match.ts"],
    bundle: true,
    format: "esm",
    outfile: join(tmp, "trash-match.mjs"),
    platform: "neutral",
    target: "es2022",
    logLevel: "silent",
  });
  const { findLiveRecaptureForTrash, formatTrashRecaptureTooltip } =
    await import(join(tmp, "trash-match.mjs"));

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

  const NOW = 1_700_000_000_000;
  const HOUR = 3_600_000;
  const DAY = 86_400_000;

  // --- findLiveRecaptureForTrash ---

  t("missing hash → null", () => {
    assert.equal(findLiveRecaptureForTrash(undefined, []), null);
  });
  t("empty hash → null", () => {
    assert.equal(findLiveRecaptureForTrash("", []), null);
  });
  t("non-string hash → null", () => {
    assert.equal(findLiveRecaptureForTrash(42, []), null);
  });
  t("non-array live → null", () => {
    assert.equal(findLiveRecaptureForTrash("h", null), null);
  });
  t("no hash match → null", () => {
    const noMatch = [{ id: "a", hash: "other", lastSeenAt: NOW }];
    assert.equal(findLiveRecaptureForTrash("target", noMatch), null);
  });
  t("single match returned", () => {
    const single = [{ id: "a", hash: "target", lastSeenAt: NOW - HOUR }];
    const m = findLiveRecaptureForTrash("target", single);
    assert.equal(m?.id, "a");
  });
  t("newest match wins", () => {
    const multi = [
      { id: "old", hash: "target", lastSeenAt: NOW - 3 * DAY },
      { id: "new", hash: "target", lastSeenAt: NOW - HOUR },
      { id: "mid", hash: "target", lastSeenAt: NOW - DAY },
    ];
    assert.equal(findLiveRecaptureForTrash("target", multi)?.id, "new");
  });
  t("stamped beats unstamped", () => {
    const partial = [
      { id: "no-stamp", hash: "target" },
      { id: "stamped", hash: "target", lastSeenAt: NOW - DAY },
    ];
    assert.equal(findLiveRecaptureForTrash("target", partial)?.id, "stamped");
  });
  t("all-unstamped → null", () => {
    const allUnstamped = [
      { id: "a", hash: "target" },
      { id: "b", hash: "target" },
    ];
    assert.equal(findLiveRecaptureForTrash("target", allUnstamped), null);
  });
  t("broken entries dropped, real wins", () => {
    const broken = [
      null,
      undefined,
      { hash: "target" },
      { id: "", hash: "target" },
      { id: "real", hash: "target", lastSeenAt: NOW - HOUR },
      { id: "wrong-type", hash: 42, lastSeenAt: NOW - HOUR },
    ];
    assert.equal(findLiveRecaptureForTrash("target", broken)?.id, "real");
  });
  t("clip without hash → no match", () => {
    assert.equal(
      findLiveRecaptureForTrash("target", [{ id: "a", lastSeenAt: NOW }]),
      null,
    );
  });

  // --- formatTrashRecaptureTooltip (head shapes) ---

  t("null match → permanent warning", () => {
    assert.equal(
      formatTrashRecaptureTooltip({ match: null }),
      "No live re-capture — purging this is permanent.",
    );
  });

  t("fresh match tooltip mentions Safe to purge + age", () => {
    const out = formatTrashRecaptureTooltip({
      match: { id: "x", lastSeenAt: NOW - 30 * 60_000 },
      now: NOW,
    });
    assert.match(out, /Safe to purge/);
    assert.match(out, /30m ago/);
  });

  t("days-old match has 'd ago'", () => {
    const out = formatTrashRecaptureTooltip({
      match: { id: "y", lastSeenAt: NOW - 5 * DAY },
      now: NOW,
    });
    assert.match(out, /5d ago/);
  });

  t("under 60s → just now", () => {
    const out = formatTrashRecaptureTooltip({
      match: { id: "z", lastSeenAt: NOW - 5_000 },
      now: NOW,
    });
    assert.match(out, /just now/);
  });

  t("no lastSeenAt → 'safe to purge' without age", () => {
    const out = formatTrashRecaptureTooltip({
      match: { id: "w" },
      now: NOW,
    });
    assert.match(out, /safe to purge/);
    assert.doesNotMatch(out, /ago/);
  });

  t("preview included in tooltip", () => {
    const out = formatTrashRecaptureTooltip({
      match: { id: "p", preview: "hello world", lastSeenAt: NOW - HOUR },
      now: NOW,
    });
    assert.match(out, /"hello world"/);
  });

  t("long preview truncated", () => {
    const out = formatTrashRecaptureTooltip({
      match: {
        id: "p",
        preview: "word ".repeat(50).trim(),
        lastSeenAt: NOW - HOUR,
      },
      now: NOW,
    });
    assert.match(out, /…/);
  });

  t("content used as preview fallback", () => {
    const out = formatTrashRecaptureTooltip({
      match: { id: "p", content: "from content", lastSeenAt: NOW - HOUR },
      now: NOW,
    });
    assert.match(out, /"from content"/);
  });

  t("future lastSeenAt → just now", () => {
    const out = formatTrashRecaptureTooltip({
      match: { id: "f", lastSeenAt: NOW + HOUR },
      now: NOW,
    });
    assert.match(out, /just now/);
  });

  // --- note tail (this tick's extension) ---

  t("no trashed clip passed → no note tail", () => {
    const out = formatTrashRecaptureTooltip({
      match: { id: "x", lastSeenAt: NOW - HOUR },
      now: NOW,
    });
    assert.doesNotMatch(out, /Note:/);
  });

  t("trashed without note → no note tail", () => {
    const out = formatTrashRecaptureTooltip({
      match: { id: "x", lastSeenAt: NOW - HOUR },
      trashed: { id: "t1" },
      now: NOW,
    });
    assert.doesNotMatch(out, /Note:/);
  });

  t("trashed with note → note tail appears (match case)", () => {
    const out = formatTrashRecaptureTooltip({
      match: { id: "x", lastSeenAt: NOW - HOUR },
      trashed: { id: "t1", note: "staging only — be careful" },
      now: NOW,
    });
    assert.match(out, /Safe to purge/);
    assert.match(out, /Note: staging only — be careful/);
  });

  t("trashed with note + no match → note tail still appears", () => {
    const out = formatTrashRecaptureTooltip({
      match: null,
      trashed: { id: "t1", note: "irreplaceable draft" },
    });
    assert.match(out, /permanent/);
    assert.match(out, /Note: irreplaceable draft/);
  });

  t("empty note → no tail", () => {
    const out = formatTrashRecaptureTooltip({
      match: null,
      trashed: { id: "t1", note: "" },
    });
    assert.doesNotMatch(out, /Note:/);
  });

  t("whitespace-only note → no tail", () => {
    const out = formatTrashRecaptureTooltip({
      match: null,
      trashed: { id: "t1", note: "   \n   " },
    });
    assert.doesNotMatch(out, /Note:/);
  });

  t("non-string note → no tail (defensive)", () => {
    const out = formatTrashRecaptureTooltip({
      match: null,
      trashed: { id: "t1", note: 42 },
    });
    assert.doesNotMatch(out, /Note:/);
  });

  t("note with newlines collapses to single line", () => {
    const out = formatTrashRecaptureTooltip({
      match: null,
      trashed: { id: "t1", note: "line one\nline two\n\nline three" },
    });
    assert.match(out, /Note: line one line two line three/);
  });

  t("long note truncated at default 80 char cap", () => {
    const longNote = "x".repeat(200);
    const out = formatTrashRecaptureTooltip({
      match: null,
      trashed: { id: "t1", note: longNote },
    });
    assert.match(out, /Note: /);
    assert.match(out, /…$/m);
    // Tail should be much shorter than the input
    const noteLine = out.split("\n").find((l) => l.startsWith("Note:"));
    assert.ok(noteLine.length < 120, "note tail must be capped");
  });

  t("long note word-boundary truncates", () => {
    const note =
      "this is a long enough sentence to exceed the cap and trigger the word-boundary trim near the end so we don't chop mid-word";
    const out = formatTrashRecaptureTooltip({
      match: null,
      trashed: { id: "t1", note },
    });
    const noteLine = out.split("\n").find((l) => l.startsWith("Note:"));
    // Truncated text ends with ellipsis
    assert.match(noteLine, /…$/);
  });

  t("custom notePeek override respected", () => {
    const out = formatTrashRecaptureTooltip({
      match: null,
      trashed: { id: "t1", note: "abcdefghijklmnopqrstuvwxyz" },
      notePeek: 10,
    });
    const noteLine = out.split("\n").find((l) => l.startsWith("Note:"));
    assert.ok(noteLine.includes("…"));
    assert.ok(noteLine.length < 30);
  });

  t("note tail composes correctly with preview tail", () => {
    const out = formatTrashRecaptureTooltip({
      match: { id: "x", preview: "hello live", lastSeenAt: NOW - HOUR },
      trashed: { id: "t1", note: "deprecated" },
      now: NOW,
    });
    // both bits surface
    assert.match(out, /"hello live"/);
    assert.match(out, /Note: deprecated/);
    // note tail comes AFTER preview tail in the join order
    const idx1 = out.indexOf('"hello live"');
    const idx2 = out.indexOf("Note: deprecated");
    assert.ok(idx2 > idx1, "note tail must follow preview tail");
  });

  console.log(`trash-match sanity: ${pass}/${pass} pass`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
