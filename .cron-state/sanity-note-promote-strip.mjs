#!/usr/bin/env node
// Sanity for lib/note-promote-strip pure module.
// Verifies plan composition (extractHashtags + mergedTagsForClip +
// stripHashtagsFromNote), gate predicate, and three formatters.

import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = process.cwd();
const tmp = mkdtempSync(join(tmpdir(), "sanity-promote-strip-"));
const out = join(tmp, "ps.js");
execSync(
  `node_modules/.bin/esbuild src/lib/note-promote-strip.ts --bundle --format=esm --platform=neutral --outfile=${out}`,
  { stdio: "ignore", cwd: repo },
);
const {
  planPromoteAndStrip,
  isPromoteAndStripActionable,
  formatPromoteAndStripChipLabel,
  formatPromoteAndStripChipTooltip,
  formatPromoteAndStripToast,
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
expect("plan(null) → empty",
  planPromoteAndStrip(null).pending.length === 0);
expect("plan(undefined) → empty",
  planPromoteAndStrip(undefined).pending.length === 0);
expect("plan(no id) → empty",
  planPromoteAndStrip({ note: "#foo" }).pending.length === 0);
expect("plan(empty id) → empty",
  planPromoteAndStrip({ id: "", note: "#foo" }).pending.length === 0);
expect("plan(no note) → empty",
  planPromoteAndStrip({ id: "x" }).pending.length === 0);
expect("plan(prose-only note) → empty",
  planPromoteAndStrip({ id: "x", note: "just prose" }).pending.length === 0);

// ===== Plan: standard case =====
{
  const c = { id: "a", note: "be careful — #staging #wip", tags: [] };
  const p = planPromoteAndStrip(c);
  expect("plan: standard case has pending list",
    p.pending.length === 2 &&
    p.pending.includes("staging") && p.pending.includes("wip"),
    `got pending: ${JSON.stringify(p.pending)}`);
  expect("plan: alreadyTagged empty when no tags",
    p.alreadyTagged.length === 0);
  expect("plan: mergedTags has both new tags",
    Array.isArray(p.mergedTags) && p.mergedTags.length === 2);
  expect("plan: removed = 2",
    p.removed === 2, `got removed: ${p.removed}`);
  expect("plan: newNote preserves prose",
    p.newNote === "be careful —",
    `got newNote: ${JSON.stringify(p.newNote)}`);
  expect("plan: emptiesNote false (prose remains)",
    p.emptiesNote === false);
}

// ===== Plan: gate (all-already-tagged → empty) =====
{
  // Every hashtag in the note is already structured. Combo should
  // hide (user should click strip alone).
  const c = {
    id: "b",
    note: "#staging only #wip",
    tags: ["staging", "wip"],
  };
  const p = planPromoteAndStrip(c);
  expect("plan: all-already-tagged → pending empty (combo hidden)",
    p.pending.length === 0,
    `got pending: ${JSON.stringify(p.pending)}`);
  expect("plan: alreadyTagged populated",
    p.alreadyTagged.length === 2);
  expect("plan: no mergedTags computed",
    p.mergedTags === undefined);
}

// ===== Plan: mixed (some new, some already) =====
{
  const c = {
    id: "c",
    note: "todo #urgent #review #urgent",
    tags: ["urgent"], // urgent already tagged
  };
  const p = planPromoteAndStrip(c);
  expect("plan: mixed → only NEW tags in pending",
    p.pending.length === 1 && p.pending[0] === "review",
    `got pending: ${JSON.stringify(p.pending)}`);
  expect("plan: alreadyTagged carries the duplicated tag",
    p.alreadyTagged.includes("urgent"));
  expect("plan: removed counts all occurrences (2 #urgent + 1 #review)",
    p.removed === 3,
    `got removed: ${p.removed}`);
  expect("plan: mergedTags appends new only",
    p.mergedTags && p.mergedTags.length === 2 &&
    p.mergedTags.includes("urgent") && p.mergedTags.includes("review"),
    `got mergedTags: ${JSON.stringify(p.mergedTags)}`);
}

// ===== Plan: emptiesNote when only #tags =====
{
  const c = { id: "d", note: "#standalone", tags: [] };
  const p = planPromoteAndStrip(c);
  expect("plan: standalone-tag note has pending=1",
    p.pending.length === 1 && p.pending[0] === "standalone");
  expect("plan: standalone-tag note has newNote undefined",
    p.newNote === undefined);
  expect("plan: standalone-tag flags emptiesNote",
    p.emptiesNote === true);
}

// ===== Plan: case-insensitive comparison =====
{
  const c = {
    id: "e",
    note: "#Staging is critical",
    tags: ["staging"], // case differs but matches
  };
  const p = planPromoteAndStrip(c);
  expect("plan: case-insensitive (Staging matches staging)",
    p.pending.length === 0 && p.alreadyTagged.includes("staging"),
    `got pending: ${JSON.stringify(p.pending)} alreadyTagged: ${JSON.stringify(p.alreadyTagged)}`);
}

// ===== Predicate =====
expect("isPromoteAndStripActionable(null) → false",
  isPromoteAndStripActionable(null) === false);
expect("isPromoteAndStripActionable(no hashtags) → false",
  isPromoteAndStripActionable({ id: "a", note: "prose", tags: [] }) === false);
expect("isPromoteAndStripActionable(all-already-tagged) → false",
  isPromoteAndStripActionable({ id: "a", note: "#x", tags: ["x"] }) === false);
expect("isPromoteAndStripActionable(has new tag) → true",
  isPromoteAndStripActionable({ id: "a", note: "#new", tags: [] }) === true);

// ===== Label formatter =====
{
  const p = { pending: [], alreadyTagged: [], removed: 0, emptiesNote: false };
  expect("label(0 pending) → ''",
    formatPromoteAndStripChipLabel(p) === "");
}
{
  const p = { pending: ["x"], alreadyTagged: [], removed: 1, emptiesNote: false };
  expect("label(1 pending) → 'Promote #x + strip'",
    formatPromoteAndStripChipLabel(p) === "Promote #x + strip",
    `got: ${formatPromoteAndStripChipLabel(p)}`);
}
{
  const p = { pending: ["x", "y"], alreadyTagged: [], removed: 2, emptiesNote: false };
  expect("label(2 pending) → 'Promote #x, #y + strip'",
    formatPromoteAndStripChipLabel(p) === "Promote #x, #y + strip",
    `got: ${formatPromoteAndStripChipLabel(p)}`);
}
{
  const p = { pending: ["x", "y", "z"], alreadyTagged: [], removed: 3, emptiesNote: false };
  expect("label(3 pending) → enumerate",
    formatPromoteAndStripChipLabel(p) === "Promote #x, #y, #z + strip",
    `got: ${formatPromoteAndStripChipLabel(p)}`);
}
{
  const p = { pending: ["a","b","c","d","e"], alreadyTagged: [], removed: 5, emptiesNote: false };
  expect("label(5 pending) → count form",
    formatPromoteAndStripChipLabel(p) === "Promote 5 tags + strip",
    `got: ${formatPromoteAndStripChipLabel(p)}`);
}

// ===== Tooltip =====
{
  const p = { pending: ["x"], alreadyTagged: [], removed: 1, emptiesNote: false };
  const t = formatPromoteAndStripChipTooltip(p);
  expect("tooltip(1 pending, 1 removed, no empty) shape",
    t === "Add #x to structured tags, remove 1 inline #tag token from note",
    `got: ${t}`);
}
{
  const p = { pending: ["x", "y"], alreadyTagged: [], removed: 2, emptiesNote: true };
  const t = formatPromoteAndStripChipTooltip(p);
  expect("tooltip with emptiesNote tail",
    t.includes("(note will be cleared)") && t.includes("Add #x, #y"),
    `got: ${t}`);
}
{
  const p = { pending: ["x", "y"], alreadyTagged: [], removed: 2, emptiesNote: false };
  const t = formatPromoteAndStripChipTooltip(p);
  expect("tooltip uses 'tokens' plural for removed >= 2",
    t.includes("2 inline #tag tokens"),
    `got: ${t}`);
}

// ===== Toast =====
{
  const p = { pending: [], alreadyTagged: [], removed: 0, emptiesNote: false };
  expect("toast(no pending) → 'Nothing to promote'",
    formatPromoteAndStripToast(p) === "Nothing to promote");
}
{
  const p = { pending: ["x"], alreadyTagged: [], removed: 1, emptiesNote: false };
  expect("toast(1 pending, 1 removed) → 'Added #x + stripped'",
    formatPromoteAndStripToast(p) === "Added #x + stripped",
    `got: ${formatPromoteAndStripToast(p)}`);
}
{
  const p = { pending: ["x"], alreadyTagged: [], removed: 3, emptiesNote: false };
  expect("toast(1 pending, 3 removed) → 'Added #x + stripped 3'",
    formatPromoteAndStripToast(p) === "Added #x + stripped 3",
    `got: ${formatPromoteAndStripToast(p)}`);
}
{
  const p = { pending: ["x", "y"], alreadyTagged: [], removed: 2, emptiesNote: false };
  expect("toast(2 pending, 2 removed) symmetric → 'Added #x, #y + stripped'",
    formatPromoteAndStripToast(p) === "Added #x, #y + stripped",
    `got: ${formatPromoteAndStripToast(p)}`);
}
{
  const p = { pending: ["x", "y"], alreadyTagged: ["z"], removed: 4, emptiesNote: false };
  expect("toast(2 pending, 4 removed) → 'Added #x, #y + stripped 4'",
    formatPromoteAndStripToast(p) === "Added #x, #y + stripped 4",
    `got: ${formatPromoteAndStripToast(p)}`);
}
{
  const p = { pending: ["a","b","c","d","e"], alreadyTagged: [], removed: 5, emptiesNote: false };
  expect("toast(5 pending) → count form",
    formatPromoteAndStripToast(p) === "Added 5 tags + stripped 5",
    `got: ${formatPromoteAndStripToast(p)}`);
}
{
  const p = { pending: ["x"], alreadyTagged: [], removed: 1, emptiesNote: true };
  expect("toast(emptiesNote) appends ' · note cleared'",
    formatPromoteAndStripToast(p) === "Added #x + stripped · note cleared",
    `got: ${formatPromoteAndStripToast(p)}`);
}

// ===== Realistic end-to-end =====
{
  const c = {
    id: "real",
    note: "be careful — #staging - check with $person first",
    tags: [],
  };
  const p = planPromoteAndStrip(c);
  expect("realistic plan: 1 pending, 1 removed, prose preserved",
    p.pending.length === 1 && p.pending[0] === "staging" &&
    p.removed === 1 &&
    p.newNote === "be careful — - check with $person first" &&
    p.emptiesNote === false,
    `got: ${JSON.stringify(p)}`);
  expect("realistic toast",
    formatPromoteAndStripToast(p) === "Added #staging + stripped",
    `got: ${formatPromoteAndStripToast(p)}`);
}

// ===== Order preservation in mergedTags =====
{
  const c = {
    id: "ord",
    note: "first #alpha then #beta then #gamma",
    tags: ["existing"],
  };
  const p = planPromoteAndStrip(c);
  expect("mergedTags preserves existing + appends new in note order",
    p.mergedTags && p.mergedTags[0] === "existing" &&
    p.mergedTags.includes("alpha") && p.mergedTags.includes("beta") && p.mergedTags.includes("gamma"),
    `got mergedTags: ${JSON.stringify(p.mergedTags)}`);
}

rmSync(tmp, { recursive: true, force: true });

if (fail) {
  console.error(`FAIL: ${fail}/${pass + fail} (${failures.length} failures)`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`PASS: ${pass}/${pass} (note-promote-strip)`);
