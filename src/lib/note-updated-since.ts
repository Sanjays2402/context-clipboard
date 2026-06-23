/**
 * Pure formatter for the detail-view "Noted <X ago>" breadcrumb.
 *
 * Surfaced in the note row as a small, scannable hint right next to
 * the char-counter so the user sees both "what's in the note" AND
 * "how stale is the note" without leaving detail-view. Answers a
 * real workflow question on the review pass: "did I write this
 * caveat yesterday or six months ago?"
 *
 * Why a dedicated formatter (vs. reusing locked-since or formatAge)?
 *
 *   - formatLockedSince produces "Locked <X>" labels — wrong prefix
 *     and slightly different tier choices for the note context.
 *   - popup's generic formatAge gives bare relative times (`5m`,
 *     `2h`) without the "Noted" prefix; the note row needs the
 *     full breadcrumb shape for context.
 *   - Three rendering tiers matches locked-since but the boundaries
 *     are tighter (notes are more conversational — "minutes ago" is
 *     enough granularity in the recent tier, no separate "just now").
 *
 * Tiers:
 *   - < 60s              → "Noted just now"
 *   - < 1h               → "Noted Nm ago"
 *   - < 24h              → "Noted Nh ago"
 *   - 1–6 days ago       → "Noted Nd ago"
 *   - 7+ days ago        → "Noted on YYYY-MM-DD"
 *
 * Pure: no DOM, no IDB, no clock fixation. Caller passes `now`
 * (popup hands `Date.now()`).
 *
 * Tests at .cron-state/sanity-note-updated-since.mjs.
 */

export interface NoteUpdatedLabel {
  /** Terse age-tier-aware label, suitable for inline display. */
  label: string;
  /** Full ISO date + time for the `title` tooltip attr. */
  tooltip: string;
}

/**
 * Format a `noteUpdatedAt` timestamp into the breadcrumb pair.
 *
 * Defensive: when `noteUpdatedAt` is missing / non-finite / null
 * (legacy clips noted before the stamp shipped), returns a minimal
 * "Noted" label with an empty tooltip — the caller should hide the
 * breadcrumb in that case (no useful info to display), but the
 * fallback exists so a stale render doesn't crash.
 *
 * Negative ages (clock skew where `noteUpdatedAt` is in the future
 * relative to `now`) clamp to "just now" rather than rendering a
 * nonsensical "Noted in 2h ago" — matches the locked-since contract.
 */
export function formatNoteUpdatedSince(
  noteUpdatedAt: number | null | undefined,
  now: number,
): NoteUpdatedLabel {
  if (typeof noteUpdatedAt !== "number" || !Number.isFinite(noteUpdatedAt)) {
    return { label: "Noted", tooltip: "" };
  }
  const ageMs = Math.max(0, now - noteUpdatedAt);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const tooltip = formatFullStamp(noteUpdatedAt);

  if (ageMs < minute) {
    return { label: "Noted just now", tooltip };
  }
  if (ageMs < hour) {
    const n = Math.floor(ageMs / minute);
    return { label: `Noted ${n}m ago`, tooltip };
  }
  if (ageMs < day) {
    const n = Math.floor(ageMs / hour);
    return { label: `Noted ${n}h ago`, tooltip };
  }
  // 1–6 days ago via calendar-day math so "1 day" reads as
  // "yesterday's date" not "any 24-hour window". Boundary uses
  // local-day starts so a note written 23:55 yesterday becomes
  // "Noted 1d ago" at 01:00 today instead of "12h ago".
  const noteDate = new Date(noteUpdatedAt);
  const nowDate = new Date(now);
  const noteDayStart = new Date(
    noteDate.getFullYear(),
    noteDate.getMonth(),
    noteDate.getDate(),
  ).getTime();
  const todayStart = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth(),
    nowDate.getDate(),
  ).getTime();
  const daysAgo = Math.floor((todayStart - noteDayStart) / day);
  if (daysAgo > 0 && daysAgo < 7) {
    const noun = daysAgo === 1 ? "day" : "days";
    return { label: `Noted ${daysAgo} ${noun} ago`, tooltip };
  }
  // 7+ days → ISO date only. The user reads the date at this
  // distance anyway, not a relative span.
  return { label: `Noted on ${isoDateOf(noteDate)}`, tooltip };
}

function isoDateOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function clockOf(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatFullStamp(at: number): string {
  const d = new Date(at);
  return `${isoDateOf(d)} ${clockOf(d)}`;
}
