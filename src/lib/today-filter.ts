/**
 * "Today" calendar-day filter boundary.
 *
 * The quick-chip row already has a "Last 24h" chip (`after:24h`) — a
 * ROLLING window: at 9am it still includes yesterday afternoon. But the
 * day-group dividers in the list speak in CALENDAR days ("Today",
 * "Yesterday"), and a user who clicks a "Today" affordance means "clips
 * from since local midnight", not "the last 24 hours". Those are
 * different sets for most of the day. This module owns the local-midnight
 * boundary + the same-local-day predicate behind a dedicated `is:today`
 * search operator (and the "Today" quick-chip that injects it).
 *
 * Pure — no DOM, no clock beyond the caller-supplied `now` (so the
 * boundary is deterministic + testable). The search parser computes the
 * threshold once at parse time (mirroring how `before:`/`after:` store
 * `now - duration`) and applyQuery does a straight `lastSeenAt >=`
 * comparison per clip.
 *
 * Design decisions:
 *   - LOCAL midnight, not UTC: a late-evening clip for a user west of
 *     GMT must count as "today", which UTC bucketing would push into
 *     "tomorrow". We zero the local h/m/s/ms via the Date's local
 *     getters — the same local-day contract `lib/day-group.dayKey` uses,
 *     so the chip and the dividers agree on where "Today" starts.
 *   - The boundary is INCLUSIVE of local midnight (`>= start`): a clip
 *     captured at exactly 00:00:00.000 is part of today.
 *   - `isToday` is the per-clip predicate (ts >= start-of-today AND ts <
 *     start-of-tomorrow) so it's correct even if a clip somehow carries
 *     a future timestamp (clock skew) — a tomorrow-stamped clip is NOT
 *     today. applyQuery only needs the lower bound (no clip is in the
 *     future under normal capture), but the predicate is exact for tests
 *     + reuse.
 *   - Defensive: a non-finite `now` falls back to `Date.now()`; a
 *     non-finite clip ts is never "today" (returns false) rather than
 *     throwing in the filter hot path.
 */

const DAY_MS = 86_400_000;

/**
 * Unix-ms of the most recent LOCAL midnight at/under `now` — the start
 * of "today" in the user's local timezone. Inclusive lower bound for the
 * `is:today` filter. A non-finite `now` falls back to the live clock.
 */
export function localDayStart(now: number = Date.now()): number {
  const base = Number.isFinite(now) ? now : Date.now();
  const d = new Date(base);
  d.setHours(0, 0, 0, 0); // local midnight — zeroes h/m/s/ms in local time
  return d.getTime();
}

/**
 * Unix-ms of the NEXT local midnight after `now` — the exclusive upper
 * bound of "today". Computed off `localDayStart` + 24h is WRONG across a
 * DST boundary (a spring-forward day is 23h), so we advance the calendar
 * date and re-zero, which is DST-correct.
 */
export function localDayEnd(now: number = Date.now()): number {
  const base = Number.isFinite(now) ? now : Date.now();
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1); // next calendar day, re-zeroed -> DST-safe
  return d.getTime();
}

/**
 * True when `ts` falls within the local calendar day containing `now`
 * (>= local midnight today AND < local midnight tomorrow). A non-finite
 * `ts` is never today. Exact both-ends gate so a future-stamped clip
 * (clock skew) correctly reads as NOT today.
 */
export function isToday(ts: number | null | undefined, now: number = Date.now()): boolean {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return false;
  return ts >= localDayStart(now) && ts < localDayEnd(now);
}

/**
 * Unix-ms of the LOCAL midnight that began YESTERDAY — the inclusive
 * lower bound of the yesterday window. Computed by stepping the
 * calendar date back one and re-zeroing (NOT `localDayStart - 24h`,
 * which is wrong across a DST boundary the same way `localDayEnd` is).
 * A non-finite `now` falls back to the live clock.
 *
 * Companion to `is:today` — the next-most-asked calendar bucket. The
 * upper bound of yesterday is exactly `localDayStart(now)` (today's
 * midnight), so the two buckets tile the timeline with no gap and no
 * overlap: a clip is in exactly one of {before-yesterday, yesterday,
 * today, future}.
 */
export function localYesterdayStart(now: number = Date.now()): number {
  const base = Number.isFinite(now) ? now : Date.now();
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 1); // previous calendar day, re-zeroed -> DST-safe
  return d.getTime();
}

/**
 * True when `ts` falls within the local calendar day BEFORE the one
 * containing `now` (>= yesterday's local midnight AND < today's local
 * midnight). A non-finite `ts` is never yesterday. Exact both-ends gate
 * so a clip from two days ago, today, or a future-stamped clip all
 * correctly read as NOT yesterday.
 *
 * The window's upper bound is `localDayStart(now)` — the same value
 * `isToday`'s lower bound uses — so `isToday` and `isYesterday` are
 * mutually exclusive by construction (no instant satisfies both).
 */
export function isYesterday(ts: number | null | undefined, now: number = Date.now()): boolean {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return false;
  return ts >= localYesterdayStart(now) && ts < localDayStart(now);
}

/**
 * Which weekday begins the calendar week, as a `Date.getDay()` value
 * (0 = Sunday ... 6 = Saturday). We use MONDAY (1) — the ISO-8601 week
 * start, which is what most of the world (and every "this week" filter a
 * productivity user reaches for) means by a week. Flipping this single
 * constant to 0 would move the boundary to a Sunday-start week without
 * touching the math below, so the locale choice lives in exactly one
 * place. (A full per-locale week-start would read
 * Intl.Locale.weekInfo.firstDay, but that's still patchy across engines
 * and isn't worth the branch here — Monday is the safe, predictable
 * default the dividers can also adopt later.)
 */
export const WEEK_START_DAY = 1; // Monday (ISO-8601)

/**
 * Unix-ms of the most recent local midnight on the week's start day
 * at/under `now` — the inclusive lower bound of "this week". Built by
 * walking back from today's local midnight to the most recent
 * `WEEK_START_DAY`, stepping whole calendar days (NOT subtracting
 * `n * DAY_MS`, which is wrong across a DST boundary the same way
 * `localDayEnd`/`localYesterdayStart` are). A non-finite `now` falls
 * back to the live clock.
 *
 * The next grain up from `is:today` / `is:yesterday`: where those bucket
 * a single calendar day, this brackets the whole running week (Monday
 * 00:00 through next Monday 00:00). Today and yesterday (when yesterday
 * is in the same week) both fall inside this window, so the "This week"
 * chip is a SUPERSET of the day chips — its count is computed
 * independently, not as a remainder.
 */
export function localWeekStart(now: number = Date.now()): number {
  const base = Number.isFinite(now) ? now : Date.now();
  const d = new Date(base);
  d.setHours(0, 0, 0, 0); // local midnight today
  // Days since the week's start day, in [0, 6]. (getDay() - start + 7) % 7
  // handles the wrap so a Sunday-start or Monday-start both land right.
  const delta = (d.getDay() - WEEK_START_DAY + 7) % 7;
  d.setDate(d.getDate() - delta); // step back whole days -> DST-safe
  return d.getTime();
}

/**
 * Unix-ms of the NEXT week's start-day local midnight after `now` — the
 * exclusive upper bound of "this week" (= `localWeekStart` + 7 calendar
 * days, advanced via setDate so it's DST-correct). A clip stamped at
 * exactly this instant belongs to next week, not this one.
 */
export function localWeekEnd(now: number = Date.now()): number {
  const d = new Date(localWeekStart(now));
  d.setDate(d.getDate() + 7); // next week's start day, re-zeroed -> DST-safe
  return d.getTime();
}

/**
 * True when `ts` falls within the local calendar week containing `now`
 * (>= this week's start-day midnight AND < next week's start-day
 * midnight). A non-finite `ts` is never this-week. Exact both-ends gate
 * so a future-stamped clip (clock skew, next week) reads as NOT this
 * week. `isToday`/`isYesterday` (when yesterday is in-week) imply
 * `isThisWeek`, never the reverse.
 */
export function isThisWeek(ts: number | null | undefined, now: number = Date.now()): boolean {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return false;
  return ts >= localWeekStart(now) && ts < localWeekEnd(now);
}
