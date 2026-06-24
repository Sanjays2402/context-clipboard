/**
 * Pure helper for the detail-view "Copy as cURL with note comment"
 * send-to row.
 *
 * Composite of the existing `curlCommandForClip` (single-line
 * `curl 'url'`) and the per-clip free-form `note`. When a clip has
 * BOTH a curlable URL AND a note, this row emits a single-line
 * shell command with the note as a trailing `# comment`:
 *
 *   curl 'https://example.com/path?q=1' # only on staging
 *
 * Why a separate row instead of always-pairing inside `Copy as cURL`?
 *   - The standalone cURL row is the right action for the common
 *     "give me the shell command" workflow (no caveat needed). The
 *     vast majority of link clips don't have notes; tacking on a
 *     comment slot would be empty noise for them.
 *   - The combined row handles the workflow where the user is
 *     handing off a request to someone (Slack, PR comment, runbook
 *     paste) and wants the WHY to ride along with the command. A
 *     reviewer reading "curl '...' # only on staging" gets both
 *     the request AND the caveat in one paste, with the caveat as
 *     a real shell comment so they can run the line as-is
 *     (shells ignore # comments mid-line when preceded by
 *     whitespace).
 *
 * Why end-of-line comment vs leading comment?
 *   - Leading `# note\ncurl '...'` forces a 2-line paste. Some
 *     terminals + chat apps strip newlines on paste, leaving just
 *     the curl. The note would silently disappear.
 *   - End-of-line `curl '...' # note` survives single-line paste
 *     everywhere, AND lets the user pipe to head/jq/etc by
 *     editing AFTER the URL but BEFORE the `#` (which is the
 *     natural cursor position when reading the line).
 *
 * Note sanitisation for shell-comment safety:
 *   - Collapse all whitespace (incl. newlines) to single spaces so
 *     a multi-line note becomes a single comment line. Shell `#`
 *     comments only run to end-of-LINE - a newline in the note
 *     would TERMINATE the comment and start a new shell command
 *     with whatever was on the next line (potentially executable
 *     content from the note). Collapse fixes this defensively.
 *   - Cap at 200 chars - shell terminals truncate long lines and
 *     comment text past 200 chars is almost certainly multi-
 *     paragraph prose that doesn't belong on the command line.
 *     Word-boundary truncation + ellipsis matches paletteNoteTail
 *     style.
 *   - Strip control characters defensively (sanitizeClipNote
 *     already does this at store-time but a future code path
 *     might bypass it; belt + braces).
 *
 * Pure: no IO, no DOM, no clipboard touch. Caller writes the
 * result via the existing send-to dispatch path.
 */

import { hasClipNote } from "./clip-note";
import { curlCommandForClip } from "./curl-command";
import type { ClipForJson } from "./send-to";

/** Max comment length on the cURL line. */
export const CURL_COMMENT_DEFAULT_CAP = 200;

/**
 * Sanitise a note value for use as a shell comment. Pure helper -
 * collapses whitespace, strips C0 controls, truncates with ellipsis
 * at word boundary if over cap. Returns empty string when input
 * isn't a usable note (mirrors the empty contract of the other
 * note formatters).
 *
 * Exported for testability; the bundler dead-strips it if no
 * caller imports it.
 */
export function sanitiseForShellComment(
  note: unknown,
  cap: number = CURL_COMMENT_DEFAULT_CAP,
): string {
  if (typeof note !== "string") return "";
  // Strip C0 control chars (\u0000-\u001F except \t \n \r which we
  // collapse below) and \u007F. Defensive - the stored note
  // SHOULD already be sanitised but the formatter is called from
  // multiple paths.
  // eslint-disable-next-line no-control-regex
  const stripped = note.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, "");
  const trimmed = stripped.trim();
  if (trimmed.length === 0) return "";
  // Collapse all whitespace (incl. \n \r \t) to single spaces.
  const flat = trimmed.replace(/\s+/g, " ");
  // Cap normalisation: invalid (NaN, <= 0, infinity) falls back to
  // the default. Floor to integer for safety.
  const useCap =
    typeof cap === "number" && Number.isFinite(cap) && cap > 0
      ? Math.floor(cap)
      : CURL_COMMENT_DEFAULT_CAP;
  if (flat.length <= useCap) return flat;
  // Word-boundary truncation: walk back from cap to last space.
  // If the last space is too far back (one giant word), hard slice.
  const cut = flat.slice(0, useCap);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > useCap * 0.6) return cut.slice(0, lastSpace) + "…";
  return cut + "…";
}

/**
 * Build `curl '<url>' # <note>` for a clip with BOTH a curlable URL
 * AND a non-empty note. Returns undefined when either side is missing
 * so the send-to row HIDES (not greys) cleanly.
 *
 * Composition guarantee: the URL half is BYTE-IDENTICAL to what
 * `curlCommandForClip` returns standalone - we don't re-do the
 * shell-quoting math here. The note half is sanitised via
 * sanitiseForShellComment + prefixed with ` # `.
 *
 * Why ` # ` (space-hash-space)? POSIX shells treat `#` as the
 * start of a comment ONLY when it's at the start of a word (after
 * whitespace). The leading space ensures the `#` is parsed as a
 * comment marker, not part of the previous token. The trailing
 * space is cosmetic (matches conventional shell-script style).
 *
 * Pure: deterministic for the same clip.
 */
export function curlWithNoteCommentForClip(
  c: ClipForJson | null | undefined,
): string | undefined {
  if (!c) return undefined;
  if (!hasClipNote(c)) return undefined;
  const curl = curlCommandForClip(c);
  if (!curl) return undefined;
  const comment = sanitiseForShellComment(c.note);
  if (!comment) return undefined;
  return `${curl} # ${comment}`;
}

/**
 * Predicate: should the send-to row be visible? Same gate as
 * curlWithNoteCommentForClip produces output. Kept as a separate
 * helper so the send-action assembly can short-circuit the full
 * formatter when the gate is closed.
 *
 * Defensive: null clip -> false; no curlable URL -> false; no
 * usable note -> false.
 */
export function curlWithNoteCommentAvailable(
  c: ClipForJson | null | undefined,
): boolean {
  return curlWithNoteCommentForClip(c) !== undefined;
}
