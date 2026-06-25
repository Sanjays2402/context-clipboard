/**
 * Range-selection helper for the clip list.
 *
 * Shift+Click is the universal "select everything between the last
 * thing I touched and this one" gesture (file explorers, Gmail,
 * Linear, every list UI worth its salt). The popup already supports
 * single-toggle selection (Cmd/Ctrl+Click, or plain click once a
 * selection exists) but had no way to grab a contiguous run without
 * clicking each row — painful when triaging 20 clips from one host.
 *
 * This module is the pure index-math core: given an anchor index
 * (the last row the user explicitly toggled) and a target index (the
 * row they just shift-clicked), return the inclusive list of indices
 * the range spans, in ascending order, regardless of click direction.
 *
 * It does NOT touch the DOM or the selection Set — the popup owns
 * that. Keeping the math pure means the sanity suite can hammer every
 * direction / bounds / degenerate case without a browser.
 *
 * Anchor semantics (decided here so the popup stays a thin caller):
 *   - The anchor is the row index of the user's MOST RECENT explicit
 *     single-toggle. A plain/Cmd-click sets it; a shift-click does
 *     NOT move it (so the user can shift-click A, then shift-click B
 *     to re-extend from the same anchor — matches Finder/Gmail).
 *   - When there's no anchor yet (first interaction is a shift-click),
 *     we treat the target itself as the anchor — the range is just
 *     that one row. Honest, non-surprising fallback.
 */

export interface RangeResult {
  /** Inclusive ascending indices the range covers. */
  indices: number[];
  /** Low end of the range (== first index). */
  from: number;
  /** High end of the range (== last index). */
  to: number;
}

/**
 * Compute the inclusive index range between `anchor` and `target`,
 * clamped to `[0, length)`. Direction-agnostic: shift-clicking
 * upward or downward from the anchor both produce an ascending list.
 *
 * Returns null when the inputs can't yield a real range:
 *   - length <= 0 (empty list)
 *   - target out of bounds after clamping is impossible (negative
 *     length already handled)
 * A null result tells the caller "fall back to a plain toggle".
 *
 * `anchor` may be null/undefined (no prior selection) — in that case
 * the range collapses to just the target row.
 */
export function computeRange(
  anchor: number | null | undefined,
  target: number,
  length: number,
): RangeResult | null {
  if (!Number.isFinite(target) || !Number.isFinite(length)) return null;
  if (length <= 0) return null;
  const max = length - 1;
  const t = clampIndex(Math.trunc(target), max);
  if (t < 0) return null;
  // No anchor → single-row "range".
  const rawAnchor =
    anchor == null || !Number.isFinite(anchor) ? t : clampIndex(Math.trunc(anchor), max);
  const from = Math.min(rawAnchor, t);
  const to = Math.max(rawAnchor, t);
  const indices: number[] = [];
  for (let i = from; i <= to; i++) indices.push(i);
  return { indices, from, to };
}

/** Clamp an index into [0, max]. Returns -1 only for a negative max. */
function clampIndex(i: number, max: number): number {
  if (max < 0) return -1;
  if (i < 0) return 0;
  if (i > max) return max;
  return i;
}

/**
 * Map a list of indices to the clip ids at those positions, skipping
 * any index that's out of range (defensive against a stale anchor
 * after the list re-rendered shorter). Pure projection helper so the
 * popup doesn't hand-roll the bounds check at the call site.
 */
export function idsForRange<T extends { id: string }>(
  items: T[],
  indices: number[],
): string[] {
  const out: string[] = [];
  for (const i of indices) {
    const item = items[i];
    if (item && typeof item.id === "string") out.push(item.id);
  }
  return out;
}

/**
 * Decide the SELECT vs DESELECT intent for a range, matching the
 * common file-manager behavior: a shift-click ADDS the range to the
 * selection (it never removes — extending a selection is the whole
 * point of the gesture). We still expose this as a named decision so
 * the contract is testable and the popup reads cleanly.
 *
 * Returns the ids that should be ADDED (those not already selected).
 * Already-selected ids in the range are left untouched — idempotent.
 */
export function rangeIdsToAdd(
  rangeIds: string[],
  alreadySelected: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  for (const id of rangeIds) {
    if (!alreadySelected.has(id)) out.push(id);
  }
  return out;
}
