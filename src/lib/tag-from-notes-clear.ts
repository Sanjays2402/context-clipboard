/**
 * Pure helper for the bulk-bar "Tag from notes + clear notes" combo.
 *
 * Composes the existing single-clip primitives:
 *   - extractHashtagsFromNote + mergedTagsForClip (tag-from-notes)
 *   - sanitizeClipNote / hasClipNote (clip-note)
 *
 * Workflow:
 *   1. Extract #hashtags from each selected clip's note.
 *   2. Merge them into the structured tag list (same case-insensitive
 *      dedup as bulk-bar Tag-from-notes).
 *   3. Clear the source note text on every clip that had ANY hashtags
 *      promoted - the inline #staging is now redundant with the
 *      structured `tag:staging`, so wiping the note is a housekeeping
 *      win for users who want a tidy detail-view.
 *
 * Why the combined action vs separate buttons?
 *   - The standalone "Tag from notes" button promotes WITHOUT
 *     touching the note. Some users want that - the note carries
 *     more than just the hashtags ("be careful #staging - check
 *     with $person first") and clearing the note would lose the
 *     prose context.
 *   - The standalone "Add note to selection" can clear notes
 *     (empty input) but it's UNCONDITIONAL - every selected clip's
 *     note gets wiped regardless of what's in it.
 *   - The COMBO action is targeted: only clears notes on clips
 *     where the action actually PROMOTED something. A clip whose
 *     note has no hashtags (just prose) keeps its note. A clip
 *     whose note has ALL-already-promoted hashtags also keeps its
 *     note (nothing got promoted, so nothing to clean up).
 *
 * Conservative-by-default contract:
 *   - We only clear notes on clips where promotion HAPPENED.
 *     A clip with "#staging - and also call IT first" has the
 *     prose context lost when we clear, which IS a cost - but the
 *     button label warns ("Tag + CLEAR notes") and the toast says
 *     how many notes got cleared, so the user knows what was lost.
 *   - The standalone "Tag from notes" button STILL exists for the
 *     keep-the-prose workflow.
 *
 * Pure: no IO, no DOM. Caller owns the IDB write loop (updateTags +
 * setClipNote) and the toast.
 */

import {
  extractHashtagsFromNote,
  mergedTagsForClip,
  type TagFromNotesCandidate,
} from "./tag-from-notes";
import { hasClipNote } from "./clip-note";

export interface TagFromNotesClearPlan {
  /** Selection size (valid ids only). */
  total: number;
  /** Clips with no extractable hashtags - untouched by either op. */
  noPromote: number;
  /** Clips where every extracted hashtag was already structured. */
  alreadyTagged: number;
  /** Clips whose tag list will be updated AND note cleared. */
  promoteAndClear: number;
  /** Total NEW tag-additions across all clips (sum across all promotes). */
  totalAdded: number;
  /** Distinct tag names introduced anywhere in the selection. */
  distinctNewTags: string[];
  /** Number of notes that will be cleared (= promoteAndClear). */
  cleared: number;
}

/**
 * Compute per-clip action: what will be promoted AND whether the note
 * gets cleared. Returns the merged-tag list (or undefined for skip)
 * AND a clear-flag the caller uses to decide whether to call
 * setClipNote(undefined) after the updateTags write.
 *
 * Pure: deterministic; same input -> same output.
 */
export interface TagFromNotesClearPerClip {
  id: string;
  /** Merged tag list to write, or undefined to skip the updateTags call. */
  mergedTags?: string[];
  /** Whether to clear the note after the tag merge. */
  clearNote: boolean;
  /** How many NEW tags this clip would gain. */
  added: number;
}

export function perClipActionForCombo<T extends TagFromNotesCandidate>(
  c: T | null | undefined,
): TagFromNotesClearPerClip | undefined {
  if (!c || typeof c.id !== "string" || c.id.length === 0) return undefined;
  const extracted = extractHashtagsFromNote(c.note);
  if (extracted.length === 0) return undefined;
  // Existing tags as a case-insensitive set, matching tag-from-notes.
  const existing = new Set<string>();
  if (Array.isArray(c.tags)) {
    for (const t of c.tags) {
      if (typeof t === "string") existing.add(t.trim().toLowerCase());
    }
  }
  // How many extracted hashtags are NEW.
  let added = 0;
  for (const t of extracted) {
    if (!existing.has(t)) added++;
  }
  if (added === 0) {
    // All-already-tagged: keep the note (we only clear on promote).
    return { id: c.id, clearNote: false, added: 0 };
  }
  const merged = mergedTagsForClip(c);
  if (!merged) {
    // Defensive drift fallback - if mergedTagsForClip returns
    // undefined despite added > 0 (shouldn't happen), treat as
    // no-op rather than crash.
    return { id: c.id, clearNote: false, added: 0 };
  }
  return {
    id: c.id,
    mergedTags: merged,
    clearNote: true,
    added,
  };
}

/**
 * Aggregate plan across the full selection. Drives the post-action
 * toast + the pre-prompt warning ("will clear N notes").
 *
 * Defensive: empty / non-array input -> zero plan.
 */
export function planTagFromNotesAndClear<T extends TagFromNotesCandidate>(
  clips: T[] | null | undefined,
): TagFromNotesClearPlan {
  const plan: TagFromNotesClearPlan = {
    total: 0,
    noPromote: 0,
    alreadyTagged: 0,
    promoteAndClear: 0,
    totalAdded: 0,
    distinctNewTags: [],
    cleared: 0,
  };
  if (!Array.isArray(clips)) return plan;
  const distinctNew = new Set<string>();
  for (const c of clips) {
    if (!c || typeof c.id !== "string" || c.id.length === 0) continue;
    plan.total++;
    const action = perClipActionForCombo(c);
    if (!action) {
      plan.noPromote++;
      continue;
    }
    if (action.added === 0) {
      plan.alreadyTagged++;
      continue;
    }
    plan.promoteAndClear++;
    plan.totalAdded += action.added;
    plan.cleared++;
    // Compute distinct new tag names for the toast headline.
    // We re-extract here because perClipActionForCombo returns the
    // merged list (existing + new) - we want only NEW. Cheap repeat
    // since extractHashtagsFromNote is already memoized via Map in
    // a downstream tally, but this loop is O(M) per clip with M
    // bounded by MAX_TAGS_PER_NOTE=16, so total cost is fine.
    const extracted = extractHashtagsFromNote(c.note);
    const existingLower = new Set<string>();
    if (Array.isArray(c.tags)) {
      for (const t of c.tags) {
        if (typeof t === "string") existingLower.add(t.trim().toLowerCase());
      }
    }
    for (const t of extracted) {
      if (!existingLower.has(t)) distinctNew.add(t);
    }
  }
  plan.distinctNewTags = Array.from(distinctNew).sort();
  return plan;
}

/**
 * Predicate: should the combo button fire at all? Same gate as
 * standalone tag-from-notes - at least one clip in the selection
 * has at least one extractable hashtag NOT already structured.
 *
 * Defensive: null / non-array / empty input -> false.
 */
export function isTagFromNotesAndClearActionable<
  T extends TagFromNotesCandidate,
>(clips: T[] | null | undefined): boolean {
  if (!Array.isArray(clips) || clips.length === 0) return false;
  for (const c of clips) {
    const action = perClipActionForCombo(c);
    if (action && action.added > 0) return true;
  }
  return false;
}

/**
 * Post-action toast. Adapts to the plan shape:
 *
 *   - total === 0                    -> "Nothing to tag"
 *   - no clip had hashtags           -> "No hashtags in any note"
 *   - hashtags found but all tagged  -> "Already tagged"
 *   - 1 new tag, 1 clip, 1 cleared   -> "Added #x · cleared 1 note"
 *   - N new tags, M clips            -> "Added N tags across M clips · cleared M notes"
 *
 * Pure: deterministic for the same plan.
 */
export function formatTagFromNotesAndClearToast(
  plan: TagFromNotesClearPlan,
): string {
  const total = Math.max(0, Math.floor(Number(plan?.total) || 0));
  if (total === 0) return "Nothing to tag";
  const promoteAndClear = Math.max(
    0,
    Math.floor(Number(plan.promoteAndClear) || 0),
  );
  const totalAdded = Math.max(0, Math.floor(Number(plan.totalAdded) || 0));
  const distinct = Array.isArray(plan.distinctNewTags)
    ? plan.distinctNewTags
    : [];
  if (promoteAndClear === 0) {
    const noPromote = Math.max(0, Math.floor(Number(plan.noPromote) || 0));
    if (noPromote === total) return "Selection has no hashtags";
    return "Already tagged";
  }
  // promoteAndClear is the same number as cleared (we only clear on
  // promote) - keep the toast tight by surfacing both bits in one
  // tail clause instead of redundantly listing the count twice.
  const noteNoun = promoteAndClear === 1 ? "note" : "notes";
  const clipNoun = promoteAndClear === 1 ? "clip" : "clips";
  if (distinct.length === 1) {
    const tag = `#${distinct[0]}`;
    // Single-tag, single-clip: tightest form.
    if (promoteAndClear === 1) {
      return `Added ${tag} · cleared 1 note`;
    }
    return `Added ${tag} to ${promoteAndClear} ${clipNoun} · cleared ${promoteAndClear} ${noteNoun}`;
  }
  return `Added ${totalAdded} tags across ${promoteAndClear} ${clipNoun} · cleared ${promoteAndClear} ${noteNoun}`;
}

/**
 * Hover tooltip for the bulk-bar combo button. Adapts to the live
 * selection so the user sees what'll happen BEFORE the click.
 * Highlights the destructive bit ("clears N notes") prominently so
 * the user doesn't surprise themselves.
 *
 * Pure: deterministic for the same clips.
 */
export function formatTagFromNotesAndClearButtonTitle<
  T extends TagFromNotesCandidate,
>(clips: T[] | null | undefined): string {
  if (!Array.isArray(clips) || clips.length === 0) {
    return "Tag selection from hashtags in notes, then clear those notes";
  }
  const plan = planTagFromNotesAndClear(clips);
  if (plan.promoteAndClear === 0) {
    // Disambiguate: nothing to promote vs everything already tagged.
    if (plan.noPromote === plan.total) {
      return "No hashtags in any selected note - nothing to promote or clear";
    }
    return "All extracted hashtags already tagged - nothing to clear";
  }
  const noteNoun = plan.cleared === 1 ? "note" : "notes";
  const clipNoun = plan.promoteAndClear === 1 ? "clip" : "clips";
  if (plan.distinctNewTags.length === 1) {
    return `Add #${plan.distinctNewTags[0]} to ${plan.promoteAndClear} ${clipNoun}, then clear ${plan.cleared} ${noteNoun}`;
  }
  return `Add ${plan.totalAdded} tags across ${plan.promoteAndClear} ${clipNoun}, then clear ${plan.cleared} ${noteNoun}`;
}
