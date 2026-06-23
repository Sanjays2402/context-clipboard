/**
 * Pure helpers for the bulk-bar lock/unlock affordance.
 *
 * Selecting N clips and pressing the lock button needs a couple of
 * decisions made consistently across renders + the actual write
 * path:
 *
 *   1. What's the INTENT — should we lock everything, or unlock
 *      everything? The button's UX is one toggle, so the existing
 *      "if all selected are pinned → unpin, else pin" pattern from
 *      bulkPin is the closest mental model. We mirror it: when the
 *      current selection is ENTIRELY locked, the button unlocks;
 *      otherwise it locks. That way the button always moves the
 *      selection toward a uniform state (no flipping individual
 *      bits — that's never what the user wants when they batched
 *      a group together).
 *
 *   2. What label + toast text should the user see? Different
 *      shapes for:
 *        - all-locked selection (action = unlock all)
 *        - mixed selection (action = lock the unlocked, leave the
 *          already-locked alone)
 *        - all-unlocked selection (action = lock everything)
 *      Singular/plural grammar mirrors the rest of the popup
 *      ("Locked 1 clip" / "Locked 3 clips" / "Unlocked 5 clips").
 *
 * Both layers are pure (no DOM, no IDB) so the unit tests cover
 * every edge.
 */

export interface LockBitClip {
  id: string;
  locked?: boolean;
}

/**
 * Decide whether a bulk lock action should target `lock` or `unlock`.
 *
 * Rule: only when EVERY id in the selection is currently locked do
 * we unlock — anything else (some-locked-some-not, all-unlocked) we
 * lock. Mirrors bulkPin's "if-all-then-undo" UX so users develop the
 * same muscle memory across pin/lock/archive bulk verbs.
 *
 * Defensive against empty arrays (returns null — no action to take),
 * non-arrays, and malformed entries.
 */
export type BulkLockIntent = "lock" | "unlock";

export function decideBulkLockIntent<T extends LockBitClip>(
  clips: T[],
): BulkLockIntent | null {
  if (!Array.isArray(clips) || clips.length === 0) return null;
  // Strict ===true to match db.toggleLock + clip-lock.partitionLocked +
  // is:locked applyQuery gate. A truthy non-boolean (locked:1) counts as
  // unlocked here so the bulk-lock action would FORCE it to a proper
  // boolean — that's the right cleanup behavior, not a bug.
  for (const c of clips) {
    if (!c || typeof c.id !== "string" || c.id.length === 0) continue;
    if (c.locked !== true) return "lock";
  }
  return "unlock";
}

/**
 * Compute how many writes the bulk-lock action will actually perform.
 *
 * For `intent: "lock"`: count ids that are NOT currently locked
 *   (already-locked entries are no-ops, see db.setLocked fast path).
 * For `intent: "unlock"`: count ids that ARE currently locked.
 *
 * Used by the post-action toast so we can say "Locked 3" (the actual
 * change), not "Locked 5" (the selection size). The two diverge in
 * mixed-selection cases.
 */
export function countBulkLockWrites<T extends LockBitClip>(
  clips: T[],
  intent: BulkLockIntent,
): number {
  if (!Array.isArray(clips)) return 0;
  let n = 0;
  for (const c of clips) {
    if (!c || typeof c.id !== "string" || c.id.length === 0) continue;
    const isLocked = c.locked === true;
    if (intent === "lock" && !isLocked) n++;
    else if (intent === "unlock" && isLocked) n++;
  }
  return n;
}

/**
 * Build the toast message for the completed bulk action.
 *
 * Shapes:
 *   - intent="lock", writes=0: "All N already locked"
 *   - intent="lock", writes=1: "Locked 1 clip"
 *   - intent="lock", writes>1: "Locked N clips"
 *     (mixed selection → "Locked N of M clips" so the user knows
 *      the action didn't touch the already-locked ones)
 *   - intent="unlock": same pattern, "Unlocked" verb.
 *
 * `total` = original selection size, `writes` = entries actually
 * mutated. When equal, the simple "Locked N clips" reads cleanest;
 * when divergent, "Locked 3 of 7 clips · 4 already locked" tells
 * the truthful story.
 */
export function formatBulkLockToast(opts: {
  intent: BulkLockIntent;
  total: number;
  writes: number;
}): string {
  const total = Math.max(0, Math.floor(Number(opts.total) || 0));
  const writes = Math.max(0, Math.floor(Number(opts.writes) || 0));
  const verb = opts.intent === "lock" ? "Locked" : "Unlocked";
  if (writes === 0) {
    const state = opts.intent === "lock" ? "locked" : "unlocked";
    if (total === 0) return `Nothing to ${opts.intent}`;
    return total === 1 ? `Already ${state}` : `All ${total} already ${state}`;
  }
  const noun = writes === 1 ? "clip" : "clips";
  if (writes === total) {
    return `${verb} ${writes} ${noun}`;
  }
  // Mixed selection — be honest about the skip count.
  const skipped = Math.max(0, total - writes);
  const skipState = opts.intent === "lock" ? "already locked" : "already unlocked";
  return `${verb} ${writes} of ${total} clips · ${skipped} ${skipState}`;
}

/**
 * Build the bulk-bar button title (hover-tooltip). Adapts to the
 * current intent so the user knows what the click will do before
 * pressing it — same as bulkPin's "Toggle pin on selection" with
 * lock-specific verbs and a "(N)" affordance when the action would
 * skip already-locked rows.
 */
export function formatBulkLockButtonTitle(opts: {
  intent: BulkLockIntent | null;
  total: number;
  writes: number;
}): string {
  if (opts.intent === null || opts.total === 0) return "Toggle lock on selection";
  const verb = opts.intent === "lock" ? "Lock" : "Unlock";
  const writes = Math.max(0, Math.floor(Number(opts.writes) || 0));
  const total = Math.max(0, Math.floor(Number(opts.total) || 0));
  if (writes === total) {
    return `${verb} ${writes === 1 ? "this clip" : `${writes} clips`}`;
  }
  return `${verb} ${writes} of ${total} (${total - writes} already ${opts.intent === "lock" ? "locked" : "unlocked"})`;
}
