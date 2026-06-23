/**
 * Pure helper for the in-page palette's per-clip note tail.
 *
 * When a clip carries a free-form note, the in-page palette shows
 * a small italicised tail BELOW the preview line so the user sees
 * the caveat ("staging only", "needs login", "deprecated as of
 * June") BEFORE pasting.
 *
 * Why this matters in the palette specifically:
 *   - The popup detail-view shows the full note + lets the user
 *     edit it, but the in-page palette is the FAST-PATH the user
 *     reaches for with Cmd+Shift+V when they want to paste-and-go.
 *     A clip with a critical caveat ("staging URL only - don't
 *     use in prod") shouldn't paste into a production form just
 *     because the user didn't open detail-view first.
 *   - Most users won't open detail-view to verify a caveat before
 *     pasting. The tail makes the warning passive: it shows up at
 *     the moment of decision (palette open / row hover), where it
 *     can actually change behavior.
 *
 * Why a separate pure module instead of inline in content.ts?
 *   - content.ts is shadow-DOM scoped + lives inside every page
 *     load. Keeping ANY logic out of there that doesn't have to
 *     be there cuts the per-page bundle size and keeps the
 *     content-script focused on capture + palette UI plumbing.
 *   - The tail format is testable in isolation: trim, collapse
 *     newlines to spaces, truncate at word boundary, ellipsis.
 *     Same shape as summarizeClipNote from lib/clip-note, but with
 *     a tighter cap (palette rows are narrow) + this module owns
 *     the HTML-safe slot for the palette's escapeHtml caller.
 *
 * Pure: no DOM. Caller wraps the result in the escapeHtml+template
 * literal for the row HTML.
 */

/** Default cap for note-tail text. Palette rows are narrow, so a
 * tight cap keeps the tail single-line without clipping the preview. */
export const PALETTE_NOTE_TAIL_DEFAULT_CAP = 80;

/**
 * Format a clip's note as the palette tail string. Returns empty
 * string when the note isn't usable (caller hides the row's
 * note-tail element entirely in that case via `hidden` attr).
 *
 * Transformations:
 *   - Non-string / null / undefined -> ""
 *   - Empty / whitespace-only -> ""
 *   - Trim outer whitespace, collapse internal whitespace (incl.
 *     newlines) to single spaces so the tail stays single-line
 *   - Truncate at word boundary inside the cap (matches
 *     summarizeClipNote contract); falls back to hard slice when
 *     the first cap chars are one big word
 *   - Append ellipsis when truncated
 *
 * Pure: deterministic; same input -> same output.
 */
export function paletteNoteTail(
  note: unknown,
  opts: { cap?: number } = {},
): string {
  if (typeof note !== "string") return "";
  const trimmed = note.trim();
  if (trimmed.length === 0) return "";
  const cap =
    typeof opts.cap === "number" &&
    Number.isFinite(opts.cap) &&
    opts.cap > 0
      ? Math.floor(opts.cap)
      : PALETTE_NOTE_TAIL_DEFAULT_CAP;
  // Collapse all whitespace (including tabs, newlines) to single
  // spaces so the tail stays single-line. Without this, a multi-
  // paragraph note would render with embedded \n characters that
  // the browser would honor in some renderers (incl. shadow DOM)
  // and break our CSS overflow:hidden contract.
  const flat = trimmed.replace(/\s+/g, " ");
  if (flat.length <= cap) return flat;
  // Word-boundary truncation. Walk back from cap to the last
  // whitespace; if that whitespace is more than 60% into the cap
  // window, use it (avoids "..." landing mid-word for natural-
  // language notes). Otherwise hard-slice (one giant word).
  const cut = flat.slice(0, cap);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > cap * 0.6) return cut.slice(0, lastSpace) + "…";
  return cut + "…";
}

/**
 * Predicate: should the note-tail element appear in the palette row?
 * Mirrors paletteNoteTail's empty contract — same gate, separate
 * function so the row-building code can short-circuit allocation.
 */
export function paletteNoteTailAvailable(note: unknown): boolean {
  if (typeof note !== "string") return false;
  return note.trim().length > 0;
}
