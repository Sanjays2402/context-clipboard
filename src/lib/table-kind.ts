/**
 * Tabular-kind predicates for the `is:csv` / `is:tsv` search operators.
 *
 * The detail Send-to menu already surfaces "Copy as table row" / "Copy as
 * CSV row" / "Copy as TSV row" for clips whose single-line body reads as a
 * delimited row (`looksLikeTableRow`). But there was no way to FILTER the
 * list down to those clips — a user with a pile of pasted spreadsheet rows
 * couldn't ask "show me the comma-separated ones" the way they can ask for
 * is:code / is:prose / is:link.
 *
 * These two predicates close that gap with the SAME detection gate the
 * send-to rows use (`looksLikeTableRow` from table-row.ts), then split on
 * the delimiter that row-builder already prefers:
 *
 *   - `is:tsv` → a tabular row whose delimiter is a TAB (the cleanest,
 *     collision-free signal — exactly what splitTableCells reaches for
 *     first).
 *   - `is:csv` → a tabular row with NO tab but at least one comma (the
 *     CSV-style fallback splitTableCells uses).
 *
 * The pair PARTITIONS the looksLikeTableRow set: every tabular clip is
 * either tsv (has a tab) or csv (no tab, has a comma), never both, never
 * neither. So `is:csv` + `is:tsv` together === every clip the table-row
 * send-to rows light up for, and the filter agrees with the menu.
 *
 * Pure: no DOM, no clipboard. Shares TableRowInput + looksLikeTableRow with
 * table-row.ts so the filter and the send-to rows can never drift on what
 * counts as a tabular clip. Images / empty / multi-line bodies fail the
 * gate (a table ROW is one line) and match neither operator.
 */

import type { TableRowInput } from "./table-row";
import { looksLikeTableRow } from "./table-row";

const TAB_RE = /\t/;

/**
 * `is:tsv` — a single-line tabular body delimited by a TAB. Tab is the
 * cleanest tabular signal (no collision with prose commas), and it's the
 * delimiter splitTableCells reaches for first, so a clip matching here is
 * exactly one whose "Copy as TSV row" send-to row fires on the native
 * delimiter. Multi-line / image / empty / comma-only bodies don't match.
 */
export function tsvMatches(c: TableRowInput): boolean {
  if (!looksLikeTableRow(c)) return false;
  // looksLikeTableRow already trimmed + single-lined the body; re-trim
  // here so the predicate is self-contained for direct callers/tests.
  const body = (c.content || "").trim();
  return TAB_RE.test(body);
}

/**
 * `is:csv` — a single-line tabular body delimited by COMMAS (and NOT a
 * tab). The CSV-style branch of splitTableCells: when there's no tab, the
 * row splits on commas. Excluding tab-bearing bodies keeps the pair
 * disjoint (a body with a tab is is:tsv, never is:csv) so the two operators
 * partition the tabular set cleanly. Multi-line / image / empty bodies
 * don't match.
 */
export function csvMatches(c: TableRowInput): boolean {
  if (!looksLikeTableRow(c)) return false;
  const body = (c.content || "").trim();
  // Tab wins (TSV); a comma-only row is CSV. looksLikeTableRow already
  // guaranteed at least one delimiter, so "no tab" here implies a comma.
  return !TAB_RE.test(body);
}
