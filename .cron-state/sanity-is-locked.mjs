// Sanity: `is:locked` smart-search operator.
//
// Parses + applies the operator against representative clips. Covers
// strict gate semantics (=== true), interaction with other is:* flags,
// the describeQuery surface, and the parser fallback for unknown is:
// values.

import { build } from "esbuild";
import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const dir = mkdtempSync(join(tmpdir(), "ctxclip-islocked-"));
await build({
  entryPoints: ["src/lib/search.ts"],
  bundle: true,
  format: "esm",
  outfile: join(dir, "search.mjs"),
  platform: "neutral",
  target: "es2022",
  sourcemap: false,
});
const mod = await import("file://" + join(dir, "search.mjs"));
const { parseQuery, applyQuery, describeQuery } = mod;

let pass = 0;
let total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}
function checkTrue(name, got) {
  total++;
  if (got === true) pass++;
  else console.error("FAIL", name, "expected true, got", JSON.stringify(got));
}
function checkFalse(name, got) {
  total++;
  if (got === false) pass++;
  else console.error("FAIL", name, "expected false, got", JSON.stringify(got));
}

// --- 1. parseQuery sets lockedOnly --------------------------------------
checkTrue("parse: is:locked sets lockedOnly true",
  parseQuery("is:locked").lockedOnly);
checkFalse("parse: plain text leaves lockedOnly false",
  parseQuery("hello world").lockedOnly);
checkFalse("parse: empty leaves lockedOnly false",
  parseQuery("").lockedOnly);
checkTrue("parse: case-insensitive (IS:LOCKED)",
  parseQuery("IS:LOCKED").lockedOnly);
checkTrue("parse: mid-string (kind:text is:locked)",
  parseQuery("kind:text is:locked").lockedOnly);

// is:loc / is:lock / is:locks should NOT match (only exact `locked`).
const partial1 = parseQuery("is:lock");
check("parse: is:lock (partial) doesn't set lockedOnly", partial1.lockedOnly, false);
check("parse: is:lock falls through to leftover (freeText)", partial1.freeText, "is:lock");

const partial2 = parseQuery("is:locks");
check("parse: is:locks (plural) doesn't set lockedOnly", partial2.lockedOnly, false);
check("parse: is:locks falls through to leftover", partial2.freeText, "is:locks");

// --- 2. parseQuery preserves freeText -----------------------------------
check("parse: is:locked + freeText",
  parseQuery("password is:locked").freeText, "password");
check("parse: standalone is:locked → empty freeText",
  parseQuery("is:locked").freeText, "");

// --- 3. parseQuery combines with other is:* flags -----------------------
const combined = parseQuery("is:pinned is:locked is:link");
checkTrue("parse: is:pinned + is:locked + is:link — all three set",
  combined.pinnedOnly && combined.lockedOnly && combined.linkOnly);

// --- 4. applyQuery filters by locked bit --------------------------------
const clips = [
  { id: "a", kind: "text", content: "alpha", source: { url: "https://a.com" }, tags: [], pinned: false, locked: true, lastSeenAt: 1 },
  { id: "b", kind: "text", content: "bravo", source: { url: "https://b.com" }, tags: [], pinned: true, locked: false, lastSeenAt: 2 },
  { id: "c", kind: "text", content: "charlie", source: { url: "https://c.com" }, tags: [], pinned: false, lastSeenAt: 3 }, // locked: undefined
  { id: "d", kind: "text", content: "delta", source: { url: "https://d.com" }, tags: [], pinned: false, locked: true, lastSeenAt: 4 },
  { id: "e", kind: "image", content: "data:img", source: { url: "https://e.com" }, tags: [], pinned: false, locked: true, lastSeenAt: 5 },
];

const q1 = parseQuery("is:locked");
check("apply: is:locked → only a, d, e",
  applyQuery(clips, q1).map((c) => c.id).sort(), ["a", "d", "e"]);

// Strict ===true: locked:1 (truthy non-boolean from an older import) should NOT
// satisfy `is:locked`. Mirrors db.toggleLock's contract and clip-lock partition.
const trickyClips = [
  { id: "t1", kind: "text", content: "x", source: {}, tags: [], pinned: false, locked: 1, lastSeenAt: 1 },
  { id: "t2", kind: "text", content: "y", source: {}, tags: [], pinned: false, locked: "true", lastSeenAt: 2 },
  { id: "t3", kind: "text", content: "z", source: {}, tags: [], pinned: false, locked: true, lastSeenAt: 3 },
  { id: "t4", kind: "text", content: "w", source: {}, tags: [], pinned: false, locked: false, lastSeenAt: 4 },
];
check("apply: is:locked is strict (===true) → only t3",
  applyQuery(trickyClips, parseQuery("is:locked")).map((c) => c.id), ["t3"]);

// --- 5. applyQuery combines with other operators ------------------------
const q2 = parseQuery("kind:text is:locked");
check("apply: kind:text is:locked → a, d (e is image)",
  applyQuery(clips, q2).map((c) => c.id).sort(), ["a", "d"]);

const q3 = parseQuery("is:pinned is:locked");
check("apply: is:pinned is:locked → empty (no clip is both)",
  applyQuery(clips, q3), []);

const q4 = parseQuery("is:locked alpha");
check("apply: is:locked + freeText 'alpha' → just a",
  applyQuery(clips, q4).map((c) => c.id), ["a"]);

// --- 6. describeQuery surfaces 'locked' ---------------------------------
check("describe: is:locked → 'locked'",
  describeQuery(parseQuery("is:locked")), "locked");
check("describe: kind:text is:locked → 'text · locked'",
  describeQuery(parseQuery("kind:text is:locked")), "text · locked");
check("describe: is:pinned is:locked → 'pinned · locked'",
  describeQuery(parseQuery("is:pinned is:locked")), "pinned · locked");
check("describe: is:locked is:link → 'link · locked'",
  describeQuery(parseQuery("is:locked is:link")), "link · locked");

// --- 7. archived clips dropped by default even with is:locked -----------
// Mirrors the existing `is:link`/`kind:text` contract — archived stays
// hidden unless explicitly opted-in via `is:archived`.
const withArchived = [
  ...clips,
  { id: "z", kind: "text", content: "zulu", source: {}, tags: [], pinned: false, locked: true, archived: true, lastSeenAt: 6 },
];
const q5 = parseQuery("is:locked");
check("apply: is:locked drops archived (z hidden)",
  applyQuery(withArchived, q5).map((c) => c.id).sort(), ["a", "d", "e"]);

const q6 = parseQuery("is:locked is:archived");
check("apply: is:locked is:archived surfaces z + still drops non-archived",
  applyQuery(withArchived, q6).map((c) => c.id), ["z"]);

// --- 8. Plain non-matching value falls through --------------------------
const q7 = parseQuery("is:unknownflag is:locked");
checkTrue("parse: unknown is:* value falls through to freeText",
  q7.freeText.includes("is:unknownflag"));
checkTrue("parse: known is:locked still set in mixed query",
  q7.lockedOnly);

console.log(`is-locked sanity: ${pass}/${total} pass`);
if (pass !== total) process.exit(1);
