/**
 * Bulk "Copy selected as CSV" — join N selected clips into a single
 * multi-row CSV payload for paste into a spreadsheet / .csv.
 *
 * The detail Send-to already has a single-clip "Copy as CSV row" that turns
 * one tabular body (`a,b,c` / tab-separated) into a clean RFC-4180 CSV row.
 * This is its BULK sibling: select N rows you pasted out of a spreadsheet
 * (or captured one at a time) and get them back as a single block you can
 * paste straight into a sheet — one CSV row per line.
 *
 * Reuses the exact same gate + cell logic the single-clip row uses
 * (`csvRowForClip` from csv-row.ts, itself built on looksLikeTableRow +
 * splitTableCells), so the bulk output is byte-identical to running the
 * single-clip "Copy as CSV row" on each clip and stacking the results. A
 * clip that wouldn't light up the single-clip row (plain prose, image,
 * multi-line, single-cell) contributes NOTHING here and is counted as
 * skipped, so the toast stays honest ("Copied 3 rows - 2 not tabular").
 *
 * Design decisions:
 *   - One CSV row per clip, joined with "\n" (LF). A spreadsheet paste
 *     splits on newlines into rows; the seam is a row boundary, not a blank
 *     line (unlike plain bulk-copy, where "\n\n" separates free text).
 *   - NO header row. The clips are arbitrary tabular rows with no shared
 *     schema — inventing a "col1,col2" header would be wrong. The user
 *     pastes these under their own header.
 *   - Order follows the caller-supplied array (visible list order) so the
 *     pasted block reads top-to-bottom the way the user sees the list.
 *   - When NOTHING in the selection is tabular, we produce no text and the
 *     caller surfaces an error toast instead of writing an empty string.
 *
 * Pure — no clipboard, no DOM. Shares the char/byte receipt shape +
 * utf8ByteLength with bulk-clipboard so the CSV button reports weight the
 * same way Copy / Copy-as-Markdown do (pre-hover + post-toast parity).
 */

import { csvRowForClip } from "./csv-row";
import type { ClipItem } from "./types";
import { utf8ByteLength, formatCopyBytes } from "./bulk-clipboard";

export interface BulkCsvClip {
  id: string;
  kind: ClipItem["kind"];
  content: string;
}

export interface BulkCsvPlan {
  /** The joined CSV (one row per line); empty when nothing was tabular. */
  text: string;
  /** How many clips contributed a CSV row. */
  rows: number;
  /** How many clips were skipped because they don't read as a tabular row. */
  skipped: number;
  /** True when there's at least one row worth writing to the clipboard. */
  hasContent: boolean;
  /** Code-point length of exactly what hits the clipboard (seams included). */
  chars: number;
  /** UTF-8 byte weight of exactly what hits the clipboard (seams included). */
  bytes: number;
}

/** One CSV row per clip, joined by LF — spreadsheet row boundaries. */
const ROW_SEPARATOR = "\n";

/**
 * Build the bulk-CSV plan from an ordered selection. Pure — caller does the
 * clipboard write + toast. A clip contributes a row only when csvRowForClip
 * returns a value (single-line tabular body, >1 cell); everything else is
 * counted as skipped so the toast can name the gap.
 */
export function planBulkCsv(
  clips: ReadonlyArray<BulkCsvClip | null | undefined>,
): BulkCsvPlan {
  const rows: string[] = [];
  let skipped = 0;
  for (const c of clips) {
    if (!c) continue;
    const row = csvRowForClip({ kind: c.kind, content: c.content });
    if (row != null && row !== "") {
      rows.push(row);
    } else {
      // A present clip that isn't tabular — count it so the toast is honest
      // about how much of the selection couldn't become a CSV row.
      skipped++;
    }
  }
  const text = rows.join(ROW_SEPARATOR);
  return {
    text,
    rows: rows.length,
    skipped,
    hasContent: rows.length > 0,
    chars: [...text].length,
    bytes: utf8ByteLength(text),
  };
}

/**
 * Human toast for a completed (or empty) bulk-CSV copy. Mirrors the grammar
 * of the other bulk-copy toasts: lead with the row count, append the joined
 * char total + UTF-8 byte weight (pre/post parity with the button hover),
 * and trail the not-tabular skip count when relevant.
 *
 *   3 rows, 2 skipped -> "Copied 3 rows as CSV - <chars> - <bytes> - 2 not tabular"
 *   1 row, 0 skipped  -> "Copied 1 row as CSV - <chars> - <bytes>"
 *   0 rows, 2 skipped -> "Nothing tabular to copy - 2 clips aren't CSV rows"
 *   0 rows, 0 skipped -> "Nothing to copy as CSV"
 */
export function formatBulkCsvToast(plan: BulkCsvPlan): string {
  const { rows, skipped, chars, bytes } = plan;
  if (rows === 0) {
    if (skipped > 0) {
      return `Nothing tabular to copy \u2014 ${skipped} clip${skipped === 1 ? "" : "s"} ${skipped === 1 ? "isn't a CSV row" : "aren't CSV rows"}`;
    }
    return "Nothing to copy as CSV";
  }
  const head = `Copied ${rows} row${rows === 1 ? "" : "s"} as CSV \u2014 ${groupThousandsLocal(chars)} char${chars === 1 ? "" : "s"} \u2014 ${formatCopyBytes(bytes)}`;
  if (skipped > 0) {
    return `${head} \u2014 ${skipped} not tabular`;
  }
  return head;
}

/**
 * Tooltip / button-title for the bulk Copy-as-CSV button, reflecting what
 * the click will do for the currently-visible selection. The click handler
 * does its own authoritative read over the FULL selection at fire time, so
 * the toast count stays truthful even when selection outlives the filter
 * window. Includes the joined char total + byte weight, matching the
 * two-figure contract the plain Copy + Copy-as-Markdown buttons use.
 */
export function formatBulkCsvButtonTitle(plan: BulkCsvPlan): string {
  if (!plan.hasContent) {
    if (plan.skipped > 0) {
      return "Copy selected as CSV (no tabular rows in selection)";
    }
    return "Copy selected clips as CSV rows";
  }
  const base = `Copy ${plan.rows} row${plan.rows === 1 ? "" : "s"} as CSV (${groupThousandsLocal(plan.chars)} char${plan.chars === 1 ? "" : "s"} \u00b7 ${formatCopyBytes(plan.bytes)})`;
  if (plan.skipped > 0) {
    return `${base} (${plan.skipped} not tabular)`;
  }
  return base;
}

/**
 * Group an integer with commas: 1240 -> "1,240". Deterministic en-US.
 * Local copy (the bulk-csv module stays dependency-light) — mirrors the
 * bulk-clipboard / content-stats grouping so every char readout reads alike.
 */
function groupThousandsLocal(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const digits = Math.abs(Math.trunc(n)).toString();
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
