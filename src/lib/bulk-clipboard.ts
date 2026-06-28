/**
 * Bulk "Copy selected" — join the bodies of N selected clips into a
 * single clipboard payload.
 *
 * The bulk bar can already pin / lock / tag / note / export a
 * selection, but the most basic batch operation — "copy all of these
 * at once" — was missing. Selecting 5 snippets then copy-pasting them
 * one at a time is exactly the kind of papercut the selection model
 * exists to kill.
 *
 * This module is the pure joiner: given the selected clips (in the
 * order they appear in the list) it produces the concatenated text
 * and a human toast describing what happened. No clipboard, no DOM —
 * the popup does the navigator.clipboard.writeText + toast.
 *
 * Design decisions:
 *   - Clips are joined with a blank line between them ("\n\n") so the
 *     boundary is visible when the result is pasted into a doc / shell
 *     / editor. A single newline would smush a one-line snippet into
 *     the next; double-newline matches how people separate paragraphs.
 *   - IMAGE clips have no copy-pasteable TEXT body (the content is a
 *     data URL). Joining a 2-MB base64 blob into a text payload is
 *     never what the user wants from "copy selected". We SKIP images
 *     and report how many were skipped, so the toast stays honest
 *     ("Copied 3 clips - 2 images skipped"). When the ENTIRE selection
 *     is images, we produce no text and the caller surfaces an error
 *     toast instead of writing an empty string to the clipboard.
 *   - TEMPLATE clips are copied as their RAW body ({{token}} intact),
 *     NOT expanded. Bulk copy is a "give me these snippets" operation,
 *     not a per-clip paste; expanding N templates against one ambient
 *     tab context would be surprising (each template may assume a
 *     different context). The single-clip Copy path still expands —
 *     this is deliberately the raw-join sibling.
 *   - We trim trailing whitespace off each body so stray newlines from
 *     capture don't pile up blank lines at the join seams, but we
 *     preserve INTERNAL formatting (a multi-line code block stays
 *     intact).
 *   - Order follows the caller-supplied array (the popup passes clips
 *     in visible list order), so the paste reads top-to-bottom the way
 *     the user sees them.
 */

export interface BulkCopyClip {
  id: string;
  kind: "text" | "image" | "link";
  content: string;
}

export interface BulkCopyPlan {
  /** The joined text to write to the clipboard (empty when nothing copyable). */
  text: string;
  /** How many clips contributed text. */
  copied: number;
  /** How many image clips were skipped (no text body). */
  skippedImages: number;
  /** True when there's text worth writing to the clipboard. */
  hasContent: boolean;
  /**
   * Code-point length of the joined `text` (including the "\n\n" seams).
   * This is exactly what lands on the clipboard, so the button hover can
   * promise "Copy 3 clips as text (1,240 chars)" and the number matches
   * what the user pastes. Counted by code point (spread iterator) so an
   * emoji counts as one character — same "length a human perceives"
   * contract the detail-view content-stats uses.
   */
  chars: number;
  /**
   * UTF-8 byte length of the joined `text` (seams included). The char
   * count answers "how much will I paste"; the byte count answers "how
   * much weight is this" — the same distinction the bulk-export JSON
   * receipt draws (it shows bytes). Surfacing BOTH on the copy hover +
   * toast gives the copy path the same pre/post parity the export path
   * has: the hover preview and the completion receipt show identical
   * figures. A multi-byte glyph (emoji, CJK) makes bytes > chars, which
   * is exactly the signal a "is this a heavy paste?" glance wants.
   */
  bytes: number;
}

const JOIN_SEPARATOR = "\n\n";

/**
 * Build the bulk-copy plan from an ordered selection. Pure — caller
 * handles the actual clipboard write + toast. Defensive against
 * nullish entries and non-string content (a malformed record
 * contributes nothing rather than throwing).
 */
export function planBulkCopy(clips: ReadonlyArray<BulkCopyClip | null | undefined>): BulkCopyPlan {
  const bodies: string[] = [];
  let skippedImages = 0;
  for (const c of clips) {
    if (!c) continue;
    if (c.kind === "image") {
      skippedImages++;
      continue;
    }
    const body = typeof c.content === "string" ? c.content.replace(/\s+$/, "") : "";
    // Preserve empty-but-present text clips as a blank entry? No — an
    // empty body contributes nothing and would just widen a seam. Skip
    // silently (it's not an image, so it doesn't count as "skipped"
    // in the user-facing sense; it simply has no text to add).
    if (body === "") continue;
    bodies.push(body);
  }
  const text = bodies.join(JOIN_SEPARATOR);
  return {
    text,
    copied: bodies.length,
    skippedImages,
    hasContent: bodies.length > 0,
    // Code-point length of exactly what hits the clipboard.
    chars: [...text].length,
    // UTF-8 byte weight of exactly what hits the clipboard.
    bytes: utf8ByteLength(text),
  };
}

/**
 * UTF-8 byte length of a string. Used to weigh the joined copy payload
 * so the hover + toast can show bytes alongside chars. Prefers the
 * platform TextEncoder (exact, surrogate-correct); falls back to a
 * manual code-point walk when TextEncoder is unavailable (defensive —
 * it exists everywhere this extension runs). Mirrors lib/bulk-export's
 * utf8ByteLength so the copy + export receipts count weight identically.
 */
export function utf8ByteLength(s: string | null | undefined): number {
  if (typeof s !== "string" || s.length === 0) return 0;
  if (typeof TextEncoder !== "undefined") {
    try {
      return new TextEncoder().encode(s).length;
    } catch {
      // fall through to manual count
    }
  }
  let bytes = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp <= 0x7f) bytes += 1;
    else if (cp <= 0x7ff) bytes += 2;
    else if (cp <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

/**
 * Format a byte count into a compact human string (e.g. "742 B",
 * "12.3 KB", "4.2 MB", "1.07 GB"). Mirrors lib/bulk-export.formatExportBytes
 * BYTE-FOR-BYTE (same tiers, same rounding: floor for B, 1 dp for KB/MB,
 * 2 dp for GB) so the copy receipt and the export receipt render weight
 * identically across the UI. Binary units (1024-step) since this is
 * storage/transfer weight, not a count.
 *
 * Defensive: a non-finite / negative byte count reads "0 B".
 */
export function formatCopyBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0 B";
  if (n < 1024) return `${Math.floor(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * Human toast for a completed (or empty) bulk copy. Mirrors the
 * grammar style of the other bulk toasts: lead with the count, append
 * the joined CHARACTER total AND the UTF-8 byte weight so the completion
 * receipt matches the button-hover preview (`formatBulkCopyButtonTitle`)
 * — the user sees the same figures before AND after the copy. The byte
 * weight gives the copy path the same pre/post parity the export JSON
 * receipt has (which shows bytes). The skipped-images tail trails when
 * relevant.
 *
 *   3 copied, 1240 chars, 1.2 KB, 0 skipped -> "Copied 3 clips - 1,240 chars - 1.2 KB"
 *   1 copied, 12 chars, 12 B, 0 skipped       -> "Copied 1 clip - 12 chars - 12 B"
 *   3 copied, 1240 chars, 1.2 KB, 2 skipped -> "Copied 3 clips - 1,240 chars - 1.2 KB - 2 images skipped"
 *   0 copied, 2 skipped                        -> "Nothing to copy - 2 images skipped"
 *   0 copied, 0 skipped                        -> "Nothing to copy"
 */
export function formatBulkCopyToast(plan: BulkCopyPlan): string {
  const { copied, skippedImages, chars, bytes } = plan;
  if (copied === 0) {
    if (skippedImages > 0) {
      return `Nothing to copy \u2014 ${skippedImages} image${skippedImages === 1 ? "" : "s"} skipped`;
    }
    return "Nothing to copy";
  }
  const head = `Copied ${copied} clip${copied === 1 ? "" : "s"} \u2014 ${groupThousandsLocal(chars)} char${chars === 1 ? "" : "s"} \u2014 ${formatCopyBytes(bytes)}`;
  if (skippedImages > 0) {
    return `${head} \u2014 ${skippedImages} image${skippedImages === 1 ? "" : "s"} skipped`;
  }
  return head;
}

/**
 * Tooltip / button-title for the bulk Copy button. Reflects what the
 * click will do given the current selection so the user knows before
 * committing — including the joined CHARACTER total, so the hover reads
 * "Copy 3 clips as text (1,240 chars)". The char count is exactly what
 * lands on the clipboard (the joined `text`, seams included), so the
 * preview never overpromises.
 *
 * When the visible slice carries fewer copyable clips than the total
 * selection (selection outlives the filter window), we stay honest
 * and describe only what we can concretely act on.
 *
 * The hover reads "Copy 3 clips as text (1,240 chars · 1.2 KB)" — char
 * count for "how much will I paste", byte weight for "how heavy is it",
 * the same two figures the completion toast echoes (pre/post parity).
 */
export function formatBulkCopyButtonTitle(plan: BulkCopyPlan): string {
  if (!plan.hasContent) {
    if (plan.skippedImages > 0) {
      return "Copy selected as text (selection is all images \u2014 nothing to copy)";
    }
    return "Copy selected clips as text";
  }
  const base = `Copy ${plan.copied} clip${plan.copied === 1 ? "" : "s"} as text (${groupThousandsLocal(plan.chars)} char${plan.chars === 1 ? "" : "s"} \u00b7 ${formatCopyBytes(plan.bytes)})`;
  if (plan.skippedImages > 0) {
    return `${base} (${plan.skippedImages} image${plan.skippedImages === 1 ? "" : "s"} skipped)`;
  }
  return base;
}

/**
 * Group an integer with commas: 1240 -> "1,240". Deterministic en-US.
 * Local copy (the bulk module stays dependency-free) — mirrors the
 * content-stats grouping so the two read identically across the UI.
 */
function groupThousandsLocal(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const digits = Math.abs(Math.trunc(n)).toString();
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Soft byte budget for a bulk clipboard payload — 1 MiB. Above this, some
 * paste targets choke or silently truncate: chat composers with a server-
 * side message cap, a commit-message field, a textarea with a maxlength, a
 * form that rejects the POST. The copy itself always succeeds (the OS
 * clipboard handles megabytes fine); the budget only gates whether we add
 * a heads-up so the user isn't surprised when their paste lands clipped.
 */
export const BULK_COPY_BUDGET_BYTES = 1024 * 1024;

/**
 * Does the joined payload exceed the soft budget? Both copy plans
 * (planBulkCopy + planBulkMarkdown) carry a `bytes` field measured over
 * exactly what hits the clipboard, so this predicate works for either
 * batch-copy path. Defensive: a non-finite / negative figure is never
 * "over" (no spurious warning on a malformed count).
 */
export function exceedsCopyBudget(bytes: number): boolean {
  return Number.isFinite(bytes) && bytes > BULK_COPY_BUDGET_BYTES;
}

/**
 * Conditionally append a byte-budget heads-up to a completed-copy toast.
 * When the payload is within budget the message is returned UNCHANGED (the
 * common case shows no extra noise); when it's over, a tail naming the size
 * is appended — "… — large paste (1.4 MB); some targets may truncate" — so
 * the user knows a clipped paste is a payload-size issue, not a copy
 * failure.
 *
 * Generic over the toast STRING (not the plan) so it layers onto BOTH
 * copy paths' toasts — formatBulkCopyToast and formatBulkMarkdownToast —
 * from one helper, keeping those formatters (and their existing row-count
 * tests) untouched. The size uses the same formatCopyBytes the receipt
 * already shows, so the figure in the warning matches the figure in the
 * receipt exactly.
 */
export function appendCopyBudgetWarning(message: string, bytes: number): string {
  if (!exceedsCopyBudget(bytes)) return message;
  return `${message} \u2014 large paste (${formatCopyBytes(bytes)}); some targets may truncate`;
}
