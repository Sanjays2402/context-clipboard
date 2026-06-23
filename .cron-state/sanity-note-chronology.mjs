// Sanity tests for the `is:notenewer:Nd` / `is:noteolder:Nd`
// chronology operators (chronology over `noteUpdatedAt`).
//
// Run with: node .cron-state/sanity-note-chronology.mjs

import assert from "node:assert/strict";
import { build } from "esbuild";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "ctxclip-notechr-"));
try {
  await build({
    entryPoints: ["src/lib/search.ts"],
    bundle: true,
    format: "esm",
    outfile: join(tmp, "search.mjs"),
    platform: "neutral",
    target: "es2022",
    logLevel: "silent",
  });
  const { parseQuery, applyQuery, describeQuery } = await import(
    join(tmp, "search.mjs")
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

  const day = 86_400_000;
  const hour = 3_600_000;

  const clip = (id, note, noteUpdatedAt) => {
    const c = {
      id,
      kind: "text",
      content: "x",
      source: { url: "https://example.com" },
      tags: [],
      pinned: false,
      createdAt: 0,
      lastSeenAt: 0,
      hitCount: 0,
      bytes: 1,
      hash: id,
    };
    if (note !== undefined) c.note = note;
    if (noteUpdatedAt !== undefined) c.noteUpdatedAt = noteUpdatedAt;
    return c;
  };

  // -------------------- parser --------------------
  t("parseQuery: is:notenewer:7d sets noteNewerThan to now-7d", () => {
    const before = Date.now();
    const q = parseQuery("is:notenewer:7d");
    const after = Date.now();
    assert.equal(typeof q.noteNewerThan, "number");
    // threshold within a few ms of now-7d
    assert(q.noteNewerThan >= before - 7 * day - 5);
    assert(q.noteNewerThan <= after - 7 * day + 5);
    assert.equal(q.noteOlderThan, undefined);
  });

  t("parseQuery: is:noteolder:30d sets noteOlderThan", () => {
    const before = Date.now();
    const q = parseQuery("is:noteolder:30d");
    const after = Date.now();
    assert(q.noteOlderThan >= before - 30 * day - 5);
    assert(q.noteOlderThan <= after - 30 * day + 5);
    assert.equal(q.noteNewerThan, undefined);
  });

  t("parseQuery: combined notenewer + noteolder both set", () => {
    const q = parseQuery("is:notenewer:7d is:noteolder:30d");
    assert(typeof q.noteNewerThan === "number");
    assert(typeof q.noteOlderThan === "number");
  });

  t("parseQuery: notenewer with hours grammar (1h)", () => {
    const before = Date.now();
    const q = parseQuery("is:notenewer:1h");
    assert(q.noteNewerThan >= before - hour - 5);
  });

  t("parseQuery: notenewer with minutes grammar (30m)", () => {
    const before = Date.now();
    const q = parseQuery("is:notenewer:30m");
    assert(q.noteNewerThan >= before - 30 * 60_000 - 5);
  });

  t("parseQuery: notenewer with seconds grammar (45s)", () => {
    const before = Date.now();
    const q = parseQuery("is:notenewer:45s");
    assert(q.noteNewerThan >= before - 45_000 - 5);
  });

  t("parseQuery: notenewer with weeks grammar (2w)", () => {
    const before = Date.now();
    const q = parseQuery("is:notenewer:2w");
    assert(q.noteNewerThan >= before - 14 * day - 5);
  });

  // -------------------- typo rejection --------------------
  t("parseQuery: is:notenewer with no duration → leftover", () => {
    const q = parseQuery("is:notenewer");
    assert.equal(q.noteNewerThan, undefined);
    assert.equal(q.freeText, "is:notenewer");
  });

  t("parseQuery: is:notenewer: with empty duration → leftover", () => {
    const q = parseQuery("is:notenewer:");
    // colon at end → tok skipped entirely by key/val split
    assert.equal(q.noteNewerThan, undefined);
  });

  t("parseQuery: is:notenewer:bad → leftover (bad duration)", () => {
    const q = parseQuery("is:notenewer:bad");
    assert.equal(q.noteNewerThan, undefined);
    assert.match(q.freeText, /is:notenewer:bad/);
  });

  t("parseQuery: is:notenewer:7 (no unit) → leftover", () => {
    const q = parseQuery("is:notenewer:7");
    assert.equal(q.noteNewerThan, undefined);
  });

  t("parseQuery: is:notenewer:7x (bad unit) → leftover", () => {
    const q = parseQuery("is:notenewer:7x");
    assert.equal(q.noteNewerThan, undefined);
  });

  t("parseQuery: is:noteolder:foo → leftover (bad duration)", () => {
    const q = parseQuery("is:noteolder:foo");
    assert.equal(q.noteOlderThan, undefined);
  });

  // -------------------- applyQuery: notenewer --------------------
  t("notenewer: includes clip noted within window", () => {
    const now = 1_000_000_000_000;
    const cutoff = now - 7 * day;
    const clips = [clip("a", "fresh", now - 60_000)];
    // Use parser to build the query with a controlled now-relative
    // threshold; we override via direct field set.
    const q = { ...parseQuery(""), noteNewerThan: cutoff };
    const out = applyQuery(clips, q);
    assert.equal(out.length, 1);
  });

  t("notenewer: excludes clip noted outside window", () => {
    const now = 1_000_000_000_000;
    const cutoff = now - 7 * day;
    const clips = [clip("a", "old", now - 14 * day)];
    const q = { ...parseQuery(""), noteNewerThan: cutoff };
    const out = applyQuery(clips, q);
    assert.equal(out.length, 0);
  });

  t("notenewer: excludes clip without a note", () => {
    const clips = [clip("a", undefined, 1_000_000_000_000)];
    const q = { ...parseQuery(""), noteNewerThan: 0 };
    const out = applyQuery(clips, q);
    assert.equal(out.length, 0);
  });

  t("notenewer: excludes clip with empty-string note", () => {
    const clips = [clip("a", "", 1_000_000_000_000)];
    const q = { ...parseQuery(""), noteNewerThan: 0 };
    const out = applyQuery(clips, q);
    assert.equal(out.length, 0);
  });

  t("notenewer: excludes legacy clip with note but no noteUpdatedAt", () => {
    const clips = [clip("a", "real")];
    const q = { ...parseQuery(""), noteNewerThan: 0 };
    const out = applyQuery(clips, q);
    assert.equal(out.length, 0);
  });

  t("notenewer: excludes clip with NaN noteUpdatedAt", () => {
    const clips = [clip("a", "real", NaN)];
    const q = { ...parseQuery(""), noteNewerThan: 0 };
    const out = applyQuery(clips, q);
    assert.equal(out.length, 0);
  });

  t("notenewer: includes clip with stamp exactly at threshold", () => {
    const cutoff = 1_000_000_000_000;
    const clips = [clip("a", "edge", cutoff)];
    const q = { ...parseQuery(""), noteNewerThan: cutoff };
    const out = applyQuery(clips, q);
    assert.equal(out.length, 1);
  });

  // -------------------- applyQuery: noteolder --------------------
  t("noteolder: includes clip noted before threshold", () => {
    const cutoff = 1_000_000_000_000;
    const clips = [clip("a", "stale", cutoff - day)];
    const q = { ...parseQuery(""), noteOlderThan: cutoff };
    const out = applyQuery(clips, q);
    assert.equal(out.length, 1);
  });

  t("noteolder: excludes clip noted after threshold (newer)", () => {
    const cutoff = 1_000_000_000_000;
    const clips = [clip("a", "fresh", cutoff + day)];
    const q = { ...parseQuery(""), noteOlderThan: cutoff };
    const out = applyQuery(clips, q);
    assert.equal(out.length, 0);
  });

  t("noteolder: excludes clip without a note", () => {
    const clips = [clip("a", undefined, 0)];
    const q = { ...parseQuery(""), noteOlderThan: 1_000_000_000_000 };
    const out = applyQuery(clips, q);
    assert.equal(out.length, 0);
  });

  t("noteolder: excludes legacy clip with note but no noteUpdatedAt", () => {
    const clips = [clip("a", "real")];
    const q = { ...parseQuery(""), noteOlderThan: 1_000_000_000_000 };
    const out = applyQuery(clips, q);
    assert.equal(out.length, 0);
  });

  t("noteolder: includes clip with stamp exactly at threshold", () => {
    const cutoff = 1_000_000_000_000;
    const clips = [clip("a", "edge", cutoff)];
    const q = { ...parseQuery(""), noteOlderThan: cutoff };
    const out = applyQuery(clips, q);
    assert.equal(out.length, 1);
  });

  // -------------------- band-pass / contradictory --------------------
  t("AND-semantics: notenewer + noteolder yields band intersection", () => {
    const now = 1_000_000_000_000;
    const clips = [
      clip("a", "in-band", now - 10 * day),    // 10 days ago
      clip("b", "too-old", now - 60 * day),    // 60 days ago
      clip("c", "too-new", now - 2 * day),     // 2 days ago
    ];
    // band: older than 7d AND newer than 30d
    const q = {
      ...parseQuery(""),
      noteOlderThan: now - 7 * day,
      noteNewerThan: now - 30 * day,
    };
    const out = applyQuery(clips, q);
    assert.equal(out.length, 1);
    assert.equal(out[0].id, "a");
  });

  t("contradictory bounds yield empty set", () => {
    const now = 1_000_000_000_000;
    const clips = [
      clip("a", "x", now - 10 * day),
      clip("b", "y", now - 60 * day),
    ];
    // notenewer:5d means "stamp >= now-5d" (within last 5d)
    // noteolder:10d means "stamp <= now-10d" (older than 10d)
    // No clip can be both within last 5d AND older than 10d
    const q = {
      ...parseQuery(""),
      noteNewerThan: now - 5 * day,
      noteOlderThan: now - 10 * day,
    };
    const out = applyQuery(clips, q);
    assert.equal(out.length, 0);
  });

  // -------------------- composition with other operators --------------------
  t("composition: notenewer + is:locked (parsed separately) intersects", () => {
    const now = 1_000_000_000_000;
    const a = clip("a", "fresh", now - day);
    a.locked = true;
    const b = clip("b", "fresh", now - day);
    b.locked = false;
    const c = clip("c", "stale", now - 60 * day);
    c.locked = true;
    const clips = [a, b, c];
    // recently noted (within 7d) AND locked
    const q = { ...parseQuery("is:locked"), noteNewerThan: now - 7 * day };
    const out = applyQuery(clips, q);
    assert.equal(out.length, 1);
    assert.equal(out[0].id, "a");
  });

  // -------------------- describeQuery --------------------
  t("describeQuery: notenewer → 'note-recent' bit", () => {
    const q = parseQuery("is:notenewer:7d");
    const d = describeQuery(q);
    assert.match(d, /note-recent/);
  });

  t("describeQuery: noteolder → 'note-stale' bit", () => {
    const q = parseQuery("is:noteolder:30d");
    const d = describeQuery(q);
    assert.match(d, /note-stale/);
  });

  // -------------------- end-to-end with parser → applyQuery --------------------
  t("end-to-end: parseQuery → applyQuery filters by chronology", () => {
    // We can't pin Date.now() through parseQuery, but the threshold
    // is set to now-7d at parse time. So a clip with noteUpdatedAt
    // = now - 60_000 (one minute ago) MUST satisfy any reasonable
    // is:notenewer:7d query.
    const clips = [clip("a", "fresh", Date.now() - 60_000)];
    const q = parseQuery("is:notenewer:7d");
    const out = applyQuery(clips, q);
    assert.equal(out.length, 1);
  });

  t("end-to-end: parseQuery → applyQuery rejects out-of-window", () => {
    const clips = [clip("a", "old", Date.now() - 14 * day)];
    const q = parseQuery("is:notenewer:7d");
    const out = applyQuery(clips, q);
    assert.equal(out.length, 0);
  });

  // -------------------- typo rejection from end-to-end --------------------
  t("end-to-end: bad operator falls through, doesn't break filter", () => {
    const clips = [
      clip("a", "real", Date.now() - 60_000),
      clip("b", undefined, undefined),
    ];
    const q = parseQuery("is:notenewer:bad");
    // bad duration → freeText "is:notenewer:bad", no chronology
    // filter applied. Free-text needle "is:notenewer:bad" matches
    // nothing in the test clips so both rows fail the freeText
    // gate. The point: parsing didn't crash and didn't silently
    // apply a coerced threshold.
    const out = applyQuery(clips, q);
    assert.equal(out.length, 0);
    assert.match(q.freeText, /is:notenewer:bad/);
  });

  console.log(`note-chronology sanity: ${pass}/${pass} pass`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
