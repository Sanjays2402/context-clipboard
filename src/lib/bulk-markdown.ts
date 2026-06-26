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
 * block language tag, mirroring the single-clip path exactly.
 */

import { detectCodeLang } from "./util";

export interface BulkMarkdownClip {
  id: string;
  kind: "text" | "image" | "link";
  content: string;
  preview?: string;
  tags?: string[];
  source?: { url?: string; title?: string };
}

export interface BulkMarkdownPlan {
  /** The joined Markdown document (empty when nothing renderable). */
  text: string;
  /** How many clips contributed a rendered block. */
  rendered: number;
  /** True when there's a document worth writing to the clipboard. */
  hasContent: boolean;
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
  if (tags.includes("code") || looksLikeCode(content)) {
    const lang = detectCodeLang(content) ?? "";
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
  };
}

/**
 * Human toast for a completed (or empty) bulk-Markdown copy. Mirrors
 * the grammar of the plain bulk-copy toast.
 *
 *   3 rendered  -> "Copied 3 clips as Markdown"
 *   1 rendered  -> "Copied 1 clip as Markdown"
 *   0 rendered  -> "Nothing to copy as Markdown"
 */
export function formatBulkMarkdownToast(plan: BulkMarkdownPlan): string {
  if (plan.rendered === 0) return "Nothing to copy as Markdown";
  return `Copied ${plan.rendered} clip${plan.rendered === 1 ? "" : "s"} as Markdown`;
}

/**
 * Tooltip / button-title for the bulk Copy-as-Markdown button, given
 * the currently-visible selected clips (what we can inspect
 * synchronously). The click handler does its own authoritative read
 * over the FULL selection at fire time, so the toast count stays
 * truthful even when the selection extends past the filter window.
 */
export function formatBulkMarkdownButtonTitle(plan: BulkMarkdownPlan): string {
  if (!plan.hasContent) return "Copy selected clips as Markdown";
  return `Copy ${plan.rendered} clip${plan.rendered === 1 ? "" : "s"} as Markdown`;
}
