/**
 * TSV-row formatter for the detail send-to menu — the tab-delimited
 * sibling of csv-row (commas) and table-row (Markdown pipes).
 *
 * Same single-line tabular body, three destinations: a Markdown doc
 * wants `| a | b | c |`, a CSV file wants `a,b,c`, and pasting into a
 * spreadsheet / many web inputs wants TAB-separated `a<TAB>b<TAB>c` —
 * the cleanest round-trip into Excel / Sheets / Numbers cells. This
 * row emits that, reusing the SAME detection gate (looksLikeTableRow)
 * and cell split (splitTableCells) so all three table-paste rows
 * surface and hide together.
 *
 * Pure: no clipboard, no DOM. The popup writes the result.
 *
 * Cell sanitising: a TAB inside a cell value would create a spurious
 * column on paste, so each cell's interior whitespace runs collapse to
 * a single space (matching the Markdown escapeCell spirit). Cells are
 * joined with a single real tab. No surrounding quotes — TSV's whole
 * appeal is the bare, separator-free cell payload that pastes one cell
 * per column. A CSV/comma body re-emits as tab-separated, normalising
 * a pasted comma row straight into the clipboard for spreadsheet paste.
 */

import type { TableRowInput } from "./table-row";
import { looksLikeTableRow, splitTableCells } from "./table-row";

/** Collapse a cell's whitespace so an embedded tab can't add a column. */
export function sanitizeTsvCell(value: string | null | undefined): string {
  if (value == null) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

/**
 * Build a TSV row from a single-line tabular clip, or undefined when
 * the body doesn't look tabular / collapses to one cell — identical
 * gate to tableRowForClip + csvRowForClip so the three pair. No
 * trailing newline (one row dropped into a larger paste).
 */
export function tsvRowForClip(c: TableRowInput): string | undefined {
  if (!looksLikeTableRow(c)) return undefined;
  const cells = splitTableCells(c.content);
  if (cells.length <= 1) return undefined;
  return cells.map(sanitizeTsvCell).join("\t");
}
