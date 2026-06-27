/**
 * Cheatsheet roving-focus navigation model.
 *
 * The keyboard cheatsheet (`?`) focuses its filter input on open so a
 * user can immediately type to narrow the ~30 shortcut rows. But once
 * they've filtered to a handful, there's no keyboard way to step DOWN
 * into the surviving rows — the input swallows ArrowDown (moving the text
 * caret, which does nothing in a one-line field). A keyboard-only user is
 * stranded at the input. This module is the pure decision behind a roving
 * highlight: ArrowDown from the input drops onto the first visible row,
 * ArrowDown/Up step the highlight through the surviving rows, and ArrowUp
 * off the top row returns focus to the input.
 *
 * No DOM — the popup collects the indices of the currently-visible
 * (non-hidden) rows, tracks which one is highlighted (or none, meaning
 * the input has focus), and asks this module "given ArrowDown/ArrowUp,
 * where does focus go next?". Keeping the index math here means every
 * boundary (empty result set, top/bottom edges, a stale highlight after
 * the filter shrank the set) is exercised headless.
 *
 * Design decisions:
 *   - Focus has two zones: the INPUT (highlight === null) and a ROW
 *     (highlight is an index into the visible-rows array). The model
 *     speaks in that vocabulary via `CheatNavTarget`: `{ kind: "input" }`
 *     or `{ kind: "row", index }`. The popup maps a row index back to the
 *     actual node and calls `.focus()`.
 *   - ArrowDown from the input -> first visible row (index 0). ArrowDown
 *     on the last row STAYS on the last row (no wrap) — wrapping back to
 *     the input on a down-press is surprising; the user pressed DOWN to
 *     go further down. ArrowUp on the first row -> back to the input (the
 *     natural "escape upward" to keep typing). ArrowUp in the input is a
 *     no-op (already at the top).
 *   - Operates on the VISIBLE row set only (the popup filters out hidden
 *     rows before calling), so the highlight only ever lands on a row the
 *     user can actually see. When the visible set is empty (filter
 *     matched nothing), ArrowDown keeps focus in the input — there's
 *     nowhere to go.
 *   - Defensive: a highlight index outside the current visible range
 *     (the filter shrank the set out from under it) is treated as "no
 *     valid row" and ArrowDown re-enters at the top, ArrowUp returns to
 *     the input — so a stale index can never focus a hidden row.
 */

/** Where keyboard focus should land: the filter input, or a visible row. */
export type CheatNavTarget =
  | { kind: "input" }
  | { kind: "row"; index: number };

/** The two navigation keys this model answers to. */
export type CheatNavKey = "ArrowDown" | "ArrowUp";

/**
 * Compute the next focus target for a roving-highlight key press.
 *
 * @param key        the arrow key pressed ("ArrowDown" / "ArrowUp").
 * @param current    the current highlight: `null` when the INPUT is
 *                   focused, otherwise the index into the visible-rows
 *                   array that's highlighted.
 * @param visibleCount  how many rows are currently visible (>= 0).
 *
 * Returns the target zone — `{ kind: "input" }` or `{ kind: "row",
 * index }` — or `null` when the press should be IGNORED (no movement,
 * e.g. ArrowUp while already in the input, or any nav with zero visible
 * rows). The popup only `preventDefault()`s + moves focus when a non-null
 * target comes back, so a no-op press still lets the input handle the key
 * natively (harmless for a one-line field, but correct).
 */
export function cheatsheetRowNav(
  key: CheatNavKey,
  current: number | null,
  visibleCount: number,
): CheatNavTarget | null {
  const count = Number.isFinite(visibleCount) && visibleCount > 0 ? Math.floor(visibleCount) : 0;
  // Nothing to step into — keep focus where it is (the input).
  if (count === 0) return null;
  // Normalise a stale / out-of-range highlight to "in the input": the
  // filter may have shrunk the visible set below the old index, and we
  // must never report a row that's no longer visible.
  const inInput = current === null || !Number.isInteger(current) || current < 0 || current >= count;

  if (key === "ArrowDown") {
    if (inInput) return { kind: "row", index: 0 }; // enter at the top row
    const next = (current as number) + 1;
    // Clamp at the last row (no wrap on a down-press).
    if (next >= count) return { kind: "row", index: count - 1 };
    return { kind: "row", index: next };
  }

  // ArrowUp
  if (inInput) return null; // already at the top — no-op
  const idx = current as number;
  if (idx <= 0) return { kind: "input" }; // off the top row -> back to input
  return { kind: "row", index: idx - 1 };
}
