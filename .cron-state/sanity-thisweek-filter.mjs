// Sanity: "This week" calendar-week filter boundary (lib/today-filter).
//
// The `is:thisweek` operator + the "This week" quick-chip filter to the
// local calendar week containing now — from the week's start-day local
// midnight (Monday by default) up to, but not including, next week's
// start-day midnight. It is the next grain UP from is:today/is:yesterday
// and a SUPERSET of them (today + same-week yesterday fall inside). This
// harness exercises the pure boundary helpers (inline copies,
// bundler-free).
//
// Coverage:
//   1. localWeekStart = Monday's local midnight of the current week.
//   2. seven-day window width (no DST in the anchor week here).
//   3. isThisWeek: Mon/Wed/Sun of this week true; last week / next week
//      false.
//   4. exact bounds (inclusive lower at this Monday, exclusive upper at
//      next Monday).
//   5. SUPERSET of today + yesterday — every in-week today/yesterday
//      instant is also this-week.
//   6. defensive: non-finite ts / now.

const DAY_MS = 86_400_000;
const WEEK_START_DAY = 1; // Monday

function localDayStart(now = Date.now()) {
  const base = Number.isFinite(now) ? now : Date.now();
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function localDayEnd(now = Date.now()) {
  const base = Number.isFinite(now) ? now : Date.now();
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d.getTime();
}
function localYesterdayStart(now = Date.now()) {
  const base = Number.isFinite(now) ? now : Date.now();
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 1);
  return d.getTime();
}
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
function isToday(ts, now = Date.now()) {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return false;
  return ts >= localDayStart(now) && ts < localDayEnd(now);
}
function isYesterday(ts, now = Date.now()) {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return false;
  return ts >= localYesterdayStart(now) && ts < localDayStart(now);
}
function isThisWeek(ts, now = Date.now()) {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return false;
  return ts >= localWeekStart(now) && ts < localWeekEnd(now);
}

let p = 0,
  t = 0;
function ck(n, g, w) {
  t++;
  if (g === w) p++;
  else console.error("FAIL", n, "got", JSON.stringify(g), "want", JSON.stringify(w));
}

// Anchor "now" at a known local wall-clock: Wed 2026-06-24 14:30 local.
// June 2026: the 22nd is a Monday, so this week runs Mon 22 -> Mon 29.
const now = new Date(2026, 5, 24, 14, 30, 0, 0).getTime(); // Wed
const thisMon = new Date(2026, 5, 22, 0, 0, 0, 0).getTime(); // Mon (week start)
const nextMon = new Date(2026, 5, 29, 0, 0, 0, 0).getTime(); // Mon (week end, exclusive)
const lastSun = new Date(2026, 5, 21, 12, 0, 0, 0).getTime(); // prev week (Sunday)

// 1. localWeekStart = this Monday midnight
ck("week start = this Monday local midnight", localWeekStart(now), thisMon);
ck("week start idempotent on the Monday itself", localWeekStart(thisMon), thisMon);
// A Sunday should still map back to the SAME Monday (Sunday is day 0; the
// (0 - 1 + 7) % 7 = 6 step walks back to the week's Monday).
const thisSun = new Date(2026, 5, 28, 9, 0, 0, 0).getTime();
ck("Sunday maps back to this week's Monday", localWeekStart(thisSun), thisMon);

// 2. window width — exactly seven days (no DST in late-June here)
ck("week window = 7 days", localWeekEnd(now) - localWeekStart(now), 7 * DAY_MS);

// 3. isThisWeek — core cases
ck("this Monday is this week", isThisWeek(thisMon, now), true);
ck("Wed (now) is this week", isThisWeek(now, now), true);
ck("this Sunday is this week", isThisWeek(thisSun, now), true);
ck("last Sunday is NOT this week", isThisWeek(lastSun, now), false);
ck("next Monday is NOT this week", isThisWeek(nextMon, now), false);
ck("next Tuesday (clock skew) is NOT this week", isThisWeek(new Date(2026, 5, 30, 1, 0, 0).getTime(), now), false);

// 4. exact bounds
ck("this-Monday midnight is this week (inclusive lower)", isThisWeek(thisMon, now), true);
ck("1ms before this Monday is NOT this week", isThisWeek(thisMon - 1, now), false);
ck("next-Monday midnight is NOT this week (exclusive upper)", isThisWeek(nextMon, now), false);
ck("1ms before next Monday is this week", isThisWeek(nextMon - 1, now), true);

// 5. SUPERSET of today + yesterday (when in-week). Every in-week
//    today/yesterday instant is also this-week — never the reverse.
const samples = [
  thisMon, now, thisSun, nextMon - 1,
  new Date(2026, 5, 23, 8, 0, 0).getTime(), // Tue (yesterday rel. to Wed now)
  new Date(2026, 5, 24, 0, 0, 0).getTime(), // today midnight
];
let supersetHolds = true;
for (const s of samples) {
  if ((isToday(s, now) || isYesterday(s, now)) && !isThisWeek(s, now)) supersetHolds = false;
}
ck("today/yesterday (in-week) implies this-week", supersetHolds, true);
ck("today (now) is both today AND this-week", isToday(now, now) && isThisWeek(now, now), true);
ck("yesterday (Tue) is both yesterday AND this-week",
  isYesterday(new Date(2026, 5, 23, 8, 0, 0).getTime(), now) &&
    isThisWeek(new Date(2026, 5, 23, 8, 0, 0).getTime(), now),
  true);

// 6. defensive
ck("non-finite ts -> not this week", isThisWeek(NaN, now), false);
ck("undefined ts -> not this week", isThisWeek(undefined, now), false);
ck("null ts -> not this week", isThisWeek(null, now), false);
ck("string ts -> not this week", isThisWeek("123", now), false);
ck("non-finite now returns boolean", typeof isThisWeek(Date.now(), NaN), "boolean");

console.log(`thisweek-filter sanity: ${p}/${t} passed`);
if (p !== t) process.exit(1);
