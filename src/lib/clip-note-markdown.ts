/**
 * Pure helper for the detail-view "Copy clip + note as Markdown" send-to row.
 *
 * Composite of the existing `fencedCodeForClip` body builder and the
 * `noteAsMarkdownBlockquote` formatter shipped last tick. When a clip
 * has BOTH a body (text or link content) AND a note, this row emits
 * a single copy combining the two:
 *
 *   ```python
 *   <body>
 *   ```
 *
 *   > <note>
 *
 * Why a separate row instead of always-pairing inside one of the
 * existing rows?
 *
 *   - "Copy as fenced code" alone is the right action for sharing
 *     just the snippet (most common). Tacking on the note would
 *     pollute the paste with caveat text the recipient doesn't
 *     always want.
 *   - "Copy note as Markdown" alone is the right action for
 *     sharing JUST the caveat (rarer but still useful — e.g. a
 *     reviewer asking "remind me why we said this needs a
 *     re-run?").
 *   - The COMBINED row handles the third workflow: sharing a
 *     snippet plus its WHY in a single paste. Common when
 *     dropping into a PR comment / doc / chat where you want both
 *     the code and the caveat to land together.
 *
 * Why fenced-code + blockquote (vs. blockquote-then-code, or both
 * in fenced)? Because Markdown renderers paint them as visually
 * distinct blocks — code in a monospace box, note in a quoted
 * sidebar — which matches the user's mental model (the note is
 * COMMENTARY ON the code, not part of it). Putting them inline
 * (e.g. note as a code comment) would require knowing the
 * snippet's language comment syntax + would corrupt the snippet
 * for re-use.
 *
 * Two newlines between the fenced block and the blockquote so
 * Markdown renderers treat them as separate paragraphs (a single
 * newline would risk the blockquote being parsed as the last
 * line of the fenced code on some renderers). The CommonMark spec
 * is forgiving but real-world Markdown engines (GitHub, Notion,
 * Slack via mrkdwn-ish fallback) differ on edge cases — two
 * newlines is the safest separator.
 *
 * Availability gate: row HIDES unless the clip carries BOTH
 *   - a usable body (kind != image, non-empty content) AND
 *   - a usable note (hasClipNote(c))
 *
 * If either side is missing, the user can reach for the dedicated
 * single-purpose row (fenced-code OR note-md) — no point in a
 * dimmed half-broken combo row.
 *
 * Image clips are excluded: there's no fenced-code form for binary
 * image data, and the existing markdown-link row already covers
 * the "share the image alongside its source" use case.
 *
 * Pure: no IO, no DOM, no clipboard touch. Caller writes the
 * result to the clipboard via the existing send-to dispatch path.
 */

import { hasClipNote } from "./clip-note";
import { noteAsMarkdownBlockquote } from "./note-markdown";
import { detectCodeLang } from "./util";
import type { ClipItem } from "./types";

/**
 * Minimal structural type accepted by clipAndNoteAsMarkdown. Mirrors
 * the SendableClip shape but kept independent so this module doesn't
 * pull in send-to.ts (avoids circular import).
 */
export interface ClipForNoteCombo {
  kind: ClipItem["kind"];
  content: string;
  note?: unknown;
}

/**
 * Format the clip's body as a fenced code block AND its note as a
 * Markdown blockquote, joined by a paragraph-break.
 *
 * Returns undefined when:
 *   - clip is null/undefined
 *   - clip.kind === "image" (no fenced-code form for image data)
 *   - clip.content is empty / whitespace-only after trim
 *   - clip.note doesn't pass hasClipNote (missing / wrong type /
 *     empty / whitespace)
 *
 * The fenced code carries an auto-detected language tag (same
 * detector the existing "Copy as fenced code" row uses) so syntax
 * highlighting works in any GFM renderer.
 *
 * The blockquote uses the same line-by-line `> ` prefix as
 * noteAsMarkdownBlockquote — internal blank lines preserved as
 * empty `>` placeholders (paragraph breaks survive Markdown
 * round-trip), trailing/leading blanks stripped, CRLF normalised.
 *
 * Both halves come from existing pure modules so the output is
 * byte-identical to what the user gets from the two single-purpose
 * rows concatenated — no surprises, no drift between the combined
 * row and its components.
 */
export function clipAndNoteAsMarkdown(
  c: ClipForNoteCombo | null | undefined,
): string | undefined {
  if (!c) return undefined;
  if (c.kind === "image") return undefined;
  if (typeof c.content !== "string") return undefined;
  const body = c.content.trim();
  if (body.length === 0) return undefined;
  // hasClipNote is the source-of-truth gate for "this clip has a
  // usable note" — same predicate as the search filter, the detail-
  // view paint, and the standalone note-md row. Single source means
  // the combined row's visibility never disagrees with the others.
  if (!hasClipNote(c)) return undefined;
  // noteAsMarkdownBlockquote returns undefined for the same cases
  // hasClipNote rejects, but we double-check defensively here so
  // a future divergence in the two predicates doesn't crash.
  const blockquote = noteAsMarkdownBlockquote(c as { note?: unknown });
  if (!blockquote) return undefined;
  const lang = detectCodeLang(body) ?? "";
  // Fenced code: ```<lang>\n<body>\n``` — same shape as the
  // standalone fenced-code row in send-to.ts so the two stay
  // identical character-for-character on the body half.
  const fenced = "```" + lang + "\n" + body + "\n```";
  // Two newlines between fenced and blockquote so renderers treat
  // them as separate paragraphs. Single newline can confuse some
  // engines into reading the blockquote as the closing fence's
  // trailing text.
  return fenced + "\n\n" + blockquote;
}

/**
 * Predicate: should the "Copy clip + note as Markdown" send-to row
 * be visible? Same gate as clipAndNoteAsMarkdown produces output;
 * kept separate so the send-action assembly can short-circuit the
 * full formatter when the gate is closed (no need to allocate the
 * combined string just to test if it's undefined).
 *
 * Defensive: null clip -> false; image kind -> false; empty body
 * -> false; missing/empty note -> false.
 */
export function clipAndNoteAsMarkdownAvailable(
  c: ClipForNoteCombo | null | undefined,
): boolean {
  if (!c) return false;
  if (c.kind === "image") return false;
  if (typeof c.content !== "string") return false;
  if (c.content.trim().length === 0) return false;
  return hasClipNote(c);
}
