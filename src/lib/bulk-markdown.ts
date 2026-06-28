/**
 * Bulk "Copy selected as Markdown" — render N selected clips into a
 * single Markdown document and join them for the clipboard.
 *
 * The bulk bar already has a plain "Copy selected" (raw bodies joined
 * with blank lines — see lib/bulk-clipboard). This is its Markdown
 * sibling: each clip is rendered with the SAME per-clip grammar the
 * single-clip detail "Copy as Markdown" uses, so a batch paste into a
 * doc / PR / wiki reads as proper Markdown with source citations,
 * fenced code blocks, and image/link syntax — not a raw text dump.
 *
 * Per-clip rendering (mirrors popup's copyAsMarkdown):
 *   - image  -> `![title](url)`            (alt = source title, fallback "image")
 *   - link   -> `[label](url)`             (label = preview or content)
 *   - code   -> ```lang\n<body>\n```       (lang via detectCodeLang; tag:code or
 *                                            a code-shaped body qualifies)
 *   - text   -> `> quoted body` + a `— [title](url)` citation when a
 *               source URL exists                                       
 *
 * Design decisions:
 *   - Clips are joined with a horizontal rule + blank lines
 *     ("\n\n---\n\n") so the boundary between independent snippets is
 *     visually unambiguous when rendered — a bare blank line can blur
 *     two adjacent blockquotes into one. The rule reads as "new clip".
 *   - TEMPLATE clips are rendered from their RAW body ({{token}}
 *     intact), NOT expanded — same rationale as bulk-clipboard: a batch
 *     copy is "give me these snippets", and expanding N templates
 *     against one ambient tab context would be surprising.
 *   - Order follows the caller-supplied array (visible list order), so
 *     the document reads top-to-bottom the way the user sees the list.
 *   - Image clips DO contribute (unlike plain bulk-copy, which skips
 *     them): `![](url)` is legitimate Markdown the user wants in a doc.
 *     We only skip a clip when it has nothing renderable at all (e.g. a
 *     malformed record with no content and no source).
 *
 * Pure — no clipboard, no DOM. The popup does the clipboard write +
 * toast. Imports detectCodeLang (itself a pure util) for the fenced-
 * block language tag, mirroring the single-clip path exactly. The
 * per-clip force-language override (lib/lang-override) is honored too,
 * so a clip the user pinned to "rust" (or forced OFF) renders the SAME
 * fence the single-clip "Copy as Markdown" produces — bulk + single
 * stay byte-identical on the fence.
 */

import { detectCodeLang } from "./util";
import { exportFenceLang, OVERRIDE_NONE, OVERRIDE_AUTO } from "./lang-override";
import { utf8ByteLength, formatCopyBytes } from "./bulk-clipboard";

export interface BulkMarkdownClip {
  id: string;
  kind: "text" | "image" | "link";
  content: string;
  preview?: string;
  tags?: string[];
  source?: { url?: string; title?: string };
  /**
   * Per-clip force-language override (lib/lang-override): a pinned
   * tinting language id, the OVERRIDE_NONE ("none") forced-off sentinel,
   * or undefined to follow auto-detection. Steers BOTH whether a text
   * clip renders as a fenced block AND the fence's language tag, so the
   * user's hand-classification rides along into the batch paste exactly
   * as it does for the single-clip copy.
   */
  langOverride?: string;
}

export interface BulkMarkdownPlan {
  /** The joined Markdown document (empty when nothing renderable). */
  text: string;
  /** How many clips contributed a rendered block. */
  rendered: number;
  /** True when there's a document worth writing to the clipboard. */
  hasContent: boolean;
  /**
   * Code-point length of the joined `text` (separators included) — what
   * actually lands on the clipboard. Surfaced in the completion toast so
   * the Markdown receipt mirrors the plain bulk-copy receipt's
   * "- N chars" tail. Counted by code point (spread iterator) so an
   * emoji counts as one — same contract as the plain bulk-copy plan.
   */
  chars: number;
  /**
   * UTF-8 byte length of the joined `text` (separators included). The
   * plain bulk-copy path (lib/bulk-clipboard) already pairs its char
   * count with a byte weight on BOTH the hover preview and the completion
   * toast — "how much will I paste" (chars) vs "how heavy is it" (bytes,
   * the figure that matters when a paste target chokes on a multi-byte
   * payload). The Markdown path showed chars only, so the two batch-copy
   * buttons disagreed on what they reported. Counting bytes here — over
   * exactly the joined document that hits the clipboard, fences/citations
   * and separators included — closes that gap so Copy and Copy-as-Markdown
   * read the same two figures. Mirrors lib/bulk-clipboard's utf8ByteLength
   * byte-for-byte (shared import), so a Markdown doc and a plain join of
   * the same bytes weigh identically.
   */
  bytes: number;
}

/**
 * Clip-separator style for the joined Markdown document.
 *   - "rule"  -> a horizontal rule with blank lines around it
 *     ("\n\n---\n\n"). Visually unambiguous when rendered — each clip
 *     reads as its own section. The historical default.
 *   - "blank" -> a bare blank line ("\n\n"). Some doc targets (certain
 *     wikis, chat composers, slide importers) render a `---` as a
 *     thematic break / front-matter fence / new slide, which is NOT what
 *     the user wants between snippets; the blank-line join sidesteps that.
 */
export type BulkMarkdownSeparator = "rule" | "blank";

const SEPARATORS: Record<BulkMarkdownSeparator, string> = {
  rule: "\n\n---\n\n",
  blank: "\n\n",
};

/** The clip-join string for a separator style; defaults to the rule. */
export function bulkMarkdownSeparator(
  style: BulkMarkdownSeparator | null | undefined,
): string {
  return style === "blank" ? SEPARATORS.blank : SEPARATORS.rule;
}

/**
 * Heuristic: does this text body LOOK like code? Mirrors the popup's
 * private looksLikeCode so the bulk path renders fenced blocks for the
 * same clips the single-clip path would. Multi-line bodies, or bodies
 * carrying obvious language tokens, qualify.
 */
function looksLikeCode(s: string): boolean {
  return (
    /\b(function|const|let|var|class|import|export|=>|<\/?\w|def |print\()/.test(s) ||
    /\n/.test(s)
  );
}

/**
 * Decide whether a text clip renders as a fenced code block (vs a prose
 * blockquote), honoring the per-clip force-language override — mirrors
 * the popup's private markdownAsFence so bulk + single agree:
 *   - a forced LANGUAGE ("rust", "sql", ...) -> always a fence (the user
 *     classified it as code, even if looksLikeCode wouldn't have fired).
 *   - the forced-OFF sentinel ("none")       -> never a fence (the user
 *     said "this isn't code" — render a prose blockquote).
 *   - no override (auto)                     -> the existing heuristic
 *     (tag:code, or a code-shaped body).
 */
function bulkMarkdownAsFence(c: BulkMarkdownClip, content: string, tags: string[]): boolean {
  if (c.langOverride === OVERRIDE_NONE) return false;
  if (
    typeof c.langOverride === "string" &&
    c.langOverride !== OVERRIDE_AUTO &&
    c.langOverride !== ""
  ) {
    return true;
  }
  return tags.includes("code") || looksLikeCode(content);
}

/**
 * Render a single clip to its Markdown block. Returns null when the
 * clip carries nothing renderable (defensive against malformed records).
 */
export function clipToMarkdown(c: BulkMarkdownClip | null | undefined): string | null {
  if (!c) return null;
  const content = typeof c.content === "string" ? c.content : "";
  const url = c.source?.url || "";
  const title = c.source?.title || "";
  const preview = typeof c.preview === "string" ? c.preview : "";

  if (c.kind === "image") {
    // An image with neither a URL nor a title can't make a useful
    // Markdown image — skip it rather than emit `![]()`.
    if (!url && !title) return null;
    return `![${title || "image"}](${url})`;
  }

  if (c.kind === "link") {
    const target = content || url;
    if (!target) return null;
    const label = preview || content || url || "link";
    return `[${label}](${target})`;
  }

  // text
  if (content.trim() === "") return null;
  const tags = Array.isArray(c.tags) ? c.tags : [];
  if (bulkMarkdownAsFence(c, content, tags)) {
    // exportFenceLang folds the per-clip override into auto-detection so a
    // clip pinned to "rust" exports ```rust even when detectCodeLang would
    // have guessed wrong; a forced-OFF clip never reaches here (the fence
    // decision returned false above). Identical to the single-clip path.
    const lang = exportFenceLang(c.langOverride, detectCodeLang(content) ?? "");
    return "```" + lang + "\n" + content + "\n```";
  }
  const cite = url ? `\n\n\u2014 [${title || url}](${url})` : "";
  return `> ${content.replace(/\n/g, "\n> ")}${cite}`;
}

/**
 * Build the bulk-Markdown plan from an ordered selection. Pure — the
 * caller handles the clipboard write + toast. Skips clips with nothing
 * renderable; joins the rest with the chosen clip separator (default:
 * the horizontal rule). Pass "blank" for a bare blank-line join when the
 * paste target treats `---` as a thematic break / front-matter fence.
 */
export function planBulkMarkdown(
  clips: ReadonlyArray<BulkMarkdownClip | null | undefined>,
  separator: BulkMarkdownSeparator | null | undefined = "rule",
): BulkMarkdownPlan {
  const blocks: string[] = [];
  for (const c of clips) {
    const md = clipToMarkdown(c);
    if (md != null && md !== "") blocks.push(md);
  }
  const text = blocks.join(bulkMarkdownSeparator(separator));
  return {
    text,
    rendered: blocks.length,
    hasContent: blocks.length > 0,
    // Code-point length of exactly what hits the clipboard (separators
    // included), so the toast receipt is byte-honest.
    chars: [...text].length,
    // UTF-8 byte weight of exactly what hits the clipboard — the same
    // figure the plain bulk-copy plan carries, so the two batch-copy
    // buttons report identical pre/post numbers.
    bytes: utf8ByteLength(text),
  };
}

/**
 * Human toast for a completed (or empty) bulk-Markdown copy. Mirrors
 * the grammar of the plain bulk-copy toast, including the joined
 * CHARACTER total AND the UTF-8 byte weight so the Markdown receipt
 * reads the same way the plain Copy receipt does (pre/post parity, and
 * cross-button parity — both batch-copy buttons report both figures).
 *
 *   3 rendered, 1240 chars, 1.2 KB -> "Copied 3 clips as Markdown - 1,240 chars - 1.2 KB"
 *   1 rendered, 80 chars, 80 B     -> "Copied 1 clip as Markdown - 80 chars - 80 B"
 *   0 rendered                     -> "Nothing to copy as Markdown"
 */
export function formatBulkMarkdownToast(plan: BulkMarkdownPlan): string {
  if (plan.rendered === 0) return "Nothing to copy as Markdown";
  return `Copied ${plan.rendered} clip${plan.rendered === 1 ? "" : "s"} as Markdown \u2014 ${groupThousandsLocal(plan.chars)} char${plan.chars === 1 ? "" : "s"} \u2014 ${formatCopyBytes(plan.bytes)}`;
}

/**
 * Tooltip / button-title for the bulk Copy-as-Markdown button, given
 * the currently-visible selected clips (what we can inspect
 * synchronously). The click handler does its own authoritative read
 * over the FULL selection at fire time, so the toast count stays
 * truthful even when the selection extends past the filter window.
 * Includes the joined CHARACTER total AND the UTF-8 byte weight so the
 * hover preview matches the completion receipt — same two-figure
 * contract (`chars · bytes`) the plain bulk-copy button uses.
 */
export function formatBulkMarkdownButtonTitle(plan: BulkMarkdownPlan): string {
  if (!plan.hasContent) return "Copy selected clips as Markdown";
  return `Copy ${plan.rendered} clip${plan.rendered === 1 ? "" : "s"} as Markdown (${groupThousandsLocal(plan.chars)} char${plan.chars === 1 ? "" : "s"} \u00b7 ${formatCopyBytes(plan.bytes)})`;
}

/**
 * Group an integer with commas: 1240 -> "1,240". Deterministic en-US.
 * Local copy (the bulk-markdown module stays dependency-light) —
 * mirrors the bulk-clipboard + content-stats grouping so every char
 * readout across the UI reads identically.
 */
function groupThousandsLocal(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const digits = Math.abs(Math.trunc(n)).toString();
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
