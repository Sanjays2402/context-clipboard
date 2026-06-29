/**
 * "Copy first paragraph" send-to row — the block-level prose sibling
 * of first-sentence and first-line.
 *
 * first-line gives ONE physical line; first-sentence gives ONE prose
 * sentence. But a captured article / release note / spec is usually
 * organised in PARAGRAPHS separated by a blank line, and "the lead
 * paragraph" is the unit a user quotes as a TL;DR more often than a
 * single sentence. This row extracts everything up to the first blank
 * line (one or more empty lines), preserving the internal line breaks
 * so a wrapped paragraph stays intact.
 *
 * Pure: no IO, no DOM. The popup writes the result.
 *
 * Design decisions:
 *   - IMAGE clips return undefined (data-URL body, no prose).
 *   - Empty / whitespace-only bodies return undefined.
 *   - We only surface the row when there's MORE than one paragraph —
 *     if the whole body IS one block (no blank-line split), plain Copy
 *     already covers it and a "first paragraph" equal to the body is
 *     clutter (mirrors first-line / first-sentence hiding their single
 *     cases). Single-line clips therefore never show it.
 *   - CRLF normalises to LF first so a Windows-clipboard paste splits
 *     on blank lines the same way.
 */

export interface ParagraphClip {
  kind: "text" | "image" | "link";
  content: string;
}

/** First paragraph of `body`, or null when there isn't a clean second one. */
export function firstParagraphOf(body: string): string | null {
  const text = typeof body === "string" ? body.replace(/\r\n?/g, "\n") : "";
  if (text.trim() === "") return null;
  // Split on a run of one-or-more blank lines (\n\n+). Two paragraphs
  // separated by a single blank line is the universal prose convention.
  const blocks = text.split(/\n[ \t]*\n+/).map((b) => b.trim()).filter((b) => b !== "");
  if (blocks.length <= 1) return null; // one block -> plain Copy covers it
  const first = blocks[0];
  if (!first || first.length >= text.trim().length) return null;
  return first;
}

/**
 * First-paragraph payload for a clip, or undefined for images / empty
 * bodies / single-paragraph clips so the send-to row hides.
 */
export function firstParagraphForClip(c: ParagraphClip | null | undefined): string | undefined {
  if (!c || c.kind === "image") return undefined;
  const body = typeof c.content === "string" ? c.content : "";
  return firstParagraphOf(body) ?? undefined;
}
