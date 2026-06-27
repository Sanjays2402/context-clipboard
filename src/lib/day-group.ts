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

/**
 * A day-group divider: the human `label` to paint plus the `count` of
 * clips in the contiguous run this header leads. The count powers the
 * "Today · 6" volume badge on the divider so the user can see how many
 * clips landed in each day-bucket at a glance without scrolling the run.
 */
export interface DayHeaderInfo {
  /** The human divider label ("Today", "Yesterday", "Pinned", ...). */
  label: string;
  /** How many clips belong to the run this header leads (>= 1). */
  count: number;
}

/** Label used for the pinned run at the top of a time-sorted list. */
export const PINNED_HEADER = "Pinned";
/** Catch-all label for clips with an unusable timestamp. */
export const UNDATED_HEADER = "Earlier";
/**
 * Label for the current local calendar day. Exported so the redundant-
 * divider suppressor (lib/redundant-divider) can compare against the same
 * string `dayLabel` emits — the suppress-label can never drift from the
 * render-label.
 */
export const TODAY_HEADER = "Today";
/** Label for the previous local calendar day (see `TODAY_HEADER`). */
export const YESTERDAY_HEADER = "Yesterday";

const DAY_MS = 86_400_000;

/** Resolve the group key + human label for a single clip. */
function bucketOf(
  c: DayGroupClip | null | undefined,
  now: number,
): { key: string; label: string } {
  const pinned = !!c && c.pinned === true;
  if (pinned) return { key: "pinned", label: PINNED_HEADER };
  const ts = c && Number.isFinite(c.lastSeenAt) ? c.lastSeenAt : NaN;
  if (!Number.isFinite(ts)) return { key: "undated", label: UNDATED_HEADER };
  return { key: dayKey(ts), label: dayLabel(ts, now) };
}

/**
 * Compute the per-clip day-group headers WITH the size of each run, for
 * an ordered clip list.
 *
 * Returns an array the same length as `clips`: element i is the header
 * `{ label, count }` to render immediately BEFORE clip i, or null when
 * clip i belongs to the same group as clip i-1 (so only the first row
 * of each run carries a divider). `count` is the number of clips in the
 * contiguous run the header leads — exactly what the "Today · 6" badge
 * shows.
 *
 * The pinned tier (a leading run of `pinned` clips) collapses to a
 * single `PINNED_HEADER` run; day bucketing begins at the first
 * unpinned clip. A clip whose `lastSeenAt` is non-finite is grouped
 * under `UNDATED_HEADER`. Same bucketing as `computeDayHeaders` (which
 * is now a thin label-only projection of this) so the two never drift.
 */
export function computeDayHeaderInfos(
  clips: ReadonlyArray<DayGroupClip | null | undefined> | null | undefined,
  now: number = Date.now(),
): (DayHeaderInfo | null)[] {
  if (!Array.isArray(clips) || clips.length === 0) return [];
  const buckets = clips.map((c) => bucketOf(c, now));
  const out: (DayHeaderInfo | null)[] = [];
  let prevKey: string | null = null;
  for (let i = 0; i < buckets.length; i++) {
    const { key, label } = buckets[i];
    if (key === prevKey) {
      out.push(null);
    } else {
      // First row of a new run: count forward until the key changes.
      // The list is time-contiguous (this is only called for the
      // recent/oldest sorts), so a run is one calendar day (or the
      // single pinned/undated tier).
      let count = 0;
      for (let j = i; j < buckets.length && buckets[j].key === key; j++) count++;
      out.push({ label, count });
    }
    prevKey = key;
  }
  return out;
}

/**
 * Compute the per-clip day-group headers (label only) for an ordered
 * clip list — the back-compat projection of `computeDayHeaderInfos`.
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
  return computeDayHeaderInfos(clips, now).map((h) => (h ? h.label : null));
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
  if (dayDiff === 0) return TODAY_HEADER;
  if (dayDiff === 1) return YESTERDAY_HEADER;
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
