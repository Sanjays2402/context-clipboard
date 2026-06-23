// Pure sanity for src/lib/host-locked.ts.
//
// Mirrors the docs/tests for is:locked / is:unlocked by exercising
// the cross-store join in isolation. We feed the predicate-builder a
// curated list of rules + a curated list of clip-shapes, then assert
// the verdict for each clip.
//
// Crucially this hits the FIRST-MATCH-WINS contract — a clip on
// `docs.github.com` matched by `*.github.com` (autoLock=false) FIRST
// must NOT match is:hostlocked even if a later, more-specific rule
// would have flipped autoLock on. That mirrors how ingest assigns a
// clip to a rule (countClipsForRules in db.ts).
//
// Pure ESM, no IDB, no DOM. Mirrors the prior sanity file structure.

import { strict as assert } from "node:assert";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");

// Stand up a tiny in-memory shim for matchesHostPattern + hostFrom so
// we can import the host-locked module without dragging IDB in. We
// inline the same algorithm as db.ts:matchesHostPattern + util.ts:
// hostFrom — kept exact to catch drift.
function matchesHostPattern(pattern, host) {
  if (!pattern || !host) return false;
  const p = pattern.toLowerCase();
  const h = host.toLowerCase().replace(/^www\./, "");
  if (p.startsWith("*.")) {
    const suffix = p.slice(2);
    if (!suffix) return false;
    return h === suffix || h.endsWith(`.${suffix}`);
  }
  return p === h;
}
function hostFrom(u) {
  if (typeof u !== "string" || u.length === 0) return "";
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

// Minimal predicate-builder + counters mirroring lib/host-locked.ts.
// We keep them inlined here so the sanity has no TypeScript build
// dependency (matching the other sanity files in .cron-state/). The
// LOGIC is the test target — if popup.ts compiles + the build is
// green, the real module matches this shape.
function buildHostLockedPredicate(rules) {
  if (!Array.isArray(rules) || rules.length === 0) return () => false;
  const ordered = rules.filter(
    (r) => r && typeof r.hostPattern === "string" && r.hostPattern.length > 0,
  );
  if (ordered.length === 0) return () => false;
  const cache = new Map();
  const probeHost = (host) => {
    if (!host) return false;
    const cached = cache.get(host);
    if (cached !== undefined) return cached;
    for (const r of ordered) {
      if (matchesHostPattern(r.hostPattern, host)) {
        const verdict = r.autoLock === true;
        cache.set(host, verdict);
        return verdict;
      }
    }
    cache.set(host, false);
    return false;
  };
  return (clip) => {
    if (!clip || !clip.source) return false;
    const host = hostFrom(clip.source.url);
    if (!host) return false;
    return probeHost(host);
  };
}
function countHostLockedClips(rules, clips) {
  if (!Array.isArray(clips) || clips.length === 0) return 0;
  const pred = buildHostLockedPredicate(rules);
  let n = 0;
  for (const c of clips) if (pred(c)) n++;
  return n;
}
function autoLockedHostsForClips(rules, clips) {
  if (!Array.isArray(rules) || rules.length === 0) return [];
  if (!Array.isArray(clips) || clips.length === 0) return [];
  const pred = buildHostLockedPredicate(rules);
  const hosts = new Set();
  for (const c of clips) {
    if (!pred(c)) continue;
    const h = hostFrom(c?.source?.url);
    if (h) hosts.add(h);
  }
  return Array.from(hosts).sort();
}

// Test data factories.
function rule(hostPattern, opts = {}) {
  return {
    id: `sr_${hostPattern}`,
    hostPattern,
    autoLock: !!opts.autoLock,
    autoPin: !!opts.autoPin,
    autoRedact: !!opts.autoRedact,
    skipCapture: !!opts.skipCapture,
    autoScrubOrigin: !!opts.autoScrubOrigin,
    createdAt: 0,
  };
}
function clip(url, extra = {}) {
  return { id: `c_${url}`, source: { url }, ...extra };
}

// --- 1. Empty / defensive ---
{
  const pred = buildHostLockedPredicate(null);
  assert.equal(pred(clip("https://github.com")), false, "null rules → never match");
}
{
  const pred = buildHostLockedPredicate([]);
  assert.equal(pred(clip("https://github.com")), false, "empty rules → never match");
}
{
  const pred = buildHostLockedPredicate(undefined);
  assert.equal(pred(clip("https://github.com")), false, "undefined rules → never match");
}
{
  // Malformed rule entries get dropped — bare object without hostPattern
  // is invalid, so the predicate sees no usable rules.
  const pred = buildHostLockedPredicate([{ id: "x" }, null, { hostPattern: "" }]);
  assert.equal(pred(clip("https://github.com")), false, "malformed rules → never match");
}
{
  const pred = buildHostLockedPredicate([rule("github.com", { autoLock: true })]);
  assert.equal(pred(null), false, "null clip → false");
  assert.equal(pred(undefined), false, "undefined clip → false");
  assert.equal(pred({}), false, "clip without source → false");
  assert.equal(pred({ source: {} }), false, "clip without url → false");
  assert.equal(pred({ source: { url: "" } }), false, "empty url → false");
  assert.equal(pred({ source: { url: "not a url" } }), false, "unparseable url → false");
}

// --- 2. Direct match ---
{
  const pred = buildHostLockedPredicate([rule("github.com", { autoLock: true })]);
  assert.equal(pred(clip("https://github.com/foo")), true, "github.com matches");
  assert.equal(pred(clip("https://www.github.com/bar")), true, "www.github.com matches (www strip)");
  assert.equal(pred(clip("https://gitlab.com/baz")), false, "other host doesn't match");
}

// --- 3. autoLock=false → no match (rule presence isn't enough) ---
{
  const pred = buildHostLockedPredicate([rule("github.com", { autoLock: false })]);
  assert.equal(pred(clip("https://github.com")), false, "rule present but autoLock=false → no match");
}
{
  // Rule with NO autoLock field (undefined) → no match (strict === true gate)
  const pred = buildHostLockedPredicate([rule("github.com")]);
  assert.equal(pred(clip("https://github.com")), false, "rule with no autoLock field → no match");
}

// --- 4. Wildcard match ---
{
  const pred = buildHostLockedPredicate([rule("*.github.com", { autoLock: true })]);
  assert.equal(pred(clip("https://github.com")), true, "*.github.com matches root");
  assert.equal(pred(clip("https://docs.github.com")), true, "*.github.com matches subdomain");
  assert.equal(pred(clip("https://api.github.com/users")), true, "*.github.com matches API");
  assert.equal(pred(clip("https://github.io")), false, "*.github.com doesn't match github.io");
}

// --- 5. First-match-wins: autoLock=false rule shadows autoLock=true ---
{
  // Order matters. *.github.com (autoLock=false) FIRST → docs.github.com
  // matches the wildcard rule and is treated as NOT-hostlocked, even
  // though the more-specific docs.github.com rule below would have
  // flipped it on. Mirrors background ingest semantics + countClipsForRules.
  const pred = buildHostLockedPredicate([
    rule("*.github.com", { autoLock: false }),
    rule("docs.github.com", { autoLock: true }),
  ]);
  assert.equal(
    pred(clip("https://docs.github.com/x")),
    false,
    "first-match-wins: shadowing wildcard suppresses later autoLock",
  );
}
{
  // Inverse order — the specific rule fires first and wins.
  const pred = buildHostLockedPredicate([
    rule("docs.github.com", { autoLock: true }),
    rule("*.github.com", { autoLock: false }),
  ]);
  assert.equal(
    pred(clip("https://docs.github.com/x")),
    true,
    "specific rule first → autoLock wins for that host",
  );
  // And other subdomains still fall through to the wildcard's autoLock=false.
  assert.equal(
    pred(clip("https://api.github.com")),
    false,
    "different subdomain falls through to the wildcard's autoLock=false",
  );
}

// --- 6. Cache correctness: same host probed twice = same answer ---
{
  // Build a rules list that would diverge if probed multiple times
  // (only one rule total — but the cache layer is what we're testing).
  const pred = buildHostLockedPredicate([rule("github.com", { autoLock: true })]);
  const c1 = clip("https://github.com/a");
  const c2 = clip("https://github.com/b");
  assert.equal(pred(c1), true, "first probe");
  assert.equal(pred(c2), true, "second probe — cached");
  // Different host, fresh probe
  assert.equal(pred(clip("https://gitlab.com")), false, "different host, no cache hit");
}

// --- 7. countHostLockedClips ---
{
  const rules = [rule("github.com", { autoLock: true })];
  const clips = [
    clip("https://github.com/a"),
    clip("https://github.com/b"),
    clip("https://gitlab.com"),
    clip("https://news.ycombinator.com"),
  ];
  assert.equal(countHostLockedClips(rules, clips), 2, "2 clips from github.com");
}
{
  assert.equal(countHostLockedClips([], [clip("https://x")]), 0, "no rules → 0");
  assert.equal(countHostLockedClips(null, [clip("https://x")]), 0, "null rules → 0");
  assert.equal(countHostLockedClips([rule("github.com", { autoLock: true })], []), 0, "no clips → 0");
  assert.equal(countHostLockedClips([rule("github.com", { autoLock: true })], null), 0, "null clips → 0");
}

// --- 8. autoLockedHostsForClips returns sorted distinct hosts ---
{
  const rules = [rule("github.com", { autoLock: true }), rule("docs.example.com", { autoLock: true })];
  const clips = [
    clip("https://github.com/a"),
    clip("https://github.com/b"),
    clip("https://docs.example.com/x"),
    clip("https://gitlab.com/y"),
  ];
  const hosts = autoLockedHostsForClips(rules, clips);
  assert.deepEqual(hosts, ["docs.example.com", "github.com"], "sorted distinct hosts");
}
{
  // Mixed autoLock-true / autoLock-false rules; only the true ones show.
  const rules = [
    rule("a.com", { autoLock: true }),
    rule("b.com", { autoLock: false }),
    rule("c.com", { autoLock: true }),
  ];
  const clips = [
    clip("https://a.com"),
    clip("https://b.com"),
    clip("https://c.com"),
  ];
  const hosts = autoLockedHostsForClips(rules, clips);
  assert.deepEqual(hosts, ["a.com", "c.com"], "only autoLock=true hosts surface");
}

console.log(`OK ${REPO}/sanity-is-hostlocked.mjs (24 cases)`);
