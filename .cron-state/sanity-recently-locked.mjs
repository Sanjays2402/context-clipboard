// Sanity: recently-locked window helper — strict gate on lockedAt + locked === true
//
// Surfaces clips with `lockedAt` within a sliding window (default 7
// days). Strict gate: `c.locked === true` AND
// `typeof c.lockedAt === "number" && Number.isFinite(...)`. Sort:
// newest lockedAt first. Inlines the helper logic (mirrors
// src/lib/recently-locked.ts) so the sanity runs without a TS step.

const RECENTLY_LOCKED_DEFAULT_WINDOW_MS = 7 * 86_400_000;

function recentlyLockedClips(clips, opts = {}) {
  if (!Array.isArray(clips)) return [];
  const now =
    typeof opts.now === "number" && Number.isFinite(opts.now)
      ? opts.now
      : Date.now();
  const windowMs =
    typeof opts.windowMs === "number" &&
    Number.isFinite(opts.windowMs) &&
    opts.windowMs > 0
      ? opts.windowMs
      : RECENTLY_LOCKED_DEFAULT_WINDOW_MS;
  const cutoff = now - windowMs;
  const out = [];
  for (const c of clips) {
    if (!c || typeof c.id !== "string" || c.id.length === 0) continue;
    if (c.locked !== true) continue;
    if (typeof c.lockedAt !== "number" || !Number.isFinite(c.lockedAt)) continue;
    if (c.lockedAt < cutoff) continue;
    out.push(c);
  }
  out.sort((a, b) => (b.lockedAt ?? 0) - (a.lockedAt ?? 0));
  return out;
}

function countRecentlyLocked(clips, opts = {}) {
  if (!Array.isArray(clips)) return 0;
  const now =
    typeof opts.now === "number" && Number.isFinite(opts.now)
      ? opts.now
      : Date.now();
  const windowMs =
    typeof opts.windowMs === "number" &&
    Number.isFinite(opts.windowMs) &&
    opts.windowMs > 0
      ? opts.windowMs
      : RECENTLY_LOCKED_DEFAULT_WINDOW_MS;
  const cutoff = now - windowMs;
  let n = 0;
  for (const c of clips) {
    if (!c || typeof c.id !== "string" || c.id.length === 0) continue;
    if (c.locked !== true) continue;
    if (typeof c.lockedAt !== "number" || !Number.isFinite(c.lockedAt)) continue;
    if (c.lockedAt < cutoff) continue;
    n++;
  }
  return n;
}

function formatRecentlyLockedLabel(opts) {
  const rawCount = Math.max(0, Math.floor(Number(opts.count) || 0));
  const windowDays =
    typeof opts.windowDays === "number" &&
    Number.isFinite(opts.windowDays) &&
    opts.windowDays > 0
      ? Math.floor(opts.windowDays)
      : 7;
  if (rawCount === 0) {
    return {
      label: "Show recently locked clips",
      hint: `No clips locked in the last ${windowDays} days`,
      available: false,
    };
  }
  const noun = rawCount === 1 ? "clip" : "clips";
  const label = `Show ${rawCount} recently locked ${noun}`;
  const fresh = opts.freshestLockedAt;
  let hint;
  if (typeof fresh === "number" && Number.isFinite(fresh)) {
    const ageLabel = opts.formatAge(fresh);
    hint = `Most recent: ${ageLabel} · window = last ${windowDays} days`;
  } else {
    hint = `Locked within the last ${windowDays} days`;
  }
  return { label, hint, available: true };
}

let pass = 0;
let fail = 0;
function check(name, ok) {
  if (ok) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

// Defensive
check("non-array → []", recentlyLockedClips(null).length === 0);
check("undefined → []", recentlyLockedClips(undefined).length === 0);
check("count non-array → 0", countRecentlyLocked("nope") === 0);

// Strict gate
const truthyButNotTrue = [
  { id: "a", locked: 1, lockedAt: NOW - DAY },
  { id: "b", locked: "yes", lockedAt: NOW - DAY },
  { id: "c", locked: true, lockedAt: NOW - DAY },
];
check("strict locked === true gate", recentlyLockedClips(truthyButNotTrue, { now: NOW }).length === 1);

// Missing lockedAt
const lockedNoStamp = [{ id: "a", locked: true }];
check("locked but no lockedAt → dropped", recentlyLockedClips(lockedNoStamp, { now: NOW }).length === 0);

// NaN / Infinity lockedAt
const badStamps = [
  { id: "a", locked: true, lockedAt: NaN },
  { id: "b", locked: true, lockedAt: Infinity },
  { id: "c", locked: true, lockedAt: -Infinity },
];
check("NaN/Infinity lockedAt dropped", recentlyLockedClips(badStamps, { now: NOW }).length === 0);

// Window boundary
const boundary = [
  { id: "edge", locked: true, lockedAt: NOW - 7 * DAY },
  { id: "old",  locked: true, lockedAt: NOW - 7 * DAY - 1 },
];
const within = recentlyLockedClips(boundary, { now: NOW });
check("exact-cutoff included", within.find((c) => c.id === "edge") !== undefined);
check("just-past-cutoff excluded", within.find((c) => c.id === "old") === undefined);

// Future lockedAt (clock skew) still included — we don't punish drift
const future = [{ id: "f", locked: true, lockedAt: NOW + DAY }];
check("future lockedAt included", recentlyLockedClips(future, { now: NOW }).length === 1);

// Sort newest-first
const mixed = [
  { id: "mid", locked: true, lockedAt: NOW - 2 * DAY },
  { id: "new", locked: true, lockedAt: NOW - DAY },
  { id: "old", locked: true, lockedAt: NOW - 5 * DAY },
];
const sorted = recentlyLockedClips(mixed, { now: NOW });
check("sorted newest-first", sorted[0].id === "new" && sorted[1].id === "mid" && sorted[2].id === "old");

// Custom window
const custom = [
  { id: "a", locked: true, lockedAt: NOW - 2 * DAY },
  { id: "b", locked: true, lockedAt: NOW - 5 * DAY },
];
check("custom 3d window scopes", recentlyLockedClips(custom, { now: NOW, windowMs: 3 * DAY }).length === 1);
check("custom 0 window → default fallback", recentlyLockedClips(custom, { now: NOW, windowMs: 0 }).length === 2);
check("custom NaN window → default fallback", recentlyLockedClips(custom, { now: NOW, windowMs: NaN }).length === 2);

// Bad entries silently dropped
const broken = [
  null,
  undefined,
  { id: "", locked: true, lockedAt: NOW - DAY },
  { id: "good", locked: true, lockedAt: NOW - DAY },
  { locked: true, lockedAt: NOW - DAY },
];
check("broken entries dropped", recentlyLockedClips(broken, { now: NOW }).length === 1);

// Count matches list
check("count matches list length", countRecentlyLocked(sorted, { now: NOW }) === sorted.length);
check("count of empty input is 0", countRecentlyLocked([], { now: NOW }) === 0);

// Label shapes
const fmt = (at) => {
  const ago = (NOW - at) / 1000;
  if (ago < 60) return `${Math.floor(ago)}s ago`;
  if (ago < 3600) return `${Math.floor(ago / 60)}m ago`;
  return `${Math.floor(ago / 3600)}h ago`;
};
const emptyLbl = formatRecentlyLockedLabel({ count: 0, formatAge: fmt });
check("empty label", emptyLbl.label === "Show recently locked clips");
check("empty available=false", emptyLbl.available === false);
check("empty hint mentions window", /7 days/.test(emptyLbl.hint));

const oneLbl = formatRecentlyLockedLabel({ count: 1, formatAge: fmt });
check("singular label", oneLbl.label === "Show 1 recently locked clip");
check("singular available=true", oneLbl.available === true);

const manyLbl = formatRecentlyLockedLabel({
  count: 4,
  freshestLockedAt: NOW - 2 * 3600 * 1000,
  formatAge: fmt,
});
check("plural label", manyLbl.label === "Show 4 recently locked clips");
check("plural hint includes age", manyLbl.hint.includes("2h ago"));

const negLbl = formatRecentlyLockedLabel({ count: -5, formatAge: fmt });
check("negative count clamped to 0 (empty)", negLbl.label === "Show recently locked clips");

const nanLbl = formatRecentlyLockedLabel({ count: NaN, formatAge: fmt });
check("NaN count clamped to 0 (empty)", nanLbl.label === "Show recently locked clips");

const customDays = formatRecentlyLockedLabel({ count: 0, formatAge: fmt, windowDays: 14 });
check("custom windowDays surfaces", /14 days/.test(customDays.hint));

const badWindowDays = formatRecentlyLockedLabel({ count: 0, formatAge: fmt, windowDays: -3 });
check("bad windowDays falls back to 7", /7 days/.test(badWindowDays.hint));

// Empty-count with freshestLockedAt → still empty-state (count is the gate)
const emptyWithFresh = formatRecentlyLockedLabel({
  count: 0,
  freshestLockedAt: NOW - DAY,
  formatAge: fmt,
});
check("count=0 wins over freshestLockedAt", emptyWithFresh.available === false);

// Count without freshestLockedAt → still works
const noFresh = formatRecentlyLockedLabel({ count: 2, formatAge: fmt });
check("count>0 without freshestLockedAt uses generic hint", /Locked within the last/.test(noFresh.hint));

console.log(`\n${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
