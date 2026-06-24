/**
 * Pure helpers for the bulk-bar "Strip hashtags from notes" affordance.
 *
 * Bulk counterpart to the per-clip "Strip N #tags" chip in
 * detail-view. Walks the selection and produces a plan + per-clip
 * action shape that the caller uses to drive setClipNote writes.
 *
 * Position in the bulk-bar's note-cleanup family:
 *   - Tag-from-notes          → PROMOTE inline tags into structured
 *                                tag list. Note untouched.
 *   - Tag-from-notes + clear  → PROMOTE inline tags AND WIPE the
 *                                whole note text (destructive of
 *                                prose).
 *   - Strip-hashtags (THIS)   → STRIP inline `#tag` tokens from
 *                                notes; PROSE PRESERVED; structured
 *                                tag list UNTOUCHED.
 *
 * The third variant is the cleanup pass AFTER Tag-from-notes (or
 * for users who used `#tag` as a writeup-time TODO marker and
 * never wanted structured-tag promotion). It's the non-destructive
 * counterpart to the combo's wholesale clear.
 *
 * Pure: no IO, no DOM. Caller owns the IDB write loop (setClipNote)
 * and the toast. Single source of truth via stripHashtagsFromNote
 * means the bulk + the per-clip detail chip produce byte-identical
 * cleaned notes for the same input.
 */

import { stripHashtagsFromNote, countStrippableHashtagsInNote } from "./note-hashtag-strip";

export interface BulkStripHashtagsCandidate {
  id: string;
  note?: unknown;
}

export interface BulkStripHashtagsPerClip {
  id: string;
  /** Sanitised stripped note value, or undefined to delete the field. */
  newNote: string | undefined;
  /** How many `#tag` tokens this clip would lose. */
  removed: number;
  /** Whether the note becomes empty after strip (was-only-hashtags case). */
  emptiedNote: boolean;
}

export interface BulkStripHashtagsPlan {
  /** Selection size considered (valid ids only). */
  total: number;
  /** Clips with no extractable hashtags - untouched. */
  noHashtags: number;
  /** Clips whose note will be modified (= at least 1 token stripped). */
  modified: number;
  /** Clips where the strip empties the note entirely (was-only-hashtags). */
  emptied: number;
  /** Total tokens stripped across the entire selection (per-occurrence). */
  totalRemoved: number;
}

/**
 * Compute the per-clip plan for the strip. Returns undefined when
 * the clip has no extractable hashtags (= no work to do, caller
 * skips the setClipNote write).
 *
 * Pure: deterministic; same input -> same output.
 */
export function perClipActionForStrip<T extends BulkStripHashtagsCandidate>(
  c: T | null | undefined,
): BulkStripHashtagsPerClip | undefined {
  if (!c || typeof c.id !== "string" || c.id.length === 0) return undefined;
  const count = countStrippableHashtagsInNote(c.note);
  if (count === 0) return undefined;
  const newNote = stripHashtagsFromNote(c.note);
  return {
    id: c.id,
    newNote,
    removed: count,
    emptiedNote: newNote === undefined,
  };
}

/**
 * Aggregate plan across the full selection. Drives the post-action
 * toast + the bulk button's hover-preview tooltip.
 *
 * Defensive against empty / non-array / malformed entries.
 *
 * Pure: deterministic for the same input.
 */
export function planBulkStripHashtags<T extends BulkStripHashtagsCandidate>(
  clips: T[] | null | undefined,
): BulkStripHashtagsPlan {
  const plan: BulkStripHashtagsPlan = {
    total: 0,
    noHashtags: 0,
    modified: 0,
    emptied: 0,
    totalRemoved: 0,
  };
  if (!Array.isArray(clips)) return plan;
  for (const c of clips) {
    if (!c || typeof c.id !== "string" || c.id.length === 0) continue;
    plan.total++;
    const action = perClipActionForStrip(c);
    if (!action) {
      plan.noHashtags++;
      continue;
    }
    plan.modified++;
    plan.totalRemoved += action.removed;
    if (action.emptiedNote) plan.emptied++;
  }
  return plan;
}

/**
 * Predicate: should the bulk button fire? Same gate as the per-clip
 * chip: at least one selected clip has at least one extractable
 * hashtag in its note.
 *
 * Defensive: null / non-array / empty input -> false.
 *
 * Pure: deterministic for the same input.
 */
export function isBulkStripHashtagsActionable<
  T extends BulkStripHashtagsCandidate,
>(clips: T[] | null | undefined): boolean {
  if (!Array.isArray(clips) || clips.length === 0) return false;
  for (const c of clips) {
    if (perClipActionForStrip(c)) return true;
  }
  return false;
}

/**
 * Post-action toast. Adapts to the plan shape:
 *
 *   - total === 0              -> "Nothing to strip"
 *   - 0 modified               -> "No hashtags in any note"
 *   - 1 modified, 1 token      -> "Stripped #tag from 1 note"
 *   - 1 modified, N tokens     -> "Stripped N hashtags from 1 note"
 *   - M modified, N tokens     -> "Stripped N hashtags across M notes"
 *   - Some emptied             -> append " (M notes emptied)" tail
 *                                 so user sees prose-vs-empty split
 *
 * Pure: deterministic for the same plan.
 */
export function formatBulkStripHashtagsToast(
  plan: BulkStripHashtagsPlan,
): string {
  const total = Math.max(0, Math.floor(Number(plan?.total) || 0));
  if (total === 0) return "Nothing to strip";
  const modified = Math.max(0, Math.floor(Number(plan.modified) || 0));
  const totalRemoved = Math.max(0, Math.floor(Number(plan.totalRemoved) || 0));
  const emptied = Math.max(0, Math.floor(Number(plan.emptied) || 0));
  if (modified === 0) {
    return "No hashtags in any note";
  }
  let head: string;
  if (modified === 1) {
    if (totalRemoved === 1) {
      head = "Stripped #tag from 1 note";
    } else {
      head = `Stripped ${totalRemoved} hashtags from 1 note`;
    }
  } else {
    head = `Stripped ${totalRemoved} hashtags across ${modified} notes`;
  }
  if (emptied === 0) return head;
  // Note-emptied tail: when stripping leaves an empty note, the
  // note field gets deleted (same contract as setClipNote(undefined)).
  // User should know how many of their notes vanished entirely vs
  // had prose left over.
  const noun = emptied === 1 ? "note" : "notes";
  return `${head} (${emptied} ${noun} emptied)`;
}

/**
 * Hover-tooltip for the bulk-bar button. Adapts to the live
 * selection so the user sees what'll happen BEFORE the click.
 *
 * Selection-shape-only: counts the work without committing to a
 * specific phrasing for an in-flight action. Pre-action UX uses
 * present-tense ("will strip"), post-action toast uses past-tense
 * ("Stripped") - they're the same pure module but the wording
 * intentionally differs to signal state.
 *
 * Pure: deterministic for the same clips.
 */
export function formatBulkStripHashtagsButtonTitle<
  T extends BulkStripHashtagsCandidate,
>(clips: T[] | null | undefined): string {
  if (!Array.isArray(clips) || clips.length === 0) {
    return "Strip inline #tag tokens from notes (prose preserved)";
  }
  const plan = planBulkStripHashtags(clips);
  if (plan.modified === 0) {
    return "No #hashtag tokens in any selected note";
  }
  const noun = plan.modified === 1 ? "note" : "notes";
  if (plan.totalRemoved === 1) {
    return `Strip 1 inline #tag from 1 note (prose preserved)`;
  }
  if (plan.modified === 1) {
    return `Strip ${plan.totalRemoved} inline #tags from 1 note (prose preserved)`;
  }
  return `Strip ${plan.totalRemoved} inline #tags from ${plan.modified} ${noun} (prose preserved)`;
}
