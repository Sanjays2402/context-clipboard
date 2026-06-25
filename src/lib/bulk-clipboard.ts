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
  };
}

/**
 * Human toast for a completed (or empty) bulk copy. Mirrors the
 * grammar style of the other bulk toasts: lead with the count,
 * append the skipped-images tail only when relevant.
 *
 *   3 copied, 0 skipped  -> "Copied 3 clips"
 *   1 copied, 0 skipped  -> "Copied 1 clip"
 *   3 copied, 2 skipped  -> "Copied 3 clips - 2 images skipped"
 *   0 copied, 2 skipped  -> "Nothing to copy - 2 images skipped"
 *   0 copied, 0 skipped  -> "Nothing to copy"
 */
export function formatBulkCopyToast(plan: BulkCopyPlan): string {
  const { copied, skippedImages } = plan;
  if (copied === 0) {
    if (skippedImages > 0) {
      return `Nothing to copy \u2014 ${skippedImages} image${skippedImages === 1 ? "" : "s"} skipped`;
    }
    return "Nothing to copy";
  }
  const head = `Copied ${copied} clip${copied === 1 ? "" : "s"}`;
  if (skippedImages > 0) {
    return `${head} \u2014 ${skippedImages} image${skippedImages === 1 ? "" : "s"} skipped`;
  }
  return head;
}

/**
 * Tooltip / button-title for the bulk Copy button. Reflects what the
 * click will do given the current selection so the user knows before
 * committing. `selectedCount` is the FULL selection size (visible or
 * not); `copyableCount` is how many of the visible ones carry text.
 *
 * When the visible slice carries fewer copyable clips than the total
 * selection (selection outlives the filter window), we stay honest
 * and describe only what we can concretely act on.
 */
export function formatBulkCopyButtonTitle(plan: BulkCopyPlan): string {
  if (!plan.hasContent) {
    if (plan.skippedImages > 0) {
      return "Copy selected as text (selection is all images \u2014 nothing to copy)";
    }
    return "Copy selected clips as text";
  }
  const base = `Copy ${plan.copied} clip${plan.copied === 1 ? "" : "s"} as text`;
  if (plan.skippedImages > 0) {
    return `${base} (${plan.skippedImages} image${plan.skippedImages === 1 ? "" : "s"} skipped)`;
  }
  return base;
}
