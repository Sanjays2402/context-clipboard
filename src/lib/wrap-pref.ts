/**
 * Effective word-wrap resolution for the detail body.
 *
 * The detail view wraps long lines by default, with a global toggle
 * (persisted in the `detail_wrap` meta row) the user can flip to make
 * the body scroll horizontally instead — useful for tabular text,
 * logs, and wide code where column alignment matters more than seeing
 * every character without scrolling.
 *
 * But a SINGLE wide clip often wants the opposite of the user's global
 * preference: they keep wrap on for prose generally, yet this one TSV
 * dump should scroll. Flipping the global every time they open that
 * clip — and flipping it back after — is a papercut. So a clip can
 * carry a per-clip `wrapOverride` that wins over the global for just
 * that clip.
 *
 * This module is the pure resolver: given the global default and a
 * clip's optional override, it returns the wrap state the body should
 * actually render. No DOM, no IDB — the popup reads the result and
 * toggles the `.nowrap` class. Keeping the precedence here means the
 * "override wins, else fall back to global" rule is exercised headless
 * and lives in exactly one place.
 *
 * Design decisions:
 *   - Precedence: a boolean `wrapOverride` ALWAYS wins (true -> wrap,
 *     false -> nowrap). Only `undefined` (no override set) falls
 *     through to the global default. This is the whole point — the
 *     per-clip choice is sticky regardless of how the user later
 *     changes the global.
 *   - The global default is itself coerced to a boolean (defaulting to
 *     wrap-on) so a malformed meta value can't leave the body in an
 *     indeterminate state.
 *   - `hasWrapOverride` is a tiny predicate the popup uses to decide
 *     whether to show the "following global" vs "overridden" affordance
 *     on the toggle button (and whether Alt-click has anything to
 *     clear). Strict boolean check so a stray truthy non-boolean never
 *     reads as an override.
 */

export interface WrapResolvable {
  /** Per-clip override; undefined = follow the global default. */
  wrapOverride?: boolean;
}

/**
 * Resolve the wrap state the detail body should render for `clip`,
 * given the user's global `globalDefault` (wrap-on = true).
 *
 * A boolean `wrapOverride` on the clip wins outright; otherwise the
 * global default applies. Defensive against a nullish clip (treated as
 * "no override") and a non-boolean global (coerced to wrap-on).
 */
export function effectiveWrap(
  clip: WrapResolvable | null | undefined,
  globalDefault: boolean,
): boolean {
  const fallback = globalDefault !== false; // default wrap-on
  if (clip && typeof clip.wrapOverride === "boolean") {
    return clip.wrapOverride;
  }
  return fallback;
}

/**
 * True when `clip` carries an explicit per-clip wrap override (i.e. it
 * is NOT following the global default). The popup uses this to badge
 * the toggle button ("overridden — Alt-click to follow the global
 * again") and to gate the Alt-click clear path.
 */
export function hasWrapOverride(clip: WrapResolvable | null | undefined): boolean {
  return !!clip && typeof clip.wrapOverride === "boolean";
}

/**
 * Directional wrap-override match for the `is:wrapoverride:on` /
 * `is:wrapoverride:off` search variants.
 *
 * The bare `is:wrapoverride` operator is presence-only (any override,
 * either direction). These variants narrow it to a SPECIFIC forced
 * state — "show me everything I forced to NOWRAP" is a real review
 * pass (find the wide TSV/log clips you pinned to scroll):
 *   - dir "on"  -> matches only clips with wrapOverride === true
 *                  (forced word-wrap ON).
 *   - dir "off" -> matches only clips with wrapOverride === false
 *                  (forced word-wrap OFF / nowrap).
 *
 * A clip following the global default (undefined override) matches
 * NEITHER direction — it has no forced state to point at. Strict
 * boolean check so a stray truthy non-boolean never reads as a forced
 * state. Defensive against a nullish clip (no override -> no match).
 */
export function wrapOverrideMatches(
  clip: WrapResolvable | null | undefined,
  dir: "on" | "off",
): boolean {
  if (!clip || typeof clip.wrapOverride !== "boolean") return false;
  return dir === "on" ? clip.wrapOverride === true : clip.wrapOverride === false;
}

/**
 * Tooltip for the detail wrap button, reflecting BOTH the effective
 * wrap state and whether this clip is pinned to a per-clip override.
 * The base sentence mirrors the historical copy; when an override is
 * active we append the Alt-click escape hatch so the affordance is
 * discoverable.
 *
 *   global, wrap on   -> "Word wrap on — click to scroll long lines instead"
 *   global, wrap off  -> "Word wrap off — click to wrap long lines"
 *   override, wrap on -> "Word wrap on for this clip — click to scroll · Alt-click to follow the global default"
 *   override, wrap off-> "Word wrap off for this clip — click to wrap · Alt-click to follow the global default"
 */
export function wrapButtonTitle(wrapOn: boolean, overridden: boolean): string {
  if (!overridden) {
    return wrapOn
      ? "Word wrap on \u2014 click to scroll long lines instead"
      : "Word wrap off \u2014 click to wrap long lines";
  }
  return wrapOn
    ? "Word wrap on for this clip \u2014 click to scroll \u00b7 Alt-click to follow the global default"
    : "Word wrap off for this clip \u2014 click to wrap \u00b7 Alt-click to follow the global default";
}
