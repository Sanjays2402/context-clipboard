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

/** Default cap on how many dots render before the strip windows. */
export const DEFAULT_MAX_DOTS = 15;

/**
 * A windowed slice of the full dot list, for runs too long to show
 * every dot without wrapping into a wall.
 */
export interface DotStripWindow {
  /** The visible (windowed) dots, in order. */
  dots: LightboxDot[];
  /** True when the leading edge is truncated (dots exist before the window). */
  hasMoreBefore: boolean;
  /** True when the trailing edge is truncated (dots exist after the window). */
  hasMoreAfter: boolean;
  /**
   * True when the full set didn't fit and we windowed it. The caller
   * shows the compact "N of M" position label only in this case (a
   * fully-visible strip needs no count — the active dot says it all).
   */
  windowed: boolean;
}

/**
 * Window a long dot list down to a sliding band centred on the active
 * dot, so a run of 40 screenshots shows ~15 dots + ellipsis affordances
 * instead of wrapping into a wall.
 *
 * Behaviour:
 *   - total <= maxVisible: every dot shown, `windowed: false`, no
 *     ellipsis. The short-run path is byte-identical to rendering the
 *     raw `lightboxDots` output.
 *   - total >  maxVisible: a contiguous slice of `maxVisible` dots,
 *     centred on the active dot and clamped so it never runs off either
 *     end (near the start it hugs the start; near the end it hugs the
 *     end — the active dot is always inside the window). `hasMoreBefore`
 *     / `hasMoreAfter` flag the truncated edges so the popup can render
 *     a "…" cue, and `windowed: true` tells it to show the "N of M"
 *     count.
 *
 * The window CENTRES on the active dot (not a fixed page) so stepping
 * prev/next scrolls the band smoothly rather than jumping a page at a
 * time. When no dot is active (a stale id mid-re-render) the window
 * anchors at the start rather than throwing.
 *
 * Defensive: a nullish list yields an empty, non-windowed result; a
 * `maxVisible` below 1 is clamped to 1 so we never return an empty
 * window for a non-empty list.
 */
export function windowLightboxDots(
  dots: ReadonlyArray<LightboxDot> | null | undefined,
  maxVisible: number = DEFAULT_MAX_DOTS,
): DotStripWindow {
  const all = Array.isArray(dots) ? dots : [];
  const total = all.length;
  const cap = Number.isFinite(maxVisible) && maxVisible >= 1 ? Math.floor(maxVisible) : 1;
  if (total <= cap) {
    return { dots: all.slice(), hasMoreBefore: false, hasMoreAfter: false, windowed: false };
  }
  // Index of the active dot (first match), or 0 when none is active.
  let activeIdx = 0;
  for (let i = 0; i < total; i++) {
    if (all[i] && all[i].active) {
      activeIdx = i;
      break;
    }
  }
  const half = Math.floor(cap / 2);
  // Centre on active, then clamp so the window stays fully in-range.
  let start = activeIdx - half;
  if (start < 0) start = 0;
  if (start > total - cap) start = total - cap;
  const end = start + cap;
  return {
    dots: all.slice(start, end),
    hasMoreBefore: start > 0,
    hasMoreAfter: end < total,
    windowed: true,
  };
}

/**
 * Compact "N of M" position label for the windowed strip, derived from
 * the active dot in the FULL list. Shown only when the strip is windowed
 * (so a user staring at a truncated band still knows exactly where they
 * are). Returns "" when no dot is active (nothing to anchor on).
 */
export function dotWindowLabel(dots: ReadonlyArray<LightboxDot> | null | undefined): string {
  if (!Array.isArray(dots)) return "";
  for (const d of dots) {
    if (d && d.active) return `${d.index} of ${d.total}`;
  }
  return "";
}
