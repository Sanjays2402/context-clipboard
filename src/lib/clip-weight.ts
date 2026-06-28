/**
 * Single-clip "copy weight" summary — chars + UTF-8 bytes — for the
 * detail-view Send-to menu.
 *
 * The detail content-stats breadcrumb already answers "how big is this
 * clip?" in chars / words / lines, and you can click it to copy that
 * summary. But it has no BYTE figure — and bytes are the number that
 * matters when you're about to paste into a size-bounded target (a chat
 * box that chokes past N KB, a commit message, a form field with a
 * server-side limit). The bulk-bar copy + export receipts both surface
 * bytes; the single-clip path didn't. This closes that gap with a
 * dedicated "Copy weight (chars + bytes)" Send-to row.
 *
 * Pure — no DOM, no clipboard. The module produces the WYSIWYG string
 * ("1,240 chars · 1.2 KB"); the popup writes it to the clipboard + toasts.
 *
 * Design decisions:
 *   - chars = Unicode CODE POINTS (via computeContentStats), so an emoji
 *     counts as one character the way a human perceives length — the same
 *     contract the content-stats breadcrumb uses. bytes = UTF-8 weight via
 *     the SAME utf8ByteLength the bulk-copy + bulk-export receipts use, so
 *     every weight figure across the UI counts identically. A multi-byte
 *     glyph makes bytes > chars, which is exactly the "this paste is
 *     heavier than its length suggests" signal the byte count exists for.
 *   - IMAGE clips return null (the "content" is a data URL — a megabyte of
 *     base64 whose char/byte count is noise, not signal). The caller hides
 *     the row, exactly as content-stats hides its breadcrumb for images.
 *   - An empty / whitespace-only body returns null too: a "0 chars · 0 B"
 *     receipt is nothing worth copying, so the row stays off the menu
 *     rather than putting an empty-ish string on the user's clipboard.
 *   - The summary STRING is the clipboard payload (WYSIWYG): clicking the
 *     row labelled by this weight copies exactly that text, mirroring how
 *     the content-stats breadcrumb copies precisely what it shows.
 *   - bytes uses the clip's raw `content` (what actually lands on the
 *     clipboard for a plain Copy), not the preview — the weight must
 *     describe the real payload, not a truncated display string.
 */

import { computeContentStats, groupThousands } from "./content-stats";
import { utf8ByteLength, formatCopyBytes } from "./bulk-clipboard";

export interface ClipWeightInput {
  kind: "text" | "image" | "link";
  content: string;
}

export interface ClipWeight {
  /** Unicode code-point count of the body (matches content-stats chars). */
  chars: number;
  /**
   * Whitespace-delimited word count of the body (matches content-stats
   * words). The detail content-stats breadcrumb tails chars / words /
   * lines / bytes; the single-clip Send-to weight row showed chars +
   * bytes only, so the two told different stories about the same clip.
   * Carrying words here lets the weight summary read the SAME triple the
   * breadcrumb does (chars / words / bytes — line count is structure, not
   * weight, so it stays out of the size-oriented row). Same
   * computeContentStats word count, so the two figures can't drift.
   */
  words: number;
  /** UTF-8 byte length of the body (matches the bulk receipts' weight). */
  bytes: number;
}

/**
 * Compute the chars + words + bytes weight for a clip body. Returns null
 * for image clips (data-URL content) and for empty / whitespace-only
 * bodies, so the caller hides the Send-to row in exactly those cases.
 *
 * Defensive against nullish / non-string content (treated as empty →
 * null) so a malformed record never throws inside the menu build.
 */
export function clipWeight(c: ClipWeightInput | null | undefined): ClipWeight | null {
  if (!c) return null;
  if (c.kind === "image") return null;
  const body = typeof c.content === "string" ? c.content : "";
  if (body.trim() === "") return null;
  const { chars, words } = computeContentStats(body);
  return { chars, words, bytes: utf8ByteLength(body) };
}

/**
 * Format the copy-weight summary string the Send-to row copies, e.g.
 * "1,240 chars · 198 words · 1.2 KB". Returns null in the same cases
 * clipWeight does (image, empty, bad input) so the row gates off a single
 * predicate.
 *
 * The char + word figures are comma-grouped (en-US, deterministic) to
 * match the content-stats breadcrumb; the byte figure uses formatCopyBytes
 * so it reads identically to the bulk copy + export receipts. The order —
 * chars · words · bytes — mirrors the content-stats breadcrumb (which
 * leads chars, then words, then drops to lines/bytes) so the single-clip
 * weight and the multi-stat breadcrumb agree on both the figures AND their
 * sequence. The line count is intentionally absent: this row answers "how
 * heavy / how long is this paste?", and a line count is structure, not
 * size. The middot separator (\u00b7) matches the breadcrumb so the two
 * share one visual grammar.
 */
export function clipWeightSummary(c: ClipWeightInput | null | undefined): string | null {
  const w = clipWeight(c);
  if (!w) return null;
  const charPart = `${groupThousands(w.chars)} char${w.chars === 1 ? "" : "s"}`;
  const wordPart = `${groupThousands(w.words)} word${w.words === 1 ? "" : "s"}`;
  return `${charPart} \u00b7 ${wordPart} \u00b7 ${formatCopyBytes(w.bytes)}`;
}

/**
 * Bold the NUMERIC prefix of a formatCopyBytes string, unit plain:
 * "1.2 KB" -> "**1.2** KB", "742 B" -> "**742** B". Splitting on the last
 * space keeps the unit outside the emphasis; bold and plain differ ONLY by
 * the `**`, so stripping them reproduces the plain figure exactly. Mirrors
 * content-stats' private byteSegment(bold) so the weight row and the
 * breadcrumb bold their byte figure identically.
 */
function boldBytes(bytes: number): string {
  const s = formatCopyBytes(bytes);
  const sp = s.lastIndexOf(" ");
  if (sp < 0) return `**${s}**`;
  return `**${s.slice(0, sp)}** ${s.slice(sp + 1)}`;
}

/**
 * Markdown variant of the copy-weight summary, e.g. "**1,240** chars ·
 * **198** words · **1.2** KB". Same figures + order + separator as
 * clipWeightSummary, but each NUMBER is wrapped in `**` (units stay plain)
 * so a doc / issue / PR renders the weight bold — mirroring the
 * content-stats Markdown stat-line. Stripping the `**` reproduces the
 * plain summary's three figures exactly (md/plain parity), so the two rows
 * read the same clip identically, differing only in emphasis. Returns null
 * in the same cases clipWeightSummary does (image, empty, bad input) so the
 * Markdown row gates off the same predicate.
 */
export function clipWeightSummaryMarkdown(c: ClipWeightInput | null | undefined): string | null {
  const w = clipWeight(c);
  if (!w) return null;
  const charPart = `**${groupThousands(w.chars)}** char${w.chars === 1 ? "" : "s"}`;
  const wordPart = `**${groupThousands(w.words)}** word${w.words === 1 ? "" : "s"}`;
  return `${charPart} \u00b7 ${wordPart} \u00b7 ${boldBytes(w.bytes)}`;
}
