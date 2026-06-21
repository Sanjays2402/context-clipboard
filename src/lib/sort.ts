/**
 * Pure sort helpers for the popup list.
 *
 * `sortClips` runs AFTER the filter layer (applyQuery in lib/search) so
 * it operates on the same array the UI will render. Pinned clips
 * always float to the top regardless of mode — pinning is a "stick
 * this here" intent, and dropping a pinned clip mid-list because some
 * other clip is bigger or newer feels broken.
 *
 * No IO. No DOM. Caller passes the array; we return a new sorted array
 * (defensive copy so the input stays stable for whatever else holds a
 * reference, e.g. the rank-then-paginate path).
 */
import type { ClipItem, SortMode } from "./types";

/**
 * Human label for a sort mode — used by the footer dropdown and the
 * count-line hint. Kept here so the UI and the data layer agree on the
 * vocabulary.
 */
export function sortLabel(mode: SortMode): string {
  switch (mode) {
    case "recent":
      return "Most recent";
    case "oldest":
      return "Oldest first";
    case "hits":
      return "Most copied";
    case "size":
      return "Largest first";
    case "alpha":
      return "A to Z";
  }
}

/** Comparator used INSIDE each pin tier. Pinned tier ALWAYS sorts above
 *  the unpinned tier, regardless of mode (`pinnedFirst` in sortClips). */
function compareByMode(a: ClipItem, b: ClipItem, mode: SortMode): number {
  switch (mode) {
    case "recent":
      return b.lastSeenAt - a.lastSeenAt;
    case "oldest":
      return a.lastSeenAt - b.lastSeenAt;
    case "hits": {
      const diff = (b.hitCount || 0) - (a.hitCount || 0);
      // Tie-break on recency so two 1-hit clips don't flip on every render.
      return diff !== 0 ? diff : b.lastSeenAt - a.lastSeenAt;
    }
    case "size": {
      const diff = (b.bytes || 0) - (a.bytes || 0);
      return diff !== 0 ? diff : b.lastSeenAt - a.lastSeenAt;
    }
    case "alpha": {
      const ka = (a.preview || a.content || "").trim().toLowerCase();
      const kb = (b.preview || b.content || "").trim().toLowerCase();
      const cmp = ka.localeCompare(kb);
      return cmp !== 0 ? cmp : b.lastSeenAt - a.lastSeenAt;
    }
  }
}

/**
 * Return a copy of `clips` sorted by `mode`. Pinned clips always go first,
 * then unpinned, each tier sorted independently. Stable across renders
 * (deterministic tie-breaker on `lastSeenAt`).
 */
export function sortClips(clips: ClipItem[], mode: SortMode): ClipItem[] {
  const copy = clips.slice();
  copy.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return compareByMode(a, b, mode);
  });
  return copy;
}
