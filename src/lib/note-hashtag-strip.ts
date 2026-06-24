/**
 * Pure helper for stripping `#hashtag` tokens out of a note while
 * preserving the surrounding prose.
 *
 * The companion to tag-from-notes and tag-from-notes-clear:
 *   - tag-from-notes: PROMOTES hashtags into structured tags (note untouched)
 *   - tag-from-notes-clear (combo): PROMOTES + WIPES the WHOLE note
 *   - note-hashtag-strip (THIS module): STRIPS just the `#tag` tokens
 *     and leaves the prose intact
 *
 * Why a third variant?
 *   - The combo (Tag + clear notes) is destructive of prose. A user
 *     who wrote "be careful #staging - check with $person first"
 *     loses the "check with $person first" context when the whole
 *     note gets wiped.
 *   - The standalone Tag-from-notes leaves the inline tags in the
 *     note, which is fine but creates redundancy: once `#staging`
 *     is in the structured tag list, the inline `#staging` in the
 *     note is noise.
 *   - This module is the precise middle: REMOVE the redundancy
 *     (strip `#tag` tokens) but KEEP the prose ("be careful - check
 *     with $person first"). Two writes are still pure: one to
 *     updateTags (the promotion side), one to setClipNote (the
 *     strip side).
 *
 * Stripping grammar (mirrors extractHashtagsFromNote):
 *   - Match `#[a-zA-Z0-9_][a-zA-Z0-9_-]{0,31}` preceded by
 *     start-of-string OR whitespace/punctuation (same leader set as
 *     extraction so we strip exactly what extraction would promote).
 *   - Remove the `#tag` token AND a single trailing space if present
 *     (so "foo #bar baz" -> "foo baz" not "foo  baz" with double space).
 *   - Preserve the leading punct (the leader set isn't consumed by
 *     extraction either) so "draft;#wip later" -> "draft; later".
 *   - Multi-pass collapse: after stripping all tokens, collapse runs
 *     of whitespace to single spaces, then trim.
 *
 * Idempotent: stripping twice produces the same output as once.
 *
 * Pure: no IO, no DOM. Caller owns the setClipNote write.
 */

import { sanitizeClipNote } from "./clip-note";

/**
 * Match a single `#hashtag` token (with the same leader-set as
 * extractHashtagsFromNote). The leader char isn't part of the
 * token but IS captured so the replacement can decide whether to
 * keep it (we keep punctuation, drop whitespace+token together).
 *
 *   group 1: the leader char (whitespace OR punctuation OR empty
 *            for start-of-string)
 *   group 2: the hashtag body (without leading `#`)
 *
 * `g` flag for replace-all.
 */
const STRIP_RE =
  /(^|[\s,;:!?.(){}\[\]<>])#([a-zA-Z0-9_][a-zA-Z0-9_-]{0,31})/g;

/**
 * Strip every `#hashtag` token from the note string, preserving the
 * surrounding prose. Returns the cleaned note (possibly undefined
 * if the result is empty after sanitization — same empty contract
 * as sanitizeClipNote).
 *
 * Behaviors:
 *   - Whitespace-leader tokens: drop the entire `\s#tag` run so we
 *     don't leave a double space. "foo #bar baz" -> "foo baz".
 *   - Punctuation-leader tokens: keep the punct, drop `#tag`.
 *     "draft;#wip later" -> "draft; later" (then collapsed to
 *     "draft; later" still — single space already).
 *   - Start-of-string tokens: drop the token cleanly.
 *     "#staging do this" -> "do this".
 *   - Multi-token: "be careful — #staging #wip later" -> "be careful — later".
 *   - Whitespace collapse after strip: any runs of >=2 spaces are
 *     collapsed to a single space (without touching newlines, so
 *     paragraph notes survive).
 *
 * Defensive: non-string input or empty input returns undefined
 * (same as sanitizeClipNote on bad input).
 *
 * Pure: deterministic; same input -> same output.
 */
export function stripHashtagsFromNote(note: unknown): string | undefined {
  if (typeof note !== "string" || note.length === 0) return undefined;
  // Reset regex state defensively (g-flag lastIndex carries between
  // calls on a shared regex).
  STRIP_RE.lastIndex = 0;
  // Pass 1: replace each `<leader>#tag` with the leader char alone
  // (for punctuation leaders) or empty (for whitespace/start
  // leaders — we want to drop the leading whitespace too so the
  // join stays clean).
  const stripped = note.replace(STRIP_RE, (_match, leader: string) => {
    if (leader.length === 0) return ""; // start-of-string
    // Whitespace leader: drop the whitespace AND the token so we
    // don't leave a double space when the next char is also a space.
    if (/^\s$/.test(leader)) return "";
    // Punctuation leader: keep the punct, drop the `#tag`.
    return leader;
  });
  // Pass 2: collapse runs of horizontal whitespace (NOT newlines)
  // to a single space. Some tokens were embedded mid-line — after
  // stripping we may have left "foo  baz" where the leader+tag
  // disappeared. Use [ \t]+ so paragraph breaks (newlines) survive.
  const collapsed = stripped.replace(/[ \t]+/g, " ");
  // Pass 3: collapse runs of blank lines (>2 newlines) down to two
  // for the same reason — stripping a leading-of-line `#tag` could
  // leave a stray blank line in a paragraph note. Multi-pass is
  // safer than one big regex because the input set is small.
  const tidied = collapsed.replace(/\n{3,}/g, "\n\n");
  // Pass 4: trim leading/trailing whitespace on each line so we
  // don't leave indentation artifacts from stripped leading tokens.
  const perLine = tidied
    .split("\n")
    .map((line) => line.replace(/^[ \t]+|[ \t]+$/g, ""))
    .join("\n");
  // Final sanitize routes through the same sanitizer the editor +
  // bulk path use, so empty/whitespace returns undefined and the
  // 2000-char cap is respected. The cleaned note IS shorter (we
  // removed text) so the cap is a no-op in practice, but routing
  // through the central sanitizer keeps the contract uniform.
  return sanitizeClipNote(perLine);
}

/**
 * Predicate: would stripping change the note? Returns true when
 * the note contains at least one extractable hashtag (= the strip
 * would actually do work). False on empty / no-hashtag / non-string
 * input so the caller can hide the chip cleanly.
 *
 * Implementation: cheap one-pass test via STRIP_RE.test before the
 * full replace. Same regex used by stripHashtagsFromNote so the
 * gate + the action can't disagree.
 *
 * Pure: deterministic for the same input.
 */
export function noteHasStrippableHashtags(note: unknown): boolean {
  if (typeof note !== "string" || note.length === 0) return false;
  // Reset before test (g-flag).
  STRIP_RE.lastIndex = 0;
  return STRIP_RE.test(note);
}

/**
 * Compute how many hashtag tokens the strip would remove. Used by
 * the chip label and tooltip to surface the count honestly:
 *   "Strip 3 #tags" instead of an opaque "Strip hashtags".
 *
 * Counts EACH occurrence (so "foo #x #y #x" returns 3, not 2 —
 * the strip removes every occurrence, not just distinct names).
 *
 * Defensive: non-string / empty returns 0.
 *
 * Pure: deterministic for the same input.
 */
export function countStrippableHashtagsInNote(note: unknown): number {
  if (typeof note !== "string" || note.length === 0) return 0;
  STRIP_RE.lastIndex = 0;
  let count = 0;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let m: RegExpExecArray | null;
  while ((m = STRIP_RE.exec(note)) !== null) {
    count++;
    // Guard against zero-width matches (shouldn't happen given the
    // capture group requires at least one char, but defensive).
    if (m.index === STRIP_RE.lastIndex) STRIP_RE.lastIndex++;
  }
  return count;
}

/**
 * Build the chip's visible label. Adapts to the count grammar:
 *   - 0          -> "" (chip hidden — caller checks noteHasStrippableHashtags)
 *   - 1          -> "Strip #tag"
 *   - 2-3        -> "Strip 2 #tags"
 *   - 4+         -> "Strip N #tags"
 *
 * Single-line, no overflow. Tooltip carries the full detail.
 *
 * Pure: deterministic for the same count.
 */
export function formatStripHashtagsChipLabel(count: number): string {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n === 0) return "";
  if (n === 1) return "Strip #tag";
  return `Strip ${n} #tags`;
}

/**
 * Hover-tooltip for the strip chip. Surfaces the destructive bit
 * up-front ("remove from note, keep prose") so the user knows what
 * the button will and WON'T do. Specifically calls out the prose
 * preservation contract to differentiate from the "Clear note"
 * sibling button.
 *
 * Returns empty when nothing to strip (defensive — caller hides
 * the chip).
 *
 * Pure: deterministic for the same count.
 */
export function formatStripHashtagsChipTooltip(count: number): string {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n === 0) return "";
  const noun = n === 1 ? "hashtag" : "hashtags";
  return `Remove ${n} inline ${noun} from the note (prose preserved — does NOT promote to structured tags)`;
}

/**
 * Post-action toast. Adapts to the count grammar:
 *   - 0          -> "Nothing to strip"
 *   - 1          -> "Stripped #tag from note"
 *   - 2+         -> "Stripped N hashtags from note"
 *
 * Tighter than the combo's toast because this action is per-clip
 * and only does ONE thing.
 *
 * Pure: deterministic for the same count.
 */
export function formatStripHashtagsToast(count: number): string {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n === 0) return "Nothing to strip";
  if (n === 1) return "Stripped #tag from note";
  return `Stripped ${n} hashtags from note`;
}
