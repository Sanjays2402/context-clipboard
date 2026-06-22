/**
 * Pure helper for the bulk-bar "Free X MB" storage-delta hint.
 *
 * When the user has a multi-clip selection and the delete button is
 * the visible bulk action, we want to show how much storage the trash
 * action will reclaim — concretely, the sum of `bytes` across the
 * selected clips. This is a glanceable cue ("oh, those 47 image
 * captures total 12 MB") that matters for users near their IDB quota
 * or just curious about cost.
 *
 * Why a helper at all (rather than inline reduce in popup.ts)? The
 * math has a few defensive branches — missing bytes field, non-number
 * bytes, negative bytes (shouldn't happen but trust nothing), empty
 * selection — and the formatting (B/KB/MB/GB) needs to match the rest
 * of the popup's storage UI. Centralising both keeps the bulk-bar
 * label consistent with `formatBytes` in the storage panel.
 */

/** Sum non-negative numeric byte counts. Defensive against missing/exotic shapes. */
export function sumClipBytes(clips: Array<{ bytes?: number }>): number {
  let total = 0;
  for (const c of clips) {
    const b = c.bytes;
    if (typeof b !== "number") continue;
    if (!Number.isFinite(b)) continue;
    if (b <= 0) continue;
    total += b;
  }
  return total;
}

/**
 * Byte formatter — mirrors the existing popup.ts helper but
 * standalone + testable. Matches the storage panel's segmented bar +
 * detail-view image meta + audit panel labels.
 *
 *   < 1 KB   → "742 B"
 *   < 1 MB   → "12.3 KB"
 *   < 1 GB   → "4.2 MB"
 *   ≥ 1 GB   → "1.07 GB" (2 decimals for the big number)
 */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0 B";
  if (n < 1024) return `${Math.floor(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * Compose the bulk-bar storage-delta label given a selected clip list.
 *
 * Returns:
 *   - `null` when the sum is 0 (no point showing "Free 0 B" — adds
 *     noise without information). Caller hides the strip.
 *   - "Free 4.2 MB" otherwise. The verb is intentionally "Free"
 *     (positive framing) rather than "Delete X MB" (the bulk button
 *     itself already says delete).
 *
 * `now` arg unused; kept here for future expansion (e.g. "Free 4.2 MB
 * (will purge after 7 days)") without breaking the call signature.
 */
export function buildStorageDeltaLabel(
  clips: Array<{ bytes?: number }>,
): string | null {
  const bytes = sumClipBytes(clips);
  if (bytes <= 0) return null;
  return `Free ${formatBytes(bytes)}`;
}
