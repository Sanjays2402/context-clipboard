/**
 * CSV-row formatter for the detail send-to menu — the spreadsheet
 * sibling of table-row (Markdown).
 *
 * `tableRowForClip` emits `| a | b | c |` for pasting into a Markdown
 * doc. But just as often the destination is a spreadsheet, a `.csv`,
 * or a tool that wants comma-separated values — there the pipes are
 * noise. This row takes the SAME single-line tabular body and emits
 * a clean RFC-4180-ish CSV row: `a,b,c`, quoting only the cells that
 * need it. Same detection gate as table-row (reuses looksLikeTableRow
 * + splitTableCells) so the two rows surface and hide together — if
 * "Copy as table row" shows, "Copy as CSV row" shows.
 *
 * Pure: no clipboard, no DOM. The popup writes the result.
 *
 * Quoting rules (RFC 4180): a cell is wrapped in double quotes when it
 * contains a comma, a double quote, or a newline; embedded quotes are
 * doubled (`"` -> `""`). Cells that need none are left bare so a simple
 * "a,b,c" round-trips byte-clean. A tab-delimited (TSV) body re-emits
 * as comma-separated, which is the whole point — normalising a pasted
 * spreadsheet row to CSV.
 */

import type { TableRowInput } from "./table-row";
import { looksLikeTableRow, splitTableCells } from "./table-row";

/** Quote one cell per RFC 4180 only when it carries comma/quote/newline. */
export function escapeCsvCell(value: string | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Build a CSV row from a single-line tabular clip, or undefined when
 * the body doesn't look tabular / collapses to one cell — identical
 * gate to tableRowForClip so the menu pairs the two rows. Output has
 * no trailing newline (the user is dropping one row into a larger set).
 */
export function csvRowForClip(c: TableRowInput): string | undefined {
  if (!looksLikeTableRow(c)) return undefined;
  const cells = splitTableCells(c.content);
  if (cells.length <= 1) return undefined;
  return cells.map(escapeCsvCell).join(",");
}
