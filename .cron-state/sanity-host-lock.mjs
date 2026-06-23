// Sanity: host-lock — Cmd+K "Lock every clip from active tab's host"
// helpers. Mirrors sanity-host-pin.mjs structure for parity.

import { build } from "esbuild";
import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const dir = mkdtempSync(join(tmpdir(), "ctxclip-hostlock-"));
await build({
  entryPoints: ["src/lib/host-lock.ts"],
  bundle: true,
  format: "esm",
  outfile: join(dir, "host-lock.mjs"),
  platform: "neutral",
  target: "es2022",
  sourcemap: false,
});
const mod = await import("file://" + join(dir, "host-lock.mjs"));
const {
  idsToLockForHost,
  availableToLockHost,
  matchedClipsForHostLock,
  formatLockFromHostLabel,
} = mod;

let pass = 0;
let total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}

// --- 1. idsToLockForHost: matching basics --------------------------------

const clips = [
  { id: "a", locked: false, source: { url: "https://github.com/foo" } },
  { id: "b", locked: true, source: { url: "https://github.com/bar" } },
  { id: "c", locked: false, source: { url: "https://docs.github.com/x" } },
  { id: "d", source: { url: "https://github.com/baz" } }, // locked undefined
  { id: "e", locked: false, source: { url: "https://example.com/foo" } },
  { id: "f", locked: false, source: {} }, // no url (scrubbed)
  { id: "g", locked: false, source: { url: "data:text/plain,x" } }, // data: scheme
  { id: "h", locked: false }, // no source at all
];

check("ids: github.com matches a, d (skip locked b, skip subdomain c)",
  idsToLockForHost("github.com", clips), ["a", "d"]);

check("ids: docs.github.com matches only c",
  idsToLockForHost("docs.github.com", clips), ["c"]);

check("ids: example.com matches e", idsToLockForHost("example.com", clips), ["e"]);

check("ids: unknown.com → []", idsToLockForHost("unknown.com", clips), []);

// --- 2. host normalisation -----------------------------------------------
check("ids: www-strip on input", idsToLockForHost("www.github.com", clips), ["a", "d"]);
check("ids: case-insensitive (GITHUB.COM)",
  idsToLockForHost("GITHUB.COM", clips), ["a", "d"]);
check("ids: trim input", idsToLockForHost("  github.com  ", clips), ["a", "d"]);
check("ids: combined trim+case+www",
  idsToLockForHost("  WWW.GitHub.COM  ", clips), ["a", "d"]);

const wwwClips = [
  { id: "w1", source: { url: "https://www.example.com/foo" } },
  { id: "w2", source: { url: "https://example.com/bar" } },
];
check("ids: clip URLs www-stripped (both for example.com)",
  idsToLockForHost("example.com", wwwClips), ["w1", "w2"]);
check("ids: clip URLs www-stripped (both for www.example.com)",
  idsToLockForHost("www.example.com", wwwClips), ["w1", "w2"]);

// --- 3. locked-skip semantics -------------------------------------------
const allLocked = [
  { id: "p1", locked: true, source: { url: "https://a.com/x" } },
  { id: "p2", locked: true, source: { url: "https://a.com/y" } },
];
check("ids: all-locked host → []", idsToLockForHost("a.com", allLocked), []);

const mixed = [
  { id: "u1", locked: false, source: { url: "https://a.com/1" } },
  { id: "u2", locked: true, source: { url: "https://a.com/2" } },
  { id: "u3", locked: undefined, source: { url: "https://a.com/3" } },
  { id: "u4", locked: null, source: { url: "https://a.com/4" } },
];
check("ids: mixed locked/unlocked/undefined/null → only unlocked",
  idsToLockForHost("a.com", mixed), ["u1", "u3", "u4"]);

check("ids: locked:1 (truthy non-boolean) → still lockable (strict ===true cleanup)",
  idsToLockForHost("a.com", [{ id: "x", locked: 1, source: { url: "https://a.com/" } }]),
  ["x"]);

// --- 4. defensive guards -------------------------------------------------
check("ids: empty host → []", idsToLockForHost("", clips), []);
check("ids: whitespace → []", idsToLockForHost("   ", clips), []);
check("ids: null host → []", idsToLockForHost(null, clips), []);
check("ids: undefined → []", idsToLockForHost(undefined, clips), []);
check("ids: non-string → []", idsToLockForHost(42, clips), []);
check("ids: non-array clips → []", idsToLockForHost("github.com", null), []);

const bad = [
  null,
  undefined,
  { id: "", source: { url: "https://a.com/" } },
  { id: 42, source: { url: "https://a.com/" } },
  { source: { url: "https://a.com/" } },
  { id: "good", source: { url: "https://a.com/" } },
];
check("ids: bad entries dropped, good survives",
  idsToLockForHost("a.com", bad), ["good"]);

const badUrls = [
  { id: "u1", source: { url: "not a url" } },
  { id: "u2", source: { url: "" } },
  { id: "u3", source: { url: null } },
  { id: "u4", source: { url: undefined } },
  { id: "u5", source: { url: "https://valid.com/" } },
];
check("ids: malformed URLs skipped, valid surfaces",
  idsToLockForHost("valid.com", badUrls), ["u5"]);

// --- 5. availableToLockHost: count parity --------------------------------
check("count: parity for github.com",
  availableToLockHost("github.com", clips), idsToLockForHost("github.com", clips).length);
check("count: 0 for unknown.com", availableToLockHost("unknown.com", clips), 0);
check("count: 0 for all-locked", availableToLockHost("a.com", allLocked), 0);
check("count: 3 for mixed", availableToLockHost("a.com", mixed), 3);
check("count: empty host → 0", availableToLockHost("", clips), 0);

// --- 6. matchedClipsForHostLock: counts include locked -------------------
check("matched: github.com counts all 3 (a, b locked, d)",
  matchedClipsForHostLock("github.com", clips), 3);
check("matched: all-locked returns true count",
  matchedClipsForHostLock("a.com", allLocked), 2);
check("matched: unknown → 0", matchedClipsForHostLock("unknown.com", clips), 0);
check("matched: empty → 0", matchedClipsForHostLock("", clips), 0);

// --- 7. formatLockFromHostLabel: shape matrix ---------------------------
check("label: no host → 'this site' fallback (greyed)",
  formatLockFromHostLabel({ host: "", matched: 0, lockable: 0 }),
  {
    label: "Lock every clip from this site",
    hint: "No site context — open this on a normal http(s) tab",
    available: false,
  });

check("label: host, 0 matched → 'no captures yet' (greyed)",
  formatLockFromHostLabel({ host: "github.com", matched: 0, lockable: 0 }),
  {
    label: "Lock every clip from github.com",
    hint: "No clips captured from this site yet",
    available: false,
  });

check("label: host, 5 matched, 0 lockable → 'All 5 already locked' (greyed)",
  formatLockFromHostLabel({ host: "github.com", matched: 5, lockable: 0 }),
  {
    label: "Lock every clip from github.com",
    hint: "All 5 already locked",
    available: false,
  });

check("label: host, 1 lockable → singular 'clip' + available",
  formatLockFromHostLabel({ host: "github.com", matched: 3, lockable: 1 }),
  {
    label: "Lock 1 clip from github.com",
    hint: "Ask-before-deleting gate for every capture — orthogonal to pin",
    available: true,
  });

check("label: host, 4 lockable → plural 'clips' + available",
  formatLockFromHostLabel({ host: "github.com", matched: 7, lockable: 4 }),
  {
    label: "Lock 4 clips from github.com",
    hint: "Ask-before-deleting gate for every capture — orthogonal to pin",
    available: true,
  });

check("label: input GITHUB.COM normalised in display",
  formatLockFromHostLabel({ host: "GITHUB.COM", matched: 3, lockable: 1 }).label,
  "Lock 1 clip from github.com");

check("label: www-strip in display",
  formatLockFromHostLabel({ host: "www.example.com", matched: 0, lockable: 0 }).label,
  "Lock every clip from example.com");

// --- 8. defensive number coercion ---------------------------------------
check("label: NaN matched → 0",
  formatLockFromHostLabel({ host: "a.com", matched: NaN, lockable: 0 }).hint,
  "No clips captured from this site yet");
check("label: negative matched coerced to 0",
  formatLockFromHostLabel({ host: "a.com", matched: -5, lockable: 0 }).hint,
  "No clips captured from this site yet");
check("label: fractional lockable floors (3.7 → 3)",
  formatLockFromHostLabel({ host: "a.com", matched: 5, lockable: 3.7 }).label,
  "Lock 3 clips from a.com");
check("label: string-number coerced",
  formatLockFromHostLabel({ host: "a.com", matched: "5", lockable: "2" }).label,
  "Lock 2 clips from a.com");

// --- 9. End-to-end: realistic 10-clip ring -------------------------------
const realistic = [
  { id: "r1", locked: false, source: { url: "https://github.com/sanjay/repo" } },
  { id: "r2", locked: true, source: { url: "https://github.com/sanjay/repo/issues/1" } },
  { id: "r3", locked: false, source: { url: "https://github.com/sanjay/repo/pull/2" } },
  { id: "r4", locked: false, source: { url: "https://docs.github.com/rest" } },
  { id: "r5", locked: false, source: { url: "https://example.com/blog" } },
  { id: "r6", locked: true, source: { url: "https://example.com/about" } },
  { id: "r7", locked: false, source: { url: "https://www.github.com/sanjay/notes" } },
  { id: "r8", locked: false, source: {} },
  { id: "r9", locked: false, source: { url: "https://news.ycombinator.com/" } },
  { id: "r10", locked: false, source: { url: "https://github.com/sanjay/wip" } },
];
const githubMatch = matchedClipsForHostLock("github.com", realistic);
const githubLock = availableToLockHost("github.com", realistic);
const githubIds = idsToLockForHost("github.com", realistic);
check("realistic: 5 matched on github.com (with www-strip)", githubMatch, 5);
check("realistic: 4 lockable (r2 already locked)", githubLock, 4);
check("realistic: lockable ids in order", githubIds, ["r1", "r3", "r7", "r10"]);
const githubLabel = formatLockFromHostLabel({
  host: "github.com",
  matched: githubMatch,
  lockable: githubLock,
});
check("realistic: label 'Lock 4 clips from github.com'",
  githubLabel.label, "Lock 4 clips from github.com");
check("realistic: available true", githubLabel.available, true);

check("realistic: docs.github.com only r4",
  idsToLockForHost("docs.github.com", realistic), ["r4"]);

console.log(`host-lock sanity: ${pass}/${total} pass`);
if (pass !== total) process.exit(1);
