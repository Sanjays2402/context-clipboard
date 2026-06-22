/**
 * Similar-traversal nav stack.
 *
 * When the user opens detail view and sees the "Similar" sidekick list,
 * they often want to scan all of them, not just the top hit. Clicking
 * individual rows works but loses the prev/next nav (since similar
 * matches may not be in `currentClips`, the list-position pill hides).
 *
 * This module models the *alternate* navigation mode: when active, the
 * detail-view's prev/next walk a fixed ordered slice (the similar set
 * snapshot at the moment the user opted in), and the position pill
 * reads "Similar 2 / 5". Exiting the mode (Back, navigate to a clip
 * NOT in the stack, or explicit Esc) returns to list-mode nav.
 *
 * Pure module. The popup owns the actual state slot; this module
 * provides the math + label formatters.
 */

export interface SimilarNav {
  /** Ordered ids — the snapshot of the similar set at opt-in time. */
  ids: string[];
  /** Index of the currently-open id within `ids`. */
  index: number;
  /** Id of the pivot the user opened "all similar" from — surfaced
   *  in the position pill tooltip so the user remembers the anchor. */
  pivotId: string;
}

/**
 * Construct a fresh nav stack from a similar-result list. The first id
 * becomes the open clip; index starts at 0. Returns null when the list
 * is empty (caller falls back to single-clip openDetail).
 *
 * Defensive: filters non-string ids, drops empties, dedupes (a similar-
 * results list with the pivot accidentally re-included would otherwise
 * make prev/next jump back to the anchor surprisingly).
 */
export function buildSimilarNav(
  rawIds: unknown,
  pivotId: string,
): SimilarNav | null {
  if (!Array.isArray(rawIds)) return null;
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const raw of rawIds) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    // Defensive: skip the pivot id if it slipped into the similar
    // results — opening "all similar" should leap *away* from the
    // pivot, not loop back.
    if (trimmed === pivotId) continue;
    seen.add(trimmed);
    ids.push(trimmed);
  }
  if (ids.length === 0) return null;
  return { ids, index: 0, pivotId };
}

/**
 * Step `nav` forward / backward and return the new id + index. When
 * the step would go past either end we WRAP (mirrors next-archived
 * cycle semantics) so the user can keep tapping prev/next without the
 * cycle "ending". Returns null when the stack is empty (defensive).
 */
export function stepSimilarNav(
  nav: SimilarNav,
  direction: "prev" | "next",
): { id: string; index: number } | null {
  if (!nav || nav.ids.length === 0) return null;
  const len = nav.ids.length;
  const delta = direction === "next" ? 1 : -1;
  // Modular arithmetic that handles negative wraps correctly:
  //   ((-1) + 5) % 5 === 4 ✓
  const nextIndex = (((nav.index + delta) % len) + len) % len;
  return { id: nav.ids[nextIndex], index: nextIndex };
}

/**
 * Format the position pill label — "Similar 2 / 5".
 *
 * Returns null when the nav is empty (caller hides the pill). Mirrors
 * the list-mode "2 / 17" shape but with the "Similar" prefix so the
 * user knows they're in alt-mode.
 */
export function formatSimilarPosLabel(nav: SimilarNav | null): string | null {
  if (!nav || nav.ids.length === 0) return null;
  // index is 0-based; display is 1-based.
  return `Similar ${nav.index + 1} / ${nav.ids.length}`;
}

/**
 * Format the "Open all (N)" button label. Returns null when there's
 * fewer than 2 similar matches (single-match similar doesn't need a
 * traversal mode — the user can just click the row).
 */
export function formatTraverseButtonLabel(matchCount: number): string | null {
  if (!Number.isFinite(matchCount) || matchCount < 2) return null;
  return `Open all (${matchCount})`;
}

/**
 * Predicate: does the nav stack contain this id? Used to decide
 * whether opening a given clip-id should EXIT the traversal mode
 * (id not in stack -> user navigated away, drop nav) or RESYNC the
 * index (id in stack -> user clicked a different similar row, keep
 * the stack but move the cursor).
 */
export function isInSimilarNav(nav: SimilarNav | null, id: string): boolean {
  if (!nav || !id) return false;
  return nav.ids.includes(id);
}

/**
 * Resync the nav index to the given id. Returns a new SimilarNav with
 * the updated index. Returns null when the id isn't in the stack
 * (caller treats as "exit traversal mode").
 */
export function syncSimilarNav(
  nav: SimilarNav,
  id: string,
): SimilarNav | null {
  if (!nav || !id) return null;
  const idx = nav.ids.indexOf(id);
  if (idx < 0) return null;
  return { ...nav, index: idx };
}
