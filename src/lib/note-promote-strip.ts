/**
 * Pure helper for the detail-view per-clip "Promote + Strip" combo
 * chip.
 *
 * Single-clip mirror of the bulk-bar Tag-from-notes-and-clear combo
 * but with the strip semantics (not the destructive whole-note
 * clear). Closes the per-clip workflow:
 *
 *   - Promote chip (existing):  ADDS structured tags, keeps note
 *   - Strip chip   (existing):  REMOVES inline tokens, keeps prose
 *   - PromoteStrip (THIS):      Does BOTH in one click
 *
 * The two-click "promote then strip" path always existed; this
 * combines them so the user who knows they want both operations
 * doesn't have to chase the second chip after the first hides.
 *
 * Visibility predicate: requires AT LEAST one new hashtag to
 * promote (= promote-chip gate AND strip-chip gate would both be
 * open simultaneously). When every hashtag in the note is already
 * structured, the strip chip alone is enough — this combo chip
 * hides because there's nothing to PROMOTE. When the note has
 * no hashtags at all, both chips and this combo hide.
 *
 * Composition contract:
 *   - Tag merge: same `mergedTagsForClip` the bulk Tag-from-notes
 *     uses → single source of truth on hashtag → structured-tag
 *     promotion semantics.
 *   - Note strip: same `stripHashtagsFromNote` the per-clip strip
 *     chip + the bulk strip-hashtags action use → single source
 *     of truth on what gets removed.
 *
 * Result: clicking this combo produces BYTE-IDENTICAL stored state
 * to clicking promote-then-strip back to back. Three places (single
 * promote, single strip, this combo) can never disagree.
 *
 * Pure: no IO, no DOM. Caller writes via updateTags + setClipNote.
 */

import {
  extractHashtagsFromNote,
  mergedTagsForClip,
  type TagFromNotesCandidate,
} from "./tag-from-notes";
import {
  stripHashtagsFromNote,
  countStrippableHashtagsInNote,
} from "./note-hashtag-strip";

export interface PromoteStripPlan {
  /**
   * Hashtags found in the note that ARE NOT already structured tags.
   * Empty array means the combo chip hides (no promotion to do).
   * Same gate as the standalone promote chip.
   */
  pending: string[];
  /**
   * Hashtags found in the note that ARE already structured. The
   * combo doesn't strictly need this for the action (strip removes
   * tokens regardless), but the tooltip surfaces it so the user
   * sees the full picture.
   */
  alreadyTagged: string[];
  /**
   * Merged structured-tag list the click would write. Undefined when
   * pending is empty (chip hidden).
   */
  mergedTags?: string[];
  /**
   * The note text AFTER stripping. Undefined when:
   *   - chip hidden (pending empty), OR
   *   - the stripped result is empty (note was only `#tag` tokens —
   *     setClipNote(undefined) deletes the field).
   * A non-empty string means the prose survives the strip.
   */
  newNote?: string;
  /**
   * How many `#tag` tokens (per-occurrence) the strip will remove.
   * Surfaces in the tooltip / toast.
   */
  removed: number;
  /** Whether the strip empties the note entirely. */
  emptiesNote: boolean;
}

/**
 * Compute the combo plan for a single clip. Returns the empty
 * shape (`pending: []`) when:
 *   - clip is null/undefined or missing id
 *   - note doesn't pass extractHashtagsFromNote (no hashtags at all)
 *   - every extracted hashtag is already in the structured tag list
 *     (= strip without promote — user should click the strip chip,
 *     not the combo)
 *
 * mergedTags / newNote are computed only when pending is non-empty.
 *
 * Pure: deterministic; same input -> same output.
 */
export function planPromoteAndStrip<T extends TagFromNotesCandidate>(
  c: T | null | undefined,
): PromoteStripPlan {
  const plan: PromoteStripPlan = {
    pending: [],
    alreadyTagged: [],
    removed: 0,
    emptiesNote: false,
  };
  if (!c || typeof c.id !== "string" || c.id.length === 0) return plan;
  const extracted = extractHashtagsFromNote(c.note);
  if (extracted.length === 0) return plan;
  const existing = new Set<string>();
  if (Array.isArray(c.tags)) {
    for (const t of c.tags) {
      if (typeof t === "string") existing.add(t.trim().toLowerCase());
    }
  }
  for (const tag of extracted) {
    if (existing.has(tag)) plan.alreadyTagged.push(tag);
    else plan.pending.push(tag);
  }
  // Gate: at least one NEW tag to promote. Without it, this combo
  // is just "strip" — the standalone strip chip should be used
  // instead.
  if (plan.pending.length === 0) return plan;
  const merged = mergedTagsForClip(c);
  if (!merged) {
    // Defensive drift: pending.length > 0 implies mergedTagsForClip
    // should return a list. If it doesn't, fall back to no-op so we
    // never write something inconsistent.
    plan.pending = [];
    return plan;
  }
  plan.mergedTags = merged;
  // Strip pass — operates on the SAME note text the extractor used.
  // Result may be undefined (note was only `#tag` tokens).
  const stripped = stripHashtagsFromNote(c.note);
  plan.newNote = stripped;
  plan.emptiesNote = stripped === undefined;
  plan.removed = countStrippableHashtagsInNote(c.note);
  return plan;
}

/**
 * Predicate: should the combo chip appear in the note-row foot?
 *
 * Defensive: null/undefined → false.
 *
 * Same gate as the standalone promote chip — combo doesn't surface
 * when there's no promotion to do, even if there are stripable
 * tokens (in that case the user wants the strip chip alone).
 */
export function isPromoteAndStripActionable<T extends TagFromNotesCandidate>(
  c: T | null | undefined,
): boolean {
  return planPromoteAndStrip(c).pending.length > 0;
}

/**
 * Build the chip's visible label. Adapts to the plan shape:
 *
 *   - 0 pending          -> "" (chip hidden)
 *   - 1 pending          -> "Promote #x + strip"
 *   - 2-3 pending        -> "Promote #x, #y + strip"
 *   - 4+ pending         -> "Promote N tags + strip"
 *
 * Tighter than the bulk equivalent because per-clip never has the
 * "across N clips" framing.
 *
 * Pure: deterministic.
 */
export function formatPromoteAndStripChipLabel(plan: PromoteStripPlan): string {
  const pending = plan?.pending ?? [];
  if (pending.length === 0) return "";
  if (pending.length === 1) return `Promote #${pending[0]} + strip`;
  if (pending.length <= 3) {
    return `Promote ${pending.map((t) => `#${t}`).join(", ")} + strip`;
  }
  return `Promote ${pending.length} tags + strip`;
}

/**
 * Hover tooltip for the combo chip. Surfaces:
 *   - The full pending list ("Add #x, #y, #z to structured tags")
 *   - The strip count ("remove N inline #tag tokens from note")
 *   - The destructive-edge flag when the strip would empty the
 *     note ("note will be cleared")
 *
 * Returns empty when chip hidden (defensive fallback).
 *
 * Pure: deterministic.
 */
export function formatPromoteAndStripChipTooltip(
  plan: PromoteStripPlan,
): string {
  const pending = plan?.pending ?? [];
  if (pending.length === 0) return "";
  const promoteLine =
    pending.length === 1
      ? `Add #${pending[0]} to structured tags`
      : `Add ${pending.map((t) => `#${t}`).join(", ")} to structured tags`;
  const removed = Math.max(0, Math.floor(Number(plan.removed) || 0));
  const stripNoun = removed === 1 ? "token" : "tokens";
  const stripLine = `remove ${removed} inline #tag ${stripNoun} from note`;
  const tail = plan.emptiesNote ? " (note will be cleared)" : "";
  return `${promoteLine}, ${stripLine}${tail}`;
}

/**
 * Post-action toast. Adapts to the plan shape:
 *
 *   - 0 pending              -> "Nothing to promote" (defensive)
 *   - 1 pending, 1 removed   -> "Added #x + stripped"
 *   - N pending, M removed   -> "Added N tags + stripped M"
 *   - emptiesNote tail       -> appends "· note cleared"
 *
 * Tighter than the bulk equivalent because per-clip lacks the
 * "across N clips" frame.
 *
 * Pure: deterministic.
 */
export function formatPromoteAndStripToast(plan: PromoteStripPlan): string {
  const pending = plan?.pending ?? [];
  if (pending.length === 0) return "Nothing to promote";
  const removed = Math.max(0, Math.floor(Number(plan.removed) || 0));
  let head: string;
  if (pending.length === 1 && removed === 1) {
    head = `Added #${pending[0]} + stripped`;
  } else if (pending.length === 1) {
    head = `Added #${pending[0]} + stripped ${removed}`;
  } else if (pending.length <= 3) {
    const tags = pending.map((t) => `#${t}`).join(", ");
    if (removed === pending.length) {
      head = `Added ${tags} + stripped`;
    } else {
      head = `Added ${tags} + stripped ${removed}`;
    }
  } else {
    head = `Added ${pending.length} tags + stripped ${removed}`;
  }
  if (plan.emptiesNote) return `${head} · note cleared`;
  return head;
}
