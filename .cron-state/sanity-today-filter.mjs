// Sanity: "Today" calendar-day filter boundary (lib/today-filter).
//
// The `is:today` operator + the "Today" quick-chip filter to the local
// calendar day (since local midnight), distinct from the rolling
// `after:24h`. This harness exercises the pure boundary helpers (inline
// copies, bundler-free).
//
// Coverage:
//   1. localDayStart = local midnight at/under now (inclusive lower).
//   2. localDayEnd = next local midnight (exclusive upper).
//   3. isToday: same-day true, yesterday/tomorrow false, exact bounds.
//   4. distinct from rolling 24h (a clip 23h ago from early-morning now
//      is NOT today even though it's within 24h).
//   5. defensive: non-finite ts / now.

const DAY_MS = 86_400_000;
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
function isToday(ts, now = Date.now()) {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return false;
  return ts >= localDayStart(now) && ts < localDayEnd(now);
}

let p = 0,
  t = 0;
function ck(n, g, w) {
  t++;
  if (g === w) p++;
  else console.error("FAIL", n, "got", JSON.stringify(g), "want", JSON.stringify(w));
}

// Anchor "now" at a known local wall-clock: 2026-06-26 14:30 local.
const now = new Date(2026, 5, 26, 14, 30, 0, 0).getTime();
const midnight = new Date(2026, 5, 26, 0, 0, 0, 0).getTime();
const nextMidnight = new Date(2026, 5, 27, 0, 0, 0, 0).getTime();

// 1. localDayStart
ck("start = local midnight today", localDayStart(now), midnight);
ck("start idempotent at midnight", localDayStart(midnight), midnight);
ck("start just before next midnight stays today", localDayStart(nextMidnight - 1), midnight);

// 2. localDayEnd
ck("end = next local midnight", localDayEnd(now), nextMidnight);
ck("end - start = one day (no DST here)", localDayEnd(now) - localDayStart(now), DAY_MS);

// 3. isToday
ck("now is today", isToday(now, now), true);
ck("midnight is today (inclusive)", isToday(midnight, now), true);
ck("1ms before midnight is NOT today (yesterday)", isToday(midnight - 1, now), false);
ck("next midnight is NOT today (exclusive)", isToday(nextMidnight, now), false);
ck("this morning 8am is today", isToday(new Date(2026, 5, 26, 8, 0, 0).getTime(), now), true);
ck("yesterday evening is NOT today", isToday(new Date(2026, 5, 25, 23, 0, 0).getTime(), now), false);
ck("tomorrow (clock skew) is NOT today", isToday(new Date(2026, 5, 27, 1, 0, 0).getTime(), now), false);

// 4. distinct from rolling 24h
// now = 09:00 local; a clip from 23h ago lands at 10:00 YESTERDAY ->
// within rolling 24h, but NOT the same calendar day.
const earlyNow = new Date(2026, 5, 26, 9, 0, 0).getTime();
const clip23hAgo = earlyNow - 23 * 3600 * 1000; // = 2026-06-25 10:00 local
ck("23h-ago clip is within rolling 24h", earlyNow - clip23hAgo < DAY_MS, true);
ck("23h-ago clip is NOT today (distinct from after:24h)", isToday(clip23hAgo, earlyNow), false);
// A clip from 2h ago at 09:00 now -> 07:00 today -> today AND within 24h.
ck("2h-ago clip is today", isToday(earlyNow - 2 * 3600 * 1000, earlyNow), true);

// 5. defensive
ck("non-finite ts -> not today", isToday(NaN, now), false);
ck("undefined ts -> not today", isToday(undefined, now), false);
ck("null ts -> not today", isToday(null, now), false);
ck("string ts -> not today", isToday("123", now), false);
// non-finite now falls back to live clock; just assert it doesn't throw +
// returns a boolean.
ck("non-finite now returns boolean", typeof isToday(Date.now(), NaN), "boolean");

console.log(`today-filter sanity: ${p}/${t} passed`);
if (p !== t) process.exit(1);
