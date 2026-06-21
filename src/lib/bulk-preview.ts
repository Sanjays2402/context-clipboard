/**
 * Pure helpers for bulk-action confirm dialogs.
 *
 * The popup's bulk-archive / bulk-tag / bulk-pin paths all need to
 * generate "Hey, here's the first 3 of N — proceed?" confirm text
 * so the user gets a concrete anchor instead of a faceless count.
 * Pulling the string-building out into a leaf module lets us
 * sanity-check the text shape (ellipsis cap, whitespace collapse,
 * +N more tail, singular/plural) without standing up the popup
 * DOM.
 *
 * NO IO, no DOM, no IDB. Pass in the minimal shape the helper needs
 * (id + preview/content + kind) and we'll do the rest.
 */

import type { ClipItem } from "./types";

/**
 * Just the bits we need to render a single preview row. Mirrors
 * the SendableClip shape — same trick — so callers can pass full
 * ClipItem records without coercing.
 */
export interface PreviewableClip {
  preview?: string;
  content?: string;
  kind?: ClipItem["kind"];
}

/**
 * Build the body text of a bulk-action confirm dialog. Returns a
 * single multi-line string ready to drop into `confirm()`.
 *
 * Examples:
 *   buildBulkPreviewMessage("Archive", 47, sampleOf3) →
 *     "Archive 47 clips?
 *
 *      First 3:
 *        • Hello world
 *        • function foo() ...
 *        • Image · 800×600
 *        + 44 more"
 *
 *   buildBulkPreviewMessage("Pin", 1, [one]) →
 *     "Pin 1 clip?
 *
 *      First 1:
 *        • Hello"
 *
 * Empty `targets` (n=0) returns just the head — the caller should
 * never pass zero (they'd skip the confirm path entirely), but we
 * defend against it.
 */
export function buildBulkPreviewMessage(
  verb: string,
  totalCount: number,
  sample: PreviewableClip[],
  opts: { previewMax?: number; sampleSize?: number } = {},
): string {
  const previewMax = opts.previewMax ?? 60;
  const sampleSize = opts.sampleSize ?? 3;
  const n = totalCount;
  const head = `${verb} ${n} clip${n === 1 ? "" : "s"}?`;
  if (n === 0) return head;
  // Cap the sample we render to opts.sampleSize even if the caller
  // passed more — keeps the dialog readable.
  const shown = sample.slice(0, Math.min(sampleSize, n));
  const lines = shown.map((c) => `  • ${truncatePreview(c, previewMax)}`).join("\n");
  const tail = n > shown.length ? `\n  + ${n - shown.length} more` : "";
  return `${head}\n\nFirst ${shown.length}:\n${lines}${tail}`;
}

/**
 * Pure preview string for a single clip:
 * - Use `preview` when present (already-trimmed user-facing text)
 * - Else use `content` (raw body)
 * - Else "(empty)" so the row never collapses to nothing
 * - Collapse whitespace (multi-line bodies break alert layout)
 * - Trim to `max` chars with an ellipsis suffix
 *
 * Exported separately so callers that need just the cell text (e.g.
 * a sparkline tooltip) can reuse the same shape.
 */
export function truncatePreview(c: PreviewableClip, max = 60): string {
  const raw = c.preview || c.content || "(empty)";
  const flat = raw.replace(/\s+/g, " ").trim() || "(empty)";
  return flat.length > max ? flat.slice(0, max) + "…" : flat;
}
