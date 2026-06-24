/**
 * Pure helper for the detail-view per-clip "Promote hashtags" chip.
 *
 * The bulk-bar's "Tag from notes" action already does this across
 * a SELECTION. This module is the SINGLE-CLIP variant: surface a
 * small chip in the detail-view note-row foot when the open clip's
 * note contains `#hashtag` tokens that aren't already in its
 * structured tag list, and let the user promote them in one click
 * without leaving detail-view.
 *
 * Why a per-clip chip vs always relying on bulk-bar?
 *   - Detail-view is where the user EDITS the note. The moment
 *     they type "#staging" into a note is the moment they're most
 *     likely to want a structured tag with the same name -
 *     surfacing the chip in-place catches the intent before they
 *     close detail-view.
 *   - Bulk-bar requires a SELECTION. Selecting one clip just to
 *     promote one hashtag is high friction.
 *   - The chip is INCREMENTAL: it appears only when there's actual
 *     work to do (note has hashtags AND at least one isn't already
 *     in the structured tag list). When the user clicks it, the
 *     work is done and the chip hides. Zero noise when there's
 *     nothing to promote.
 *
 * Why a new module vs reusing tag-from-notes directly?
 *   - tag-from-notes is BULK-SHAPED (planTagFromNotes returns
 *     aggregate counts across an array). The per-clip case wants
 *     a tighter "what would change for THIS clip?" answer:
 *     {pending: [], merged: []} vs {total: N, changed: M, ...}.
 *   - The chip label needs a different grammar from the bulk
 *     toast ("Promote #x" vs "Added #x to N clips"). Centralising
 *     the formatter here keeps the detail-view click code thin.
 *   - Composing the two existing pure functions (extractHashtags
 *     + mergedTagsForClip) at this layer means the chip
 *     visibility + label + click handler all share one source of
 *     truth - they can never disagree on what counts as
 *     "promotable".
 *
 * Pure: no IO, no DOM. Caller (popup detail-view) owns the chip
 * element, the click handler dispatch, and the IDB write via the
 * existing db.updateTags path.
 */

import {
  extractHashtagsFromNote,
  mergedTagsForClip,
  type TagFromNotesCandidate,
} from "./tag-from-notes";

export interface NoteHashtagPromotePlan {
  /**
   * Hashtags found in the note that ARE NOT already in the clip's
   * structured tag list (case-insensitive). These are the ones a
   * click would actually add. Empty array means the chip hides.
   */
  pending: string[];
  /**
   * Hashtags found in the note that ARE already structured tags
   * (case-insensitive). Surfaced separately so the chip tooltip
   * can honestly distinguish "promote 3" from "found 5, 2 already
   * tagged".
   */
  alreadyTagged: string[];
  /**
   * The fully-merged tag list a click would write to IDB via
   * db.updateTags, preserving existing tag-list order with new
   * hashtags appended in note-appearance order. Undefined when
   * nothing would change (= pending is empty) so the click can
   * short-circuit the write.
   */
  mergedTags?: string[];
}

/**
 * Compute the promote plan for a single clip's note. Returns an
 * empty pending list when:
 *   - clip is null/undefined or missing id
 *   - note doesn't pass hasClipNote (missing / wrong type / empty)
 *   - note has no extractable hashtags
 *   - every extracted hashtag is already in the structured tag list
 *
 * mergedTags is computed only when pending is non-empty so callers
 * who just want the visibility predicate don't pay for the merge
 * allocation.
 *
 * Pure: deterministic; same input -> same output.
 */
export function planNoteHashtagPromote<T extends TagFromNotesCandidate>(
  c: T | null | undefined,
): NoteHashtagPromotePlan {
  const plan: NoteHashtagPromotePlan = {
    pending: [],
    alreadyTagged: [],
  };
  if (!c || typeof c.id !== "string" || c.id.length === 0) return plan;
  const extracted = extractHashtagsFromNote(c.note);
  if (extracted.length === 0) return plan;
  // Normalise existing tags to lowercase for the comparison.
  // Matches the same case-insensitive contract tag-from-notes uses,
  // so a clip with structured tag "Staging" and note hashtag
  // "#staging" reports alreadyTagged (no duplicate promotion).
  const existing = new Set<string>();
  if (Array.isArray(c.tags)) {
    for (const t of c.tags) {
      if (typeof t === "string") existing.add(t.trim().toLowerCase());
    }
  }
  for (const tag of extracted) {
    if (existing.has(tag)) {
      plan.alreadyTagged.push(tag);
    } else {
      plan.pending.push(tag);
    }
  }
  if (plan.pending.length > 0) {
    // Re-use the bulk helper's merge - same code path the bulk-bar
    // uses, so single-clip + bulk produce byte-identical structured
    // tag lists for the same input. undefined return means the
    // merge would no-op; we treat that as "nothing pending" too
    // (defensive against drift, shouldn't happen given our pending
    // check above).
    const merged = mergedTagsForClip(c);
    if (merged) plan.mergedTags = merged;
    else plan.pending = []; // drift fallback
  }
  return plan;
}

/**
 * Predicate: should the chip appear in the note-row foot? Mirrors
 * planNoteHashtagPromote().pending.length > 0 but lets the
 * caller short-circuit without computing the full plan + the
 * alreadyTagged list when they only need the visibility gate.
 *
 * Defensive: null/undefined clip -> false.
 */
export function isNoteHashtagPromoteActionable<
  T extends TagFromNotesCandidate,
>(c: T | null | undefined): boolean {
  return planNoteHashtagPromote(c).pending.length > 0;
}

/**
 * Build the chip's visible label. Adapts to the plan shape:
 *
 *   - 0 pending          -> "" (chip hidden anyway)
 *   - 1 pending          -> "Promote #x"
 *   - 2-3 pending        -> "Promote #x, #y, #z"
 *   - 4+ pending         -> "Promote 5 tags"
 *
 * Keeps the chip TIGHT (single-line, no overflow). The tooltip
 * carries the full list for cases where the count grammar kicks in.
 *
 * Pure: deterministic for the same plan.
 */
export function formatNoteHashtagPromoteLabel(
  plan: NoteHashtagPromotePlan,
): string {
  const pending = plan?.pending ?? [];
  if (pending.length === 0) return "";
  if (pending.length === 1) return `Promote #${pending[0]}`;
  if (pending.length <= 3) {
    return `Promote ${pending.map((t) => `#${t}`).join(", ")}`;
  }
  return `Promote ${pending.length} tags`;
}

/**
 * Hover tooltip for the chip. Surfaces:
 *   - The full pending list ("Add #x, #y, #z to this clip's tags")
 *   - The alreadyTagged tail when present ("Already tagged: #w")
 *     so the user knows what was IGNORED vs what'll be ADDED.
 *
 * Returns empty string when nothing's pending (caller hides the
 * chip; this is just a defensive fallback).
 *
 * Pure: deterministic for the same plan.
 */
export function formatNoteHashtagPromoteTooltip(
  plan: NoteHashtagPromotePlan,
): string {
  const pending = plan?.pending ?? [];
  if (pending.length === 0) return "";
  const head =
    pending.length === 1
      ? `Add #${pending[0]} to this clip's tags`
      : `Add ${pending.map((t) => `#${t}`).join(", ")} to this clip's tags`;
  const already = plan?.alreadyTagged ?? [];
  if (already.length === 0) return head;
  const tail =
    already.length === 1
      ? `Already tagged: #${already[0]}`
      : `Already tagged: ${already.map((t) => `#${t}`).join(", ")}`;
  return `${head}\n${tail}`;
}

/**
 * Post-action toast. Shows after the user clicks the chip and the
 * IDB write lands. Tight grammar so the user sees what got added.
 *
 *   - 0 pending          -> "Already tagged" (defensive; chip
 *                           shouldn't appear in this case)
 *   - 1 pending          -> "Added #x"
 *   - 2-3 pending        -> "Added #x, #y, #z"
 *   - 4+ pending         -> "Added N tags"
 *
 * Pure: deterministic for the same plan.
 */
export function formatNoteHashtagPromoteToast(
  plan: NoteHashtagPromotePlan,
): string {
  const pending = plan?.pending ?? [];
  if (pending.length === 0) return "Already tagged";
  if (pending.length === 1) return `Added #${pending[0]}`;
  if (pending.length <= 3) {
    return `Added ${pending.map((t) => `#${t}`).join(", ")}`;
  }
  return `Added ${pending.length} tags`;
}
