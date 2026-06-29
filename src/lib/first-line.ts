/**
 * Pure helper for the detail-view "Copy first line" send-to row.
 *
 * A multi-line clip's first line is often the part the user actually
 * wants alone: the heading of a captured section, the title of a fenced
 * block, the function signature, the subject line. Copying the whole clip
 * and trimming by hand is the papercut; this row hands them line 1 with a
 * single click. The full-body Copy already covers "everything", and the
 * content-stats breadcrumb already says how many lines there are — so the
 * row only earns its place when there's MORE than one line (a single-line
 * clip's first line IS the body; the dedicated row would be redundant).
 *
 * Pure: no IO, no DOM, no clipboard. The popup writes the returned line.
 *
 * Design decisions:
 *   - IMAGE clips return undefined (data-URL body — no meaningful "line").
 *   - SINGLE-line bodies return undefined: line 1 equals the whole clip,
 *     so the plain Copy already does this; surfacing a second identical
 *     row is clutter. The row only appears for genuinely multi-line clips.
 *   - The "first line" is the body up to the first newline, with CRLF/CR
 *     normalised first so a Windows paste's first line doesn't keep a
 *     stray \r. Trailing whitespace on that line is trimmed; the rest of
 *     the clip is dropped. An all-blank first line (clip starts with a
 *     newline) falls through to the first NON-blank line so the row hands
 *     over signal, not an empty string.
 *   - Empty / whitespace-only clips return undefined — nothing to copy.
 */

export interface FirstLineClip {
  kind: "text" | "image" | "link";
  content: string;
}

/**
 * The clip's first non-blank line, or undefined when there's nothing
 * useful to extract (image, empty body, or a single-line clip where the
 * line equals the whole body). Lines are split on normalised \n; leading
 * blank lines are skipped so a clip that opens with a newline still
 * yields its first real line.
 */
export function firstLineOf(c: FirstLineClip | null | undefined): string | undefined {
  if (!c) return undefined;
  if (c.kind === "image") return undefined;
  const raw = typeof c.content === "string" ? c.content : "";
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  // A single-line body's first line is the whole clip — plain Copy covers
  // it, so the dedicated row would be a duplicate. Hide it.
  if (lines.length <= 1) return undefined;
  for (const line of lines) {
    const t = line.trim();
    if (t.length > 0) return t;
  }
  return undefined;
}
