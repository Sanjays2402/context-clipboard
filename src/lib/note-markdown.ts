/**
 * Pure helper for the detail-view "Copy note as Markdown" send-to row.
 *
 * The per-clip free-form `note` field is the user's commentary on the
 * clip ("be careful — staging only", "use this for onboarding only",
 * "this template assumes the user is already logged in"). When the
 * user pastes a clip into a doc / chat / PR / wiki, they often want
 * that caveat to RIDE ALONG so the recipient sees the warning too.
 *
 * This formatter wraps the note as a Markdown blockquote:
 *
 *   > be careful — staging only
 *
 * Multi-line notes preserve their line breaks but each line gets a
 * `> ` prefix so the whole block renders as a single quoted region
 * in any Markdown renderer (GitHub, GitLab, Notion, Obsidian, etc).
 *
 * Why a separate row (vs. always appending to other send-to copies)?
 *   - The note is META about the clip. Most send-to actions copy the
 *     clip's content for use elsewhere; tacking on the note would
 *     pollute the paste with stuff the recipient doesn't always need.
 *   - A dedicated row makes the action visible + opt-in. The user
 *     CHOOSES to send the caveat when it matters.
 *
 * Availability gate: the row hides for clips without a note (mirrors
 * the detail-view note-row Clear-button visibility — same predicate,
 * different surface). Users pressing "Send to..." on an un-noted clip
 * don't see a dead row.
 *
 * Pure: no IO, no DOM, no clipboard touch. Caller writes the result
 * to the clipboard via the existing send-to dispatch path.
 */

import { hasClipNote } from "./clip-note";

/**
 * Format a clip's note as a Markdown blockquote string. Each line of
 * the note gets a `> ` prefix so the whole block renders as a single
 * contiguous quote in any CommonMark / GFM renderer.
 *
 * Returns undefined when the clip carries no usable note (mirrors
 * hasClipNote semantics) — caller hides the send-to row in that case.
 *
 * Defensive against bad inputs (null clip, non-string note, empty,
 * whitespace-only) — all yield undefined. Newlines are NORMALISED to
 * `\n` (CRLF and bare CR collapsed) so the output blockquote is
 * platform-independent. Trailing blank lines stripped. Leading blank
 * lines stripped. Internal blank lines preserved (legitimate
 * paragraph breaks in the note).
 *
 * The output never includes the original blockquote characters even
 * if the note already starts with `> ` — wrapping a quote-of-a-quote
 * with another `> ` would yield `>> ` which is a legitimate Markdown
 * nesting. We let that through (the user wrote it; we trust them).
 */
export function noteAsMarkdownBlockquote(
  c: { note?: unknown } | null | undefined,
): string | undefined {
  if (!hasClipNote(c ?? null)) return undefined;
  const raw = (c as { note?: string }).note;
  if (typeof raw !== "string") return undefined;
  // Normalise line endings + trim outer blank lines. Inner blank
  // lines stay so paragraph breaks survive the round-trip.
  const normalized = raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const trimmed = normalized.replace(/^\n+/, "").replace(/\n+$/, "");
  if (trimmed.length === 0) return undefined;
  // Prefix every line. An empty inner line becomes `>` (Markdown
  // empty-quote-line); a non-empty line becomes `> <content>`. The
  // trailing space on empty lines is intentional — keeps the
  // blockquote visually continuous without trailing-whitespace
  // warnings in linted Markdown.
  const lines = trimmed.split("\n").map((line) => {
    if (line.length === 0) return ">";
    return `> ${line}`;
  });
  return lines.join("\n");
}

/**
 * Predicate: should the "Copy note as Markdown" send-to row appear?
 * Same gate as `noteAsMarkdownBlockquote` produces output, kept as a
 * separate function so the popup's send-action assembly can short-
 * circuit the formatter when the gate is closed (no need to allocate
 * a string just to test if it's undefined).
 *
 * Defensive: null clip → false; non-string / empty / whitespace-only
 * note → false. Same contract as hasClipNote.
 */
export function noteAsMarkdownAvailable(
  c: { note?: unknown } | null | undefined,
): boolean {
  return hasClipNote(c ?? null);
}
