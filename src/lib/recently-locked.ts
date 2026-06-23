/**
 * Pure helper for the Cmd+K "Show recently locked clips" command.
 *
 * Surfaces clips with `lockedAt` within a sliding window (default 7
 * days). Answers a real workflow question: "what have I marked
 * irreplaceable lately?" — a chronology view of recent lock decisions.
 * Complements the existing `is:locked` operator, which is the
 * everything-ever view; this one is the just-recently view used
 * during a review pass.
 *
 * Why a dedicated module instead of leaning on `is:locked after:7d`
 * alone?
 *
 *   - `after:` filters on `lastSeenAt` (re-copy recency), NOT on
 *     `lockedAt` (lock-decision recency). A clip the user locked last
 *     week then re-copied today would surface in `is:locked after:1d`
 *     but isn't a *recent lock decision* — the lock is week-old.
 *   - The palette command needs a live count to decide its `available`
 *     gate + render the label ("Show recently locked (4)"), so a pure
 *     scanner is the natural shape.
 *   - The label hint (latest lock + age) needs the freshest entry's
 *     `lockedAt` — computed in one pass alongside the count.
 *
 * Strict gate: `c.locked === true` AND `typeof c.lockedAt === "number"`
 * AND `lockedAt >= now - windowMs`. The strict check on `locked`
 * mirrors db.toggleLock / setLocked / partitionLocked + the
 * `is:locked` filter, so a truthy non-boolean (a stray `locked: 1`
 * from an older import) doesn't accidentally surface here. The
 * `lockedAt` number-check rules out clips locked before the
 * breadcrumb shipped — they're still locked, but we can't tell WHEN,
 * so they can't be "recently locked" by definition.
 *
 * Pure: no DOM, no IDB, no clock fixation. Caller passes `now` so
 * tests can pin time.
 */

/** Minimal structural type — just the locked bits matter. */
export interface RecentlyLockedClip {
  id: string;
  locked?: boolean;
  lockedAt?: number;
}

/** Default window: 7 days in ms. Picked to match the trash retention
 * window so "recently" reads consistently across surfaces. */
export const RECENTLY_LOCKED_DEFAULT_WINDOW_MS = 7 * 86_400_000;

/**
 * Filter to clips that were locked within the window AND survive the
 * strict gate. Returned newest-locked first (`lockedAt` desc) so the
 * caller can show "your most recent lock at the top" without an extra
 * sort pass.
 *
 * Defensive against:
 *   - Non-array `clips` → `[]` (caller renders empty state)
 *   - Bad entries (no id, no lockedAt, locked!==true) → silently dropped
 *   - Future-dated `lockedAt` (clock skew) → still included, since
 *     they're "recent" by construction (we don't punish clock drift)
 *   - Stale `lockedAt` outside the window → dropped
 *   - NaN/Infinity `lockedAt` → dropped (Number.isFinite gate)
 *   - `now` non-finite → falls back to Date.now() under the hood so
 *     unit tests passing junk don't silently get the live clock
 */
export function recentlyLockedClips<T extends RecentlyLockedClip>(
  clips: T[],
  opts: { now?: number; windowMs?: number } = {},
): T[] {
  if (!Array.isArray(clips)) return [];
  const now =
    typeof opts.now === "number" && Number.isFinite(opts.now)
      ? opts.now
      : Date.now();
  const windowMs =
    typeof opts.windowMs === "number" &&
    Number.isFinite(opts.windowMs) &&
    opts.windowMs > 0
      ? opts.windowMs
      : RECENTLY_LOCKED_DEFAULT_WINDOW_MS;
  const cutoff = now - windowMs;
  const out: T[] = [];
  for (const c of clips) {
    if (!c || typeof c.id !== "string" || c.id.length === 0) continue;
    if (c.locked !== true) continue;
    if (typeof c.lockedAt !== "number" || !Number.isFinite(c.lockedAt)) continue;
    if (c.lockedAt < cutoff) continue;
    out.push(c);
  }
  // Newest-locked first. Stable enough — same `lockedAt` (rare) falls
  // back to input order via Array#sort's stable guarantee.
  out.sort((a, b) => (b.lockedAt ?? 0) - (a.lockedAt ?? 0));
  return out;
}

/**
 * Count matching clips without allocating the array. Used by the
 * palette label so the command renders "Show recently locked (4)"
 * without paying for an unused slice.
 */
export function countRecentlyLocked<T extends RecentlyLockedClip>(
  clips: T[],
  opts: { now?: number; windowMs?: number } = {},
): number {
  if (!Array.isArray(clips)) return 0;
  const now =
    typeof opts.now === "number" && Number.isFinite(opts.now)
      ? opts.now
      : Date.now();
  const windowMs =
    typeof opts.windowMs === "number" &&
    Number.isFinite(opts.windowMs) &&
    opts.windowMs > 0
      ? opts.windowMs
      : RECENTLY_LOCKED_DEFAULT_WINDOW_MS;
  const cutoff = now - windowMs;
  let n = 0;
  for (const c of clips) {
    if (!c || typeof c.id !== "string" || c.id.length === 0) continue;
    if (c.locked !== true) continue;
    if (typeof c.lockedAt !== "number" || !Number.isFinite(c.lockedAt)) continue;
    if (c.lockedAt < cutoff) continue;
    n++;
  }
  return n;
}

/**
 * Palette label + hint pair for the Cmd+K command. Three shapes:
 *
 *   - count === 0 → "Show recently locked clips" with empty-friendly
 *     hint; `available: false` so the row greys out.
 *   - count === 1 → "Show 1 recently locked clip" (singular)
 *   - count >= 2 → "Show N recently locked clips" (plural)
 *
 * Hint when available carries the freshest `lockedAt` age so the user
 * sees how recent the most recent lock was without expanding the
 * filter. Caller passes a formatAge function (matches the existing
 * formatAge in popup.ts) so the formatting stays consistent without
 * a dependency import.
 *
 * Defensive against non-finite count (NaN/negative → 0).
 */
export interface RecentlyLockedLabel {
  label: string;
  hint: string;
  available: boolean;
}

export function formatRecentlyLockedLabel(opts: {
  count: number;
  freshestLockedAt?: number;
  now?: number;
  windowDays?: number;
  formatAge: (at: number) => string;
}): RecentlyLockedLabel {
  const rawCount = Math.max(0, Math.floor(Number(opts.count) || 0));
  const windowDays =
    typeof opts.windowDays === "number" &&
    Number.isFinite(opts.windowDays) &&
    opts.windowDays > 0
      ? Math.floor(opts.windowDays)
      : 7;
  if (rawCount === 0) {
    return {
      label: "Show recently locked clips",
      hint: `No clips locked in the last ${windowDays} days`,
      available: false,
    };
  }
  const noun = rawCount === 1 ? "clip" : "clips";
  const label = `Show ${rawCount} recently locked ${noun}`;
  const fresh = opts.freshestLockedAt;
  let hint: string;
  if (typeof fresh === "number" && Number.isFinite(fresh)) {
    const ageLabel = opts.formatAge(fresh);
    hint = `Most recent: ${ageLabel} · window = last ${windowDays} days`;
  } else {
    hint = `Locked within the last ${windowDays} days`;
  }
  return { label, hint, available: true };
}
