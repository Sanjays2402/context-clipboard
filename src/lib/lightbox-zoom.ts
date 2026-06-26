/**
 * Image-lightbox zoom level core.
 *
 * The lightbox opens an image clip at fit-to-viewport so the whole shot
 * is visible (lib/lightbox caps the detail thumb at 200px; the lightbox
 * shows it at `object-fit: contain`). But a dense screenshot — a config
 * file, a stack trace, a diagram with small labels — is often readable
 * only when you can push PAST fit and enlarge a region. Every image
 * viewer answers this with a zoom: `+` enlarges, `-` shrinks, `0` snaps
 * back to fit.
 *
 * This module is the pure zoom-level model behind that: a clamped,
 * stepped scale factor with a reset-to-fit and a human percentage
 * label. No DOM — the popup owns the `<img>` transform, the control
 * buttons, and the key wiring; keeping the arithmetic here means every
 * boundary (clamp at the floor/ceiling, the reset, the label rounding)
 * is exercised headless and the keyboard path + the on-screen buttons
 * can never disagree about what "one step in" means.
 *
 * Design decisions:
 *   - The floor is FIT (1.0 = the contained, whole-image view). You
 *     can't shrink BELOW fit — there's no use for a postage-stamp of an
 *     already-fitted image, and it would just float in dead space. So
 *     `-` at 1.0 is a no-op (stays 1.0), and the popup greys the
 *     zoom-out control there.
 *   - The ceiling is MAX_ZOOM (5x). Past that a typical capture is just
 *     blur — the underlying pixels don't exist. The follow-up roadmap
 *     item (pinch / wheel pan beyond fit) is a separate, richer viewer;
 *     this slice is the keyboard/button stepper the roadmap scoped.
 *   - Steps are ADDITIVE (ZOOM_STEP = 0.5) rather than multiplicative,
 *     so the increments read as round percentages (100/150/200/...%)
 *     in the readout instead of 100/141/200/... — a stepper, not a
 *     continuous slider.
 *   - `resetZoom` is a named export (= MIN_ZOOM) so the popup's open /
 *     close / step-to-next-image paths all snap to fit through one
 *     symbol rather than a bare literal scattered around.
 *   - Defensive: a nullish / non-finite current level coerces to fit
 *     before stepping, so a corrupted state never propagates NaN into a
 *     CSS transform.
 */

/** Fit-to-viewport — the zoom floor. 1.0 = the contained whole image. */
export const MIN_ZOOM = 1;
/** Zoom ceiling. Past 5x a typical capture is just upscaled blur. */
export const MAX_ZOOM = 5;
/** Additive step per `+` / `-` so the readout lands on round percents. */
export const ZOOM_STEP = 0.5;

/** Coerce a raw level to a finite number, defaulting to fit. */
function coerce(z: number | null | undefined): number {
  return typeof z === "number" && Number.isFinite(z) ? z : MIN_ZOOM;
}

/**
 * Clamp a zoom level into [MIN_ZOOM, MAX_ZOOM]. A nullish / non-finite
 * input coerces to fit so a corrupted state can't escape the range.
 */
export function clampZoom(z: number | null | undefined): number {
  const v = coerce(z);
  if (v < MIN_ZOOM) return MIN_ZOOM;
  if (v > MAX_ZOOM) return MAX_ZOOM;
  return v;
}

/**
 * Step the zoom one increment in `direction` (+1 = in, -1 = out),
 * clamped to the [fit, max] range. A step that would cross a boundary
 * lands ON the boundary (so `-` at fit stays at fit; `+` at max stays
 * at max), which the caller reads via `canZoomIn` / `canZoomOut` to
 * grey the controls. A bad direction returns the (clamped) current
 * level unchanged.
 */
export function stepZoom(current: number | null | undefined, direction: -1 | 1): number {
  const cur = clampZoom(current);
  if (direction !== -1 && direction !== 1) return cur;
  return clampZoom(cur + direction * ZOOM_STEP);
}

/** The fit-to-viewport reset level (= MIN_ZOOM), for open/close/step. */
export function resetZoom(): number {
  return MIN_ZOOM;
}

/** True when the level is enlarged past fit (within a float epsilon). */
export function isZoomed(z: number | null | undefined): boolean {
  return clampZoom(z) > MIN_ZOOM + 1e-9;
}

/** True when there's headroom to zoom IN (below the ceiling). */
export function canZoomIn(z: number | null | undefined): boolean {
  return clampZoom(z) < MAX_ZOOM - 1e-9;
}

/** True when there's room to zoom OUT (above fit). */
export function canZoomOut(z: number | null | undefined): boolean {
  return clampZoom(z) > MIN_ZOOM + 1e-9;
}

/**
 * Human percentage label for the zoom readout: 1.0 -> "100%",
 * 1.5 -> "150%", 2 -> "200%". Rounded to the nearest whole percent so
 * the readout never shows a fractional "150.0001%" from float drift.
 */
export function formatZoomPercent(z: number | null | undefined): string {
  return `${Math.round(clampZoom(z) * 100)}%`;
}

/**
 * The CSS transform string for a zoom level — `scale(N)` with a trimmed
 * number (no trailing ".0"). The popup drops this straight onto
 * `img.style.transform`; transform-origin is set in CSS. Fit (1.0)
 * yields `scale(1)`, a harmless identity transform the caller can also
 * choose to clear entirely.
 */
export function zoomTransform(z: number | null | undefined): string {
  const v = clampZoom(z);
  // Trim a trailing ".0" / ".50" -> ".5" for a tidy inline style.
  const n = Number.isInteger(v) ? String(v) : String(parseFloat(v.toFixed(3)));
  return `scale(${n})`;
}
