// Sanity: "Yesterday" calendar-day filter boundary (lib/today-filter).
//
// The `is:yesterday` operator + the "Yesterday" quick-chip filter to the
// previous local calendar day (yesterday's local midnight up to, but not
// including, today's local midnight). It tiles against `is:today` with no
// gap and no overlap. This harness exercises the pure boundary helpers
// (inline copies, bundler-free).
//
// Coverage:
//   1. localYesterdayStart = yesterday's local midnight (inclusive lower).
//   2. isYesterday: yesterday true; today / 2-days-ago / future false.
//   3. exact bounds (inclusive lower, exclusive upper at today midnight).
//   4. DISJOINT from isToday — no instant satisfies both; the two buckets
//      share the today-midnight boundary.
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
function localYesterdayStart(now = Date.now()) {
  const base = Number.isFinite(now) ? now : Date.now();
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 1);
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

let p = 0,
  t = 0;
function ck(n, g, w) {
  t++;
  if (g === w) p++;
  else console.error("FAIL", n, "got", JSON.stringify(g), "want", JSON.stringify(w));
}

// Anchor "now" at a known local wall-clock: 2026-06-26 14:30 local.
const now = new Date(2026, 5, 26, 14, 30, 0, 0).getTime();
const todayMid = new Date(2026, 5, 26, 0, 0, 0, 0).getTime();
const yMid = new Date(2026, 5, 25, 0, 0, 0, 0).getTime();
const twoAgoMid = new Date(2026, 5, 24, 0, 0, 0, 0).getTime();

// 1. localYesterdayStart
ck("yesterday start = yesterday local midnight", localYesterdayStart(now), yMid);
ck("yesterday start idempotent at yMid", localYesterdayStart(yMid), twoAgoMid);
ck("yesterday window = one day (no DST here)", localDayStart(now) - localYesterdayStart(now), DAY_MS);

// 2. isYesterday — core cases
ck("yesterday afternoon is yesterday", isYesterday(new Date(2026, 5, 25, 15, 0, 0).getTime(), now), true);
ck("yesterday morning is yesterday", isYesterday(new Date(2026, 5, 25, 6, 0, 0).getTime(), now), true);
ck("today is NOT yesterday", isYesterday(now, now), false);
ck("two days ago is NOT yesterday", isYesterday(new Date(2026, 5, 24, 12, 0, 0).getTime(), now), false);
ck("tomorrow (clock skew) is NOT yesterday", isYesterday(new Date(2026, 5, 27, 1, 0, 0).getTime(), now), false);

// 3. exact bounds
ck("yesterday midnight is yesterday (inclusive lower)", isYesterday(yMid, now), true);
ck("1ms before yesterday midnight is NOT yesterday", isYesterday(yMid - 1, now), false);
ck("today midnight is NOT yesterday (exclusive upper)", isYesterday(todayMid, now), false);
ck("1ms before today midnight is yesterday", isYesterday(todayMid - 1, now), true);

// 4. disjoint from isToday — the two buckets never both fire, and the
//    today-midnight boundary belongs to today, not yesterday.
const samples = [
  yMid - 1, yMid, new Date(2026, 5, 25, 12, 0, 0).getTime(),
  todayMid - 1, todayMid, now, new Date(2026, 5, 26, 23, 59, 59).getTime(),
];
let bothFired = false;
for (const s of samples) if (isToday(s, now) && isYesterday(s, now)) bothFired = true;
ck("no instant is both today AND yesterday", bothFired, false);
ck("today-midnight belongs to today not yesterday", isToday(todayMid, now) && !isYesterday(todayMid, now), true);
ck("yesterday-midnight belongs to yesterday not today", isYesterday(yMid, now) && !isToday(yMid, now), true);

// 5. defensive
ck("non-finite ts -> not yesterday", isYesterday(NaN, now), false);
ck("undefined ts -> not yesterday", isYesterday(undefined, now), false);
ck("null ts -> not yesterday", isYesterday(null, now), false);
ck("string ts -> not yesterday", isYesterday("123", now), false);
ck("non-finite now returns boolean", typeof isYesterday(Date.now(), NaN), "boolean");

console.log(`yesterday-filter sanity: ${p}/${t} passed`);
if (p !== t) process.exit(1);
