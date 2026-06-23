/**
 * Pure helper for the Cmd+K "Show recently noted clips" command.
 *
 * Surfaces clips with `noteUpdatedAt` within a sliding window
 * (default 7 days). Answers a real workflow question: "what have I
 * left a caveat on lately?" — a chronology view of recent
 * annotation decisions. Complements the existing `is:noted`
 * operator, which is the everything-ever view; this one is the
 * just-recently view used during the weekly review pass.
 *
 * Why a dedicated module instead of leaning on `is:noted after:7d`
 * alone?
 *
 *   - `after:` filters on `lastSeenAt` (re-copy recency), NOT on
 *     `noteUpdatedAt` (annotation-decision recency). A clip the
 *     user noted last week then re-copied today would surface in
 *     `is:noted after:1d` but isn't a *recent annotation* — the
 *     note is week-old. Mirrors the same divergence rationale as
 *     recently-locked vs `is:locked after:7d`.
 *   - The palette command needs a live count to decide its
 *     `available` gate + render the label ("Show recently noted
 *     (4)"), so a pure scanner is the natural shape.
 *   - The label hint (latest note + age) needs the freshest
 *     entry's `noteUpdatedAt` — computed in one pass alongside
 *     the count.
 *
 * Strict gate: `hasClipNote(c)` (note is non-empty trimmed string)
 * AND `typeof c.noteUpdatedAt === "number"` AND `noteUpdatedAt >=
 * now - windowMs`. The hasClipNote check mirrors the search
 * filter / detail-view paint predicate, so the three surfaces
 * never disagree on what counts as "noted". The noteUpdatedAt
 * number-check rules out clips noted before the breadcrumb
 * shipped — they're still noted, but we can't tell WHEN, so they
 * can't be "recently noted" by definition (matches
 * recently-locked's lockedAt contract exactly).
 *
 * Pure: no DOM, no IDB, no clock fixation. Caller passes `now` so
 * tests can pin time.
 */

import { hasClipNote } from "./clip-note";

/** Minimal structural type — just the note bits matter. */
export interface RecentlyNotedClip {
  id: string;
  note?: string;
  noteUpdatedAt?: number;
}

/** Default window: 7 days in ms. Picked to match recently-locked +
 * trash retention so "recently" reads consistently across surfaces. */
export const RECENTLY_NOTED_DEFAULT_WINDOW_MS = 7 * 86_400_000;

/**
 * Filter to clips that were noted within the window AND survive the
 * strict gate. Returned newest-noted first (`noteUpdatedAt` desc)
 * so the caller can show "your most recent caveat at the top"
 * without an extra sort pass.
 *
 * Defensive against:
 *   - Non-array `clips` → `[]` (caller renders empty state)
 *   - Bad entries (no id, no noteUpdatedAt, hasClipNote false) →
 *     silently dropped
 *   - Future-dated `noteUpdatedAt` (clock skew) → still included,
 *     since they're "recent" by construction (we don't punish
 *     clock drift)
 *   - Stale `noteUpdatedAt` outside the window → dropped
 *   - NaN/Infinity `noteUpdatedAt` → dropped (Number.isFinite gate)
 *   - `now` non-finite → falls back to Date.now() so unit tests
 *     passing junk don't silently get the live clock
 */
export function recentlyNotedClips<T extends RecentlyNotedClip>(
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
      : RECENTLY_NOTED_DEFAULT_WINDOW_MS;
  const cutoff = now - windowMs;
  const out: T[] = [];
  for (const c of clips) {
    if (!c || typeof c.id !== "string" || c.id.length === 0) continue;
    if (!hasClipNote(c)) continue;
    if (typeof c.noteUpdatedAt !== "number" || !Number.isFinite(c.noteUpdatedAt))
      continue;
    if (c.noteUpdatedAt < cutoff) continue;
    out.push(c);
  }
  // Newest-noted first. Stable enough — same `noteUpdatedAt` (rare)
  // falls back to input order via Array#sort's stable guarantee.
  out.sort((a, b) => (b.noteUpdatedAt ?? 0) - (a.noteUpdatedAt ?? 0));
  return out;
}

/**
 * Count matching clips without allocating the array. Used by the
 * palette label so the command renders "Show recently noted (4)"
 * without paying for an unused slice.
 */
export function countRecentlyNoted<T extends RecentlyNotedClip>(
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
      : RECENTLY_NOTED_DEFAULT_WINDOW_MS;
  const cutoff = now - windowMs;
  let n = 0;
  for (const c of clips) {
    if (!c || typeof c.id !== "string" || c.id.length === 0) continue;
    if (!hasClipNote(c)) continue;
    if (typeof c.noteUpdatedAt !== "number" || !Number.isFinite(c.noteUpdatedAt))
      continue;
    if (c.noteUpdatedAt < cutoff) continue;
    n++;
  }
  return n;
}

/**
 * Palette label + hint pair for the Cmd+K command. Three shapes:
 *
 *   - count === 0 → "Show recently noted clips" with empty-friendly
 *     hint; `available: false` so the row greys out.
 *   - count === 1 → "Show 1 recently noted clip" (singular)
 *   - count >= 2 → "Show N recently noted clips" (plural)
 *
 * Hint when available carries the freshest `noteUpdatedAt` age so
 * the user sees how recent the most recent annotation was without
 * expanding the filter. Caller passes a formatAge function (matches
 * the existing formatAge in popup.ts) so the formatting stays
 * consistent without a dependency import.
 *
 * Defensive against non-finite count (NaN/negative → 0).
 */
export interface RecentlyNotedLabel {
  label: string;
  hint: string;
  available: boolean;
}

export function formatRecentlyNotedLabel(opts: {
  count: number;
  freshestNoteUpdatedAt?: number;
  now?: number;
  windowDays?: number;
  formatAge: (at: number) => string;
}): RecentlyNotedLabel {
  const rawCount = Math.max(0, Math.floor(Number(opts.count) || 0));
  const windowDays =
    typeof opts.windowDays === "number" &&
    Number.isFinite(opts.windowDays) &&
    opts.windowDays > 0
      ? Math.floor(opts.windowDays)
      : 7;
  if (rawCount === 0) {
    return {
      label: "Show recently noted clips",
      hint: `No clips noted in the last ${windowDays} days`,
      available: false,
    };
  }
  const noun = rawCount === 1 ? "clip" : "clips";
  const label = `Show ${rawCount} recently noted ${noun}`;
  const fresh = opts.freshestNoteUpdatedAt;
  let hint: string;
  if (typeof fresh === "number" && Number.isFinite(fresh)) {
    const ageLabel = opts.formatAge(fresh);
    hint = `Most recent: ${ageLabel} · window = last ${windowDays} days`;
  } else {
    hint = `Noted within the last ${windowDays} days`;
  }
  return { label, hint, available: true };
}
