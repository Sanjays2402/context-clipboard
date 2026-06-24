#!/usr/bin/env node
// Sanity for lib/bulk-strip-hashtags.
// Verifies plan aggregation, per-clip action, gate predicate,
// and toast/button-title formatters at every shape.

import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = process.cwd();
const tmp = mkdtempSync(join(tmpdir(), "sanity-bulk-strip-"));
const out = join(tmp, "strip.js");
execSync(
  `node_modules/.bin/esbuild src/lib/bulk-strip-hashtags.ts --bundle --format=esm --platform=neutral --outfile=${out}`,
  { stdio: "ignore", cwd: repo },
);
const {
  planBulkStripHashtags,
  perClipActionForStrip,
  isBulkStripHashtagsActionable,
  formatBulkStripHashtagsToast,
  formatBulkStripHashtagsButtonTitle,
} = await import(out);

let pass = 0;
let fail = 0;
const failures = [];
function expect(name, cond, detail) {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(`${name}: ${detail ?? "expectation failed"}`);
  }
}

// ===== Defensive =====
{
  const p = planBulkStripHashtags(null);
  expect("plan(null) → zero shape",
    p.total === 0 && p.noHashtags === 0 && p.modified === 0 &&
    p.emptied === 0 && p.totalRemoved === 0);
}
expect("plan([]) → zero total",
  planBulkStripHashtags([]).total === 0);
expect("plan('garbage') → zero",
  planBulkStripHashtags("garbage").total === 0);
expect("perClipActionForStrip(null) → undefined",
  perClipActionForStrip(null) === undefined);
expect("perClipActionForStrip(no-id) → undefined",
  perClipActionForStrip({ note: "#foo" }) === undefined);
expect("perClipActionForStrip(no-hashtags) → undefined",
  perClipActionForStrip({ id: "a", note: "plain prose" }) === undefined);
expect("perClipActionForStrip(no-note) → undefined",
  perClipActionForStrip({ id: "a" }) === undefined);
expect("isActionable(null) → false",
  isBulkStripHashtagsActionable(null) === false);
expect("isActionable([]) → false",
  isBulkStripHashtagsActionable([]) === false);

// ===== Per-clip action shape =====
{
  const a = perClipActionForStrip({ id: "x", note: "foo #bar baz" });
  expect("per-clip action shape correct",
    a && a.id === "x" && a.newNote === "foo baz" &&
    a.removed === 1 && a.emptiedNote === false,
    `got: ${JSON.stringify(a)}`);
}
{
  const a = perClipActionForStrip({ id: "y", note: "#staging" });
  expect("only-hashtags note flags emptiedNote",
    a && a.newNote === undefined && a.emptiedNote === true && a.removed === 1,
    `got: ${JSON.stringify(a)}`);
}
{
  // Per-occurrence counting
  const a = perClipActionForStrip({ id: "z", note: "#a #b #a #c" });
  expect("count per occurrence (not distinct)",
    a && a.removed === 4,
    `got: ${JSON.stringify(a)}`);
}

// ===== Plan aggregation =====
{
  const clips = [
    { id: "a", note: "foo #x bar" },           // 1 token, prose remains
    { id: "b", note: "#y" },                    // 1 token, note empties
    { id: "c", note: "plain prose only" },      // 0 tokens, no-op
    { id: "d", note: "be careful — #z #w" },    // 2 tokens, prose remains
    { id: "e" },                                // no note
    { id: "f", note: "#p1 #p2 #p3" },           // 3 tokens, note empties
  ];
  const p = planBulkStripHashtags(clips);
  expect("plan total = 6", p.total === 6, `got total ${p.total}`);
  expect("plan noHashtags = 2 (c, e)",
    p.noHashtags === 2, `got noHashtags ${p.noHashtags}`);
  expect("plan modified = 4",
    p.modified === 4, `got modified ${p.modified}`);
  expect("plan emptied = 2 (b, f)",
    p.emptied === 2, `got emptied ${p.emptied}`);
  expect("plan totalRemoved = 7 (1+1+2+3)",
    p.totalRemoved === 7, `got totalRemoved ${p.totalRemoved}`);
}

// ===== Defensive against malformed entries =====
{
  const clips = [
    { id: "good", note: "#x" },
    null,
    { id: "", note: "#x" }, // empty id
    { note: "#x" },          // no id
    { id: "bad", note: null },
    { id: "ok", note: "foo #y baz" },
  ];
  const p = planBulkStripHashtags(clips);
  expect("malformed entries skipped (only 'good' + 'bad' + 'ok' counted)",
    p.total === 3 && p.modified === 2,
    `got total=${p.total} modified=${p.modified}`);
}

// ===== Actionable predicate =====
expect("isActionable([no-hashtag clips]) → false",
  isBulkStripHashtagsActionable([
    { id: "a", note: "plain" },
    { id: "b" },
  ]) === false);
expect("isActionable([one with #tag]) → true",
  isBulkStripHashtagsActionable([
    { id: "a", note: "plain" },
    { id: "b", note: "#x" },
  ]) === true);

// ===== Toast formatter at every shape =====
expect("toast({total:0}) → 'Nothing to strip'",
  formatBulkStripHashtagsToast({ total: 0 }) === "Nothing to strip");
expect("toast(no modified) → 'No hashtags in any note'",
  formatBulkStripHashtagsToast({
    total: 3, modified: 0, totalRemoved: 0, emptied: 0
  }) === "No hashtags in any note");
expect("toast(1 modified, 1 token) → 'Stripped #tag from 1 note'",
  formatBulkStripHashtagsToast({
    total: 5, modified: 1, totalRemoved: 1, emptied: 0
  }) === "Stripped #tag from 1 note");
expect("toast(1 modified, 3 tokens) → 'Stripped 3 hashtags from 1 note'",
  formatBulkStripHashtagsToast({
    total: 5, modified: 1, totalRemoved: 3, emptied: 0
  }) === "Stripped 3 hashtags from 1 note");
expect("toast(4 modified, 7 tokens) → 'Stripped 7 hashtags across 4 notes'",
  formatBulkStripHashtagsToast({
    total: 6, modified: 4, totalRemoved: 7, emptied: 0
  }) === "Stripped 7 hashtags across 4 notes");
expect("toast(4 modified, 7 tokens, 2 emptied) → 'Stripped 7 hashtags across 4 notes (2 notes emptied)'",
  formatBulkStripHashtagsToast({
    total: 6, modified: 4, totalRemoved: 7, emptied: 2
  }) === "Stripped 7 hashtags across 4 notes (2 notes emptied)");
expect("toast(1 modified, 1 emptied, 1 token) → tail with singular",
  formatBulkStripHashtagsToast({
    total: 1, modified: 1, totalRemoved: 1, emptied: 1
  }) === "Stripped #tag from 1 note (1 note emptied)");

// ===== Button-title formatter =====
expect("title(empty selection) → invitation copy",
  formatBulkStripHashtagsButtonTitle([]).includes("Strip inline"));
expect("title(no hashtags in any) → 'No #hashtag tokens...'",
  formatBulkStripHashtagsButtonTitle([
    { id: "a", note: "plain" },
    { id: "b" },
  ]).includes("No #hashtag tokens"));
{
  const t = formatBulkStripHashtagsButtonTitle([
    { id: "a", note: "foo #x bar" },
    { id: "b", note: "plain" },
  ]);
  expect("title(1 token in 1 note)",
    t === "Strip 1 inline #tag from 1 note (prose preserved)",
    `got: ${t}`);
}
{
  const t = formatBulkStripHashtagsButtonTitle([
    { id: "a", note: "#x #y #z" },
  ]);
  expect("title(3 tokens in 1 note)",
    t === "Strip 3 inline #tags from 1 note (prose preserved)",
    `got: ${t}`);
}
{
  const t = formatBulkStripHashtagsButtonTitle([
    { id: "a", note: "foo #x" },
    { id: "b", note: "#y #z" },
  ]);
  expect("title(3 tokens across 2 notes)",
    t === "Strip 3 inline #tags from 2 notes (prose preserved)",
    `got: ${t}`);
}

// ===== Realistic end-to-end =====
{
  const realistic = [
    { id: "build1", note: "be careful — #staging - check with $person first", tags: [] },
    { id: "build2", note: "rotate this token #urgent #temp", tags: [] },
    { id: "build3", note: "Just regular prose here.", tags: [] },
    { id: "build4", note: "#standalone", tags: [] },
    { id: "build5", tags: [] }, // no note
  ];
  const p = planBulkStripHashtags(realistic);
  expect("realistic plan: 5 total, 3 modified, 1 emptied, 4 removed",
    p.total === 5 && p.noHashtags === 2 && p.modified === 3 &&
    p.emptied === 1 && p.totalRemoved === 4,
    `got: ${JSON.stringify(p)}`);
  const a1 = perClipActionForStrip(realistic[0]);
  expect("realistic[0] action: prose preserved with em-dash",
    a1 && a1.newNote === "be careful — - check with $person first",
    `got: ${JSON.stringify(a1)}`);
  const a4 = perClipActionForStrip(realistic[3]);
  expect("realistic[3] action: standalone empties",
    a4 && a4.newNote === undefined && a4.emptiedNote === true,
    `got: ${JSON.stringify(a4)}`);
  const a3 = perClipActionForStrip(realistic[2]);
  expect("realistic[2] (no-hashtag prose) skipped",
    a3 === undefined,
    `got: ${JSON.stringify(a3)}`);
  expect("realistic toast",
    formatBulkStripHashtagsToast(p) === "Stripped 4 hashtags across 3 notes (1 note emptied)",
    `got: ${formatBulkStripHashtagsToast(p)}`);
}

// ===== Idempotence at bulk level =====
{
  const clips = [
    { id: "a", note: "#x" },
    { id: "b", note: "foo #y bar" },
  ];
  const a1 = perClipActionForStrip(clips[0]);
  const a2 = perClipActionForStrip(clips[1]);
  // Re-running on the stripped output should produce no-action
  expect("idempotent: stripped note has no further work",
    perClipActionForStrip({ id: "b", note: a2.newNote }) === undefined,
    `expected no-op on second pass`);
}

rmSync(tmp, { recursive: true, force: true });

if (fail) {
  console.error(`FAIL: ${fail}/${pass + fail} (${failures.length} failures)`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`PASS: ${pass}/${pass} (bulk-strip-hashtags)`);
