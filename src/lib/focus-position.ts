/**
 * Keyboard-focus position breadcrumb for the footer.
 *
 * The clip list is keyboard-navigable (↑/↓ move an "active" cursor row,
 * Enter copies it, X selects it, etc.). But for a keyboard-only user
 * there was no persistent readout of WHERE the cursor sits — after a
 * few ↓ presses in a long list you lose track of "am I at row 3 or 13?"
 * without counting highlighted rows by eye. Sighted-mouse users don't
 * need it (they see the highlight in context); keyboard users do.
 *
 * This module formats the compact "row N of M" breadcrumb that paints
 * in the footer next to the clip count. Pure — no DOM — so the popup
 * just renders the returned string (or hides the element on null) and
 * the contract stays testable.
 *
 * Design decisions:
 *   - 1-based for humans: the internal activeIndex is 0-based, but
 *     "row 1 of 28" reads naturally where "row 0 of 28" would not.
 *   - Returns null (hide the element) when there's nothing to point at:
 *     an empty list, or a cursor that's out of range (defensive against
 *     a stale activeIndex after the list re-rendered shorter). The
 *     footer count already says "0 clips" in the empty case, so a
 *     position breadcrumb would be redundant noise.
 *   - Clamps a slightly-out-of-range index INTO range rather than
 *     bailing, so a transient off-by-one during a re-render still shows
 *     a sane "row M of M" instead of flickering away. Only a wildly
 *     invalid index (negative, NaN) yields null.
 *   - The count uses the same plain integer the footer's "N clips" line
 *     uses — no thousands grouping here (the list window caps at 200
 *     rendered rows, so the number is always small).
 */

export interface FocusPositionInput {
  /** 0-based index of the active (keyboard-cursor) row. */
  activeIndex: number;
  /** Total number of rows currently in the list window. */
  total: number;
}

/**
 * Format the "row N of M" breadcrumb. Returns null when there's nothing
 * meaningful to show (empty list, or an un-clampable index).
 *
 * The active index is clamped into [0, total-1] so a transient stale
 * cursor during a re-render still produces a sane readout. A negative
 * or non-finite index, or a non-positive total, yields null.
 */
export function formatFocusPosition(
  input: FocusPositionInput | null | undefined,
): string | null {
  if (!input) return null;
  const { activeIndex, total } = input;
  if (!Number.isFinite(total) || total <= 0) return null;
  if (!Number.isFinite(activeIndex) || activeIndex < 0) return null;
  const t = Math.trunc(total);
  const clamped = Math.min(Math.max(0, Math.trunc(activeIndex)), t - 1);
  return `row ${clamped + 1} of ${t}`;
}
