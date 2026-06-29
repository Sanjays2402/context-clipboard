/**
 * Pure helper for the detail-view "Copy last line" send-to row.
 *
 * Sibling of first-line.ts. Where the first line of a multi-line clip is
 * the heading / signature / subject, the LAST line is just as often the
 * part the user wants alone: the closing total of a table, the final
 * shell prompt, the conclusion of a transcript, the trailing URL, the
 * sign-off. Copying the whole clip and scrolling to trim is the papercut;
 * this row hands them the last line with one click. Full-body Copy covers
 * "everything"; this covers "just the bottom".
 *
 * Pure: no IO, no DOM, no clipboard. The popup writes the returned line.
 *
 * Design decisions (mirror first-line.ts exactly, just the other end):
 *   - IMAGE clips return undefined (data-URL body — no meaningful "line").
 *   - SINGLE-line bodies return undefined: line 1 IS the last line and the
 *     plain Copy already covers it; a duplicate row is clutter. The row
 *     only appears for genuinely multi-line clips — same gate as first-line
 *     so the two rows surface/hide together.
 *   - The "last line" is the body after the final newline, with CRLF/CR
 *     normalised first so a Windows paste's last line doesn't keep a stray
 *     \r. Trailing whitespace is trimmed. A clip ending in blank line(s)
 *     falls back to the last NON-blank line so the row hands over signal,
 *     not an empty string.
 *   - Empty / whitespace-only clips return undefined — nothing to copy.
 */

export interface LastLineClip {
  kind: "text" | "image" | "link";
  content: string;
}

/**
 * The clip's last non-blank line, or undefined when there's nothing useful
 * to extract (image, empty body, or a single-line clip where the line
 * equals the whole body). Lines split on normalised \n; trailing blank
 * lines are skipped so a clip ending in a newline still yields its last
 * real line.
 */
export function lastLineOf(c: LastLineClip | null | undefined): string | undefined {
  if (!c) return undefined;
  if (c.kind === "image") return undefined;
  const raw = typeof c.content === "string" ? c.content : "";
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  // A single-line body's last line is the whole clip — plain Copy covers it,
  // so the dedicated row would be a duplicate. Hide it (same gate as first-line).
  if (lines.length <= 1) return undefined;
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (t.length > 0) return t;
  }
  return undefined;
}
