/**
 * List-row image-thumb → lightbox gating.
 *
 * Image clips render a thumbnail in their list row. Until now a click
 * anywhere on the row opened the DETAIL view, and only from there could
 * the user click the detail image to reach the full-resolution lightbox.
 * For someone triaging a run of screenshots that's two clicks + a panel
 * swap per image. Clicking the thumb itself should jump STRAIGHT to the
 * lightbox.
 *
 * But the thumb click can't always mean "zoom": when the user is
 * multi-selecting (a selection is already active, or they're holding a
 * selection modifier), a click on any part of the row — thumb included —
 * must keep toggling the row's selected state, or the thumb would become
 * a hole in the selection surface. So the zoom gesture is the PLAIN,
 * no-modifier, not-already-selecting click only.
 *
 * This module is the pure decision behind that: given where the click
 * landed, the clip kind, and the current selection intent, it returns
 * whether to open the lightbox. No DOM — the popup resolves the
 * `.thumb-zoomable` hit-test + the modifier flags and hands them in;
 * keeping the boolean here means the precedence (selection always wins)
 * is exercised headless and the list-click handler and any future
 * keyboard affordance can't disagree about when the thumb zooms.
 */

export interface ThumbZoomContext {
  /** True when the click landed inside the row's zoomable image thumb. */
  onThumb: boolean;
  /** The clicked clip's kind — only `image` clips have a zoomable thumb. */
  kind: string;
  /**
   * True when the click carries selection intent: a selection is already
   * active, OR a selection modifier (Cmd / Ctrl / Shift) is held. When
   * set, the thumb click toggles/extends the selection instead of zooming.
   */
  selectionIntent: boolean;
}

/**
 * Decide whether a list-row click should open the image lightbox
 * directly (skipping detail). True only when the click landed on an
 * image clip's zoomable thumb AND there's no selection intent — so
 * multi-select gestures keep treating the thumb as part of the row.
 * Defensive against a nullish context.
 */
export function shouldZoomThumb(ctx: ThumbZoomContext | null | undefined): boolean {
  if (!ctx) return false;
  return ctx.onThumb === true && ctx.kind === "image" && !ctx.selectionIntent;
}
