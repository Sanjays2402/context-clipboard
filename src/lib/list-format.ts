/**
 * Pure helper for the detail-view "Copy as bullet list" send-to row.
 *
 * Multi-line clips are very often LISTS the user captured as raw text — a
 * pasted set of steps, a column of names, a checklist, a stack trace, a
 * set of bullet points that lost their markers. Dropping that into a doc /
 * issue / PR, the user wants Markdown bullets, not a wall of lines. "Copy
 * as quote" gives `>` per line; "Copy as fenced code" gives a code block;
 * neither produces a real bulleted list. This row prefixes every non-blank
 * line with `- ` so the paste renders as a clean list.
 *
 * Sibling of clip-blockquote (quote) and numbered-list (ordered). Pure: no
 * IO, no DOM, no clipboard. The popup writes the result.
 *
 * Design decisions:
 *   - IMAGE clips return undefined (data-URL body — not a list).
 *   - SINGLE-line bodies return undefined: a one-item bullet list is the
 *     plain Copy with a stray "- " — clutter. Same multi-line gate as
 *     first/last-line, so the list rows only show when there's a list.
 *   - CRLF/CR normalise to \n; outer blank lines trim; INNER blank lines
 *     are DROPPED entirely (a list has no blank items) so the bullets stay
 *     contiguous. Each surviving line is trimmed then prefixed "- ".
 *   - Empty / whitespace-only bodies return undefined — nothing to list.
 */

export interface ListableClip {
  kind: "text" | "image" | "link";
  content: string;
}

/** Split a body into trimmed non-blank lines, or [] when there's nothing. */
function listLines(c: ListableClip | null | undefined): string[] {
  if (!c) return [];
  if (c.kind === "image") return [];
  const raw = typeof c.content === "string" ? c.content : "";
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  // Single (or zero) item: plain Copy already covers it — no list to make.
  if (lines.length <= 1) return [];
  return lines;
}

/**
 * Format a clip's lines as a Markdown bullet list ("- item" per line), or
 * undefined for images, single-line/empty bodies, and bad input so the
 * caller hides the row.
 */
export function bulletListForClip(c: ListableClip | null | undefined): string | undefined {
  const lines = listLines(c);
  if (lines.length === 0) return undefined;
  return lines.map((l) => `- ${l}`).join("\n");
}

/**
 * Format a clip's lines as a Markdown numbered list ("1. item" per line),
 * or undefined under the same gate as the bullet variant. Ordinals are
 * 1-based and sequential — sharing listLines so the two list rows surface
 * and hide together.
 */
export function numberedListForClip(c: ListableClip | null | undefined): string | undefined {
  const lines = listLines(c);
  if (lines.length === 0) return undefined;
  return lines.map((l, i) => `${i + 1}. ${l}`).join("\n");
}
