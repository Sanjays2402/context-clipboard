// Sanity tests for the recently-noted helper (chronology view of
// recent note decisions for the Cmd+K "Show recently noted" command).
//
// Run with: node .cron-state/sanity-recently-noted.mjs

import assert from "node:assert/strict";
import { build } from "esbuild";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "ctxclip-recnoted-"));
try {
  await build({
    entryPoints: ["src/lib/recently-noted.ts"],
    bundle: true,
    format: "esm",
    outfile: join(tmp, "recently-noted.mjs"),
    platform: "neutral",
    target: "es2022",
    logLevel: "silent",
  });
  const {
    recentlyNotedClips,
    countRecentlyNoted,
    formatRecentlyNotedLabel,
    RECENTLY_NOTED_DEFAULT_WINDOW_MS,
  } = await import(join(tmp, "recently-noted.mjs"));

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

  const now = 1_000_000_000_000;
  const day = 86_400_000;

  const clip = (id, note, noteUpdatedAt) => {
    const c = { id };
    if (note !== undefined) c.note = note;
    if (noteUpdatedAt !== undefined) c.noteUpdatedAt = noteUpdatedAt;
    return c;
  };

  // window default
  t("default window is 7 days", () => {
    assert.equal(RECENTLY_NOTED_DEFAULT_WINDOW_MS, 7 * day);
  });

  // basic recency gate -------------------------------------------
  t("includes clip noted today", () => {
    const c = clip("a", "fresh", now - 60_000);
    const out = recentlyNotedClips([c], { now });
    assert.equal(out.length, 1);
    assert.equal(out[0].id, "a");
  });

  t("excludes clip noted 8 days ago", () => {
    const c = clip("a", "old", now - 8 * day);
    const out = recentlyNotedClips([c], { now });
    assert.equal(out.length, 0);
  });

  t("includes clip noted exactly at the window edge", () => {
    const c = clip("a", "edge", now - 7 * day);
    const out = recentlyNotedClips([c], { now });
    assert.equal(out.length, 1);
  });

  // strict gates --------------------------------------------------
  t("excludes clip without a note (gate: hasClipNote)", () => {
    const c = clip("a", undefined, now - 60_000);
    const out = recentlyNotedClips([c], { now });
    assert.equal(out.length, 0);
  });

  t("excludes clip with empty-string note", () => {
    const c = clip("a", "", now - 60_000);
    const out = recentlyNotedClips([c], { now });
    assert.equal(out.length, 0);
  });

  t("excludes clip with whitespace-only note", () => {
    const c = clip("a", "   ", now - 60_000);
    const out = recentlyNotedClips([c], { now });
    assert.equal(out.length, 0);
  });

  t("excludes clip with note but no noteUpdatedAt (legacy)", () => {
    const c = clip("a", "real");
    const out = recentlyNotedClips([c], { now });
    assert.equal(out.length, 0);
  });

  t("excludes NaN noteUpdatedAt", () => {
    const c = clip("a", "real", NaN);
    const out = recentlyNotedClips([c], { now });
    assert.equal(out.length, 0);
  });

  t("excludes Infinity noteUpdatedAt", () => {
    const c = clip("a", "real", Infinity);
    const out = recentlyNotedClips([c], { now });
    assert.equal(out.length, 0);
  });

  // clock skew ----------------------------------------------------
  t("includes future-stamped note (clock skew tolerance)", () => {
    const c = clip("a", "real", now + 2 * day);
    const out = recentlyNotedClips([c], { now });
    assert.equal(out.length, 1);
  });

  // sort newest-first --------------------------------------------
  t("sorts newest-noted first", () => {
    const clips = [
      clip("a", "a", now - 3 * day),
      clip("b", "b", now - 1 * day),
      clip("c", "c", now - 5 * day),
    ];
    const out = recentlyNotedClips(clips, { now });
    assert.deepEqual(out.map((c) => c.id), ["b", "a", "c"]);
  });

  // defensive empty cases ----------------------------------------
  t("non-array → []", () => {
    assert.deepEqual(recentlyNotedClips(null, { now }), []);
    assert.deepEqual(recentlyNotedClips(undefined, { now }), []);
    assert.deepEqual(recentlyNotedClips("not an array", { now }), []);
  });

  t("skips entries missing id", () => {
    const out = recentlyNotedClips(
      [
        { note: "x", noteUpdatedAt: now },
        clip("a", "a", now),
      ],
      { now },
    );
    assert.deepEqual(out.map((c) => c.id), ["a"]);
  });

  // count helper --------------------------------------------------
  t("countRecentlyNoted matches recentlyNotedClips().length", () => {
    const clips = [
      clip("a", "a", now - 1 * day),
      clip("b", "b", now - 6 * day),
      clip("c", "c", now - 30 * day),
      clip("d", undefined, now - 1 * day),
    ];
    assert.equal(countRecentlyNoted(clips, { now }), 2);
    assert.equal(
      countRecentlyNoted(clips, { now }),
      recentlyNotedClips(clips, { now }).length,
    );
  });

  t("countRecentlyNoted non-array → 0", () => {
    assert.equal(countRecentlyNoted(null, { now }), 0);
    assert.equal(countRecentlyNoted(undefined, { now }), 0);
  });

  // custom window ------------------------------------------------
  t("custom 1-day window narrows results", () => {
    const clips = [
      clip("a", "a", now - 60_000),
      clip("b", "b", now - 2 * day),
    ];
    const out = recentlyNotedClips(clips, { now, windowMs: day });
    assert.deepEqual(out.map((c) => c.id), ["a"]);
  });

  // formatRecentlyNotedLabel: shapes -----------------------------
  const formatAge = (at) => `${Math.floor((now - at) / 60_000)}m ago`;

  t("label: 0 count → empty + available:false", () => {
    const lbl = formatRecentlyNotedLabel({ count: 0, formatAge });
    assert.equal(lbl.label, "Show recently noted clips");
    assert.equal(lbl.available, false);
    assert.match(lbl.hint, /No clips noted in the last 7 days/);
  });

  t("label: 1 count → singular noun", () => {
    const lbl = formatRecentlyNotedLabel({
      count: 1,
      freshestNoteUpdatedAt: now - 60_000,
      formatAge,
    });
    assert.equal(lbl.label, "Show 1 recently noted clip");
    assert.equal(lbl.available, true);
    assert.match(lbl.hint, /Most recent: 1m ago/);
  });

  t("label: many → plural noun + hint", () => {
    const lbl = formatRecentlyNotedLabel({
      count: 5,
      freshestNoteUpdatedAt: now - 30 * 60_000,
      formatAge,
    });
    assert.equal(lbl.label, "Show 5 recently noted clips");
    assert.match(lbl.hint, /Most recent: 30m ago/);
  });

  t("label: missing freshest stamp → generic hint", () => {
    const lbl = formatRecentlyNotedLabel({ count: 2, formatAge });
    assert.equal(lbl.label, "Show 2 recently noted clips");
    assert.match(lbl.hint, /Noted within the last 7 days/);
  });

  t("label: custom windowDays surfaces in hint", () => {
    const lbl = formatRecentlyNotedLabel({
      count: 0,
      windowDays: 30,
      formatAge,
    });
    assert.match(lbl.hint, /last 30 days/);
  });

  t("label: negative count clamps to 0", () => {
    const lbl = formatRecentlyNotedLabel({ count: -3, formatAge });
    assert.equal(lbl.available, false);
  });

  // mirror-symmetry with recently-locked ------------------------
  t("recently-noted contract matches recently-locked structure", () => {
    const a = clip("a", "real", now - 1 * day);
    const out = recentlyNotedClips([a], { now });
    assert.equal(typeof out[0].id, "string");
    assert.equal(typeof out[0].noteUpdatedAt, "number");
  });

  console.log(`recently-noted sanity: ${pass}/${pass} pass`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
