/**
 * Pure helpers for the per-clip lock ("ask before deleting") flow.
 *
 * Two concerns live here, both kept DOM-free for unit-testability:
 *
 *   1. `partitionLocked(clips)` — given a list of clips, split into
 *      `{locked, unlocked}` so the bulk-delete confirm message can
 *      name a concrete count of irreplaceable rows ("3 locked clips
 *      among 12") rather than a generic "12 clips will be deleted".
 *
 *   2. `formatLockConfirm({locked, unlocked})` — the confirm string
 *      itself. Different shapes for:
 *        - all-locked vs all-unlocked vs mixed
 *        - 1 vs N clips (singular/plural grammar)
 *      so the prompt reads naturally in every case the user can
 *      construct.
 *
 * The popup wires these into:
 *   - `bulk-del.click` — partitions selectedIds, shows the confirm
 *     only when `locked > 0`. The unlocked path stays unchanged
 *     (no extra friction for the common case).
 *   - Row delete + keyboard Delete + right-click delete — single-clip
 *     paths that call `formatLockConfirm({locked: 1, unlocked: 0})`
 *     when the target carries the lock bit.
 */

export interface LockPartition {
  /** Clip ids whose `locked === true`. */
  locked: string[];
  /** Clip ids whose `locked` is anything other than true. */
  unlocked: string[];
}

/**
 * Minimal shape for partitioning — just id + the lock bit. Accepting
 * a structural type (not ClipItem) keeps this module a leaf with no
 * import of types.ts; tests can pass `{id, locked}` literals.
 */
export interface LockedLike {
  id: string;
  locked?: boolean;
}

/**
 * Partition the input by the lock bit. Defensive against malformed
 * entries (missing id, missing locked, non-boolean locked) — anything
 * without a string id is dropped silently.
 *
 * Stable: relative order is preserved within each output bucket so
 * the bulk-delete confirm message can show "3 locked: idA, idB, idC"
 * in the same order the user encounters them on the list.
 */
export function partitionLocked<T extends LockedLike>(clips: T[]): LockPartition {
  const out: LockPartition = { locked: [], unlocked: [] };
  if (!Array.isArray(clips)) return out;
  for (const c of clips) {
    if (!c || typeof c.id !== "string" || c.id.length === 0) continue;
    if (c.locked === true) out.locked.push(c.id);
    else out.unlocked.push(c.id);
  }
  return out;
}

/**
 * Build the human confirm string for a bulk delete that touches at
 * least one locked clip. Returns `null` when there's nothing to
 * confirm (both buckets empty, or only unlocked clips — caller is
 * expected to skip the confirm entirely in those cases).
 *
 * Shapes:
 *   - Single locked clip (1 / 0):        "Delete 1 locked clip?\n\nThe clip is marked..."
 *   - All locked (N / 0):                 "Delete N locked clips?\n\nAll N are marked..."
 *   - Mixed (N locked / M unlocked):     "Delete N+M clips? (N locked)\n\nN are marked..."
 *   - Only unlocked → null (no confirm needed; caller short-circuits)
 *
 * The strings are tuned for the browser's `confirm()` dialog: short
 * first line that fits in the title-ish area, blank line, then the
 * "why this confirm exists" explanation so a hurried user has enough
 * context to choose intelligently.
 */
export function formatLockConfirm(p: LockPartition): string | null {
  const locked = p.locked.length;
  const unlocked = p.unlocked.length;
  if (locked === 0) return null;
  // Pluralization helpers — kept inline so the grammar is obvious
  // in the resulting strings.
  const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? "" : "s"}`;
  if (unlocked === 0) {
    // Pure locked batch.
    if (locked === 1) {
      return (
        `Delete 1 locked clip?\n\n` +
        `The clip is marked "ask before deleting". It still goes to trash (restorable for 7 days), ` +
        `but you wanted an explicit confirm.`
      );
    }
    return (
      `Delete ${plural(locked, "locked clip")}?\n\n` +
      `All ${locked} are marked "ask before deleting". They go to trash (restorable for 7 days), ` +
      `but you wanted an explicit confirm.`
    );
  }
  // Mixed batch — name the total + locked count.
  const total = locked + unlocked;
  return (
    `Delete ${plural(total, "clip")}? (${locked} locked)\n\n` +
    `${plural(locked, "clip")} ${locked === 1 ? "is" : "are"} marked "ask before deleting" — they ` +
    `go to trash too, but you wanted an explicit confirm.`
  );
}

/**
 * Single-clip helper: builds the confirm message for one locked clip
 * (row delete / keyboard Delete / right-click menu). Includes the
 * preview slice so the user knows WHICH clip they're throwing away.
 *
 * Defensive: an empty/missing preview falls back to "this clip" so
 * the dialog never reads "Delete the locked clip ?\n\n...".
 */
export function formatLockedClipConfirm(preview: string | null | undefined): string {
  const raw = (preview || "").replace(/\s+/g, " ").trim();
  const snippet = raw.slice(0, 60);
  const label = snippet ? `"${snippet}${raw.length > 60 ? "…" : ""}"` : "this clip";
  return (
    `Delete the locked clip ${label}?\n\n` +
    `It's marked "ask before deleting". Goes to trash (restorable for 7 days).`
  );
}
