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
