/**
 * Scroll-shadow affordance state for horizontally-overflowing chip
 * strips (the quick-filter chips row, and any sibling that scrolls
 * sideways with a hidden scrollbar).
 *
 * The quick-chips row sets `scrollbar-width: none` (and hides the
 * webkit scrollbar) for a clean look — but that also removes the only
 * native cue that there's MORE content off the right edge. On a narrow
 * popup with many hosts, chips silently clip with no hint to scroll.
 * This module computes which edges should show a fade gradient so the
 * popup can paint a "there's more this way" affordance.
 *
 * Pure — it takes the three numbers any scroll container exposes
 * (scrollLeft / scrollWidth / clientWidth) and returns the edge state.
 * The popup reads those off the live element and toggles CSS classes;
 * keeping the math here means every threshold/rounding edge case is
 * exercised without a layout engine.
 *
 * Design decisions:
 *   - A small EPSILON (1px) absorbs sub-pixel rounding so a fully
 *     scrolled strip doesn't leave a 0.5px "more" fade lingering, and a
 *     non-overflowing strip (scrollWidth ~= clientWidth) shows neither
 *     fade. Browsers report fractional scroll metrics; exact equality
 *     would flicker.
 *   - `start` (left fade) shows once scrolled away from the origin;
 *     `end` (right fade) shows while there's still content past the
 *     right edge. Both can be true mid-scroll (content on both sides).
 *   - Non-overflowing content yields {start:false, end:false} — the
 *     caller hides both fades, leaving the row flush as before.
 */

export interface ScrollEdges {
  /** Show the leading (left) fade — content is hidden to the left. */
  start: boolean;
  /** Show the trailing (right) fade — content is hidden to the right. */
  end: boolean;
}

export interface ScrollMetrics {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

/** Sub-pixel slack so rounding doesn't leave a phantom fade. */
const EPSILON = 1;

/**
 * Compute which edge fades a horizontally-scrolling strip should show.
 *
 * Defensive against non-finite / negative inputs (a detached or
 * not-yet-laid-out element can report 0s or NaN) — those collapse to
 * "no fades", the safe flush state.
 *
 * NOTE: this assumes a left-to-right writing mode (the popup is LTR).
 * `scrollLeft` is the distance scrolled from the left origin; the max
 * is `scrollWidth - clientWidth`.
 */
export function computeScrollEdges(m: ScrollMetrics | null | undefined): ScrollEdges {
  if (!m) return { start: false, end: false };
  const { scrollLeft, scrollWidth, clientWidth } = m;
  if (
    !Number.isFinite(scrollLeft) ||
    !Number.isFinite(scrollWidth) ||
    !Number.isFinite(clientWidth)
  ) {
    return { start: false, end: false };
  }
  // Not overflowing at all → no fades.
  const maxScroll = scrollWidth - clientWidth;
  if (maxScroll <= EPSILON) return { start: false, end: false };
  const left = Math.max(0, scrollLeft);
  const start = left > EPSILON;
  const end = left < maxScroll - EPSILON;
  return { start, end };
}

/** Which way a page-scroll moves the strip. */
export type ScrollPageDirection = "start" | "end";

/**
 * Fraction of the visible width a single "page" scroll advances. Less
 * than 1 so a chip straddling the old edge stays partly visible after
 * the page — preserving the reading context (the user can see they've
 * moved, not teleported), the same overlap convention a PageDown leaves.
 */
export const PAGE_SCROLL_FRACTION = 0.8;

/**
 * Compute the target `scrollLeft` for paging a horizontally-scrolling
 * strip one "page" toward an edge (the click target of a page chevron
 * sitting on the faded overflow edge).
 *
 * Advances ~`PAGE_SCROLL_FRACTION` of the visible width in the requested
 * direction and CLAMPS to the valid range [0, scrollWidth - clientWidth],
 * so paging at either end lands flush against it rather than overscrolling.
 * The caller sets `el.scrollLeft = target` (optionally smooth).
 *
 * Defensive: non-finite / not-yet-laid-out metrics, or a non-overflowing
 * strip, yield the current `scrollLeft` (a no-op) rather than NaN — a
 * dead chevron simply doesn't move the strip.
 */
export function pageScrollTarget(
  m: ScrollMetrics | null | undefined,
  direction: ScrollPageDirection,
): number {
  if (!m) return 0;
  const { scrollLeft, scrollWidth, clientWidth } = m;
  if (
    !Number.isFinite(scrollLeft) ||
    !Number.isFinite(scrollWidth) ||
    !Number.isFinite(clientWidth)
  ) {
    return Number.isFinite(scrollLeft) ? scrollLeft : 0;
  }
  const maxScroll = Math.max(0, scrollWidth - clientWidth);
  if (maxScroll <= EPSILON) return Math.max(0, scrollLeft); // nothing to page
  const page = Math.max(1, clientWidth * PAGE_SCROLL_FRACTION);
  const delta = direction === "start" ? -page : page;
  const target = scrollLeft + delta;
  if (target < 0) return 0;
  if (target > maxScroll) return maxScroll;
  return target;
}
