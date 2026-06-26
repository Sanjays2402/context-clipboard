/**
 * Image-lightbox prev/next traversal core.
 *
 * The detail-view image lightbox (lib/lightbox + the popup overlay)
 * opens ONE image at full resolution. But a user reviewing a run of
 * screenshots — three diagrams pasted in a row, a sequence of error
 * shots — had to close the lightbox, step the detail prev/next to the
 * next image clip, then re-open the lightbox, for every single image.
 * That round-trip is the papercut this module kills: arrows (and the
 * on-screen chevrons) should walk to the previous / next IMAGE clip
 * without ever leaving the zoom view, exactly the way every photo
 * viewer works.
 *
 * This module is the pure traversal core: from the currently-rendered,
 * already-filtered+sorted clip list it derives the ordered subsequence
 * of ZOOMABLE image clips, then — given the id open in the lightbox —
 * resolves the prev / next image id with wrap-around. No DOM, no clip
 * mutation; the popup owns the `<img>` swap, the caption, and the key
 * wiring. Keeping the index math here means every boundary (a single
 * image, the open clip not being an image, a wrap at the ends, a stale
 * id after a re-render) is exercised headless and the lightbox can
 * never disagree with itself about where "next" lands.
 *
 * Design decisions:
 *   - The traversal set is the image clips IN LIST ORDER, so stepping
 *     the lightbox matches what the user would see stepping the detail
 *     prev/next — same order, just image-only. We reuse `canZoom`
 *     (kind === "image" AND a usable data URL) as the membership gate
 *     so the nav set is exactly the clips the lightbox can actually
 *     render; a malformed image record with no content is skipped, not
 *     surfaced as a dead frame.
 *   - Wrap-around is ON (matching the detail nav's looped default and
 *     the similar-clips cycle): stepping next off the last image lands
 *     on the first, prev off the first lands on the last, with a
 *     `wrapped` flag so the caller can surface a subtle "looped" toast.
 *     A single-image set has nowhere to go — every step returns null
 *     and the caller disables the chevrons.
 *   - Defensive throughout: a nullish list yields an empty nav set; a
 *     current id that isn't in the set (the open clip was deleted, or
 *     somehow isn't an image) yields null rather than throwing inside a
 *     keydown handler.
 */

export interface LightboxNavClip {
  id: string;
  kind: string;
  /** The image data URL — empty/malformed records are excluded. */
  content?: string | null;
}

/** Membership gate — mirrors lib/lightbox.canZoom (image + usable content). */
function isZoomable(c: LightboxNavClip | null | undefined): boolean {
  return (
    !!c &&
    c.kind === "image" &&
    typeof c.content === "string" &&
    c.content.length > 0
  );
}

/**
 * Derive the ordered list of zoomable image clip ids from the current
 * clip list, preserving list order. This is the traversal sequence the
 * lightbox steps through. Defensive against a nullish list and
 * malformed entries (skipped silently).
 */
export function imageNavIds(
  clips: ReadonlyArray<LightboxNavClip | null | undefined> | null | undefined,
): string[] {
  if (!Array.isArray(clips)) return [];
  const out: string[] = [];
  for (const c of clips) {
    if (isZoomable(c) && typeof c!.id === "string" && c!.id !== "") {
      out.push(c!.id);
    }
  }
  return out;
}

export interface LightboxStep {
  /** The image clip id to open after the step. */
  id: string;
  /** True when the step crossed an edge (last->first or first->last). */
  wrapped: boolean;
}

/**
 * Resolve the prev/next image id to open in the lightbox.
 *
 * @param ids        ordered zoomable image ids (from imageNavIds).
 * @param currentId  the id currently shown in the lightbox.
 * @param direction  -1 for previous, +1 for next.
 * @param wrap       when true (the default the popup passes), a step
 *                   off either edge loops to the other end and marks
 *                   `wrapped`; when false an edge step returns null.
 *
 * Returns the target {id, wrapped}, or null when there's no valid step:
 *   - the nav set is empty or has a single image (nowhere to go),
 *   - `currentId` isn't in the set (stale / non-image open clip),
 *   - a bad direction, or
 *   - an edge step with wrap off.
 */
export function stepLightbox(
  ids: ReadonlyArray<string> | null | undefined,
  currentId: string | null | undefined,
  direction: -1 | 1,
  wrap: boolean,
): LightboxStep | null {
  if (direction !== -1 && direction !== 1) return null;
  if (!Array.isArray(ids) || ids.length <= 1) return null;
  if (typeof currentId !== "string" || currentId === "") return null;
  const cur = ids.indexOf(currentId);
  if (cur < 0) return null;
  const n = ids.length;
  const raw = cur + direction;
  if (raw >= 0 && raw <= n - 1) {
    return { id: ids[raw], wrapped: false };
  }
  if (!wrap) return null;
  const wrappedIdx = raw < 0 ? n - 1 : 0;
  return { id: ids[wrappedIdx], wrapped: true };
}

/**
 * The 1-based "image N of M" position of `currentId` within the nav
 * set, for the lightbox caption / position pill. Returns null when the
 * id isn't in the set or there's fewer than 2 images (no pill worth
 * showing for a lone image). Mirrors the detail-view position-pill
 * grammar so the two read identically.
 */
export function lightboxPosition(
  ids: ReadonlyArray<string> | null | undefined,
  currentId: string | null | undefined,
): { index: number; total: number } | null {
  if (!Array.isArray(ids) || ids.length <= 1) return null;
  if (typeof currentId !== "string" || currentId === "") return null;
  const i = ids.indexOf(currentId);
  if (i < 0) return null;
  return { index: i + 1, total: ids.length };
}

/**
 * Toast text for a wrap-around lightbox step, so the loop is
 * non-surprising. Forward wrap (onto the first image) reads "Looped to
 * the first image"; backward wrap (onto the last) reads "Looped to the
 * last image". The caller only shows this when `wrapped` is true.
 */
export function formatLightboxWrapToast(direction: -1 | 1): string {
  return direction === 1
    ? "Looped to the first image"
    : "Looped to the last image";
}
