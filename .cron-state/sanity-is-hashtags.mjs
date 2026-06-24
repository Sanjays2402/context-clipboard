#!/usr/bin/env node
// Sanity for is:hashtags / is:nohashtags search operators.
// Verifies the parser+applyQuery+describeQuery integration so the
// search filter, the Tag-from-notes promotion path, and the Cmd+K
// hashtag-discovery report can never disagree on what counts as a
// hashtag — they all read from extractHashtagsFromNote.

import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = process.cwd();
const tmp = mkdtempSync(join(tmpdir(), "sanity-is-hashtags-"));
const out = join(tmp, "search.js");
execSync(
  `node_modules/.bin/esbuild src/lib/search.ts --bundle --format=esm --platform=neutral --outfile=${out}`,
  { stdio: "ignore", cwd: repo },
);
const { parseQuery, applyQuery, describeQuery } = await import(out);

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

// Build a synthetic clip array covering every relevant axis.
const now = Date.now();
function mk(opts) {
  return {
    id: opts.id,
    kind: opts.kind ?? "text",
    content: opts.content ?? "",
    preview: opts.preview ?? "",
    tags: opts.tags ?? [],
    source: { url: opts.url ?? "https://x.test/" + opts.id, title: "", nearbyText: "" },
    lastSeenAt: now,
    capturedAt: now,
    pinned: false,
    redacted: false,
    note: opts.note,
    archived: false,
    hitCount: 0,
  };
}

const clips = [
  mk({ id: "a", note: "be careful — #staging #wip" }), // 2 hashtags
  mk({ id: "b", note: "just prose, no inline tags" }), // noted, no hashtags
  mk({ id: "c" }), // no note at all
  mk({ id: "d", note: "" }), // empty note (no hashtags)
  mk({ id: "e", note: "draft notes — #review-q3" }), // 1 hashtag
  mk({ id: "f", note: "url like https://x.com/#anchor — no hashtag" }), // anchor, not hashtag (foo#bar grammar reject)
  mk({ id: "g", note: "todo #follow-up later" }), // 1 hashtag (hyphen)
];

// ----- parseQuery picks up the operators -----
{
  const q = parseQuery("is:hashtags");
  expect("parse is:hashtags sets flag", q.hashtagsOnly === true);
  expect("parse is:hashtags leaves other note flags off",
    q.notedOnly === false && q.nonotedOnly === false && q.noHashtags === false);
}
{
  const q = parseQuery("is:nohashtags");
  expect("parse is:nohashtags sets flag", q.noHashtags === true);
  expect("parse is:nohashtags leaves other note flags off",
    q.notedOnly === false && q.nonotedOnly === false && q.hashtagsOnly === false);
}
{
  const q = parseQuery("is:hashtags is:nohashtags");
  expect("both flags coexist (intent preserved)",
    q.hashtagsOnly === true && q.noHashtags === true);
}
{
  // Free-text noise survives untouched
  const q = parseQuery("review is:hashtags host:x.test");
  expect("freeText preserved alongside is:hashtags",
    q.hashtagsOnly === true && q.freeText === "review" && q.host === "x.test");
}

// ----- applyQuery gates correctly -----
{
  const f = applyQuery(clips, parseQuery("is:hashtags"));
  const ids = f.map((c) => c.id).sort();
  expect("is:hashtags surfaces clips a, e, g (anchor URL excluded)",
    JSON.stringify(ids) === JSON.stringify(["a", "e", "g"]),
    `got: ${JSON.stringify(ids)}`);
}
{
  const f = applyQuery(clips, parseQuery("is:nohashtags"));
  const ids = f.map((c) => c.id).sort();
  // b: prose-only note; c: no note; d: empty note; f: anchor URL (no hashtag grammar match)
  expect("is:nohashtags surfaces b, c, d, f (everything without inline hashtags)",
    JSON.stringify(ids) === JSON.stringify(["b", "c", "d", "f"]),
    `got: ${JSON.stringify(ids)}`);
}
{
  const f = applyQuery(clips, parseQuery("is:hashtags is:nohashtags"));
  expect("is:hashtags AND is:nohashtags = empty (mutually exclusive)",
    f.length === 0);
}
{
  // is:hashtags should IMPLY is:noted (no note → no hashtags)
  const f1 = applyQuery(clips, parseQuery("is:hashtags"));
  const f2 = applyQuery(f1, parseQuery("is:noted"));
  expect("is:hashtags implies is:noted (same result on second pass)",
    JSON.stringify(f1.map(c=>c.id).sort()) === JSON.stringify(f2.map(c=>c.id).sort()));
}
{
  // is:nohashtags does NOT imply is:nonoted (prose-only notes pass both)
  const f = applyQuery(clips, parseQuery("is:noted is:nohashtags"));
  const ids = f.map((c) => c.id).sort();
  expect("is:noted is:nohashtags = b + f (prose-only annotated)",
    JSON.stringify(ids) === JSON.stringify(["b", "f"]),
    `got: ${JSON.stringify(ids)}`);
}

// ----- Composition with other operators -----
{
  // is:hashtags + tag:code (none of our test clips have "code" tag) → empty
  const cc = [...clips, mk({ id: "h", note: "#bar", tags: ["code"] })];
  const f = applyQuery(cc, parseQuery("is:hashtags tag:code"));
  expect("is:hashtags + tag:code surfaces only clip h",
    f.length === 1 && f[0].id === "h",
    `got: ${JSON.stringify(f.map(c=>c.id))}`);
}
{
  // is:nohashtags + is:nonoted → only clips with NO note at all (c + d-empty)
  const f = applyQuery(clips, parseQuery("is:nohashtags is:nonoted"));
  const ids = f.map((c) => c.id).sort();
  expect("is:nohashtags is:nonoted = c + d (no note OR empty note)",
    JSON.stringify(ids) === JSON.stringify(["c", "d"]),
    `got: ${JSON.stringify(ids)}`);
}

// ----- describeQuery includes the new bits -----
{
  const desc = describeQuery(parseQuery("is:hashtags"));
  expect("describeQuery is:hashtags → hashtags",
    desc.includes("hashtags") && !desc.includes("no-hashtags"),
    `got: ${desc}`);
}
{
  const desc = describeQuery(parseQuery("is:nohashtags"));
  expect("describeQuery is:nohashtags → no-hashtags",
    desc.includes("no-hashtags"),
    `got: ${desc}`);
}

// ----- Defensive: invalid notes don't accidentally surface under is:hashtags -----
{
  const wonky = [
    mk({ id: "n", note: null }),
    mk({ id: "u", note: undefined }),
    mk({ id: "o", note: { not: "a string" } }),
    mk({ id: "i", note: 12345 }),
    mk({ id: "w", note: "    " }), // whitespace-only
  ];
  const f = applyQuery(wonky, parseQuery("is:hashtags"));
  expect("malformed notes never surface under is:hashtags",
    f.length === 0,
    `got: ${JSON.stringify(f.map(c=>c.id))}`);
  const inv = applyQuery(wonky, parseQuery("is:nohashtags"));
  expect("malformed notes ALL pass is:nohashtags (no inline tags by definition)",
    inv.length === wonky.length);
}

// ----- foo#bar / URL-fragment exclusion (matches hashtag grammar) -----
{
  const tricky = [
    mk({ id: "p1", note: "tweet about @cake_eater_bot — see foo#bar" }), // mid-token, no boundary
    mk({ id: "p2", note: "url: https://gh.com/issues/1#comment-123" }), // url fragment
    mk({ id: "p3", note: "code `foo#bar` example" }), // backtick-adjacent
    mk({ id: "p4", note: "real #legit tag here" }),
  ];
  const f = applyQuery(tricky, parseQuery("is:hashtags"));
  expect("hashtag grammar boundary rejects mid-token #, accepts true hashtags",
    f.length === 1 && f[0].id === "p4",
    `got: ${JSON.stringify(f.map(c=>c.id))}`);
}

// ----- Operator round-trip stability -----
{
  // Repeating the operator shouldn't accumulate state
  const f1 = applyQuery(clips, parseQuery("is:hashtags"));
  const f2 = applyQuery(clips, parseQuery("is:hashtags is:hashtags is:hashtags"));
  expect("repeated is:hashtags is idempotent",
    JSON.stringify(f1.map(c=>c.id)) === JSON.stringify(f2.map(c=>c.id)));
}

rmSync(tmp, { recursive: true, force: true });

if (fail) {
  console.error(`FAIL: ${fail}/${pass + fail} (${failures.length} failures)`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`PASS: ${pass}/${pass} (is:hashtags / is:nohashtags)`);
