/**
 * Pure helper for the bulk-bar / Cmd+K "Tag from notes" affordance.
 *
 * Scans the per-clip `note` field for `#hashtag` tokens (e.g. "be
 * careful — #staging #deprecated #review-q3") and merges them into
 * the clip's structured tag list. Lets the user convert ad-hoc
 * inline tagging (the way most people naturally write notes) into
 * the structured tag schema that powers `tag:` search, the
 * top-host pills, and the bulk-tag column - without re-typing.
 *
 * Why bulk and not per-clip?
 *
 *   - Per-clip already works via the detail-view tag editor, but
 *     when the user has been writing notes with hashtags for a
 *     while, going clip-by-clip to copy each hashtag is friction.
 *     A bulk pass scans every selected clip's note once, computes
 *     the union of new hashtags per clip, and writes them all in
 *     one chord.
 *   - Bulk emphasises the "promote inline hashtags to structured
 *     tags" workflow: select 50 clips, click once, all their
 *     `#staging` / `#deprecated` / `#draft` notes become real
 *     tags searchable via `tag:staging`.
 *
 * Hashtag grammar (intentionally tight):
 *
 *   - Start with `#` directly preceded by a word-boundary (or
 *     start-of-string). So `foo #bar` and `\n#bar` parse, but
 *     `foo#bar` doesn't (that's a fragment URL / Twitter handle
 *     style we don't want to falsely tag).
 *   - Letters / digits / underscore / hyphen. Standard hashtag
 *     character set. No emoji, no whitespace mid-tag.
 *   - Case-folded to lowercase on extraction so `#Staging` and
 *     `#staging` merge into a single tag (matches db.updateTags
 *     case-insensitivity contract).
 *   - Hyphens allowed mid-tag (`#review-q3`, `#follow-up`) -
 *     common in real-world note style. The leading `-` after `#`
 *     is rejected (`#-foo` parses as `#-foo` then strips the `-`
 *     which would yield `foo`, but we keep the strict `#[a-zA-Z0-9_]`
 *     start-character gate to avoid weird "tag from punctuation"
 *     edge cases).
 *   - Capped at 32 chars per tag (typical tag-system convention).
 *   - Capped at 16 hashtags per note (some users paste novel
 *     content; we don't want a 5000-char rant turning into 200
 *     tags).
 *
 * Pure: no IO, no DOM. Caller owns the IDB write loop + the toast.
 */

import { hasClipNote } from "./clip-note";

export interface TagFromNotesCandidate {
  id: string;
  note?: string;
  tags?: string[];
}

/**
 * Strict hashtag regex. Uses lookbehind for word-boundary so
 * `foo#bar` is rejected (the `#` must follow whitespace, start of
 * string, or punctuation). Pattern explained:
 *
 *   (?:^|[\s,;:!?.(){}\[\]<>])  - leader: SOL or whitespace/punct
 *   #                            - literal hash
 *   ([a-zA-Z0-9_][a-zA-Z0-9_-]{0,31})  - capture tag body
 *
 * Leader set includes the common end-of-sentence punctuation
 * (`.`, `,`, `;`, `:`, `!`, `?`) plus brackets/parens so common
 * note styles parse:
 *
 *   "done.#staging"     -> ["staging"]
 *   "test(#deprecated)" -> ["deprecated"]
 *   "draft;#wip"        -> ["wip"]
 *
 * Excludes `-` from the leader (else `foo-#bar` would parse, which
 * is ambiguous between "two tokens" and "URL fragment") and `'`
 * (apostrophes in contractions shouldn't trigger - "don't#" is a
 * typo, not a tag).
 *
 * The capture group enforces the start-char gate (alphanumeric or
 * underscore - not hyphen, dash, or punct) and the 32-char cap.
 * Trailing hyphen / dash on the tag is allowed (`#follow-up`).
 *
 * `g` flag so we find all matches in the note; capture is what we
 * keep (the leader char isn't part of the tag).
 */
const HASHTAG_RE =
  /(?:^|[\s,;:!?.(){}\[\]<>])#([a-zA-Z0-9_][a-zA-Z0-9_-]{0,31})/g;

/** Max hashtags extracted per note (defensive cap). */
export const MAX_TAGS_PER_NOTE = 16;

/**
 * Extract the unique set of hashtag tokens from a note string,
 * lowercase-folded + 32-char-capped + 16-per-note-capped. Returns
 * an empty array when the note is null/non-string/empty or has no
 * hashtags. Pure - same input always yields same output.
 *
 * Hashtags returned in first-appearance order (so the order in the
 * note matches the order they'll be added to the clip's tags). The
 * trailing-hyphen edge case is preserved (`#tag-` -> `tag-`) - we
 * trim only if it makes the tag empty, which it can't by regex
 * construction.
 */
export function extractHashtagsFromNote(note: unknown): string[] {
  if (typeof note !== "string" || note.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  HASHTAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HASHTAG_RE.exec(note)) !== null) {
    const tag = m[1].toLowerCase();
    if (seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= MAX_TAGS_PER_NOTE) break;
  }
  return out;
}

export interface TagFromNotesPlan {
  /** Selection size (= ids passed in that survived id-validity). */
  total: number;
  /** Clips with a note but no extractable hashtags. */
  emptyNotes: number;
  /** Clips with no note at all. */
  noNote: number;
  /** Clips where every extracted tag was already present. */
  unchanged: number;
  /** Clips whose tag list will be modified (union grew). */
  changed: number;
  /** Total NEW tag-additions across all clips (sum of newly-added). */
  totalAdded: number;
  /** Distinct tag names introduced anywhere in the selection. */
  distinctNewTags: string[];
}

/**
 * Project what the bulk action will do given the current selection.
 * Used by the post-action toast (truthful "X new tags added across
 * Y clips") and the optional pre-prompt label.
 *
 * Defensive against empty / non-array / malformed entries.
 * Per-clip: extract hashtags, normalise existing tags (trim + lower,
 * matches db.updateTags) into a Set, count how many extracted tags
 * AREN'T already present. If at least one is new, the clip is
 * "changed".
 */
export function planTagFromNotes<T extends TagFromNotesCandidate>(
  clips: T[],
): TagFromNotesPlan {
  const plan: TagFromNotesPlan = {
    total: 0,
    emptyNotes: 0,
    noNote: 0,
    unchanged: 0,
    changed: 0,
    totalAdded: 0,
    distinctNewTags: [],
  };
  if (!Array.isArray(clips)) return plan;
  const distinctNew = new Set<string>();
  for (const c of clips) {
    if (!c || typeof c.id !== "string" || c.id.length === 0) continue;
    plan.total++;
    if (!hasClipNote(c)) {
      plan.noNote++;
      continue;
    }
    const extracted = extractHashtagsFromNote(c.note);
    if (extracted.length === 0) {
      plan.emptyNotes++;
      continue;
    }
    // Normalise existing tags to lowercase for the comparison.
    // db.updateTags trims + dedups but doesn't lowercase, so we
    // do the lowercase compare here and the writer (caller) merges
    // case-insensitively too.
    const existing = new Set<string>();
    if (Array.isArray(c.tags)) {
      for (const t of c.tags) {
        if (typeof t === "string") existing.add(t.trim().toLowerCase());
      }
    }
    let added = 0;
    for (const t of extracted) {
      if (existing.has(t)) continue;
      existing.add(t);
      added++;
      distinctNew.add(t);
    }
    if (added === 0) {
      plan.unchanged++;
    } else {
      plan.changed++;
      plan.totalAdded += added;
    }
  }
  plan.distinctNewTags = Array.from(distinctNew).sort();
  return plan;
}

/**
 * Compute the merged tag list a clip should be written with. Returns
 * undefined when the merge would no-op (no hashtags found, or every
 * extracted hashtag already present). Caller uses this to skip the
 * IDB write entirely for unchanged clips.
 *
 * Output preserves the existing tag-list ORDER (no re-sort), then
 * appends NEW hashtags in first-appearance-in-note order. Same
 * pattern as bulk-tag (merge by append, dedup by set), but the
 * source of the new tags is the note text instead of a prompt.
 *
 * Pure: no IDB. Caller writes via db.updateTags.
 */
export function mergedTagsForClip<T extends TagFromNotesCandidate>(
  c: T,
): string[] | undefined {
  if (!c || typeof c.id !== "string") return undefined;
  if (!hasClipNote(c)) return undefined;
  const extracted = extractHashtagsFromNote(c.note);
  if (extracted.length === 0) return undefined;
  const existingArr = Array.isArray(c.tags)
    ? c.tags.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    : [];
  const existingLower = new Set(existingArr.map((t) => t.trim().toLowerCase()));
  const additions: string[] = [];
  for (const t of extracted) {
    if (existingLower.has(t)) continue;
    existingLower.add(t);
    additions.push(t);
  }
  if (additions.length === 0) return undefined;
  return [...existingArr, ...additions];
}

/**
 * Whether the bulk button should fire at all. False when:
 *   - selection is empty
 *   - no clip in the selection has any extractable hashtags
 *
 * Used to short-circuit the IDB loop + the toast.
 */
export function isTagFromNotesActionable<T extends TagFromNotesCandidate>(
  clips: T[],
): boolean {
  if (!Array.isArray(clips) || clips.length === 0) return false;
  for (const c of clips) {
    if (mergedTagsForClip(c) !== undefined) return true;
  }
  return false;
}

/**
 * Build the post-action toast message. Shapes:
 *
 *   - total === 0                  -> "Nothing to tag"
 *   - no extracted hashtags        -> "No hashtags in any note"
 *   - all extractions already-tagged-> "Already tagged"
 *   - 1 new tag, 1 clip            -> "Added #x to 1 clip"
 *   - N new tags, 1 clip           -> "Added N tags to 1 clip"
 *   - 1 distinct tag, N clips      -> "Added #x to N clips"
 *   - many distinct, many clips    -> "Added N tags across M clips"
 */
export function formatTagFromNotesToast(plan: TagFromNotesPlan): string {
  const total = Math.max(0, Math.floor(Number(plan.total) || 0));
  if (total === 0) return "Nothing to tag";
  const changed = Math.max(0, Math.floor(Number(plan.changed) || 0));
  const totalAdded = Math.max(0, Math.floor(Number(plan.totalAdded) || 0));
  const distinct = Array.isArray(plan.distinctNewTags)
    ? plan.distinctNewTags
    : [];
  // No clip's note had any hashtags
  if (distinct.length === 0 && totalAdded === 0) {
    // Distinguish: do ANY clips have notes? If not, the user
    // probably selected a batch of un-noted clips by mistake.
    const noNote = Math.max(0, Math.floor(Number(plan.noNote) || 0));
    if (noNote === total) return "Selection has no notes";
    return "No hashtags in any note";
  }
  // Hashtags found but all already structured
  if (changed === 0) return "Already tagged";
  if (distinct.length === 1) {
    const tag = `#${distinct[0]}`;
    if (changed === 1) return `Added ${tag} to 1 clip`;
    return `Added ${tag} to ${changed} clips`;
  }
  if (changed === 1) {
    return `Added ${totalAdded} tags to 1 clip`;
  }
  return `Added ${totalAdded} tags across ${changed} clips`;
}

/**
 * Hover-tooltip for the bulk-bar button. Adapts to the live
 * selection so the user sees the upcoming action before clicking.
 * Same selection-shape-only approach as bulk-note button title -
 * tooltip's job is to invite the action, not preview a specific
 * value.
 */
export function formatTagFromNotesButtonTitle<T extends TagFromNotesCandidate>(
  clips: T[],
): string {
  if (!Array.isArray(clips) || clips.length === 0) {
    return "Tag selection from hashtags in notes";
  }
  const plan = planTagFromNotes(clips);
  if (plan.changed === 0) {
    // Distinguish three failure modes for the hover label:
    //   - no notes at all in the selection
    //   - notes exist but contain zero hashtags
    //   - hashtags exist but every one is already in the structured
    //     tag list
    // The first two correspond to empty `distinctNewTags`; we look
    // at unchanged > 0 to detect "all already tagged" because that's
    // the case where extraction found something but the merge no-op'd.
    if (plan.unchanged > 0) {
      return "All extracted hashtags are already tagged";
    }
    if (plan.distinctNewTags.length === 0) {
      if (plan.noNote === plan.total) {
        return "No notes in selection - nothing to tag";
      }
      return "No new hashtags found in notes";
    }
    return "All extracted hashtags are already tagged";
  }
  const noun = plan.changed === 1 ? "clip" : "clips";
  if (plan.distinctNewTags.length === 1) {
    return `Add #${plan.distinctNewTags[0]} to ${plan.changed} ${noun}`;
  }
  return `Add ${plan.totalAdded} tags across ${plan.changed} ${noun}`;
}
