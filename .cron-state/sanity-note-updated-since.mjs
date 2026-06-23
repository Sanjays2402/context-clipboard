// Sanity tests for formatNoteUpdatedSince() — the "Noted <X ago>"
// breadcrumb formatter used by the detail-view note row + the
// Cmd+K "Show recently noted" hint.
//
// Run with: node .cron-state/sanity-note-updated-since.mjs

import assert from "node:assert/strict";
import { build } from "esbuild";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "ctxclip-noteupd-"));
try {
  await build({
    entryPoints: ["src/lib/note-updated-since.ts"],
    bundle: true,
    format: "esm",
    outfile: join(tmp, "note-updated-since.mjs"),
    platform: "neutral",
    target: "es2022",
    logLevel: "silent",
  });
  const { formatNoteUpdatedSince } = await import(
    join(tmp, "note-updated-since.mjs")
  );

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

  // Reference clock — Tuesday 2026-06-23 12:00 local. We pin `now`
  // explicitly so all assertions are deterministic.
  const now = new Date(2026, 5, 23, 12, 0, 0).getTime();
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;

  // shape ---------------------------------------------------------
  t("returns {label, tooltip}", () => {
    const out = formatNoteUpdatedSince(now - 30 * min, now);
    assert.equal(typeof out.label, "string");
    assert.equal(typeof out.tooltip, "string");
  });

  // bad input -----------------------------------------------------
  t("undefined → minimal label", () => {
    const out = formatNoteUpdatedSince(undefined, now);
    assert.equal(out.label, "Noted");
    assert.equal(out.tooltip, "");
  });

  t("null → minimal label", () => {
    const out = formatNoteUpdatedSince(null, now);
    assert.equal(out.label, "Noted");
  });

  t("NaN → minimal label", () => {
    const out = formatNoteUpdatedSince(NaN, now);
    assert.equal(out.label, "Noted");
  });

  t("Infinity → minimal label", () => {
    const out = formatNoteUpdatedSince(Infinity, now);
    assert.equal(out.label, "Noted");
  });

  t("string → minimal label", () => {
    const out = formatNoteUpdatedSince("yesterday", now);
    assert.equal(out.label, "Noted");
  });

  // clock skew ----------------------------------------------------
  t("future stamp clamps to 'just now'", () => {
    const out = formatNoteUpdatedSince(now + 2 * hour, now);
    assert.equal(out.label, "Noted just now");
  });

  // tier: < 1 minute ---------------------------------------------
  t("0s ago → just now", () => {
    const out = formatNoteUpdatedSince(now, now);
    assert.equal(out.label, "Noted just now");
  });

  t("30s ago → just now", () => {
    const out = formatNoteUpdatedSince(now - 30_000, now);
    assert.equal(out.label, "Noted just now");
  });

  t("59s ago → just now", () => {
    const out = formatNoteUpdatedSince(now - 59_999, now);
    assert.equal(out.label, "Noted just now");
  });

  // tier: minutes -------------------------------------------------
  t("1 minute ago → 1m ago", () => {
    const out = formatNoteUpdatedSince(now - min, now);
    assert.equal(out.label, "Noted 1m ago");
  });

  t("45 minutes ago → 45m ago", () => {
    const out = formatNoteUpdatedSince(now - 45 * min, now);
    assert.equal(out.label, "Noted 45m ago");
  });

  t("59 minutes ago → 59m ago", () => {
    const out = formatNoteUpdatedSince(now - 59 * min, now);
    assert.equal(out.label, "Noted 59m ago");
  });

  // tier: hours ---------------------------------------------------
  t("1 hour ago → 1h ago", () => {
    const out = formatNoteUpdatedSince(now - hour, now);
    assert.equal(out.label, "Noted 1h ago");
  });

  t("5 hours ago → 5h ago", () => {
    const out = formatNoteUpdatedSince(now - 5 * hour, now);
    assert.equal(out.label, "Noted 5h ago");
  });

  t("23 hours ago → 23h ago", () => {
    const out = formatNoteUpdatedSince(now - 23 * hour, now);
    assert.equal(out.label, "Noted 23h ago");
  });

  // tier: days (calendar math) -----------------------------------
  t("yesterday morning → 1 day ago", () => {
    const yesterdayMorning = new Date(2026, 5, 22, 9, 0, 0).getTime();
    const out = formatNoteUpdatedSince(yesterdayMorning, now);
    assert.equal(out.label, "Noted 1 day ago");
  });

  t("3 days ago → 3 days ago", () => {
    const t3 = new Date(2026, 5, 20, 9, 0, 0).getTime();
    const out = formatNoteUpdatedSince(t3, now);
    assert.equal(out.label, "Noted 3 days ago");
  });

  t("6 days ago → 6 days ago", () => {
    const t6 = new Date(2026, 5, 17, 9, 0, 0).getTime();
    const out = formatNoteUpdatedSince(t6, now);
    assert.equal(out.label, "Noted 6 days ago");
  });

  // tier: 7+ days → date ----------------------------------------
  t("7 days ago → ISO date", () => {
    const t7 = new Date(2026, 5, 16, 9, 0, 0).getTime();
    const out = formatNoteUpdatedSince(t7, now);
    assert.equal(out.label, "Noted on 2026-06-16");
  });

  t("30 days ago → ISO date", () => {
    const t30 = new Date(2026, 4, 24, 12, 0, 0).getTime();
    const out = formatNoteUpdatedSince(t30, now);
    assert.equal(out.label, "Noted on 2026-05-24");
  });

  t("a year ago → ISO date", () => {
    const old = new Date(2025, 5, 23, 12, 0, 0).getTime();
    const out = formatNoteUpdatedSince(old, now);
    assert.equal(out.label, "Noted on 2025-06-23");
  });

  // tooltip carries ISO + clock --------------------------------
  t("tooltip is YYYY-MM-DD HH:MM", () => {
    const at = new Date(2026, 5, 22, 14, 32, 0).getTime();
    const out = formatNoteUpdatedSince(at, now);
    assert.equal(out.tooltip, "2026-06-22 14:32");
  });

  t("tooltip pads single-digit minutes", () => {
    const at = new Date(2026, 5, 22, 9, 5, 0).getTime();
    const out = formatNoteUpdatedSince(at, now);
    assert.equal(out.tooltip, "2026-06-22 09:05");
  });

  // edge: 24h-but-same-calendar-day already lives in `hours`
  t("23h59m ago → still 23h", () => {
    const out = formatNoteUpdatedSince(now - 23 * hour - 59 * min, now);
    assert.equal(out.label, "Noted 23h ago");
  });

  console.log(`note-updated-since sanity: ${pass}/${pass} pass`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
