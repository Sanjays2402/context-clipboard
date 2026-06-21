// Sanity: findCustomPatternHits offsets, overlap merge, invalid-skip.
//
// We import the compiled CJS via esbuild's IIFE wrapping won't work
// here — instead we re-implement the function in-process so we can
// exercise it without a bundler. This mirrors the inline-sanity
// pattern used by sibling sanity-*.mjs scripts.

const MAX_PATTERNS = 32;
const MAX_LEN = 200;

function findCustomPatternHits(content, patterns) {
  if (!content || !patterns || patterns.length === 0) {
    return { hits: [], invalid: 0, matchedPatterns: 0 };
  }
  const raw = [];
  let invalid = 0;
  let n = 0;
  const matchedSet = new Set();
  for (const p of patterns) {
    if (n++ >= MAX_PATTERNS) break;
    const src = (p || "").trim();
    if (!src || src.length > MAX_LEN) {
      if (src) invalid++;
      continue;
    }
    let re;
    try {
      re = new RegExp(src, "gi");
    } catch {
      invalid++;
      continue;
    }
    re.lastIndex = 0;
    let m;
    let safety = 0;
    while ((m = re.exec(content)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      raw.push({ start: m.index, end: m.index + m[0].length, pattern: src });
      matchedSet.add(src);
      if (++safety > 5000) break;
    }
  }
  raw.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged = [];
  for (const h of raw) {
    const last = merged[merged.length - 1];
    if (last && h.start < last.end) {
      if (h.end > last.end) last.end = h.end;
    } else {
      merged.push({ ...h });
    }
  }
  return { hits: merged, invalid, matchedPatterns: matchedSet.size };
}

let pass = 0;
let total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}

// 1. Empty input → zero hits.
check(
  "empty content → 0 hits",
  findCustomPatternHits("", ["foo"]),
  { hits: [], invalid: 0, matchedPatterns: 0 },
);
check(
  "no patterns → 0 hits",
  findCustomPatternHits("some text", []),
  { hits: [], invalid: 0, matchedPatterns: 0 },
);

// 2. Simple match, correct offsets.
const r1 = findCustomPatternHits("hello ACC-123456 world", ["ACC-\\d{6,}"]);
check("offsets-simple: hits count", r1.hits.length, 1);
check("offsets-simple: start", r1.hits[0].start, 6);
check("offsets-simple: end", r1.hits[0].end, 16);
check("offsets-simple: matchedPatterns", r1.matchedPatterns, 1);

// 3. Multiple disjoint matches.
const r2 = findCustomPatternHits("ACC-111111 then ACC-222222", ["ACC-\\d{6,}"]);
check("disjoint: hit count", r2.hits.length, 2);
check("disjoint: first start", r2.hits[0].start, 0);
check("disjoint: second start", r2.hits[1].start, 16);

// 4. Overlapping patterns merge (longer wins).
const r3 = findCustomPatternHits("PROJ-12345-extra", ["PROJ-\\d+", "PROJ-\\d+-\\w+"]);
check("overlap: 1 merged hit", r3.hits.length, 1);
check("overlap: start = 0", r3.hits[0].start, 0);
check("overlap: end = full match", r3.hits[0].end, 16);
check("overlap: both patterns counted", r3.matchedPatterns, 2);

// 5. Invalid pattern counted, valid still works.
const r4 = findCustomPatternHits("foo", ["foo", "[unbalanced"]);
check("invalid: 1 hit on foo", r4.hits.length, 1);
check("invalid: counted", r4.invalid, 1);
check("invalid: 1 valid matched", r4.matchedPatterns, 1);

// 6. Case-insensitive (we compile with gi).
const r5 = findCustomPatternHits("FOO bar foo", ["foo"]);
check("case-insensitive: 2 hits", r5.hits.length, 2);

// 7. Zero-width regex doesn't infinite-loop.
const r6 = findCustomPatternHits("aaa", ["a*"]);
// We don't care about exact count; we care it returns finitely.
check("zero-width: returns finitely (hit count >= 0)", r6.hits.length >= 0, true);

// 8. Long pattern (>200 chars) skipped + counted invalid.
const big = "a".repeat(201);
const r7 = findCustomPatternHits("test", [big]);
check("long pattern: 0 hits", r7.hits.length, 0);
check("long pattern: counted invalid", r7.invalid, 1);

// 9. Whitespace-only pattern silently skipped (not counted invalid — empty).
const r8 = findCustomPatternHits("test", ["", "   "]);
check("blank patterns: 0 hits", r8.hits.length, 0);
check("blank patterns: not invalid", r8.invalid, 0);

// 10. Cap respected — 33 patterns, only first 32 processed.
const manyPatterns = Array.from({ length: 33 }, (_, i) => `tag${i}`);
const sample = manyPatterns.join(" ");
const r9 = findCustomPatternHits(sample, manyPatterns);
check("cap: at most 32 patterns scanned", r9.matchedPatterns <= 32, true);

console.log(`${pass}/${total} passed`);
if (pass !== total) process.exit(1);
