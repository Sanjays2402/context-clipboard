/**
 * Live preview of the bulk "Copy as Markdown" clip-separator choice.
 *
 * Settings offers a separator for the bulk Markdown join: a horizontal
 * rule (`---`) between clips, or a bare blank line. The two read very
 * differently once pasted — a `---` renders as a visible thematic break
 * in most viewers, a blank line just spaces the blocks — but the select
 * dropdown alone doesn't SHOW that difference. This module produces a
 * tiny two-stub-clip preview document for whichever separator is
 * selected, so the user sees the actual seam they're choosing rendered
 * right next to the control.
 *
 * Pure string builder — no DOM. The popup drops the returned text into a
 * <pre> preview swatch and re-renders it on every change of the select.
 * Keeping the join grammar here means the preview is byte-identical to
 * what `bulkMarkdownSeparator` actually emits between real clips (both
 * read the same SEPARATORS table), so the swatch can never lie about the
 * separator.
 *
 * Design decisions:
 *   - The two stub clips are short, recognisable Markdown blocks (a
 *     fenced one-liner + a cited blockquote) so the preview looks like a
 *     real bulk-Markdown paste in miniature, not lorem filler. They're
 *     fixed constants — the preview is about the SEAM, not the content.
 *   - The seam string is taken from the SAME `bulkMarkdownSeparator`
 *     resolver the live bulk path uses (imported, not re-literal'd), so
 *     there's exactly one definition of "what a rule join looks like".
 *   - An unknown / nullish style falls back to the rule join — matching
 *     the live path's default — so a stale settings value still previews
 *     sanely rather than blank.
 */

import { bulkMarkdownSeparator, type BulkMarkdownSeparator } from "./bulk-markdown";

/** First stub clip — a fenced one-liner (the common code-snippet case). */
const STUB_A = "```ts\nconst x = 1;\n```";
/** Second stub clip — a cited blockquote (the common prose case). */
const STUB_B = "> A quoted note\n\n\u2014 [example.com](https://example.com)";

/**
 * Build the two-stub preview document for a separator style, joining the
 * two stub clips with exactly the seam the live bulk path would use.
 * `rule` puts a `---` thematic break between the blocks; `blank` uses a
 * bare blank line. Unknown / nullish falls back to the rule join.
 */
export function bulkSeparatorPreview(
  style: BulkMarkdownSeparator | null | undefined,
): string {
  return [STUB_A, STUB_B].join(bulkMarkdownSeparator(style));
}

/**
 * One-line human caption describing what the chosen separator does, for
 * a hint beside the swatch. Mirrors the option labels so the control and
 * the explanation stay in lockstep.
 */
export function bulkSeparatorCaption(
  style: BulkMarkdownSeparator | null | undefined,
): string {
  return style === "blank"
    ? "Clips joined by a blank line (no thematic break)."
    : "Clips separated by a horizontal rule (---).";
}
