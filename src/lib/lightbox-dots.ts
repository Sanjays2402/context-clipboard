/**
 * Image-lightbox position dot-strip model.
 *
 * The lightbox steps through a run of image clips with prev/next
 * chevrons and a "image N of M" caption (lib/lightbox-nav). But for a
 * run of many screenshots, stepping one-at-a-time to reach image 9 of
 * 12 is tedious — every photo viewer answers this with a dot-strip /
 * filmstrip you can click to JUMP straight to a frame. This module is
 * the pure model behind that strip: from the ordered image-nav ids and
 * the id currently open, it produces the per-dot descriptors (target
 * id, 1-based label, active flag) the popup paints as clickable dots.
 *
 * No DOM — the popup renders the dots + binds the clicks; keeping the
 * mapping here means the active-dot resolution + the "hide for a lone
 * image" gate are exercised headless and can't drift from the caption's
 * own "N of M" (both derive from the same imageNavIds sequence).
 *
 * Design decisions:
 *   - The strip only earns its space when there are 2+ images to jump
 *     between (a lone image has nowhere to jump). `dotStripVisible`
 *     gates this; the popup hides the strip otherwise, exactly as the
 *     prev/next chevrons hide for a single image.
 *   - Each dot carries the TARGET clip id so the click handler is a
 *     straight `openLightboxClip(dot.id)` with no index math at the call
 *     site. The `index` (1-based) doubles as the aria-label number and
 *     the title ("Image 3 of 12").
 *   - `active` marks the dot for the currently-open image so the popup
 *     can highlight it; exactly one dot is active when the open id is in
 *     the set, none when it isn't (a stale id mid-re-render) — the strip
 *     then shows all dots inactive rather than throwing.
 *   - Defensive: a nullish / single-entry list yields an empty strip;
 *     duplicate ids (shouldn't happen — ids are unique) mark only the
 *     FIRST match active so we never light two dots.
 */

export interface LightboxDot {
  /** The image clip id to open when this dot is clicked. */
  id: string;
  /** 1-based position in the run (for label / aria / title). */
  index: number;
  /** Total images in the run (for the "of M" in the title). */
  total: number;
  /** True for the dot of the currently-open image. */
  active: boolean;
}

/**
 * True when a jump dot-strip is worth showing: there must be at least
 * two images to jump between. A lone image (or empty set) yields false
 * and the popup hides the strip — matching the prev/next chevrons,
 * which also hide for a single image.
 */
export function dotStripVisible(
  ids: ReadonlyArray<string> | null | undefined,
): boolean {
  return Array.isArray(ids) && ids.length > 1;
}

/**
 * Build the clickable dot descriptors for the position strip.
 *
 * @param ids        ordered zoomable image ids (from imageNavIds).
 * @param currentId  the id currently shown in the lightbox.
 *
 * Returns one `LightboxDot` per image (in list order), with `active`
 * set on the dot whose id matches `currentId` (the first match only, so
 * a freak duplicate never lights two). Returns [] when there's fewer
 * than two images (nothing to jump between) or a nullish list — the
 * caller gates on `dotStripVisible` first, so this is belt-and-braces.
 */
export function lightboxDots(
  ids: ReadonlyArray<string> | null | undefined,
  currentId: string | null | undefined,
): LightboxDot[] {
  if (!Array.isArray(ids) || ids.length <= 1) return [];
  const total = ids.length;
  let activeSeen = false;
  const out: LightboxDot[] = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (typeof id !== "string" || id === "") continue;
    const isActive = !activeSeen && id === currentId;
    if (isActive) activeSeen = true;
    out.push({ id, index: i + 1, total, active: isActive });
  }
  return out;
}

/**
 * Per-dot hover/title + aria text: "Image 3 of 12", with a trailing
 * " (current)" on the active dot so a screen-reader user knows which
 * one they're on. Pure string helper so the label grammar is shared +
 * testable.
 */
export function dotLabel(dot: LightboxDot | null | undefined): string {
  if (!dot) return "";
  const base = `Image ${dot.index} of ${dot.total}`;
  return dot.active ? `${base} (current)` : base;
}
