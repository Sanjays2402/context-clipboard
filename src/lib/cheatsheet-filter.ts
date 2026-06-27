/**
 * Cheatsheet shortcut-filter model.
 *
 * The keyboard cheatsheet (press `?`) has grown to six groups and ~30
 * rows — long enough that finding "the lock shortcut" or "what does
 * is:thisweek do" means scanning the whole wall. A live filter input at
 * the top fixes that: type "lock" and only the matching rows survive,
 * with empty groups hidden and a "no matches" note when nothing fits.
 *
 * This module owns the PURE side: given a row's searchable text and the
 * filter query, decide whether the row matches. No DOM — the popup walks
 * the rendered `.cheatsheet-row` nodes, reads each one's text via
 * `cheatsheetRowText`, asks `cheatsheetRowMatches`, and toggles
 * visibility + the empty-group / no-match chrome itself.
 *
 * Design decisions:
 *   - Match is a case-insensitive SUBSTRING over the row's combined
 *     "<keys> <description>" text, so "lock", "Lock", "is:" and "image"
 *     all land. Substring (not token/fuzzy) keeps the contract obvious:
 *     what you type is literally somewhere in the row.
 *   - An EMPTY / whitespace-only query matches everything (the filter is
 *     "off"), so clearing the box restores the full sheet.
 *   - The query is trimmed but NOT collapsed internally — a user typing
 *     "is:this" should match "is:thisweek", and trimming the ends is
 *     enough; we don't want to silently eat a space the user put between
 *     two words they're hunting as a phrase.
 *   - Defensive: nullish row text never matches a non-empty query (it's
 *     just an empty haystack); nullish query is treated as "off".
 */

/**
 * Normalise a query for matching: trim the ends, lowercase. An empty or
 * whitespace-only query becomes "" (the "filter off" sentinel).
 */
export function normaliseCheatFilter(query: string | null | undefined): string {
  if (typeof query !== "string") return "";
  return query.trim().toLowerCase();
}

/**
 * The searchable text for a row = its key labels + its description,
 * joined with a space and lowercased. The popup passes the row's
 * `textContent` (which already concatenates the <kbd> glyphs + the
 * <span> description); this helper just normalises it so the matcher
 * has one shape to compare against.
 */
export function cheatsheetRowText(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "";
  // Collapse runs of whitespace (textContent often carries newlines +
  // indentation between the kbd/span children) to single spaces so a
  // phrase match isn't broken by layout whitespace.
  return raw.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * True when `rowText` matches the (already-normalised) `query`. An empty
 * query matches everything (filter off). A non-empty query is a
 * case-insensitive substring test against the row text.
 *
 * @param rowText  the row's combined text, ideally via cheatsheetRowText.
 * @param query    the filter, ideally via normaliseCheatFilter.
 */
export function cheatsheetRowMatches(
  rowText: string | null | undefined,
  query: string | null | undefined,
): boolean {
  const q = normaliseCheatFilter(query);
  if (!q) return true; // filter off -> everything shows
  const hay = cheatsheetRowText(rowText);
  if (!hay) return false; // empty row can't match a non-empty needle
  return hay.includes(q);
}
