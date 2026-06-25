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
