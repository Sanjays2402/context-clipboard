/**
 * Pure helpers for the bulk-bar "Add note to selection" combo
 * affordance.
 *
 * Why a dedicated bulk path for notes?
 *   - Notes are the user's commentary on a clip — often the same
 *     caveat applies to a whole group ("all of these are staging
 *     URLs", "all of these are deprecated as of June", "all of
 *     these are draft tokens — rotate before sharing"). Re-typing
 *     the same note N times via detail-view is friction the bulk
 *     button erases in one chord.
 *   - Notes don't merge the way tags do (tags union; notes
 *     overwrite). That makes "apply to selection" a one-decision
 *     action: either everyone gets THIS text, or nothing changes.
 *
 * Overwrite contract:
 *   - The bulk action OVERWRITES any existing note on the
 *     selected clips. This is deliberate — partial-merge for
 *     prose ("append your note to the existing one") would create
 *     unreadable franken-notes. The toast tells the user how many
 *     existing notes will be REPLACED so the consequences are
 *     visible BEFORE they commit.
 *   - An empty/whitespace input deletes existing notes on the
 *     selection (mirrors detail-view's "save empty" → clear
 *     contract). Useful for "I'm rotating notes off this batch
 *     after a process change" workflows.
 *
 * Sanitisation:
 *   - Uses the same sanitizeClipNote() the detail-view editor
 *     uses, so a 5000-char paste gets sliced to 2000 chars,
 *     control chars get stripped, empty/whitespace returns
 *     undefined. Single source of truth — bulk and single-clip
 *     paths can never produce different stored values.
 *
 * Pure: no DOM, no IDB. Caller owns the IDB write loop + the
 * toast. The planner here only projects what the action WOULD
 * do so the UI can preview consequences accurately.
 */

import { sanitizeClipNote, hasClipNote } from "./clip-note";

export interface BulkNoteCandidate {
  id: string;
  note?: string;
}

export interface BulkNotePlan {
  /** Selection size considered (= ids passed in that survived id-validity). */
  total: number;
  /** Clips whose note will be CREATED (no prior note). */
  created: number;
  /** Clips whose note will be REPLACED (had a prior non-empty note). */
  replaced: number;
  /** Clips whose existing note will be CLEARED (empty input + had a note). */
  cleared: number;
  /** Clips where the action would no-op (same as current or both empty). */
  unchanged: number;
  /** Post-sanitise value the bulk action will write; undefined when input empties to nothing. */
  finalValue: string | undefined;
}

/**
 * Walk the selection and project what `applyBulkNote` will actually
 * do. Used by the toast formatter (truthful "N replaced" copy) and
 * the optional confirm dialog (so a user replacing 40 notes sees
 * the count before clicking through).
 *
 * Defensive against empty / non-array / malformed entries.
 * Sanitises the raw input ONCE here — caller passes the same value
 * to applyBulkNote so the two stay in sync.
 */
export function planBulkNote<T extends BulkNoteCandidate>(
  clips: T[],
  rawInput: unknown,
): BulkNotePlan {
  const finalValue = sanitizeClipNote(rawInput);
  const plan: BulkNotePlan = {
    total: 0,
    created: 0,
    replaced: 0,
    cleared: 0,
    unchanged: 0,
    finalValue,
  };
  if (!Array.isArray(clips)) return plan;
  for (const c of clips) {
    if (!c || typeof c.id !== "string" || c.id.length === 0) continue;
    plan.total++;
    const hadNote = hasClipNote(c);
    const current = typeof c.note === "string" ? c.note : undefined;
    // sanitizeClipNote is deterministic + idempotent — sanitising
    // an already-sanitised string returns the same string. So the
    // no-op check below is safe (no false "different" flags from
    // round-trip artifacts).
    const currentSan = sanitizeClipNote(current);
    if (currentSan === finalValue) {
      plan.unchanged++;
      continue;
    }
    if (finalValue === undefined) {
      // Input is empty after sanitise; we're clearing notes. Only
      // counts as a clear if there WAS a note. (currentSan ===
      // finalValue case above already handled the "both empty"
      // no-op branch.)
      if (hadNote) plan.cleared++;
      else plan.unchanged++; // shouldn't reach — both empty already returned
      continue;
    }
    // We're writing a non-empty value.
    if (hadNote) {
      plan.replaced++;
    } else {
      plan.created++;
    }
  }
  return plan;
}

/**
 * Whether the bulk button should fire at all. False when:
 *   - selection is empty
 *   - the action would no-op for EVERY selected clip
 *
 * Used to short-circuit the IDB loop + the toast, and to gate the
 * button's disabled state in updateBulkBar.
 */
export function isBulkNoteActionable<T extends BulkNoteCandidate>(
  clips: T[],
  rawInput: unknown,
): boolean {
  const plan = planBulkNote(clips, rawInput);
  if (plan.total === 0) return false;
  return plan.created + plan.replaced + plan.cleared > 0;
}

/**
 * Build the post-action toast message. Shapes:
 *
 *   - total === 0 →                "Nothing to note"
 *   - all unchanged →              "All N already match" (1 → "Already matches")
 *   - clearing N notes →           "Cleared N notes"
 *   - pure create (none replaced)→ "Noted N clips"
 *   - pure replace →               "Replaced N notes"
 *   - mixed create + replace →     "Noted N clips (M replaced)"
 *
 * The "N created, M replaced" mix is the most user-visible case
 * because they need to know how many EXISTING notes just got
 * overwritten. Cleared-only path is cheap-but-honest signal: the
 * user emptied the input on purpose, the toast says so.
 */
export function formatBulkNoteToast(plan: BulkNotePlan): string {
  const total = Math.max(0, Math.floor(Number(plan.total) || 0));
  if (total === 0) return "Nothing to note";
  const created = Math.max(0, Math.floor(Number(plan.created) || 0));
  const replaced = Math.max(0, Math.floor(Number(plan.replaced) || 0));
  const cleared = Math.max(0, Math.floor(Number(plan.cleared) || 0));
  const changed = created + replaced + cleared;
  if (changed === 0) {
    return total === 1 ? "Already matches" : `All ${total} already match`;
  }
  // Clearing path takes priority when finalValue is empty — the
  // toast should match the user's INTENT (they typed nothing on
  // purpose to wipe notes).
  if (plan.finalValue === undefined) {
    const noun = cleared === 1 ? "note" : "notes";
    return `Cleared ${cleared} ${noun}`;
  }
  // Mixed create + replace
  if (created > 0 && replaced > 0) {
    const noun = created === 1 ? "clip" : "clips";
    return `Noted ${created} ${noun} (${replaced} replaced)`;
  }
  if (replaced > 0) {
    const noun = replaced === 1 ? "note" : "notes";
    return `Replaced ${replaced} ${noun}`;
  }
  // pure create
  const noun = created === 1 ? "clip" : "clips";
  return `Noted ${created} ${noun}`;
}

/**
 * Hover-tooltip for the bulk-bar button. Adapts to the live
 * selection so the user sees the upcoming action before clicking.
 *
 * The tooltip is computed WITHOUT a sanitised input (the
 * tooltip's job is to invite the action, not preview a specific
 * note value — the user hasn't typed one yet at hover time). So
 * the message is selection-shape only.
 */
export function formatBulkNoteButtonTitle<T extends BulkNoteCandidate>(
  clips: T[],
): string {
  if (!Array.isArray(clips) || clips.length === 0) {
    return "Add a note to the selection";
  }
  let withNote = 0;
  let withoutNote = 0;
  for (const c of clips) {
    if (!c || typeof c.id !== "string" || c.id.length === 0) continue;
    if (hasClipNote(c)) withNote++;
    else withoutNote++;
  }
  const n = withNote + withoutNote;
  if (n === 0) return "Add a note to the selection";
  if (withNote === 0) {
    const noun = n === 1 ? "clip" : "clips";
    return `Add a note to ${n} ${noun}`;
  }
  if (withoutNote === 0) {
    const noun = n === 1 ? "note" : "notes";
    return `Replace ${n} existing ${noun}`;
  }
  return `Add or replace a note on ${n} clips (${withNote} already noted)`;
}
