/**
 * Trash-list ordering by retention runway.
 *
 * The trash store hands back rows newest-deleted-FIRST (db.listTrash walks
 * the `deletedAt` index in reverse). Retention is a fixed window, so the
 * row with the LEAST runway before permanent purge is the OLDEST one —
 * which means the about-to-vanish rows sink to the BOTTOM of the list,
 * below the 50-row render cap, exactly where the user can't see them. The
 * one row that most needs a glance ("this is hours from permanent loss,
 * restore it NOW") is the hardest to find.
 *
 * lib/trash-ttl already TINTS those rows (soft-red imminent, amber soon),
 * but a tint can't lift a row out from under the fold. This module does
 * the lift: it floats the genuinely-urgent rows (imminent / expired —
 * under 24h of runway, the soft-red band) to the TOP, sorted most-urgent
 * first, and leaves everything else in its existing recency order. So the
 * "Purges any moment" rows lead the list, the "4h left" rows follow, then
 * the calm bulk of the trash reads newest-first as it always has.
 *
 * Pure — no DOM, `now`-injectable so tests pin time deterministically.
 * Delegates the tier + remaining-ms math to lib/trash-ttl so the row that
 * SORTS as urgent is byte-identically the row that TINTS as urgent; the
 * two surfaces can never disagree on which rows are about to go.
 *
 * Design decisions:
 *   - URGENT = the "imminent" (< 24h) + "expired" (past-due) tiers only.
 *     The "soon" tier (1–2 days, the gentle amber nudge) deliberately
 *     stays in place: it's a "heads up" not an "act now", and floating
 *     every row with two days left would churn the list far more than it
 *     helps. The line matches the soft-red band the tint draws — what
 *     reads as alarming is what gets lifted.
 *   - Urgent rows sort by remaining runway ASCENDING (most-negative /
 *     most-expired first, then the smallest hours-left), so the very top
 *     of the list is always the closest to permanent loss. Within an
 *     equal runway the original recency order is preserved (stable
 *     partition + stable sort).
 *   - The NON-urgent tail keeps its incoming order untouched (a partition,
 *     not a full re-sort), so the familiar newest-first reading of the
 *     bulk of the trash is unchanged — only the dangerous handful moves.
 *   - Floating urgent rows above the render cap is the point: db.listTrash
 *     is capped at 50 rendered rows, and the urgent rows were precisely
 *     the ones the old order pushed past that cap. Now they lead.
 *   - Generic over `{ deletedAt: number }` so it sorts TrashedClip[]
 *     in place of type without importing the full record shape, and
 *     returns a NEW array (never mutates the caller's list).
 *   - Defensive: a malformed `deletedAt` yields the "normal" tier from
 *     trash-ttl (never urgent), so a bad timestamp lands in the calm tail
 *     rather than throwing inside the render path.
 */

import { trashTtlState, DEFAULT_TRASH_RETENTION_MS } from "./trash-ttl";

/** The minimum shape this sorter needs off a trashed clip. */
export interface RunwaySortable {
  deletedAt: number;
}

/**
 * Reorder trashed clips so the about-to-purge rows lead the list.
 *
 * Urgent rows (imminent < 24h + already-expired, per lib/trash-ttl) float
 * to the top sorted most-urgent-first; every other row keeps its incoming
 * order (newest-deleted-first as db.listTrash returns them). Returns a new
 * array — the input is never mutated.
 *
 * @param items       trashed clips, in the order db.listTrash returned.
 * @param now         current time (injectable for tests).
 * @param retentionMs the safety window before permanent purge.
 */
export function sortTrashByRunway<T extends RunwaySortable>(
  items: ReadonlyArray<T>,
  now: number = Date.now(),
  retentionMs: number = DEFAULT_TRASH_RETENTION_MS,
): T[] {
  if (!Array.isArray(items) || items.length === 0) return [];

  // Annotate each row with its runway state once (single trash-ttl call
  // per row), preserving the incoming index so the partition + the
  // non-urgent tail stay stable.
  const annotated = items.map((item, index) => {
    const state = trashTtlState(item?.deletedAt as number, now, retentionMs);
    return { item, index, state };
  });

  const urgent = annotated.filter((a) => isUrgentTier(a.state.tier));
  const rest = annotated.filter((a) => !isUrgentTier(a.state.tier));

  // Most-urgent first: ascending remaining-ms (expired rows carry the
  // most-negative remaining, so they lead; then the fewest hours left).
  // Tie-break on the original index so equal-runway urgents keep their
  // recency order (stable).
  urgent.sort((a, b) => {
    const ra = numericRemaining(a.state.remainingMs);
    const rb = numericRemaining(b.state.remainingMs);
    if (ra !== rb) return ra - rb;
    return a.index - b.index;
  });

  // rest[] is already in incoming order (filter preserves it). Concatenate
  // the floated urgents ahead of the untouched tail.
  return [...urgent, ...rest].map((a) => a.item);
}

/**
 * Is this tier one we float to the top? The soft-red band (imminent +
 * expired) only — "soon" (amber) and "normal" stay in place. Matches the
 * line lib/trash-ttl draws for its warm-bg flag, so sort + tint agree.
 */
function isUrgentTier(tier: string): boolean {
  return tier === "imminent" || tier === "expired";
}

/**
 * Coerce a possibly-NaN remaining-ms into a sortable number. A malformed
 * deletedAt makes trash-ttl return remainingMs = NaN with the "normal"
 * tier — those never reach the urgent sort (filtered out above), but
 * guard anyway so a stray NaN can't poison the comparator.
 */
function numericRemaining(ms: number): number {
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}
