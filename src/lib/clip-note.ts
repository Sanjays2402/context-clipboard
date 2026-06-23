/**
 * Pure helpers for the per-clip free-form note feature.
 *
 * A "clip note" is a piece of free-form user commentary attached to a
 * clip — orthogonal to tags (which are structured + searchable) and
 * orthogonal to the redaction/template/expires fields (which are
 * structural). It survives copy and re-capture, lives in the
 * `note?: string` field on ClipItem (schema-additive — no IDB schema
 * bump, just an optional property).
 *
 * Use case: "this snippet looks identical to that one but actually
 * came from the staging branch — be careful" / "use this when
 * onboarding new hires only" / "this template assumes the user is
 * already logged in". The kind of context that belongs on the clip
 * but doesn't fit the tag/template/source model.
 *
 * Why a pure module?
 *
 *   - Trim + length cap is a single source of truth so the detail-view
 *     editor + the importer + the search-needle path all sanitize the
 *     same way. A note imported from another device shouldn't be
 *     able to carry a 100KB blob just because the editor wasn't
 *     reachable on that codepath.
 *   - Empty notes don't deserve to round-trip through IDB (writing an
 *     empty string is a waste; we strip the field on save so deleted
 *     notes actually disappear from the storage breakdown).
 *
 * Cap rationale: 2,000 chars is roughly two paragraphs of dense
 * prose - enough to write a meaningful caveat but small enough that
 * a thousand clips with notes still fits in the per-clip storage
 * budget alongside the actual content.
 *
 * Pure: no DOM, no IDB, no clock. Caller owns the IDB write +
 * the toast.
 */

/** Hard cap on note length. Anything longer is sliced. */
export const CLIP_NOTE_MAX_LEN = 2_000;

/**
 * Sanitize a raw note string for storage. Returns:
 *
 *   - `undefined` when the input is empty/whitespace/non-string/null
 *     after trimming — caller writes the field as `undefined` so the
 *     clip's storage-breakdown doesn't carry a useless empty string.
 *   - `string` (≤ 2,000 chars) when the input has real content. Always
 *     trimmed at both ends. Internal whitespace is preserved
 *     (paragraph notes need it).
 *
 * Defensive against:
 *   - `null` / `undefined` → undefined
 *   - non-string (number, object) → undefined
 *   - all-whitespace → undefined (empty after trim)
 *   - control chars (NUL, etc) → stripped (paranoia — IDB doesn't care
 *     but the popup's <textarea> rendering is cleaner without them)
 */
export function sanitizeClipNote(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  // Strip C0 control chars (except \t, \n, \r which paragraph notes
  // legitimately use). Keeps a hostile import from sneaking, e.g.,
  // a NUL into the field.
  const cleaned = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  const trimmed = cleaned.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length <= CLIP_NOTE_MAX_LEN) return trimmed;
  return trimmed.slice(0, CLIP_NOTE_MAX_LEN);
}

/**
 * Predicate: does the clip carry a meaningful note? Used by the
 * detail-view to show/hide the note row + by the `is:noted` search
 * operator (parser flag handled separately) to gate matches.
 *
 * Defensive against missing / wrong-type / empty / whitespace-only
 * note fields — matches the sanitizer's empty contract so the two
 * predicates can never disagree.
 */
export function hasClipNote(c: { note?: unknown } | null | undefined): boolean {
  if (!c) return false;
  if (typeof c.note !== "string") return false;
  return c.note.trim().length > 0;
}

/**
 * Compose a one-line summary of a note for the detail-view row title
 * or a search-result preview. Truncates with an ellipsis if the
 * note is longer than `peek` chars. Newlines collapse to single
 * spaces so the summary stays single-line.
 *
 * Defensive against bad input — returns empty string when the note
 * isn't a non-empty string.
 */
export function summarizeClipNote(note: unknown, opts: { peek?: number } = {}): string {
  if (typeof note !== "string") return "";
  const trimmed = note.trim();
  if (trimmed.length === 0) return "";
  const flat = trimmed.replace(/\s+/g, " ");
  const peek =
    typeof opts.peek === "number" && Number.isFinite(opts.peek) && opts.peek > 0
      ? Math.floor(opts.peek)
      : 120;
  if (flat.length <= peek) return flat;
  // Trim to last word boundary inside the peek window so we don't
  // chop mid-word. Falls back to hard slice when no whitespace is
  // present (one giant word).
  const cut = flat.slice(0, peek);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > peek * 0.6) return cut.slice(0, lastSpace) + "…";
  return cut + "…";
}

/**
 * Compute the storage delta (in chars, not bytes — close enough for
 * the popup status row) between an old note and a new note. Used by
 * the editor to show "+42 chars" / "-12 chars" as the user types.
 *
 * Defensive against non-string inputs (treated as empty).
 */
export function clipNoteDelta(oldNote: unknown, newNote: unknown): number {
  const a = typeof oldNote === "string" ? oldNote.trim().length : 0;
  const b = typeof newNote === "string" ? newNote.trim().length : 0;
  return b - a;
}
