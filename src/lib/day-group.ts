/**
 * Day-group headers for the clip list.
 *
 * The daily list is a flat stream of clip rows. When the user is
 * scanning a long, time-ordered list ("most recent" / "oldest first")
 * there's no anchor that says WHERE in time they are — a clip from
 * this morning and one from last Tuesday sit shoulder-to-shoulder with
 * nothing between them. This module computes the lightweight
 * "Today" / "Yesterday" / "Mon Jun 22" header that should precede the
 * first clip of each calendar-day run, so the popup can paint sticky
 * date dividers (the kind every mail / chat client has).
 *
 * Pure — no DOM. The popup walks its already-sorted `currentClips`
 * array, asks this module for the header to render BEFORE each clip
 * (or null to continue the current group), and interleaves a sticky
 * `.day-header` element. Keeping the bucketing here means every
 * boundary case (pinned tier, day rollover, empty list, locale label)
 * is exercised without a layout engine.
 *
 * Design decisions:
 *   - Headers only make sense for TIME-ordered sorts. Grouping a
 *     "most copied" or "A-Z" list by day would scatter one-clip
 *     "headers" everywhere (adjacent rows rarely share a day), so the
 *     popup only calls this for the `recent` / `oldest` sort modes.
 *     This module stays sort-agnostic — it groups whatever contiguous
 *     order it's handed — but its contract assumes time-contiguity.
 *   - PINNED clips float to the top of the list regardless of age
 *     (sortClips puts the pinned tier first). Bucketing them by their
 *     own capture day would stamp a stale "5 days ago" header at the
 *     very top, which is wrong — they're up there because they're
 *     pinned, not because they're recent. So the entire pinned run
 *     gets ONE "Pinned" header, and day-bucketing starts at the first
 *     unpinned clip. This mirrors how the eye already reads the list:
 *     pins, then the dated stream.
 *   - The label is computed against a caller-supplied `now` so the
 *     "Today" / "Yesterday" boundary is deterministic + testable. Same
 *     calendar day as `now` -> "Today"; the day before -> "Yesterday";
 *     within the last week -> the weekday name ("Monday"); same year ->
 *     "Mon Jun 22"; older -> "Jun 22, 2025". Locale-formatted via
 *     toLocaleDateString to match the rest of the popup chrome.
 *   - Returns a parallel array of `string | null` the same length as
 *     the input: index i carries the header to paint before clip i, or
 *     null when clip i continues the previous row's group. The first
 *     clip of every group (and the first clip overall) always carries
 *     a header. This shape lets the popup map clips + headers in one
 *     pass with no index juggling.
 *   - Defensive: a nullish array yields []; a clip with a non-finite
 *     timestamp is bucketed under an "Earlier" catch-all rather than
 *     throwing inside the list-render hot path.
 */

export interface DayGroupClip {
  /** The timestamp the list is ordered by (lastSeenAt). */
  lastSeenAt: number;
  /** Pinned clips share a single "Pinned" header at the top. */
  pinned?: boolean;
}

/** Label used for the pinned run at the top of a time-sorted list. */
export const PINNED_HEADER = "Pinned";
/** Catch-all label for clips with an unusable timestamp. */
export const UNDATED_HEADER = "Earlier";

const DAY_MS = 86_400_000;

/**
 * Compute the per-clip day-group headers for an ordered clip list.
 *
 * Returns an array the same length as `clips`: element i is the header
 * string to render immediately BEFORE clip i, or null when clip i
 * belongs to the same group as clip i-1 (so only the first row of each
 * run carries a divider).
 *
 * The pinned tier (a leading run of `pinned` clips) collapses to a
 * single `PINNED_HEADER`; day bucketing begins at the first unpinned
 * clip. A clip whose `lastSeenAt` is non-finite is grouped under
 * `UNDATED_HEADER`.
 */
export function computeDayHeaders(
  clips: ReadonlyArray<DayGroupClip | null | undefined> | null | undefined,
  now: number = Date.now(),
): (string | null)[] {
  if (!Array.isArray(clips) || clips.length === 0) return [];
  const headers: (string | null)[] = [];
  // `prevKey` is the group key of the previous row: "pinned", a
  // calendar-day key like "2026-176", or "undated". A header is
  // emitted whenever the key changes.
  let prevKey: string | null = null;
  for (const c of clips) {
    const pinned = !!c && c.pinned === true;
    let key: string;
    let label: string;
    if (pinned) {
      key = "pinned";
      label = PINNED_HEADER;
    } else {
      const ts = c && Number.isFinite(c.lastSeenAt) ? c.lastSeenAt : NaN;
      if (!Number.isFinite(ts)) {
        key = "undated";
        label = UNDATED_HEADER;
      } else {
        key = dayKey(ts);
        label = dayLabel(ts, now);
      }
    }
    headers.push(key === prevKey ? null : label);
    prevKey = key;
  }
  return headers;
}

/**
 * Stable per-calendar-day key in LOCAL time (year + ordinal day), so
 * two timestamps on the same local day collapse to one group even
 * across a DST shift. Not user-facing — only used to detect group
 * boundaries.
 */
function dayKey(ts: number): string {
  const d = new Date(ts);
  // Local Y/M/D — avoids UTC bucketing a late-evening clip into
  // "tomorrow" for users west of GMT.
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Human day label relative to `now`:
 *   - same local day            -> "Today"
 *   - previous local day        -> "Yesterday"
 *   - within the last 7 days    -> weekday name ("Monday")
 *   - same calendar year        -> "Mon Jun 22"
 *   - older                     -> "Jun 22, 2025"
 *
 * Locale-formatted (toLocaleDateString) to match the popup's other
 * date surfaces. Exported so the popup + tests share one definition.
 */
export function dayLabel(ts: number, now: number = Date.now()): string {
  if (!Number.isFinite(ts)) return UNDATED_HEADER;
  const then = new Date(ts);
  const today = new Date(now);
  const dayDiff = calendarDayDiff(then, today);
  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff > 1 && dayDiff < 7) {
    return then.toLocaleDateString(undefined, { weekday: "long" });
  }
  // Same calendar year -> drop the year for a tighter divider.
  if (then.getFullYear() === today.getFullYear()) {
    return then.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }
  return then.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Whole-calendar-days between two dates (local midnight to local
 * midnight), so 11:59pm -> 12:01am next day counts as 1, not 0. A
 * positive result means `earlier` is before `later`.
 */
function calendarDayDiff(earlier: Date, later: Date): number {
  const a = Date.UTC(earlier.getFullYear(), earlier.getMonth(), earlier.getDate());
  const b = Date.UTC(later.getFullYear(), later.getMonth(), later.getDate());
  return Math.round((b - a) / DAY_MS);
}
