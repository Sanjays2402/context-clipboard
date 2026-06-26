/**
 * Keyboard focus math for the detail-view tag-chip editor.
 *
 * The chip editor (lib/tag-chips + renderDetailTagChips) renders each
 * tag as a pill with an × button. Shipping that made REMOVAL one click
 * for mouse users — but a keyboard-only user still had to Tab through
 * every chip's × in order, and after pressing Enter to remove one the
 * focus fell to wherever the DOM happened to land (often the document
 * body, because the focused button was just deleted). That's a dead
 * end: you remove a tag and lose your place in the row.
 *
 * This module is the pure focus-index core behind real keyboard UX on
 * the chip row:
 *   - ←/→/Home/End move focus between chips (a roving-tabindex toolbar,
 *     the standard ARIA pattern), and
 *   - Backspace/Delete on a focused chip removes it AND lands focus on
 *     a sensible neighbour so the user can keep deleting without
 *     reaching for the mouse.
 *
 * No DOM — the popup owns the actual `.focus()` calls and the IDB
 * write; keeping the index arithmetic here means every boundary
 * (removing the last chip, emptying the row, an out-of-range cursor
 * after a re-render) is exercised headless and the chip row can never
 * disagree with itself about where focus should go.
 *
 * Design decisions:
 *   - Arrow navigation CLAMPS at the ends rather than wrapping. A chip
 *     row is a short linear group; wrapping first<->last on a single
 *     arrow press is disorienting (you press ← at the start and jump to
 *     the far end). Home/End give the deliberate jump-to-edge gesture.
 *     This matches the WAI-ARIA toolbar keyboard pattern.
 *   - After a removal, focus moves to the chip that SLID INTO the
 *     removed slot (same visual position, next tag to its right) — the
 *     natural "keep going" target. Removing the LAST chip falls back to
 *     the new last chip (the one to its left). Emptying the row returns
 *     -1, the popup's signal to move focus to the raw tag input (the
 *     only thing left to interact with).
 *   - Every function is defensive against a non-finite / out-of-range
 *     index and a non-positive count, clamping into range rather than
 *     throwing inside a keydown handler.
 */

/** Keys this module knows how to resolve into a target chip index. */
export type ChipNavKey = "ArrowLeft" | "ArrowRight" | "Home" | "End";

/**
 * Resolve the chip index keyboard focus should move to, given the
 * current focused index and a navigation key.
 *
 *   - ArrowLeft  -> one chip toward the start (clamped at 0)
 *   - ArrowRight -> one chip toward the end (clamped at count-1)
 *   - Home       -> the first chip (0)
 *   - End        -> the last chip (count-1)
 *
 * Returns -1 when there are no chips to focus (count <= 0). A
 * non-finite / out-of-range `current` is first clamped into
 * [0, count-1] so a stale cursor after a re-render still steps
 * sanely instead of jumping to an edge.
 */
export function nextChipFocusIndex(
  count: number,
  current: number,
  key: ChipNavKey,
): number {
  const n = safeCount(count);
  if (n === 0) return -1;
  const cur = clampIndex(current, n);
  switch (key) {
    case "ArrowLeft":
      return Math.max(0, cur - 1);
    case "ArrowRight":
      return Math.min(n - 1, cur + 1);
    case "Home":
      return 0;
    case "End":
      return n - 1;
    default:
      return cur;
  }
}

/**
 * Index to focus AFTER removing the chip at `removedIndex` from a list
 * that had `countBefore` chips.
 *
 * The new list has `countBefore - 1` chips. We focus the chip that now
 * occupies the removed slot (the tag that was to its right slides
 * left), so the user's cursor stays in the same visual position and
 * they can keep pressing Backspace to delete the next one. When the
 * removed chip was the LAST one, there's nothing to its right, so we
 * fall back to the new last index (the chip to its left).
 *
 * Returns -1 when the removal empties the row (countBefore <= 1) — the
 * popup's cue to move focus to the raw tag input instead. Also returns
 * -1 for an out-of-range / non-finite `removedIndex` against the given
 * count, since there's no well-defined neighbour to land on.
 */
export function focusIndexAfterRemove(
  countBefore: number,
  removedIndex: number,
): number {
  const n = safeCount(countBefore);
  if (n <= 1) return -1; // removed the only chip (or nothing left) -> input
  if (!Number.isInteger(removedIndex) || removedIndex < 0 || removedIndex >= n) {
    return -1;
  }
  const after = n - 1; // size of the new list
  // The chip at `removedIndex` is gone; the one that was at
  // removedIndex+1 now sits at removedIndex. Focus it — unless we
  // removed the last chip, in which case clamp to the new last.
  return Math.min(removedIndex, after - 1);
}

/** True when `key` is a chip-navigation key this module resolves. */
export function isChipNavKey(key: string): key is ChipNavKey {
  return (
    key === "ArrowLeft" ||
    key === "ArrowRight" ||
    key === "Home" ||
    key === "End"
  );
}

/**
 * Resolve where a focused chip should MOVE to when the user reorders it
 * with Ctrl/Cmd+ArrowLeft / Ctrl/Cmd+ArrowRight — the keyboard-only
 * counterpart to drag-to-reorder on the chip row.
 *
 * Returns the destination index the chip at `current` should occupy
 * after the move, given `count` chips total:
 *   - Ctrl+ArrowLeft  -> current - 1 (one slot toward the start)
 *   - Ctrl+ArrowRight -> current + 1 (one slot toward the end)
 *
 * CLAMPS at the ends (no wrap): a chip already at index 0 can't move
 * further left, so the call is a no-op that returns the same index —
 * the caller checks `to === from` and skips the write/re-render. This
 * matches the arrow-navigation clamp + the WAI-ARIA reorder pattern
 * (Home/End aren't reorder keys; only the single-step arrows move a
 * chip, mirroring the drag's one-position-at-a-time feel is unnecessary
 * — keyboard users can repeat the chord).
 *
 * Returns -1 when there's nothing to move (count <= 1: a single chip,
 * or none). A non-finite / out-of-range `current` is clamped into
 * [0, count-1] first so a stale cursor still moves sanely.
 */
export function reorderChipTargetIndex(
  count: number,
  current: number,
  key: "ArrowLeft" | "ArrowRight",
): number {
  const n = safeCount(count);
  if (n <= 1) return -1;
  const cur = clampIndex(current, n);
  if (key === "ArrowLeft") return Math.max(0, cur - 1);
  if (key === "ArrowRight") return Math.min(n - 1, cur + 1);
  return cur;
}

/** True when `key` is a single-step reorder arrow (ArrowLeft/ArrowRight). */
export function isChipReorderKey(
  key: string,
): key is "ArrowLeft" | "ArrowRight" {
  return key === "ArrowLeft" || key === "ArrowRight";
}

/** True when `key` should remove the focused chip (Backspace / Delete). */
export function isChipRemoveKey(key: string): boolean {
  return key === "Backspace" || key === "Delete";
}

/** Coerce an arbitrary count to a non-negative integer. */
function safeCount(count: number): number {
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.trunc(count);
}

/** Clamp an index into [0, count-1]; bad input snaps to 0. */
function clampIndex(index: number, count: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(0, Math.trunc(index)), count - 1);
}
