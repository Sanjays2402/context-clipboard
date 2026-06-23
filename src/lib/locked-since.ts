/**
 * Pure formatter for the detail-view "Locked since" breadcrumb.
 *
 * The breadcrumb answers "when did I decide this clip is
 * irreplaceable?" — surfaced as a short, scannable label with a
 * tooltip-style absolute date for the user who wants the exact
 * timestamp.
 *
 * Three rendering tiers:
 *   - Today / Yesterday → relative ("Locked just now", "Locked
 *     3h ago", "Locked yesterday at 14:32"). Tight enough that
 *     the absolute datetime adds nothing.
 *   - 1–6 days → weekday + time ("Locked Mon at 09:12"). Cheap
 *     orientation for "earlier this week".
 *   - 7+ days → date ("Locked on 2026-04-12"). At this distance
 *     the absolute date is what the user reads anyway.
 *
 * `now` is injected so tests are deterministic; the popup passes
 * `Date.now()`.
 *
 * Returns both the visible label (terse) and a tooltip string
 * (always the full ISO date + clock so a hover always reveals
 * the exact moment). Tests at .cron-state/sanity-locked-since.mjs.
 */

export interface LockedSinceLabel {
  /** The terse, age-tier-aware label shown inline. */
  label: string;
  /** Full date + time for the title attribute. */
  tooltip: string;
}

/**
 * Format a `lockedAt` timestamp into the breadcrumb pair.
 *
 * Defensive: negative ages (clock skew during sync — lockedAt is
 * milliseconds in the FUTURE relative to `now`) render as "just
 * now" rather than dropping into a nonsensical "Locked in 2h"
 * label. Missing/null inputs fall back to a minimal "Locked"
 * label so the row still reads if something goes wrong (the
 * popup hides the row when `lockedAt` is missing, so this is
 * pure paranoia for the impossible case).
 */
export function formatLockedSince(
  lockedAt: number | null | undefined,
  now: number,
): LockedSinceLabel {
  if (typeof lockedAt !== "number" || !isFinite(lockedAt)) {
    return { label: "Locked", tooltip: "Locked timestamp unavailable" };
  }
  const ageMs = Math.max(0, now - lockedAt);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const tooltip = formatTooltip(lockedAt);

  // < 1 minute → "just now"
  if (ageMs < minute) {
    return { label: "Locked just now", tooltip };
  }
  // < 1 hour → minutes
  if (ageMs < hour) {
    const n = Math.floor(ageMs / minute);
    return { label: `Locked ${n}m ago`, tooltip };
  }
  // < 24 hours → hours
  if (ageMs < day) {
    const n = Math.floor(ageMs / hour);
    return { label: `Locked ${n}h ago`, tooltip };
  }

  // Day-bucket math uses local date so "yesterday" / weekday picks
  // align with what the user sees on the wall clock, not UTC.
  const sameLocalDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const lockDate = new Date(lockedAt);
  const nowDate = new Date(now);
  const yesterdayDate = new Date(now - day);
  if (sameLocalDay(lockDate, nowDate)) {
    // Same calendar day but >24h ago is impossible; shouldn't reach.
    return { label: `Locked today at ${clockOf(lockDate)}`, tooltip };
  }
  if (sameLocalDay(lockDate, yesterdayDate)) {
    return {
      label: `Locked yesterday at ${clockOf(lockDate)}`,
      tooltip,
    };
  }

  // 2–6 days ago → weekday + time. Strictly less-than 7 days from
  // the start of the lock day to today's start so the boundary is
  // predictable: a lock at 23:59 today rolls over at midnight, not
  // at the 7×86400ms mark.
  const lockDayStart = new Date(
    lockDate.getFullYear(),
    lockDate.getMonth(),
    lockDate.getDate(),
  ).getTime();
  const todayStart = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth(),
    nowDate.getDate(),
  ).getTime();
  const daysAgo = Math.floor((todayStart - lockDayStart) / day);
  if (daysAgo > 0 && daysAgo < 7) {
    const weekday = lockDate.toLocaleDateString(undefined, {
      weekday: "short",
    });
    return { label: `Locked ${weekday} at ${clockOf(lockDate)}`, tooltip };
  }

  // 7+ days → ISO date only
  return { label: `Locked on ${isoDateOf(lockDate)}`, tooltip };
}

function clockOf(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function isoDateOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTooltip(at: number): string {
  const d = new Date(at);
  return `${isoDateOf(d)} ${clockOf(d)}`;
}
