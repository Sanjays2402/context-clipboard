/**
 * Pure helper for the detail-view "Copy as quote" send-to row.
 *
 * The clip BODY (text / link content) is the thing the user copies most;
 * "Copy as fenced code" wraps it in ``` for code, and "Copy as plain
 * text" strips templates. But the third common paste shape — quoting a
 * snippet INTO a doc / PR / chat as an attributed quotation — had no row.
 * A captured paragraph dropped into a GitHub comment reads as one
 * blurry block; what the user wants is:
 *
 *   > the captured paragraph, line by line
 *   > with every line carrying a quote mark
 *
 * This is the body-side sibling of note-markdown's "Copy note as
 * Markdown" (which blockquotes the NOTE). Same `> `-per-line shape, same
 * inner-blank-line preservation, but it quotes the clip's CONTENT, so a
 * un-noted clip still has something to quote. Distinct from fenced-code
 * (prose, not code) and from the JSON/cURL rows (machine formats).
 *
 * Pure: no IO, no DOM, no clipboard. The popup writes the result to the
 * clipboard via the existing send-to dispatch.
 *
 * Design decisions:
 *   - IMAGE clips return undefined (the body is a data URL — quoting a
 *     megabyte of base64 is noise). The caller hides the row, same as the
 *     other text-only send-to actions.
 *   - Empty / whitespace-only bodies return undefined: a lone "> " is
 *     nothing worth copying, so the row stays off the menu.
 *   - Line endings normalise to \n (CRLF + lone CR collapsed) so the
 *     blockquote is platform-independent; outer blank lines trim, inner
 *     blank lines stay (paragraph breaks survive) — byte-identical to
 *     note-markdown's contract so the two blockquote rows behave the same.
 *   - Empty inner lines become a bare ">" (a Markdown empty-quote line)
 *     so the quoted region stays visually continuous without trailing
 *     whitespace.
 */

export interface BlockquotableClip {
  kind: "text" | "image" | "link";
  content: string;
}

/**
 * Format a clip's body as a Markdown blockquote — every line prefixed
 * with `> `. Returns undefined for images, empty/whitespace bodies, and
 * bad input so the caller hides the send-to row. Mirrors the line-prefix
 * + blank-line rules of note-markdown.noteAsMarkdownBlockquote so the
 * body-quote and note-quote rows render identically.
 */
export function clipAsBlockquote(c: BlockquotableClip | null | undefined): string | undefined {
  if (!c) return undefined;
  if (c.kind === "image") return undefined;
  const raw = typeof c.content === "string" ? c.content : "";
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const trimmed = normalized.replace(/^\n+/, "").replace(/\n+$/, "");
  if (trimmed.trim().length === 0) return undefined;
  const lines = trimmed.split("\n").map((line) => (line.length === 0 ? ">" : `> ${line}`));
  return lines.join("\n");
}
