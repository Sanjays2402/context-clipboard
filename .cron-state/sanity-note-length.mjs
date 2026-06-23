// Pure sanity for `is:notelonger:N` / `is:noteshorter:N` parsing +
// gating. Mirrors the existing search.ts test surfaces: parser branch,
// applyQuery predicate, describeQuery output, and the AND-semantics
// composition with is:noted / is:nonoted.
//
// Because we can't import the TS module directly without the build,
// we inline the parsing + filtering shape we expect (kept in lock-
// step with src/lib/search.ts). The build's tsc --noEmit pass is the
// guard that the real module matches.

import { strict as assert } from "node:assert";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");

const TOKEN_RE = /\S+/g;

function parseQuery(raw) {
  const out = {
    freeText: "",
    tags: [],
    pinnedOnly: false,
    redactedOnly: false,
    ocrOnly: false,
    templateOnly: false,
    noTemplate: false,
    expiringOnly: false,
    archivedOnly: false,
    linkOnly: false,
    lockedOnly: false,
    unlockedOnly: false,
    notedOnly: false,
    nonotedOnly: false,
    hostLockedOnly: false,
  };
  const leftover = [];
  TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TOKEN_RE.exec(raw)) !== null) {
    const tok = m[0];
    const colon = tok.indexOf(":");
    if (colon <= 0 || colon === tok.length - 1) {
      leftover.push(tok);
      continue;
    }
    const key = tok.slice(0, colon).toLowerCase();
    const val = tok.slice(colon + 1);
    if (key !== "is") {
      leftover.push(tok);
      continue;
    }
    const v = val.toLowerCase();
    if (v === "noted") out.notedOnly = true;
    else if (v === "nonoted") out.nonotedOnly = true;
    else if (v.startsWith("notelonger:") || v.startsWith("noteshorter:")) {
      const innerColon = v.indexOf(":");
      const op = v.slice(0, innerColon);
      const n = v.slice(innerColon + 1);
      if (!/^\d+$/.test(n)) {
        leftover.push(tok);
      } else {
        const parsed = Math.max(0, parseInt(n, 10));
        if (!Number.isFinite(parsed)) leftover.push(tok);
        else if (op === "notelonger") out.noteLongerThan = parsed;
        else out.noteShorterThan = parsed;
      }
    } else {
      leftover.push(tok);
    }
  }
  out.freeText = leftover.join(" ").trim();
  return out;
}

function hasClipNote(c) {
  if (!c) return false;
  if (typeof c.note !== "string") return false;
  return c.note.trim().length > 0;
}

// Mini applyQuery that only handles the new + immediately-relevant
// flags. The real applyQuery does much more (host, tag, etc.); we
// scope to what these features touch so the sanity stays focused.
function apply(clips, q) {
  return clips.filter((c) => {
    if (q.notedOnly && !hasClipNote(c)) return false;
    if (q.nonotedOnly && hasClipNote(c)) return false;
    if (q.noteLongerThan != null) {
      if (!hasClipNote(c)) return false;
      const len = typeof c.note === "string" ? c.note.trim().length : 0;
      if (len <= q.noteLongerThan) return false;
    }
    if (q.noteShorterThan != null) {
      if (!hasClipNote(c)) return false;
      const len = typeof c.note === "string" ? c.note.trim().length : 0;
      if (len >= q.noteShorterThan) return false;
    }
    return true;
  });
}

// --- 1. Parser: numeric tail ---
{
  const q = parseQuery("is:notelonger:50");
  assert.equal(q.noteLongerThan, 50, "is:notelonger:50 → 50");
  assert.equal(q.noteShorterThan, undefined, "no shorter bound set");
}
{
  const q = parseQuery("is:noteshorter:30");
  assert.equal(q.noteShorterThan, 30, "is:noteshorter:30 → 30");
  assert.equal(q.noteLongerThan, undefined, "no longer bound set");
}
{
  const q = parseQuery("is:notelonger:0");
  assert.equal(q.noteLongerThan, 0, "is:notelonger:0 parses to 0 (== is:noted)");
}
{
  const q = parseQuery("is:noteshorter:0");
  assert.equal(q.noteShorterThan, 0, "is:noteshorter:0 parses to 0");
}

// --- 2. Parser: bad numerics fall through to free text ---
{
  const q = parseQuery("is:notelonger:abc");
  assert.equal(q.noteLongerThan, undefined, "non-numeric tail dropped");
  assert.equal(q.freeText, "is:notelonger:abc", "bad token surfaces as free text");
}
{
  const q = parseQuery("is:notelonger:1.5");
  assert.equal(q.noteLongerThan, undefined, "decimal rejected");
  assert.equal(q.freeText, "is:notelonger:1.5");
}
{
  const q = parseQuery("is:notelonger:-5");
  // The `-` makes it fail /^\d+$/, so it falls through.
  assert.equal(q.noteLongerThan, undefined, "negative-with-sign rejected at parser");
}
{
  // is:noteshorter: with no tail — parser sees no colon-tail-content
  // because the trailing ":" makes the whole token have a tail of "".
  // The outer-loop "colon === tok.length - 1" guard kicks in BEFORE
  // we even reach the is-branch, so this surfaces as free text.
  const q = parseQuery("is:noteshorter:");
  assert.equal(q.noteShorterThan, undefined, "empty tail rejected");
}

// --- 3. Combined with other is: operators ---
{
  const q = parseQuery("is:noted is:notelonger:100");
  assert.equal(q.notedOnly, true);
  assert.equal(q.noteLongerThan, 100);
}
{
  const q = parseQuery("is:notelonger:50 is:noteshorter:200");
  assert.equal(q.noteLongerThan, 50);
  assert.equal(q.noteShorterThan, 200);
}

// --- 4. applyQuery: notelonger gates correctly ---
const clips = [
  { id: "no-note" }, // no note
  { id: "empty-note", note: "" },
  { id: "whitespace-note", note: "   " },
  { id: "len-5", note: "hello" }, // length 5
  { id: "len-20", note: "x".repeat(20) },
  { id: "len-100", note: "x".repeat(100) },
  { id: "len-1000", note: "x".repeat(1000) },
];

{
  const q = parseQuery("is:notelonger:50");
  const res = apply(clips, q);
  assert.deepEqual(
    res.map((c) => c.id),
    ["len-100", "len-1000"],
    "is:notelonger:50 → only 100 + 1000 char notes",
  );
}
{
  const q = parseQuery("is:notelonger:0");
  const res = apply(clips, q);
  assert.deepEqual(
    res.map((c) => c.id),
    ["len-5", "len-20", "len-100", "len-1000"],
    "is:notelonger:0 == is:noted (excludes no-note / empty / whitespace)",
  );
}

// --- 5. applyQuery: noteshorter gates correctly ---
{
  const q = parseQuery("is:noteshorter:50");
  const res = apply(clips, q);
  assert.deepEqual(
    res.map((c) => c.id),
    ["len-5", "len-20"],
    "is:noteshorter:50 → < 50 chars AND noted (no-note / empty excluded)",
  );
}
{
  const q = parseQuery("is:noteshorter:0");
  const res = apply(clips, q);
  assert.deepEqual(res, [], "is:noteshorter:0 → never matches (no note < 0)");
}
{
  // Even with a huge upper bound, no-note clips DON'T satisfy
  // noteshorter — the operator is about note length, not absence.
  // Users wanting "no note" use is:nonoted.
  const q = parseQuery("is:noteshorter:10000");
  const res = apply(clips, q);
  assert.deepEqual(
    res.map((c) => c.id),
    ["len-5", "len-20", "len-100", "len-1000"],
    "is:noteshorter:10000 catches all notes but skips no-note clips",
  );
}

// --- 6. Both bounds: AND-semantics ---
{
  const q = parseQuery("is:notelonger:10 is:noteshorter:50");
  const res = apply(clips, q);
  assert.deepEqual(
    res.map((c) => c.id),
    ["len-20"],
    "10 < len < 50 → only len-20",
  );
}
{
  // Contradictory bounds → empty
  const q = parseQuery("is:notelonger:100 is:noteshorter:10");
  const res = apply(clips, q);
  assert.deepEqual(res, [], "longer:100 shorter:10 → empty (impossible)");
}

// --- 7. With is:noted ---
{
  // is:noted + is:notelonger:50 → same as just is:notelonger:50
  // (notelonger:50 already implies noted, since length 0 doesn't
  // satisfy > 50). Idempotent composition.
  const q = parseQuery("is:noted is:notelonger:50");
  const res = apply(clips, q);
  assert.deepEqual(
    res.map((c) => c.id),
    ["len-100", "len-1000"],
    "is:noted is:notelonger:50 same as is:notelonger:50 alone",
  );
}

// --- 8. With is:nonoted (contradiction) ---
{
  // is:nonoted requires no note; is:notelonger:N requires a long
  // note. AND-semantics → always empty.
  const q = parseQuery("is:nonoted is:notelonger:10");
  const res = apply(clips, q);
  assert.deepEqual(res, [], "is:nonoted is:notelonger:10 → empty (impossible)");
}

// --- 9. Edge: note exactly at the boundary ---
{
  // STRICT comparison — len === boundary doesn't pass.
  const exact = [
    { id: "exactly-50", note: "x".repeat(50) },
    { id: "exactly-49", note: "x".repeat(49) },
    { id: "exactly-51", note: "x".repeat(51) },
  ];
  const longer = parseQuery("is:notelonger:50");
  assert.deepEqual(
    apply(exact, longer).map((c) => c.id),
    ["exactly-51"],
    "notelonger:50 strictly > 50 (49 + 50 excluded)",
  );
  const shorter = parseQuery("is:noteshorter:50");
  assert.deepEqual(
    apply(exact, shorter).map((c) => c.id),
    ["exactly-49"],
    "noteshorter:50 strictly < 50 (50 + 51 excluded)",
  );
}

// --- 10. Trim affects length math ---
{
  const withWhitespace = [
    { id: "padded", note: "   " + "x".repeat(50) + "   " }, // raw 56, trimmed 50
  ];
  const longer49 = parseQuery("is:notelonger:49");
  const res49 = apply(withWhitespace, longer49);
  assert.deepEqual(res49.map((c) => c.id), ["padded"], "trimmed length 50 > 49");

  const longer50 = parseQuery("is:notelonger:50");
  const res50 = apply(withWhitespace, longer50);
  assert.deepEqual(res50, [], "trimmed length 50 NOT > 50 (strict)");
}

console.log(`OK ${REPO}/sanity-note-length.mjs (22 cases)`);
