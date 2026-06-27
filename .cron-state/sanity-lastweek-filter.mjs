// Sanity: "Last week" calendar-week filter boundary (lib/today-filter).
//
// The `is:lastweek` operator + the "Last week" quick-chip filter to the
// local calendar week BEFORE the one containing now — from last week's
// start-day local midnight up to, but not including, this week's
// start-day midnight. It tiles against `is:thisweek` with no gap and no
// overlap. This harness exercises the pure boundary helpers (inline
// copies, bundler-free).
//
// Coverage:
//   1. localLastWeekStart = previous week's Monday local midnight.
//   2. seven-day window width.
//   3. isLastWeek: last Mon/Wed/Sun true; this week / two weeks ago /
//      next week false.
//   4. exact bounds (inclusive lower at last Monday, exclusive upper at
//      this Monday).
//   5. DISJOINT from isThisWeek — no instant satisfies both; they share
//      the this-week-Monday boundary.
//   6. defensive: non-finite ts / now.

const DAY_MS = 86_400_000;
const WEEK_START_DAY = 1; // Monday

function localWeekStart(now = Date.now()) {
  const base = Number.isFinite(now) ? now : Date.now();
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  const delta = (d.getDay() - WEEK_START_DAY + 7) % 7;
  d.setDate(d.getDate() - delta);
  return d.getTime();
}
function localWeekEnd(now = Date.now()) {
  const d = new Date(localWeekStart(now));
  d.setDate(d.getDate() + 7);
  return d.getTime();
}
function localLastWeekStart(now = Date.now()) {
  const d = new Date(localWeekStart(now));
  d.setDate(d.getDate() - 7);
  return d.getTime();
}
function isThisWeek(ts, now = Date.now()) {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return false;
  return ts >= localWeekStart(now) && ts < localWeekEnd(now);
}
function isLastWeek(ts, now = Date.now()) {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return false;
  return ts >= localLastWeekStart(now) && ts < localWeekStart(now);
}

let p = 0,
  t = 0;
function ck(n, g, w) {
  t++;
  if (g === w) p++;
  else console.error("FAIL", n, "got", JSON.stringify(g), "want", JSON.stringify(w));
}

// Anchor "now" at Wed 2026-06-24 14:30 local. This week = Mon 22 -> Mon 29.
// Last week = Mon 15 -> Mon 22.
const now = new Date(2026, 5, 24, 14, 30, 0, 0).getTime(); // Wed
const thisMon = new Date(2026, 5, 22, 0, 0, 0, 0).getTime(); // this week start
const lastMon = new Date(2026, 5, 15, 0, 0, 0, 0).getTime(); // last week start
const twoAgoMon = new Date(2026, 5, 8, 0, 0, 0, 0).getTime(); // two weeks ago start

// 1. localLastWeekStart
ck("last-week start = previous Monday midnight", localLastWeekStart(now), lastMon);
ck("last-week start idempotent on this Monday", localLastWeekStart(thisMon), lastMon);

// 2. window width — exactly seven days
ck("last-week window = 7 days", localWeekStart(now) - localLastWeekStart(now), 7 * DAY_MS);

// 3. isLastWeek — core cases
ck("last Monday is last week", isLastWeek(lastMon, now), true);
ck("last Wednesday is last week", isLastWeek(new Date(2026, 5, 17, 10, 0, 0).getTime(), now), true);
ck("last Sunday is last week", isLastWeek(new Date(2026, 5, 21, 23, 0, 0).getTime(), now), true);
ck("this week (now) is NOT last week", isLastWeek(now, now), false);
ck("two weeks ago is NOT last week", isLastWeek(new Date(2026, 5, 10, 12, 0, 0).getTime(), now), false);
ck("next week (clock skew) is NOT last week", isLastWeek(new Date(2026, 5, 30, 1, 0, 0).getTime(), now), false);

// 4. exact bounds
ck("last-Monday midnight is last week (inclusive lower)", isLastWeek(lastMon, now), true);
ck("1ms before last Monday is NOT last week", isLastWeek(lastMon - 1, now), false);
ck("this-Monday midnight is NOT last week (exclusive upper)", isLastWeek(thisMon, now), false);
ck("1ms before this Monday is last week", isLastWeek(thisMon - 1, now), true);

// 5. disjoint from isThisWeek — never both, and the this-week-Monday
//    boundary belongs to this week, not last week.
const samples = [
  lastMon - 1, lastMon, new Date(2026, 5, 18, 12, 0, 0).getTime(),
  thisMon - 1, thisMon, now, new Date(2026, 5, 28, 23, 59, 59).getTime(),
];
let bothFired = false;
for (const s of samples) if (isThisWeek(s, now) && isLastWeek(s, now)) bothFired = true;
ck("no instant is both this-week AND last-week", bothFired, false);
ck("this-Monday belongs to this week not last", isThisWeek(thisMon, now) && !isLastWeek(thisMon, now), true);
ck("last-Monday belongs to last week not this", isLastWeek(lastMon, now) && !isThisWeek(lastMon, now), true);

// 6. defensive
ck("non-finite ts -> not last week", isLastWeek(NaN, now), false);
ck("undefined ts -> not last week", isLastWeek(undefined, now), false);
ck("null ts -> not last week", isLastWeek(null, now), false);
ck("string ts -> not last week", isLastWeek("123", now), false);
ck("non-finite now returns boolean", typeof isLastWeek(Date.now(), NaN), "boolean");

console.log(`lastweek-filter sanity: ${p}/${t} passed`);
if (p !== t) process.exit(1);
