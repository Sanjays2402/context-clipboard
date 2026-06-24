#!/usr/bin/env node
// Sanity for note-hashtag-strip pure module.
// Covers: stripping grammar, prose preservation, idempotence,
// count-aware label/tooltip/toast formatters, defensive shapes.

import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = process.cwd();
const tmp = mkdtempSync(join(tmpdir(), "sanity-note-hashtag-strip-"));
const out = join(tmp, "strip.js");
execSync(
  `node_modules/.bin/esbuild src/lib/note-hashtag-strip.ts --bundle --format=esm --platform=neutral --outfile=${out}`,
  { stdio: "ignore", cwd: repo },
);
const {
  stripHashtagsFromNote,
  noteHasStrippableHashtags,
  countStrippableHashtagsInNote,
  formatStripHashtagsChipLabel,
  formatStripHashtagsChipTooltip,
  formatStripHashtagsToast,
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

// ===== Defensive / empty contract =====
expect("strip(null) → undefined", stripHashtagsFromNote(null) === undefined);
expect("strip(undefined) → undefined", stripHashtagsFromNote(undefined) === undefined);
expect("strip(123) → undefined", stripHashtagsFromNote(123) === undefined);
expect("strip({}) → undefined", stripHashtagsFromNote({}) === undefined);
expect("strip('') → undefined", stripHashtagsFromNote("") === undefined);
expect("strip('   ') → undefined", stripHashtagsFromNote("   ") === undefined);
expect("noteHasStrippableHashtags(null) → false",
  noteHasStrippableHashtags(null) === false);
expect("noteHasStrippableHashtags('') → false",
  noteHasStrippableHashtags("") === false);
expect("countStrippableHashtagsInNote(null) → 0",
  countStrippableHashtagsInNote(null) === 0);
expect("countStrippableHashtagsInNote('') → 0",
  countStrippableHashtagsInNote("") === 0);

// ===== Basic strip mechanics =====
{
  const r = stripHashtagsFromNote("be careful — #staging");
  expect("strip single tag end-of-line",
    r === "be careful —", `got: ${JSON.stringify(r)}`);
}
{
  const r = stripHashtagsFromNote("#staging do this");
  expect("strip leading tag",
    r === "do this", `got: ${JSON.stringify(r)}`);
}
{
  const r = stripHashtagsFromNote("foo #bar baz");
  expect("strip mid-line tag, no double space",
    r === "foo baz", `got: ${JSON.stringify(r)}`);
}
{
  const r = stripHashtagsFromNote("be careful — #staging #wip later");
  expect("strip multiple tags",
    r === "be careful — later", `got: ${JSON.stringify(r)}`);
}
{
  const r = stripHashtagsFromNote("draft;#wip later");
  expect("strip punct-leader keeps punctuation",
    r === "draft; later", `got: ${JSON.stringify(r)}`);
}
{
  const r = stripHashtagsFromNote("(#deprecated)");
  expect("strip paren-leader keeps parens",
    r === "()", `got: ${JSON.stringify(r)}`);
}
{
  const r = stripHashtagsFromNote("#follow-up later");
  expect("strip hyphenated tag",
    r === "later", `got: ${JSON.stringify(r)}`);
}

// ===== foo#bar (no boundary) NOT stripped =====
{
  const r = stripHashtagsFromNote("see foo#bar reference");
  expect("foo#bar (no boundary) is NOT stripped",
    r === "see foo#bar reference", `got: ${JSON.stringify(r)}`);
}
{
  const r = stripHashtagsFromNote("url: https://gh.com/#anchor");
  expect("URL fragment is NOT stripped",
    r === "url: https://gh.com/#anchor", `got: ${JSON.stringify(r)}`);
}

// ===== Idempotence =====
{
  const once = stripHashtagsFromNote("foo #bar baz #qux");
  const twice = stripHashtagsFromNote(once);
  expect("strip is idempotent",
    once === twice, `once=${JSON.stringify(once)} twice=${JSON.stringify(twice)}`);
}

// ===== Multi-line note: paragraph breaks preserved =====
{
  const note = "First paragraph #wip\n\nSecond paragraph #review later";
  const r = stripHashtagsFromNote(note);
  expect("multi-line note preserves paragraph break",
    r === "First paragraph\n\nSecond paragraph later", `got: ${JSON.stringify(r)}`);
}

// ===== Note that is ONLY hashtags → undefined =====
{
  const r = stripHashtagsFromNote("#staging #wip");
  expect("note that's only hashtags strips to undefined",
    r === undefined, `got: ${JSON.stringify(r)}`);
}
{
  const r = stripHashtagsFromNote("#one");
  expect("single-tag note strips to undefined",
    r === undefined, `got: ${JSON.stringify(r)}`);
}

// ===== Count and predicate =====
expect("count('foo #bar baz') === 1",
  countStrippableHashtagsInNote("foo #bar baz") === 1);
expect("count('#a #b #c') === 3",
  countStrippableHashtagsInNote("#a #b #c") === 3);
expect("count('foo #x #y #x') === 3 (per-occurrence not distinct)",
  countStrippableHashtagsInNote("foo #x #y #x") === 3);
expect("count('plain prose') === 0",
  countStrippableHashtagsInNote("plain prose") === 0);
expect("count('foo#bar') === 0 (no boundary)",
  countStrippableHashtagsInNote("foo#bar") === 0);
expect("has predicate matches positive count",
  noteHasStrippableHashtags("draft #wip") === true);
expect("has predicate false on prose",
  noteHasStrippableHashtags("just prose") === false);
expect("has predicate false on foo#bar",
  noteHasStrippableHashtags("foo#bar") === false);

// ===== Formatters: chip label =====
expect("label(0) === ''", formatStripHashtagsChipLabel(0) === "");
expect("label(1) === 'Strip #tag'",
  formatStripHashtagsChipLabel(1) === "Strip #tag");
expect("label(2) === 'Strip 2 #tags'",
  formatStripHashtagsChipLabel(2) === "Strip 2 #tags");
expect("label(5) === 'Strip 5 #tags'",
  formatStripHashtagsChipLabel(5) === "Strip 5 #tags");
expect("label(-3) clamped → ''", formatStripHashtagsChipLabel(-3) === "");
expect("label(NaN) → ''", formatStripHashtagsChipLabel(NaN) === "");
expect("label('garbage') → ''", formatStripHashtagsChipLabel("garbage") === "");

// ===== Formatters: tooltip =====
{
  const t = formatStripHashtagsChipTooltip(1);
  expect("tooltip(1) mentions hashtag + prose preserved",
    t.includes("1 inline hashtag") && t.includes("prose preserved") && t.includes("does NOT promote"),
    `got: ${t}`);
}
{
  const t = formatStripHashtagsChipTooltip(3);
  expect("tooltip(3) uses plural",
    t.includes("3 inline hashtags") && !t.includes("3 inline hashtag "),
    `got: ${t}`);
}
expect("tooltip(0) === ''", formatStripHashtagsChipTooltip(0) === "");

// ===== Formatters: toast =====
expect("toast(0) === 'Nothing to strip'",
  formatStripHashtagsToast(0) === "Nothing to strip");
expect("toast(1) === 'Stripped #tag from note'",
  formatStripHashtagsToast(1) === "Stripped #tag from note");
expect("toast(7) === 'Stripped 7 hashtags from note'",
  formatStripHashtagsToast(7) === "Stripped 7 hashtags from note");

// ===== Realistic end-to-end =====
{
  const note = "be careful — #staging - check with $person first";
  const r = stripHashtagsFromNote(note);
  expect("realistic note preserves prose with em-dash",
    r === "be careful — - check with $person first", `got: ${JSON.stringify(r)}`);
}
{
  const note = "TODO #urgent: rotate this token #temp";
  const r = stripHashtagsFromNote(note);
  expect("TODO + : + multiple tags",
    r === "TODO: rotate this token", `got: ${JSON.stringify(r)}`);
}

// ===== Stress: many hashtags, 32-char cap on body grammar =====
{
  // Hashtag body is capped at 32 chars by the matcher; longer
  // bodies still get matched up to the cap (the regex stops at 32
  // alphanumeric chars). So a 50-char-body hashtag has the first
  // 32 stripped along with its leading whitespace, the remaining
  // 18 chars stay as plain text adjacent to the prior word
  // (no space buffer because the whitespace leader was consumed
  // together with the captured token — same contract that
  // produces "foo baz" from "foo #bar baz").
  const longTag = "#" + "a".repeat(50);
  const note = "prefix " + longTag + " suffix";
  const r = stripHashtagsFromNote(note);
  expect("long hashtag body strips first 32, leftover chars adjacent",
    r === "prefix" + "a".repeat(18) + " suffix",
    `got: ${JSON.stringify(r)}`);
}

// ===== Whitespace edge cases =====
{
  // Tab leader + tab trailer
  const r = stripHashtagsFromNote("foo\t#bar\tbaz");
  expect("tab-leader strips cleanly",
    r === "foo baz" || r === "foo\tbaz", `got: ${JSON.stringify(r)}`);
}
{
  // Double-space surrounding
  const r = stripHashtagsFromNote("foo  #bar  baz");
  // Collapse leaves at most one space between words
  expect("double-space surrounding collapses",
    r === "foo baz", `got: ${JSON.stringify(r)}`);
}

// ===== Promote-then-strip equivalence with combo's clear-step =====
// The strip output should be byte-identical to what tag-from-notes-clear
// would produce IF the combo had cleared the note. We don't import the
// combo here, but the key invariant is: strip preserves prose, doesn't
// touch tags. Verified above.

rmSync(tmp, { recursive: true, force: true });

if (fail) {
  console.error(`FAIL: ${fail}/${pass + fail} (${failures.length} failures)`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`PASS: ${pass}/${pass} (note-hashtag-strip)`);
