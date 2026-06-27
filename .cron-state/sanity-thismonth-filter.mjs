// Sanity: "This month" / "Last month" calendar-month filter boundaries
// (lib/today-filter).
//
// The `is:thismonth` / `is:lastmonth` operators + their quick-chips filter
// to the local calendar month containing now (1st-of-month local midnight
// up to, but not including, next month's 1st-midnight) and the month
// before it. is:thismonth is the next grain UP from is:thisweek and a
// SUPERSET of it (this week + today/yesterday, when in-month, fall inside).
// is:lastmonth tiles against this-month with no overlap. This harness
// exercises the pure boundary helpers (inline copies, bundler-free).
//
// Coverage:
//   1. localMonthStart = the 1st of the current month, local midnight.
//   2. localMonthEnd = the 1st of next month (correct across month lengths).
//   3. isThisMonth: 1st / mid / last-day true; last month / next month false.
//   4. exact bounds (inclusive lower at the 1st, exclusive upper at next 1st).
//   5. SUPERSET of this-week + today — every in-month week/today instant is
//      also this-month.
//   6. isLastMonth: bounded both ends, tiles against this-month (shared
//      boundary = this month's 1st). Mutually exclusive with isThisMonth.
//   7. year rollover: January's last month is December of the prior year.
//   8. defensive: non-finite ts / now.

const WEEK_START_DAY = 1; // Monday

function localDayStart(now = Date.now()) {
  const base = Number.isFinite(now) ? now : Date.now();
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
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
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const start = d.getTime();
  d.setDate(d.getDate() + 1);
  return ts >= start && ts < d.getTime();
}
function isThisWeek(ts, now = Date.now()) {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return false;
  return ts >= localWeekStart(now) && ts < localWeekEnd(now);
}
function localMonthStart(now = Date.now()) {
  const base = Number.isFinite(now) ? now : Date.now();
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.getTime();
}
function localMonthEnd(now = Date.now()) {
  const d = new Date(localMonthStart(now));
  d.setMonth(d.getMonth() + 1);
  return d.getTime();
}
function isThisMonth(ts, now = Date.now()) {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return false;
  return ts >= localMonthStart(now) && ts < localMonthEnd(now);
}
function localLastMonthStart(now = Date.now()) {
  const d = new Date(localMonthStart(now));
  d.setMonth(d.getMonth() - 1);
  return d.getTime();
}
function isLastMonth(ts, now = Date.now()) {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return false;
  return ts >= localLastMonthStart(now) && ts < localMonthStart(now);
}

let p = 0,
  t = 0;
function ck(n, g, w) {
  t++;
  if (g === w) p++;
  else console.error("FAIL", n, "got", JSON.stringify(g), "want", JSON.stringify(w));
}

// Anchor "now" at a known local wall-clock: Wed 2026-06-24 14:30 local.
// June 2026 has 30 days; this month runs Jun 1 -> Jul 1, last month is May.
const now = new Date(2026, 5, 24, 14, 30, 0, 0).getTime();
const jun1 = new Date(2026, 5, 1, 0, 0, 0, 0).getTime(); // this month start
const jul1 = new Date(2026, 6, 1, 0, 0, 0, 0).getTime(); // this month end (exclusive)
const may1 = new Date(2026, 4, 1, 0, 0, 0, 0).getTime(); // last month start
const may15 = new Date(2026, 4, 15, 9, 0, 0, 0).getTime(); // mid last month
const apr30 = new Date(2026, 3, 30, 12, 0, 0, 0).getTime(); // before last month

// 1. localMonthStart = the 1st of June, local midnight
ck("month start = June 1 local midnight", localMonthStart(now), jun1);
ck("month start idempotent on the 1st itself", localMonthStart(jun1), jun1);
const jun30 = new Date(2026, 5, 30, 23, 0, 0, 0).getTime();
ck("June 30 maps back to June 1", localMonthStart(jun30), jun1);

// 2. localMonthEnd = July 1 (June has 30 days — setMonth handles it)
ck("month end = July 1 midnight", localMonthEnd(now), jul1);

// 3. isThisMonth — core cases
ck("June 1 is this month", isThisMonth(jun1, now), true);
ck("Wed (now) is this month", isThisMonth(now, now), true);
ck("June 30 is this month", isThisMonth(jun30, now), true);
ck("May 15 is NOT this month", isThisMonth(may15, now), false);
ck("July 1 is NOT this month", isThisMonth(jul1, now), false);

// 4. exact bounds
ck("June-1 midnight is this month (inclusive lower)", isThisMonth(jun1, now), true);
ck("1ms before June 1 is NOT this month", isThisMonth(jun1 - 1, now), false);
ck("July-1 midnight is NOT this month (exclusive upper)", isThisMonth(jul1, now), false);
ck("1ms before July 1 is this month", isThisMonth(jul1 - 1, now), true);

// 5. SUPERSET of this-week + today (when in-month). Every in-month
//    this-week / today instant is also this-month — never the reverse.
const samples = [jun1, now, jun30, jul1 - 1, new Date(2026, 5, 22, 8, 0, 0).getTime()];
let supersetHolds = true;
for (const s of samples) {
  if ((isToday(s, now) || isThisWeek(s, now)) && !isThisMonth(s, now)) supersetHolds = false;
}
ck("today/this-week (in-month) implies this-month", supersetHolds, true);
ck("now is both this-week AND this-month", isThisWeek(now, now) && isThisMonth(now, now), true);

// 6. isLastMonth — bounded both ends, tiles against this-month
ck("last month start = May 1", localLastMonthStart(now), may1);
ck("May 15 is last month", isLastMonth(may15, now), true);
ck("May 1 is last month (inclusive lower)", isLastMonth(may1, now), true);
ck("1ms before May 1 is NOT last month", isLastMonth(may1 - 1, now), false);
ck("Apr 30 is NOT last month", isLastMonth(apr30, now), false);
ck("June 1 is NOT last month (exclusive upper)", isLastMonth(jun1, now), false);
ck("1ms before June 1 is last month", isLastMonth(jun1 - 1, now), true);
// Mutually exclusive: no instant is both this-month and last-month.
let mutex = true;
for (const s of [may1, may15, jun1 - 1, jun1, now, jun30]) {
  if (isThisMonth(s, now) && isLastMonth(s, now)) mutex = false;
}
ck("this-month and last-month are mutually exclusive", mutex, true);

// 7. year rollover: in January, last month is December of the prior year.
const jan10 = new Date(2026, 0, 10, 10, 0, 0, 0).getTime();
const dec1_2025 = new Date(2025, 11, 1, 0, 0, 0, 0).getTime();
const dec15_2025 = new Date(2025, 11, 15, 9, 0, 0, 0).getTime();
ck("January's last-month start = Dec 1 of prior year", localLastMonthStart(jan10), dec1_2025);
ck("Dec 15 2025 is last month relative to Jan 10 2026", isLastMonth(dec15_2025, jan10), true);
ck("Jan 10 is this month relative to itself", isThisMonth(jan10, jan10), true);

// Feb (28-day month, non-leap 2026) -> March 1 end via setMonth.
const feb14_2026 = new Date(2026, 1, 14, 12, 0, 0, 0).getTime();
const mar1_2026 = new Date(2026, 2, 1, 0, 0, 0, 0).getTime();
ck("February month end = March 1 (28-day month)", localMonthEnd(feb14_2026), mar1_2026);

// 8. defensive
ck("non-finite ts -> not this month", isThisMonth(NaN, now), false);
ck("undefined ts -> not this month", isThisMonth(undefined, now), false);
ck("null ts -> not last month", isLastMonth(null, now), false);
ck("string ts -> not this month", isThisMonth("123", now), false);
ck("non-finite now returns boolean", typeof isThisMonth(Date.now(), NaN), "boolean");

console.log(`thismonth-filter sanity: ${p}/${t} passed`);
if (p !== t) process.exit(1);
