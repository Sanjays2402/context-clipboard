/**
 * Cycle through archived clips, newest-first, regardless of the
 * current filter / search query.
 *
 * Powers the Cmd+K palette command "Jump to next archived clip" —
 * a useful workflow when you've accumulated cold pins and want to
 * audit them one-by-one (decide whether to unarchive or delete)
 * without having to type `is:archived` and step through the list.
 *
 * Pure: takes an array of ClipItem-shaped records + the current
 * detailId pointer + a sort axis preference, returns the next
 * archived clip's id (or null when there's nothing to surface).
 * The popup wires the result into openDetail().
 *
 * Cycle semantics:
 *   - No archived clips → null.
 *   - No current cursor (detailId null OR not in archived set) →
 *     return the first archived clip in the sort order.
 *   - Current cursor IS in archived set → return the NEXT archived
 *     clip (wrapping around to the first when at the tail).
 *   - Single archived clip → return that clip even when it IS the
 *     cursor (the user explicitly invoked the command; surfacing
 *     the only option is more useful than a silent no-op).
 *
 * Sort axis is `lastSeenAt` descending by default (newest-first,
 * mirrors the popup's recent sort). Callers can pass an explicit
 * sortKey for tests / future per-axis variants.
 */

export interface ArchivedClipShape {
  id: string;
  archived?: boolean;
  lastSeenAt?: number;
  createdAt?: number;
}

export type SortAxis = "lastSeenAt" | "createdAt";

/**
 * Filter to only archived clips (defensive against non-string ids
 * and non-boolean archived flags), then sort by the requested axis
 * descending so the cycle reads newest-first.
 */
export function archivedClipsSorted<T extends ArchivedClipShape>(
  clips: T[] | null | undefined,
  axis: SortAxis = "lastSeenAt",
): T[] {
  if (!Array.isArray(clips)) return [];
  const out = clips.filter(
    (c) => c && typeof c.id === "string" && c.id.length > 0 && c.archived === true,
  );
  out.sort((a, b) => {
    const av = typeof a[axis] === "number" ? (a[axis] as number) : 0;
    const bv = typeof b[axis] === "number" ? (b[axis] as number) : 0;
    if (bv !== av) return bv - av;
    // Tie-breaker: id descending so the cycle is deterministic even
    // when two archived clips share a timestamp (e.g. bulk archive).
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
  return out;
}

/**
 * Pick the next archived clip's id given the current detail cursor.
 * See the file-header doc for cycle semantics. Never throws.
 */
export function nextArchivedClipId(
  clips: ArchivedClipShape[] | null | undefined,
  currentId: string | null | undefined,
  axis: SortAxis = "lastSeenAt",
): string | null {
  const sorted = archivedClipsSorted(clips, axis);
  if (sorted.length === 0) return null;
  // No cursor → first.
  if (typeof currentId !== "string" || !currentId) return sorted[0].id;
  const idx = sorted.findIndex((c) => c.id === currentId);
  if (idx < 0) return sorted[0].id; // cursor isn't archived (or gone)
  if (sorted.length === 1) return sorted[0].id; // single → that one
  // Wrap: idx+1 mod length.
  const next = (idx + 1) % sorted.length;
  return sorted[next].id;
}

/**
 * Label for the Cmd+K command. Shows the live archived count so the
 * user can tell at a glance whether the cycle is worth it (1 vs
 * 47). Empty count → command stays available but reads as a no-op
 * hint (the palette command itself marks `available: false` when
 * count is zero).
 */
export function describeArchiveCycle(count: number): {
  label: string;
  hint: string;
} {
  if (!Number.isFinite(count) || count <= 0) {
    return {
      label: "Jump to next archived clip",
      hint: "No archived clips to cycle through",
    };
  }
  if (count === 1) {
    return {
      label: "Jump to next archived clip · 1 archived",
      hint: "Only one archived clip — opens it",
    };
  }
  return {
    label: `Jump to next archived clip · ${count} archived`,
    hint: "Open detail-view for the next archived clip (wraps)",
  };
}
