/**
 * Day-rollup grouper for the privacy audit log.
 *
 * The audit ring buffer is ordered newest-first (see appendPrivacyAuditEntry).
 * When a user has been actively redacting / scrubbing / archiving, the
 * list becomes a long stream of "5m ago / 6m ago / 7m ago …" rows that
 * blur together — you can't tell at a glance "I did 18 redacts today
 * vs 3 yesterday".
 *
 * `groupAuditByDay` collapses entries by **local-day** boundary and
 * returns an ordered list of `{ key, label, entries }` groups so the
 * popup can render a `<details>`-style header per day with the count
 * inline ("Today (18)"), and default-open Today + Yesterday so the
 * recent activity stays one click away while older days fold up.
 *
 * Pure — no DOM, no IDB. Tests at .cron-state/sanity-audit-rollup.mjs.
 */

export interface AuditDayGroup<T> {
  /** Stable group key — local YYYY-MM-DD string (good as a DOM attribute). */
  key: string;
  /** Human label — "Today" / "Yesterday" / "Wed, May 18" etc. */
  label: string;
  /** Newest-first entries that fell on this local day. */
  entries: T[];
  /**
   * Default-open hint for the renderer. Today + Yesterday open so the
   * recent activity stays one click away; older days fold up to keep
   * the panel scannable. The popup may still let the user toggle each
   * group manually — this is the INITIAL state.
   */
  defaultOpen: boolean;
}

export interface AuditEntryLike {
  /** Capture time (ms since epoch). Other fields are ignored here. */
  at: number;
}

/**
 * Format a Date as a local YYYY-MM-DD string. We use this for the
 * group key so two timestamps that fall on the same wall-clock day in
 * the user's tz collapse together regardless of UTC offset.
 *
 * Avoids `toISOString().slice(0,10)` which is UTC-based and would
 * split midnight-adjacent local entries into separate groups.
 */
function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Resolve a friendly label for a day key relative to `now`:
 *   - "Today"   when the group is the local day of `now`
 *   - "Yesterday" when the group is the local day before `now`
 *   - "Wed, May 18" otherwise (omit year unless it differs from now's year)
 *   - "Wed, May 18 2024" when the year differs (archaeology / corrupt clocks)
 *
 * Pure — the only IO is `Intl.DateTimeFormat` which is deterministic
 * for a given locale + Date input.
 */
export function labelForDay(groupDate: Date, now: Date): string {
  const todayKey = localDayKey(now);
  const groupKey = localDayKey(groupDate);
  if (groupKey === todayKey) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (localDayKey(yesterday) === groupKey) return "Yesterday";
  // Same year — drop the year for a compact header. Different year
  // (uncommon — old audits or wonky clocks) — include it so the
  // header is unambiguous.
  const sameYear = groupDate.getFullYear() === now.getFullYear();
  const opts: Intl.DateTimeFormatOptions = sameYear
    ? { weekday: "short", month: "short", day: "numeric" }
    : { weekday: "short", month: "short", day: "numeric", year: "numeric" };
  try {
    return new Intl.DateTimeFormat(undefined, opts).format(groupDate);
  } catch {
    // Fallback for exotic environments without Intl — readable but
    // less localized.
    return groupDate.toDateString();
  }
}

/**
 * Group entries by local day, newest-day first. Within a day the
 * entries keep their incoming order (callers pass newest-first; the
 * audit ring already does this).
 *
 * `now` defaults to wall-clock time but is parameterised so tests can
 * pin a stable reference point ("Today" relative to a fixed date).
 *
 * Returns an empty array for an empty input — caller decides whether
 * to render a "no actions yet" empty-state above.
 */
export function groupAuditByDay<T extends AuditEntryLike>(
  entries: T[],
  now: Date = new Date(),
): AuditDayGroup<T>[] {
  if (entries.length === 0) return [];
  // Bucket by local-day key. Map iteration preserves insertion order
  // so the first day we see (newest entry's day) is the first group.
  const buckets = new Map<string, { date: Date; rows: T[] }>();
  for (const e of entries) {
    const d = new Date(e.at);
    const key = localDayKey(d);
    const hit = buckets.get(key);
    if (hit) {
      hit.rows.push(e);
    } else {
      buckets.set(key, { date: d, rows: [e] });
    }
  }
  // Sort by date desc so a freshly-imported batch with mixed-day
  // entries (rare but possible — import bundles can pull in older
  // audits) lands newest-first even if the input was non-monotonic.
  const todayKey = localDayKey(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = localDayKey(yesterday);

  return Array.from(buckets.entries())
    .map(([key, { date, rows }]) => ({
      key,
      date,
      label: labelForDay(date, now),
      entries: rows,
      defaultOpen: key === todayKey || key === yesterdayKey,
    }))
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map(({ date: _date, ...rest }) => rest);
}

/**
 * Convenience: total entries across every group. Equivalent to the
 * input array length when the input is non-empty, but exposed as a
 * function for symmetry with caller code that has the groups handy
 * (the popup uses it for the summary line).
 */
export function totalAuditEntries<T>(groups: AuditDayGroup<T>[]): number {
  let n = 0;
  for (const g of groups) n += g.entries.length;
  return n;
}
