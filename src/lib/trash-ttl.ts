/**
 * Trash-row retention-urgency model.
 *
 * A trashed clip isn't gone — it sits in the trash store for a 7-day
 * safety window, then the background GC purges it for good. The trash
 * row already shows a flat "Xd left" tail, but that text is the SAME
 * muted grey whether the clip has 6 days of runway or 4 hours before it
 * vanishes forever. So the one moment the count matters most — "this is
 * about to be permanently lost, restore it NOW if you want it" — reads
 * exactly like the moment it doesn't.
 *
 * This module computes a per-row urgency TIER + a precise label from the
 * clip's `deletedAt` and the retention window, so the trash list can
 * tint the about-to-purge rows and sharpen their countdown (hours, not a
 * rounded-up "1d"). It mirrors the detail-view TTL banner's tiering
 * (lib/ttl-banner): a soft-red "imminent" band when the deadline is
 * close, a quieter "soon" tier a bit further out, and nothing special
 * for rows with days of runway. Same visual grammar, applied to the
 * trash retention deadline instead of a per-clip TTL.
 *
 * Pure — no DOM, `now`-injectable so tests pin time deterministically.
 * The popup reads the returned tier (-> CSS class) + label (-> the row's
 * retention tail).
 *
 * Design decisions:
 *   - Three tiers + a normal default:
 *       "expired"  → past the deadline (GC hasn't run yet, but it's
 *                    effectively gone). "Purges any moment".
 *       "imminent" → < 24h left. Soft-red. The label switches to HOURS
 *                    ("4h left") so the user sees the real runway, not a
 *                    rounded-up "1d left" that hides the urgency.
 *       "soon"     → 1–2 days left. A gentle amber nudge — visible but
 *                    not alarming.
 *       "normal"   → ≥ 2 days. The default muted "Xd left" tail, exactly
 *                    as it read before. Most rows live here.
 *   - The DAY count (for "soon" / "normal") is rounded UP (ceil) so a
 *     clip with 6.2 days left reads "7d left" — matches the existing
 *     popup math (it used ceil), so the day-grain label is byte-identical
 *     to before for the rows that stay in the normal tier. The HOUR grain
 *     for "imminent" rounds up too (3h59m -> "4h left") so we never tell
 *     the user they have more time rounded down.
 *   - Sub-hour remaining still reads in hours with a floor of 1 ("<1h
 *     left" would need minute precision the trash list doesn't warrant);
 *     a clip that close is squarely "imminent" and the red tint carries
 *     the urgency. At/under zero we switch to the "expired" copy.
 *   - Defensive: a non-finite deletedAt / retention yields the normal
 *     tier with an empty label rather than throwing inside the trash
 *     render loop; the caller already has a fallback day count.
 */

export type TrashTtlTier = "expired" | "imminent" | "soon" | "normal";

export interface TrashTtlState {
  /** Urgency tier driving the row tint. */
  tier: TrashTtlTier;
  /** ms until permanent purge — negative/zero when already due. */
  remainingMs: number;
  /**
   * Ready-to-render retention tail, e.g. "4h left" / "2d left" /
   * "Purges any moment". Empty only on malformed input (caller falls
   * back to its own day count).
   */
  label: string;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
/** Default trash safety window — mirrors the popup's TRASH_RETENTION_MS. */
export const DEFAULT_TRASH_RETENTION_MS = 7 * DAY_MS;
/** Below this much remaining, a row is "imminent" (soft-red, hour grain). */
export const IMMINENT_MS = DAY_MS; // < 24h
/** Below this much remaining (and >= imminent), a row is "soon" (amber). */
export const SOON_MS = 2 * DAY_MS; // < 48h

/**
 * Compute the retention-urgency tier + label for a trashed clip.
 *
 * @param deletedAt    Unix-ms the clip entered the trash store.
 * @param now          current time (injectable for tests).
 * @param retentionMs  the safety window before permanent purge.
 *
 * Returns a `TrashTtlState`. The "normal" tier (>= 2 days left) keeps the
 * existing muted "Xd left" copy so the common case is unchanged; the
 * closer tiers sharpen the label + flag the row for tinting.
 */
export function trashTtlState(
  deletedAt: number,
  now: number = Date.now(),
  retentionMs: number = DEFAULT_TRASH_RETENTION_MS,
): TrashTtlState {
  if (!Number.isFinite(deletedAt) || !Number.isFinite(retentionMs) || retentionMs <= 0) {
    return { tier: "normal", remainingMs: NaN, label: "" };
  }
  const deadline = deletedAt + retentionMs;
  const remainingMs = deadline - now;

  if (remainingMs <= 0) {
    return { tier: "expired", remainingMs, label: "Purges any moment" };
  }
  if (remainingMs < IMMINENT_MS) {
    // Hour grain so the real runway shows (not a rounded-up "1d").
    const hours = Math.max(1, Math.ceil(remainingMs / HOUR_MS));
    return { tier: "imminent", remainingMs, label: `${hours}h left` };
  }
  if (remainingMs < SOON_MS) {
    const days = Math.ceil(remainingMs / DAY_MS);
    return { tier: "soon", remainingMs, label: `${days}d left` };
  }
  const days = Math.ceil(remainingMs / DAY_MS);
  return { tier: "normal", remainingMs, label: `${days}d left` };
}
