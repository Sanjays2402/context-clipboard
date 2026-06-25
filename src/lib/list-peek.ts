/**
 * Hover-to-peek tooltip text for truncated clip-list previews.
 *
 * Each row in the daily list renders only the first 140 characters of a
 * clip's preview (so rows stay one-or-two lines and the list scans fast).
 * For a long snippet that's often not enough to tell two similar clips
 * apart without opening the detail view — "is this the staging config or
 * the prod one?" lives in characters 200-260, off the end of the row.
 *
 * This module decides the native-`title` peek string a row should carry:
 * a longer slice of the SAME preview text, shown on hover, so the user
 * can disambiguate without a click. It's the cheapest possible affordance
 * (a `title` attr — works with keyboard focus + screen readers too) and
 * costs nothing when the preview already fits.
 *
 * Pure — no DOM. The popup reads the clip's preview text + the row slice
 * length it actually rendered, and attaches the returned string as the
 * `.preview` element's `title` (or omits it on null).
 *
 * Design decisions:
 *   - Returns null when the preview is NOT truncated (full text fits in
 *     the row slice). A title that just repeats the visible row is noise
 *     and produces a redundant browser tooltip; we skip it so only the
 *     rows that benefit get the affordance.
 *   - Caps the peek at a sane length (default 500 chars) rather than
 *     dumping a 4,000-char wall into a tooltip. A native title that long
 *     is unreadable and some platforms truncate it anyway. 500 chars is
 *     ~3.5x the row slice — enough to see substantially more context
 *     while staying a "peek", not "the whole clip". The detail view is
 *     still the place to read everything.
 *   - Appends a single-character ellipsis when the peek itself is capped
 *     (full text longer than the cap) so the user knows there's still
 *     more past the tooltip. No ellipsis when the peek shows the whole
 *     remaining text.
 *   - Collapses interior runs of whitespace/newlines to single spaces so
 *     a multi-line code block renders as a readable one-paragraph peek
 *     instead of a tall ragged tooltip. The detail view preserves exact
 *     formatting; the peek trades fidelity for scannability on purpose.
 *   - Defensive against nullish / non-string input and non-finite
 *     lengths — a malformed record yields null rather than throwing
 *     inside the list-render hot path.
 */

export interface PeekOptions {
  /**
   * How many characters the row actually rendered (the truncation
   * point). Defaults to 140 to match the list's preview slice.
   */
  rowSliceLength?: number;
  /**
   * Maximum length of the peek string itself. Defaults to 500.
   */
  cap?: number;
}

const DEFAULT_ROW_SLICE = 140;
const DEFAULT_CAP = 500;

/**
 * Build the hover-peek `title` string for a clip preview, or null when
 * the preview isn't truncated (nothing more to reveal) or the input is
 * unusable.
 *
 * `fullPreview` is the clip's complete preview text (the popup passes
 * `c.preview || c.content`). The comparison is done on the RAW length
 * (code points) so it matches what the row's `.slice(0, 140)` cut.
 */
export function peekTooltip(
  fullPreview: string | null | undefined,
  opts: PeekOptions = {},
): string | null {
  if (typeof fullPreview !== "string") return null;
  const rowSlice = normaliseLen(opts.rowSliceLength, DEFAULT_ROW_SLICE);
  const cap = normaliseLen(opts.cap, DEFAULT_CAP);
  // Use the raw string length for the truncation test so it lines up
  // with the row's `.slice(0, rowSlice)` (which counts UTF-16 units).
  if (fullPreview.length <= rowSlice) return null;
  // Collapse interior whitespace so a multi-line body reads as one tidy
  // paragraph in the tooltip. Trim the ends too — leading newlines from
  // capture would otherwise show as a blank gap.
  const flattened = fullPreview.replace(/\s+/g, " ").trim();
  // After flattening, a body that was mostly whitespace past the slice
  // point can collapse to something that fits — re-check so we don't
  // emit a peek that's no longer than the row.
  if (flattened.length <= rowSlice) return null;
  if (flattened.length <= cap) return flattened;
  // Cap and mark continuation with a single ellipsis glyph.
  return flattened.slice(0, cap).trimEnd() + "\u2026";
}

/** Clamp a length option to a positive integer, else fall back. */
function normaliseLen(v: number | undefined, fallback: number): number {
  if (v == null || !Number.isFinite(v)) return fallback;
  const n = Math.trunc(v);
  return n > 0 ? n : fallback;
}
