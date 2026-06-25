/**
 * Index math for stepping the detail-view prev/next navigation through
 * the currently-filtered clip list — with optional wrap-around.
 *
 * The detail view has [ / ] (and on-screen chevrons) to walk to the
 * previous / next clip in the filtered list. Historically it dead-ended:
 * at the last clip, "next" was disabled and pressing ] did nothing. The
 * in-page "similar clips" traversal already CYCLES (last → first), so a
 * dead-end on the main list was an inconsistency — and a papercut when
 * reviewing a short filter result ("show me everything from this host")
 * where the user wants to keep tapping ] to loop around.
 *
 * This module is the pure index core: given the current index, a
 * direction, the list length, and whether wrap is enabled, it returns
 * the target index plus whether the step WRAPPED around an edge (so the
 * caller can surface a subtle "looped" toast). No DOM, no clip objects —
 * just the arithmetic, so every boundary case is exercised headless.
 *
 * Design decisions:
 *   - Wrap is OPT-IN via the `wrap` flag, but the popup passes `true`
 *     (wrap is the new default, matching the similar-nav cycle). With
 *     wrap off, a step past an edge returns null — the legacy
 *     dead-end / disabled-button behaviour, preserved for callers that
 *     want it.
 *   - Wrapping only happens at the EDGES: stepping forward from the last
 *     row lands on row 0 (wrapped:true); stepping back from row 0 lands
 *     on the last row (wrapped:true). A step in the middle never wraps.
 *   - A single-item list (length 1) has nowhere to step: every call
 *     returns null regardless of wrap (looping onto yourself is a no-op
 *     the caller shouldn't bother re-rendering for). The on-screen
 *     buttons disable in that case.
 *   - Defensive: a non-finite / negative length, a non-finite current
 *     index, or a current index out of range yields null. Direction must
 *     be -1 or 1; anything else yields null.
 */

export interface DetailStep {
  /** The target list index after the step. */
  index: number;
  /** True when the step crossed an edge (last→first or first→last). */
  wrapped: boolean;
}

/**
 * Compute the next detail index for a prev/next step.
 *
 * @param current   0-based index of the clip currently open in detail.
 * @param direction -1 for previous, +1 for next.
 * @param total     number of clips in the filtered list.
 * @param wrap      when true, stepping past an edge loops to the other
 *                  end (and marks `wrapped`); when false, an edge step
 *                  returns null (dead-end).
 *
 * Returns the target {index, wrapped}, or null when there's no valid
 * step (bad inputs, single-item list, or an edge step with wrap off).
 */
export function nextDetailIndex(
  current: number,
  direction: -1 | 1,
  total: number,
  wrap: boolean,
): DetailStep | null {
  if (direction !== -1 && direction !== 1) return null;
  if (!Number.isFinite(total)) return null;
  const t = Math.trunc(total);
  if (t <= 1) return null; // empty or single-item — nowhere to go.
  if (!Number.isFinite(current)) return null;
  const cur = Math.trunc(current);
  if (cur < 0 || cur > t - 1) return null;

  const raw = cur + direction;
  if (raw >= 0 && raw <= t - 1) {
    // In-range step — no wrap.
    return { index: raw, wrapped: false };
  }
  // We're stepping off an edge.
  if (!wrap) return null;
  // Modulo into range: forward off the end → 0; back off the start → last.
  const wrapped = raw < 0 ? t - 1 : 0;
  return { index: wrapped, wrapped: true };
}

/**
 * Toast text for a wrap-around step, so the loop is non-surprising.
 * Forward wrap (onto row 0) reads "Looped to the first clip"; backward
 * wrap (onto the last row) reads "Looped to the last clip". The caller
 * only shows this when `wrapped` is true.
 */
export function formatWrapToast(direction: -1 | 1): string {
  return direction === 1 ? "Looped to the first clip" : "Looped to the last clip";
}
