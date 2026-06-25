/**
 * Row-density resolution for the clip list.
 *
 * The list had a single boolean `compactRows` setting: a hard jump
 * from the roomy default straight to a 28px-thumb dense mode, with
 * nothing in between. Many users want "a bit tighter" without going
 * all the way to the information-dense compact tier — so this adds a
 * three-step density scale (comfortable / cozy / compact) and the
 * logic to map it onto the body class the CSS keys off.
 *
 * This module is the pure resolver behind that control. It exists to:
 *   1. Migrate the legacy boolean (`compactRows`) into the new
 *      tri-state, so a user who had compact ON keeps it after upgrade
 *      and an export from an old version still loads sensibly.
 *   2. Keep the boolean MIRRORED to the density (compact <-> true) so
 *      the existing palette quick-toggle, import/export round-trip, and
 *      any other consumer of `compactRows` keep working unchanged.
 *   3. Map a density to the body class the CSS applies.
 *
 * No DOM, no IDB — the popup reads these helpers and toggles classes /
 * persists settings. Keeping the precedence + migration here means the
 * "legacy boolean vs new field" reconciliation is exercised headless
 * and lives in one place.
 *
 * Design decisions:
 *   - `comfortable` is the default (the historical roomy list). `cozy`
 *     is the new middle tier (trim padding + margins, keep the tag row
 *     and full thumb). `compact` is the existing dense mode (28px thumb,
 *     hidden tags, single-line) — unchanged in CSS, just reached via
 *     the scale now.
 *   - MIGRATION precedence: an explicit, valid `density` field always
 *     wins. Only when it's missing / malformed do we fall back to the
 *     legacy boolean: `compactRows === true` -> "compact", else
 *     "comfortable". This means a freshly-saved settings object (which
 *     carries both fields) is authoritative, while an old object (no
 *     density) still resolves correctly from its boolean.
 *   - The boolean is ALWAYS recomputable from the density
 *     (`compactRows = density === "compact"`), so callers persisting a
 *     density change can keep the boolean in lock-step and never let
 *     the two diverge.
 *   - Defensive against nullish / unknown values throughout — a junk
 *     density string resolves via the boolean fallback rather than
 *     leaving the list in an undefined class state.
 */

export type Density = "comfortable" | "cozy" | "compact";

export const DENSITIES: readonly Density[] = ["comfortable", "cozy", "compact"];

/** The shape this resolver needs off a Settings object (both optional). */
export interface DensitySource {
  density?: Density | string;
  compactRows?: boolean;
}

function isDensity(v: unknown): v is Density {
  return v === "comfortable" || v === "cozy" || v === "compact";
}

/**
 * Resolve the effective density from a settings object, honoring the
 * legacy `compactRows` boolean when the `density` field is absent /
 * malformed.
 *
 *   - valid `density`            -> that density (authoritative).
 *   - missing/junk density,
 *     `compactRows === true`     -> "compact" (legacy migration).
 *   - otherwise                  -> "comfortable" (the default).
 */
export function resolveDensity(s: DensitySource | null | undefined): Density {
  if (!s) return "comfortable";
  if (isDensity(s.density)) return s.density;
  return s.compactRows === true ? "compact" : "comfortable";
}

/**
 * The body CSS class for a density, or "" for comfortable (no class —
 * the default layout). Compact keeps the historical `compact-rows`
 * class so none of the existing CSS has to change; cozy gets its own
 * `cozy-rows` class for the new middle tier.
 */
export function densityBodyClass(d: Density): string {
  switch (d) {
    case "compact":
      return "compact-rows";
    case "cozy":
      return "cozy-rows";
    case "comfortable":
    default:
      return "";
  }
}

/**
 * Whether the legacy `compactRows` boolean should be true for a given
 * density. Callers persist this alongside the density so the boolean
 * (consumed by the palette toggle + import/export) stays in lock-step.
 */
export function densityToCompactBool(d: Density): boolean {
  return d === "compact";
}

/** Human label for the density radio / palette command. */
export function densityLabel(d: Density): string {
  switch (d) {
    case "comfortable":
      return "Comfortable";
    case "cozy":
      return "Cozy";
    case "compact":
      return "Compact";
  }
}
