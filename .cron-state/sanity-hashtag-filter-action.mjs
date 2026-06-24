#!/usr/bin/env node
// Sanity for hashtag-discovery's new hashtagFilterActionFor helper.
// Verifies the per-tag palette action shape composes the right
// searchOp + label/hint/keywords across the report-entry contract.

import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = process.cwd();
const tmp = mkdtempSync(join(tmpdir(), "sanity-hashtag-filter-"));
const out = join(tmp, "hf.js");
execSync(
  `node_modules/.bin/esbuild src/lib/hashtag-discovery.ts --bundle --format=esm --platform=neutral --outfile=${out}`,
  { stdio: "ignore", cwd: repo },
);
const { discoverHashtagsInNotes, hashtagFilterActionFor } = await import(out);

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
expect("hashtagFilterActionFor(null) → undefined",
  hashtagFilterActionFor(null) === undefined);
expect("hashtagFilterActionFor(undefined) → undefined",
  hashtagFilterActionFor(undefined) === undefined);
expect("hashtagFilterActionFor({}) → undefined",
  hashtagFilterActionFor({}) === undefined);
expect("hashtagFilterActionFor({tag: ''}) → undefined",
  hashtagFilterActionFor({ tag: "", clipCount: 5 }) === undefined);
expect("hashtagFilterActionFor({tag: 123}) → undefined",
  hashtagFilterActionFor({ tag: 123, clipCount: 5 }) === undefined);

// ===== Standard cases =====
{
  const a = hashtagFilterActionFor({
    tag: "staging",
    clipCount: 8,
    alreadyTagged: false,
  });
  expect("searchOp combines is:hashtags + literal",
    a.searchOp === "is:hashtags #staging",
    `got: ${a.searchOp}`);
  expect("label has tag + count + 'clips' plural",
    a.label === "Filter to clips with #staging in notes (8 clips)",
    `got: ${a.label}`);
  expect("label has no '(already structured)' tail when not flagged",
    !a.label.includes("(already structured)"),
    `got: ${a.label}`);
  expect("hint mentions promotion candidate when not structured",
    a.hint.includes("promotion candidate"),
    `got: ${a.hint}`);
  expect("keywords carry the tag for fuzzy match",
    a.keywords.includes("staging") && a.keywords.includes("#staging") &&
    a.keywords.includes("candidate"),
    `got: ${a.keywords}`);
}
{
  // 1 clip case
  const a = hashtagFilterActionFor({
    tag: "wip",
    clipCount: 1,
    alreadyTagged: false,
  });
  expect("label uses singular 'clip' for clipCount=1",
    a.label === "Filter to clips with #wip in notes (1 clip)",
    `got: ${a.label}`);
}
{
  // alreadyTagged flag
  const a = hashtagFilterActionFor({
    tag: "todo",
    clipCount: 3,
    alreadyTagged: true,
  });
  expect("alreadyTagged appends (already structured) tail",
    a.label === "Filter to clips with #todo in notes (3 clips) (already structured)",
    `got: ${a.label}`);
  expect("hint mentions structured + duplicates path when alreadyTagged",
    a.hint.includes("already a structured tag") && a.hint.includes("duplicates"),
    `got: ${a.hint}`);
  expect("keywords mention 'already structured' when alreadyTagged",
    a.keywords.includes("structured") && a.keywords.includes("already"),
    `got: ${a.keywords}`);
}

// ===== Defensive numeric inputs =====
{
  const a = hashtagFilterActionFor({
    tag: "x",
    clipCount: NaN,
    alreadyTagged: false,
  });
  expect("NaN clipCount clamps to 0",
    a.label === "Filter to clips with #x in notes (0 clips)",
    `got: ${a.label}`);
}
{
  const a = hashtagFilterActionFor({
    tag: "x",
    clipCount: -5,
    alreadyTagged: false,
  });
  expect("negative clipCount clamps to 0",
    a.label === "Filter to clips with #x in notes (0 clips)",
    `got: ${a.label}`);
}
{
  const a = hashtagFilterActionFor({
    tag: "x",
    clipCount: "garbage",
    alreadyTagged: false,
  });
  expect("non-number clipCount clamps to 0",
    a.label === "Filter to clips with #x in notes (0 clips)",
    `got: ${a.label}`);
}

// ===== Realistic end-to-end with discovery =====
{
  const clips = [
    { id: "a", note: "be careful — #staging", tags: [] },
    { id: "b", note: "draft #wip later", tags: [] },
    { id: "c", note: "#staging again", tags: [] },
    { id: "d", note: "#wip #urgent", tags: [] },
    { id: "e", note: "plain prose" },
  ];
  const r = discoverHashtagsInNotes(clips, { topN: 8 });
  const filters = r.entries.map(hashtagFilterActionFor).filter(Boolean);
  expect("discovery + filter pipeline: 3 actions for 3 tags",
    filters.length === 3,
    `got: ${filters.map(f=>f.searchOp).join(', ')}`);
  // Top entry should be #staging (2 clips) or #wip (2 clips) — tied
  // by clipCount, so alpha tiebreak puts #staging first.
  expect("top entry is #staging (alpha tiebreak vs #wip)",
    filters[0].searchOp === "is:hashtags #staging",
    `got: ${filters[0].searchOp}`);
  expect("third entry is #urgent (1 clip, alpha tiebreak)",
    filters[2].searchOp === "is:hashtags #urgent",
    `got: ${filters[2].searchOp}`);
}

// ===== Hyphenated tag passes through =====
{
  const a = hashtagFilterActionFor({
    tag: "follow-up",
    clipCount: 4,
    alreadyTagged: false,
  });
  expect("hyphenated tag passes through searchOp",
    a.searchOp === "is:hashtags #follow-up",
    `got: ${a.searchOp}`);
  expect("hyphenated tag in label",
    a.label.includes("#follow-up"),
    `got: ${a.label}`);
}

rmSync(tmp, { recursive: true, force: true });

if (fail) {
  console.error(`FAIL: ${fail}/${pass + fail} (${failures.length} failures)`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`PASS: ${pass}/${pass} (hashtag-filter-action)`);
