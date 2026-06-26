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

/** Source metadata a link clip can contribute to its hover peek. */
export interface LinkPeekSource {
  /** The captured page title, if any. */
  title?: string | null;
  /** The captured page URL, if any. */
  url?: string | null;
}

/**
 * Build the hover-peek `title` for a LINK clip, folding the source
 * page title + URL into the tooltip alongside the body peek.
 *
 * Why links need their own variant: a link row's visible preview is
 * often a short title or a truncated URL that FITS in the 140-char row
 * slice — so the plain `peekTooltip` returns null and the user gets no
 * tooltip at all. But two links from the same host ("github.com/a/b"
 * vs "github.com/c/d") are exactly the case where you want to hover and
 * read the FULL url + the real page title without opening detail. This
 * surfaces that context even when the body itself isn't truncated.
 *
 * Returns null only when there's genuinely nothing to add beyond what
 * the row already shows (no title, no url, body fits) — so a link with
 * no extra context behaves exactly like the body-only peek did.
 *
 * Dedup: a source field already visible verbatim in the row slice is
 * dropped (no point repeating the URL the row already shows), and exact
 * duplicates between title / url / body collapse to one. The longer
 * body peek is appended only when the body was actually truncated AND
 * adds information past the title/url. Parts are joined with a middot.
 */
export function linkPeekTooltip(
  fullPreview: string | null | undefined,
  source: LinkPeekSource | null | undefined,
  opts: PeekOptions = {},
): string | null {
  const rowSlice = normaliseLen(opts.rowSliceLength, DEFAULT_ROW_SLICE);
  const cap = normaliseLen(opts.cap, DEFAULT_CAP);
  const body = typeof fullPreview === "string" ? fullPreview : "";
  const flatBody = body.replace(/\s+/g, " ").trim();
  // What the user can already read in the row (lowercased for dedup).
  const visible = flatBody.slice(0, rowSlice).toLowerCase();

  const parts: string[] = [];
  const seen = new Set<string>();
  const pushUnique = (raw: string): void => {
    if (!raw) return;
    const key = raw.toLowerCase();
    if (seen.has(key)) return;
    // Already fully visible in the row — nothing new to reveal.
    if (visible.length > 0 && visible.includes(key)) return;
    seen.add(key);
    parts.push(raw);
  };

  // Title first (the human-friendly disambiguator), then the URL.
  pushUnique(cleanField(source?.title, 200));
  pushUnique(cleanField(source?.url, 300));
  // Longer body, only when it was truncated (the original peek case).
  if (flatBody.length > rowSlice) {
    const bodyPeek =
      flatBody.length <= cap ? flatBody : flatBody.slice(0, cap).trimEnd() + "\u2026";
    pushUnique(bodyPeek);
  }
  if (parts.length === 0) return null;
  const joined = parts.join("  \u00b7  ");
  return joined.length <= cap ? joined : joined.slice(0, cap).trimEnd() + "\u2026";
}

/**
 * Flatten + trim + cap a single source field for the link peek. Returns
 * "" for nullish / non-string / empty input so the caller can push it
 * unconditionally. A capped field gets a trailing ellipsis.
 */
function cleanField(v: string | null | undefined, cap: number): string {
  if (typeof v !== "string") return "";
  const s = v.replace(/\s+/g, " ").trim();
  if (s === "") return "";
  return s.length <= cap ? s : s.slice(0, cap).trimEnd() + "\u2026";
}
