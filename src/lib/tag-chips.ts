/**
 * Tag-list operations for the detail-view chip editor.
 *
 * The detail view edits a clip's tags through a single raw text input
 * ("comma,separated,tags"). That's fine for bulk edits but clumsy for
 * the common "drop just this one tag" gesture: the user has to find the
 * token in the middle of a comma string, select it plus the right
 * comma, and delete without leaving a dangling separator. A chip
 * editor — each tag as a pill with an × — makes removal one click.
 *
 * This module is the pure list core behind that editor: parse the raw
 * input into a clean tag array, remove a tag, add a tag, and re-
 * serialise back to the comma string the existing input + storage path
 * expect. No DOM — the popup renders the chips and owns the IDB write;
 * keeping the set math here means dedupe / case / whitespace edge cases
 * are exercised headless and the chip editor + the raw input can never
 * disagree on what the tag list IS.
 *
 * Design decisions:
 *   - Tags are compared CASE-INSENSITIVELY for dedupe + removal (a clip
 *     shouldn't carry both "Code" and "code"), but the FIRST-SEEN
 *     casing is preserved in the output — matching how db.updateTags
 *     dedupes via a Set of trimmed values, just with a case-fold so the
 *     chip editor doesn't silently keep a near-duplicate the storage
 *     layer would also collapse.
 *   - Order is preserved (first occurrence wins). The chip row reads
 *     left-to-right in the order the user added tags, which is the
 *     order the comma string already implies.
 *   - Empty / whitespace-only tokens are dropped (a trailing comma in
 *     the input doesn't create a blank chip).
 *   - `removeTag` and `addTag` both return NEW arrays (no mutation) so
 *     the caller's previous reference stays stable — important when the
 *     popup holds the pre-edit list for an undo/refresh path.
 *   - Defensive against nullish input throughout: a malformed value
 *     yields an empty list rather than throwing inside detail paint.
 */

/**
 * Parse a raw comma-separated tag string into a clean, de-duplicated,
 * order-preserving array. Mirrors the popup's existing inline
 * split/trim/filter, plus a case-insensitive dedupe so the chip editor
 * and the storage layer agree on the canonical set.
 */
export function parseTags(raw: string | null | undefined): string[] {
  if (typeof raw !== "string") return [];
  return dedupe(
    raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  );
}

/**
 * Remove `tag` from `tags` (case-insensitive match). Returns a new
 * array; the input is never mutated. A tag not present is a no-op
 * (returns a deduped copy of the input).
 */
export function removeTag(
  tags: ReadonlyArray<string> | null | undefined,
  tag: string | null | undefined,
): string[] {
  const list = sanitizeList(tags);
  if (typeof tag !== "string") return list;
  const needle = tag.trim().toLowerCase();
  if (needle === "") return list;
  return list.filter((t) => t.toLowerCase() !== needle);
}

/**
 * Add `tag` to the end of `tags` if it isn't already present
 * (case-insensitive). Returns a new array; an empty / duplicate tag is
 * a no-op (returns a deduped copy). Trims the incoming tag.
 */
export function addTag(
  tags: ReadonlyArray<string> | null | undefined,
  tag: string | null | undefined,
): string[] {
  const list = sanitizeList(tags);
  if (typeof tag !== "string") return list;
  const trimmed = tag.trim();
  if (trimmed === "") return list;
  const exists = list.some((t) => t.toLowerCase() === trimmed.toLowerCase());
  return exists ? list : [...list, trimmed];
}

/**
 * Serialise a tag array back to the canonical comma string the detail
 * input + db.updateTags consume ("a, b, c"). Deduped + cleaned first so
 * the round-trip parse(serialise(x)) === clean(x).
 */
export function serializeTags(tags: ReadonlyArray<string> | null | undefined): string {
  return sanitizeList(tags).join(", ");
}

/**
 * Move the tag at `fromIndex` to sit before/after `toIndex`, returning a
 * new cleaned array. Powers drag-to-reorder on the detail chip row: the
 * chip order IS the comma-string order, so reordering chips lets the
 * user rearrange a clip's tags without retyping the whole input.
 *
 * Semantics:
 *   - The tag at `fromIndex` is spliced out, then re-inserted at the
 *     position of `toIndex` (after the removal shifts indices). When
 *     `before` is false the insert lands AFTER the target, matching the
 *     drop-edge the popup computes from the pointer x vs the chip's
 *     midpoint (same model as the saved-search / search-history DnD).
 *   - Indices are taken against the CLEANED list (parse/dedupe first) so
 *     the caller can pass raw chip dataset indices and they line up with
 *     what's rendered.
 *   - A no-op move (from === to, or an out-of-range index) returns the
 *     cleaned list unchanged — the DnD drop handler can call this
 *     unconditionally and only persist when the result differs.
 *
 * Never mutates the input; defensive against nullish / malformed lists
 * (yields []) so a drop during a transient empty render can't throw.
 */
export function reorderTags(
  tags: ReadonlyArray<string> | null | undefined,
  fromIndex: number,
  toIndex: number,
  before: boolean,
): string[] {
  const list = sanitizeList(tags);
  const n = list.length;
  if (
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    fromIndex < 0 ||
    fromIndex >= n ||
    toIndex < 0 ||
    toIndex >= n
  ) {
    return list;
  }
  if (fromIndex === toIndex) return list;
  const moved = list[fromIndex];
  // Remove the source first; this shifts every index after it left by 1.
  const without = list.slice(0, fromIndex).concat(list.slice(fromIndex + 1));
  // Locate the target tag in the post-removal list to get a stable
  // insertion anchor (its index may have shifted when fromIndex < toIndex).
  const targetTag = list[toIndex];
  let insertAt = without.indexOf(targetTag);
  if (insertAt < 0) insertAt = without.length; // defensive: append
  if (!before) insertAt += 1;
  without.splice(insertAt, 0, moved);
  return without;
}

/** Clean + dedupe an arbitrary tag array (drop blanks, case-fold dedupe). */
function sanitizeList(tags: ReadonlyArray<string> | null | undefined): string[] {
  if (!Array.isArray(tags)) return [];
  return dedupe(
    tags
      .map((t) => (typeof t === "string" ? t.trim() : ""))
      .filter(Boolean),
  );
}

/** Order-preserving, case-insensitive dedupe (first casing wins). */
function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of list) {
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}
