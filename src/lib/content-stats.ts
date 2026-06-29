/**
 * Content-stats formatter for the detail view.
 *
 * Text and link clips carry a body whose *shape* — how many words,
 * how many lines, how many characters — is signal the user often
 * wants at a glance without selecting-all-and-eyeballing. A 4,000-char
 * wall of JSON reads very differently from a 4,000-char prose note,
 * and "is this the one-liner or the multi-line block?" is a question
 * the daily-list preview (capped at 140 chars) can't answer.
 *
 * This module computes the counts and formats them into the compact
 * "1,240 chars · 198 words · 12 lines" breadcrumb that paints under
 * the detail body. Pure — no DOM, no clipboard — so the popup just
 * renders the returned string and the sanity suite can exercise every
 * grammar branch.
 *
 * Design decisions:
 *   - IMAGE clips have no meaningful text body (the "content" is a
 *     data URL), so `statsForClip` returns null for them — the caller
 *     hides the row. OCR text + image dimensions already live in their
 *     own rows; piling a "2,500,000 chars" data-URL count on top would
 *     be noise, not signal.
 *   - Words are whitespace-delimited runs. This is the universally
 *     understood "word count" (matches what editors show) and stays
 *     honest for code too — `foo(bar, baz)` counts as 2 words, which
 *     is what a human scanning the line would say.
 *   - Lines count newline-separated segments. A body with no trailing
 *     newline and one `\n` is 2 lines; a single-line body is 1 line;
 *     an empty body is 0 lines (there's nothing there). We normalise
 *     CRLF / CR to LF first so a Windows-clipboard paste doesn't
 *     double-count.
 *   - Characters count Unicode code points (via the spread iterator),
 *     not UTF-16 units, so an emoji or astral-plane glyph counts as
 *     one character the way a human perceives it — not two. This
 *     matches the note char-counter's spirit (user-facing "length").
 *   - Everything is locale-formatted with thousands separators so
 *     "1,240" reads cleanly; we use a fixed en-US grouping (commas)
 *     to stay deterministic across the sanity suite + match the rest
 *     of the popup chrome.
 *   - The breadcrumb ALSO carries a UTF-8 byte figure as its final
 *     segment ("… · 1.2 KB"). The char count answers "how long is
 *     this?"; the byte count answers "how heavy is this?" — the number
 *     that matters when pasting into a size-bounded target. The detail
 *     Send-to "Copy weight" row already surfaces chars + bytes for a
 *     single clip; appending bytes here means the at-a-glance breadcrumb
 *     and that row AGREE (same utf8ByteLength + formatCopyBytes the bulk
 *     copy/export receipts use, so every weight figure in the UI counts
 *     identically). A multi-byte glyph makes bytes > chars, which is
 *     exactly the "this paste is heavier than its length suggests"
 *     signal the byte count exists for.
 */

import { utf8ByteLength, formatCopyBytes } from "./bulk-clipboard";
import { readingTimeLabel } from "./reading-time";

export interface ContentStatsInput {
  kind: "text" | "image" | "link";
  content: string;
}

export interface ContentStats {
  /** Unicode code-point count of the body. */
  chars: number;
  /** Whitespace-delimited word count. */
  words: number;
  /** Newline-separated line count (0 for an empty body). */
  lines: number;
}

/**
 * Compute character / word / line counts for a clip body. Returns
 * null for image clips (no meaningful text body) so the caller hides
 * the stats row.
 *
 * Defensive against nullish / non-string content — a malformed record
 * shouldn't throw inside detail-view paint.
 */
export function statsForClip(c: ContentStatsInput | null | undefined): ContentStats | null {
  if (!c) return null;
  if (c.kind === "image") return null;
  const body = typeof c.content === "string" ? c.content : "";
  return computeContentStats(body);
}

/**
 * The pure counting core — exposed separately so callers (and tests)
 * can run it on an arbitrary string without wrapping it in a clip.
 */
export function computeContentStats(body: string): ContentStats {
  const text = typeof body === "string" ? body : "";
  // Code points, not UTF-16 units: spread iterates by code point so
  // a 2-unit astral glyph counts as one character.
  const chars = [...text].length;
  // Words: trim then split on any whitespace run. Empty / whitespace-
  // only bodies have zero words.
  const trimmed = text.trim();
  const words = trimmed === "" ? 0 : trimmed.split(/\s+/).length;
  // Lines: normalise CRLF / lone CR to LF, then count newline-
  // separated segments. Empty body = 0 lines (nothing there); any
  // non-empty body has at least 1 line.
  let lines: number;
  if (text === "") {
    lines = 0;
  } else {
    const normalised = text.replace(/\r\n?/g, "\n");
    lines = normalised.split("\n").length;
  }
  return { chars, words, lines };
}

/** Group an integer with commas: 1240 -> "1,240". Deterministic en-US. */
export function groupThousands(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const sign = n < 0 ? "-" : "";
  const digits = Math.abs(Math.trunc(n)).toString();
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** "1 char" / "1,240 chars" — count + pluralised unit. */
function countUnit(n: number, unit: string): string {
  return `${groupThousands(n)} ${unit}${n === 1 ? "" : "s"}`;
}

/** UTF-8 byte length of a clip's raw body (image / nullish content -> 0). */
function bytesOf(c: ContentStatsInput | null | undefined): number {
  const body = typeof c?.content === "string" ? c.content : "";
  return utf8ByteLength(body);
}

/**
 * The byte segment that tails the breadcrumb, e.g. "1.2 KB" / "742 B".
 * When `bold` is true the NUMERIC prefix is wrapped in `**` (the unit
 * stays plain) — "**1.2** KB" — so the Markdown breadcrumb bolds the
 * figure the eye scans for, matching how the char/word/line segments
 * bold only their numbers. Splitting on the last space keeps the unit
 * (B / KB / MB / GB) outside the emphasis. Plain + bold differ ONLY by
 * the `**`, so stripping them reproduces the plain segment exactly (the
 * md/plain parity contract the breadcrumb's copy paths rely on).
 */
function byteSegment(bytes: number, bold: boolean): string {
  const s = formatCopyBytes(bytes);
  if (!bold) return s;
  const sp = s.lastIndexOf(" ");
  if (sp < 0) return `**${s}**`;
  return `**${s.slice(0, sp)}** ${s.slice(sp + 1)}`;
}

/**
 * Format the breadcrumb string for the detail stats row, e.g.
 * "1,240 chars · 198 words · 12 lines". Returns null when there are
 * no stats to show (null input, image clip, or an empty body — an
 * all-zeros breadcrumb is noise, so we hide the row entirely).
 *
 * For a single-line body we DROP the line count: "12 chars · 2 words"
 * reads cleaner than "12 chars · 2 words · 1 line" when the line
 * count carries no information (everything is one line). The line
 * segment only earns its place once there's structure to report.
 */
export function formatContentStats(
  c: ContentStatsInput | null | undefined,
): string | null {
  const s = statsForClip(c);
  if (!s) return null;
  // Empty body — nothing to say.
  if (s.chars === 0 && s.words === 0 && s.lines === 0) return null;
  const parts: string[] = [
    countUnit(s.chars, "char"),
    countUnit(s.words, "word"),
  ];
  // Only surface the line count when it adds information (> 1 line).
  if (s.lines > 1) parts.push(countUnit(s.lines, "line"));
  // Byte weight always tails the breadcrumb — "how heavy is this?" beside
  // "how long is this?". Same utf8ByteLength + formatCopyBytes the Send-to
  // weight row + the bulk receipts use, so every weight figure agrees.
  parts.push(byteSegment(bytesOf(c), false));
  // Reading-time tail for long-form prose ("~6 min read"). Self-selects to
  // word-heavy clips via the 60-word floor; null (short clips, code) skips.
  const read = readingTimeLabel(s.words);
  if (read) parts.push(read);
  return parts.join(" \u00b7 ");
}

/**
 * The string that lands on the clipboard when the user clicks the
 * detail stats breadcrumb. This is the WYSIWYG payload — it equals
 * exactly what the breadcrumb shows so clicking the thing that reads
 * "1,240 chars · 198 words" copies precisely that text. We delegate to
 * formatContentStats so the rendered breadcrumb and the copied summary
 * can never drift apart (one source of truth for the format).
 *
 * Returns null in the same cases the breadcrumb hides (image clip,
 * empty body, bad input) — the caller treats null as "nothing to
 * copy" and skips the clipboard write + toast rather than putting an
 * empty string on the user's clipboard.
 */
export function contentStatsClipboard(
  c: ContentStatsInput | null | undefined,
): string | null {
  return formatContentStats(c);
}

/**
 * Toast confirmation for a completed stats copy. Echoes the copied
 * summary back so the toast itself is a receipt of what landed on the
 * clipboard ("Copied: 1,240 chars · 198 words"). Falls back to a bare
 * "Copied stats" when the summary is unexpectedly long so the toast
 * stays a single tidy line.
 */
export function formatContentStatsCopyToast(summary: string): string {
  const s = typeof summary === "string" ? summary.trim() : "";
  if (s === "") return "Copied stats";
  if (s.length > 48) return "Copied stats";
  return `Copied: ${s}`;
}

/**
 * Markdown variant of the stats line, for users who paste clip metadata
 * into docs / issues / PRs and want the numbers to render bold. Where
 * the plain breadcrumb reads "1,240 chars · 198 words", this emits
 * "**1,240** chars · **198** words" — same counts, same separator, same
 * hide-the-line-count-when-it-is-1 rule, just with the figures wrapped
 * in `**` so a Markdown renderer bolds them.
 *
 * Returns null in exactly the cases the plain breadcrumb hides (null
 * input, image clip, empty body) so the caller treats null as "nothing
 * to copy" and skips the clipboard write — the two formatters stay in
 * lock-step on WHAT counts as showable, differing only in HOW it renders.
 *
 * Only the numbers are bolded (not the unit words) so the line reads
 * "**1,240** chars" — emphasising the figure the eye scans for, the way
 * a human writing the stat by hand would. We rebuild from the same
 * ContentStats the plain path uses rather than regex-bolding the plain
 * string, so the two can never drift on grouping / pluralisation.
 */
export function formatContentStatsMarkdown(
  c: ContentStatsInput | null | undefined,
): string | null {
  const s = statsForClip(c);
  if (!s) return null;
  if (s.chars === 0 && s.words === 0 && s.lines === 0) return null;
  const parts: string[] = [
    boldCountUnit(s.chars, "char"),
    boldCountUnit(s.words, "word"),
  ];
  if (s.lines > 1) parts.push(boldCountUnit(s.lines, "line"));
  // Byte weight tails the Markdown breadcrumb too, with the figure bolded
  // (unit plain) — "**1.2** KB" — so stripping the ** reproduces the plain
  // breadcrumb's byte segment exactly, preserving the md/plain parity.
  parts.push(byteSegment(bytesOf(c), true));
  // Reading-time tail — same label as the plain breadcrumb (no figure to
  // bold), so stripping the ** still reproduces the plain line, keeping
  // md/plain parity intact.
  const read = readingTimeLabel(s.words);
  if (read) parts.push(read);
  return parts.join(" \u00b7 ");
}

/** "**1,240** chars" — bold figure + plain pluralised unit. */
function boldCountUnit(n: number, unit: string): string {
  return `**${groupThousands(n)}** ${unit}${n === 1 ? "" : "s"}`;
}
