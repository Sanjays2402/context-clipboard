/**
 * Pure helpers for the bulk-bar "Lock + pin selection" combo button.
 *
 * Why a single combo button (vs. clicking lock then pin)?
 *   - "Lock + pin" is a recognisable workflow: "this clip is
 *     irreplaceable AND I want it at the top of the list". The
 *     two buttons are next to each other, but the user still has
 *     to remember to hit both — a combo button is one chord.
 *   - Lock + pin combined have a clean cumulative semantic: bulk-
 *     applying them to N clips ENDS with every clip both pinned
 *     AND locked. No partial-state confusion.
 *
 * Idempotency:
 *   - A clip that's already pinned AND locked is a no-op (no IDB
 *     writes; doesn't count toward the toast).
 *   - A clip that's pinned-only flips lock; a clip that's locked-
 *     only flips pin; a clip that's neither flips both.
 *   - We never UN-lock or UN-pin. This button only ADDS state; the
 *     dedicated bulk-pin / bulk-lock buttons handle the toggle
 *     direction. That's deliberate: an "add both" button that also
 *     subtracts when "everything is already both" would surprise
 *     the user — the lone bulk-pin already covers the un-pin path,
 *     and bulk-lock covers the un-lock path.
 *
 * Both layers are pure (no DOM, no IDB) so tests cover every
 * branch. The popup wires up the actual setPinned / setLocked
 * sequence + toast string.
 */

export interface LockPinBitClip {
  id: string;
  pinned?: boolean;
  locked?: boolean;
}

export interface BulkLockPinPlan {
  /** How many setPinned(true) writes the action will fire. */
  pinWrites: number;
  /** How many setLocked(true) writes the action will fire. */
  lockWrites: number;
  /** Clips that already had BOTH bits set — no writes for them. */
  alreadyBoth: number;
  /** Total clips inspected (= total in selection). */
  total: number;
}

/**
 * Walk the selection and project what the bulk lock+pin action will
 * actually do. Used by the click handler (drive the IDB writes) and
 * the toast formatter (truthful "N of M" copy). Pure — no IDB, no
 * DOM. Defensive against empty / non-array / malformed entries.
 *
 * Strict gate on `=== true` to match the rest of the lock stack
 * (db.toggleLock + clip-lock.partitionLocked + is:locked search
 * operator). A truthy non-boolean lock counts as "needs proper
 * boolean lock" — same rationale as bulk-lock: cleaning up a stray
 * `locked: 1` is the right behaviour, not a bug.
 *
 * Pin uses loose truthy because `pinned: boolean` is required in
 * the type (never optional) and historical clips always have a
 * real boolean. No defensive strict gate needed.
 */
export function planBulkLockPin<T extends LockPinBitClip>(
  clips: T[],
): BulkLockPinPlan {
  const plan: BulkLockPinPlan = {
    pinWrites: 0,
    lockWrites: 0,
    alreadyBoth: 0,
    total: 0,
  };
  if (!Array.isArray(clips)) return plan;
  for (const c of clips) {
    if (!c || typeof c.id !== "string" || c.id.length === 0) continue;
    plan.total++;
    const isPinned = !!c.pinned;
    const isLocked = c.locked === true;
    if (isPinned && isLocked) {
      plan.alreadyBoth++;
      continue;
    }
    if (!isPinned) plan.pinWrites++;
    if (!isLocked) plan.lockWrites++;
  }
  return plan;
}

/**
 * Decide whether the bulk-bar button should even be enabled. When
 * every selected clip already has BOTH bits, the action would no-op
 * — we hide the button so the user doesn't bounce off a click that
 * does nothing. (When SOME selection is in the all-both state but
 * SOME isn't, we keep the button visible because the partial group
 * is the genuine use case.)
 *
 * Returns `false` for empty selection too, so the button stays
 * hidden when the bulk-bar is showing zero selected (it shouldn't
 * — empty selection hides the whole bar — but the helper is
 * defensive).
 */
export function isBulkLockPinActionable<T extends LockPinBitClip>(
  clips: T[],
): boolean {
  const plan = planBulkLockPin(clips);
  if (plan.total === 0) return false;
  return plan.pinWrites > 0 || plan.lockWrites > 0;
}

/**
 * Build the post-action toast message. Shapes:
 *
 *   - total=0 → "Nothing to lock+pin"
 *   - plan touches both pins AND locks evenly →
 *     "Locked+pinned N of M clips" (M is selection size; N is the
 *     count that ACTUALLY transitioned in BOTH dimensions, which
 *     is total - alreadyBoth, since every clip that wasn't both
 *     ends up both after the action)
 *   - all already both → "All N already locked+pinned"
 *
 * The "of M" tail appears only when some clips were skipped
 * (alreadyBoth > 0). When every clip in the selection needed at
 * least one bit, the plain "Locked+pinned N clips" reads cleaner.
 */
export function formatBulkLockPinToast(plan: BulkLockPinPlan): string {
  const total = Math.max(0, Math.floor(Number(plan.total) || 0));
  const skipped = Math.max(0, Math.floor(Number(plan.alreadyBoth) || 0));
  if (total === 0) return "Nothing to lock+pin";
  // Clamp skipped so a degenerate plan (skipped > total — should be
  // impossible but defensive) reads as "all already both" rather
  // than going negative on the change count.
  const safeSkipped = Math.min(skipped, total);
  const changed = total - safeSkipped;
  if (changed === 0) {
    return total === 1
      ? "Already locked+pinned"
      : `All ${total} already locked+pinned`;
  }
  const noun = changed === 1 ? "clip" : "clips";
  if (safeSkipped === 0) {
    return `Locked+pinned ${changed} ${noun}`;
  }
  return `Locked+pinned ${changed} of ${total} clips · ${safeSkipped} already both`;
}

/**
 * Hover-tooltip title for the bulk-bar button. Adapts to the live
 * selection so the user sees the upcoming action before clicking.
 *
 * Falls back to a generic title when the selection is empty (the
 * bulk-bar would be hidden then but the helper is defensive).
 */
export function formatBulkLockPinButtonTitle<T extends LockPinBitClip>(
  clips: T[],
): string {
  const plan = planBulkLockPin(clips);
  if (plan.total === 0) {
    return "Lock + pin selection";
  }
  const changed = plan.total - plan.alreadyBoth;
  if (changed === 0) {
    return plan.total === 1
      ? "Already locked + pinned"
      : `All ${plan.total} already locked + pinned`;
  }
  const noun = changed === 1 ? "clip" : "clips";
  if (plan.alreadyBoth === 0) {
    return `Lock + pin ${changed} ${noun}`;
  }
  return `Lock + pin ${changed} of ${plan.total} (${plan.alreadyBoth} already both)`;
}
