/**
 * Markdown-table-row formatter for the detail send-to menu.
 *
 * For text clips whose body looks like a single row of tab- or
 * comma-separated values (TSV / CSV-ish), produce a Markdown table
 * row: "| col1 | col2 | col3 |". Useful workflow: copy a row from
 * a spreadsheet / log table, then drop it into a Markdown doc /
 * PR comment / wiki page as part of a growing table.
 *
 * Pure: no clipboard, no DOM. The popup calls this from the
 * send-to action builder; the resulting string (when defined)
 * goes straight through navigator.clipboard.writeText.
 *
 * Detection rules — keep the row OUT of the menu unless we're
 * confident the format applies:
 *   - Image / empty clips → undefined.
 *   - Multi-line content → undefined (a table ROW is a single line;
 *     multi-row pastes should use the user's spreadsheet's native
 *     export, not a single-row formatter).
 *   - Single-line content with no obvious delimiter → undefined
 *     (don't surface "Copy as table row" for a plain sentence).
 *   - Single value with no delimiter → undefined (a one-cell row
 *     is degenerate; user can just type the cell themselves).
 *
 * Delimiter precedence: tab wins (TSV is the cleanest signal — no
 * collision with prose); otherwise we split on commas with optional
 * surrounding whitespace so "a,b,c" and "a, b, c" and the messy
 * "a,b, c" all produce the same cells. One unified rule matches user
 * intent better than two separate cases — when someone types a
 * tabular row they don't care whether the spacing is consistent,
 * they care that each cell ends up in its own column.
 *
 * Cell escaping: pipe chars inside cells break Markdown tables, so
 * we replace pipe → \\| (standard MD escape). Trailing whitespace
 * is trimmed per cell so " foo " becomes "foo" — most spreadsheet
 * pastes carry a trailing space the user doesn't want preserved.
 */

import type { ClipItem } from "./types";

export interface TableRowInput {
  kind: ClipItem["kind"];
  content: string;
}

const TAB_RE = /\t/;
const PIPE_RE = /\|/g;

/**
 * Decide whether the clip looks like a tabular row. Exposed so the
 * caller can pre-check before showing a "Copy as table row" hint.
 */
export function looksLikeTableRow(c: TableRowInput): boolean {
  if (c.kind === "image") return false;
  const body = (c.content || "").trim();
  if (!body) return false;
  // Must be single-line. Multi-row content needs the user's
  // spreadsheet export; we don't pretend to handle that here.
  if (/\n/.test(body)) return false;
  // At least one delimiter.
  if (TAB_RE.test(body)) return true;
  // CSV-style: at least one comma. We DON'T require comma+space
  // because real exports often use bare commas.
  return /,/.test(body);
}

/**
 * Split a single-line tabular body into cells. Tab first (TSV),
 * otherwise commas with optional surrounding whitespace. Returned
 * cells are trimmed; empty cells preserved so ",,foo" honestly
 * renders as "|  |  | foo |".
 */
export function splitTableCells(body: string): string[] {
  const trimmed = body.trim();
  if (!trimmed) return [];
  if (TAB_RE.test(trimmed)) {
    return trimmed.split("\t").map((c) => c.trim());
  }
  // Single comma-split rule swallows optional surrounding spaces so
  // mixed inputs ("a,b, c") still cell-align correctly.
  return trimmed.split(/\s*,\s*/).map((c) => c.trim());
}

/**
 * Wrap one cell value so it's safe inside a Markdown table cell.
 * Escapes pipe chars; collapses internal whitespace runs to a
 * single space so "foo\\tbar" (if a cell got pre-mangled) doesn't
 * break alignment. Returns an empty string for nullish input so
 * the row stays uniform across columns.
 */
export function escapeCell(value: string | null | undefined): string {
  if (value == null) return "";
  return String(value).replace(PIPE_RE, "\\|").replace(/\s+/g, " ").trim();
}

/**
 * Build the final Markdown table row string. Returns undefined
 * when the clip doesn't look like a tabular row, OR when the row
 * would collapse to a single cell after splitting (we already
 * filter for at-least-one-delimiter via looksLikeTableRow, but
 * pathological inputs like a body that's literally just "," can
 * split to ["", ""] — we still emit those, the user asked for it
 * by clicking, but a single-cell collapse is degenerate enough
 * to skip).
 *
 * Row format: "| cell1 | cell2 | cell3 |" with a leading and
 * trailing pipe so the result drops cleanly under a Markdown
 * header row without extra editing.
 */
export function tableRowForClip(c: TableRowInput): string | undefined {
  if (!looksLikeTableRow(c)) return undefined;
  const cells = splitTableCells(c.content);
  if (cells.length <= 1) return undefined;
  const escaped = cells.map(escapeCell);
  return `| ${escaped.join(" | ")} |`;
}
