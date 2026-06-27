/**
 * Settings density-preview model.
 *
 * The Row-density control (comfortable / cozy / compact) changes how
 * tightly the clip list packs — but the three options are abstract until
 * you save and watch the list redraw. The bulk-Markdown separator select
 * already pairs with a live preview swatch so the choice is concrete;
 * this is the same affordance for density: a few stub clip rows rendered
 * at the chosen density right under the dropdown, repainting as the user
 * flips between options.
 *
 * This module owns the PURE side: the stub-row content + the caption
 * grammar + the body-class-for-a-density mapping (re-exported from
 * lib/density so the preview can scope the class to a container without
 * touching the global body class the live list uses). No DOM — the popup
 * builds the rows and swaps the container class.
 *
 * Design decisions:
 *   - Three stub rows, fixed content, so the preview is deterministic
 *     and the visual DIFFERENCE between densities (row height, gaps,
 *     whether the tag row shows) is what changes — not the text. The
 *     content is representative: a title-ish line + a meta line + a tag,
 *     so compact's "hide the tag row" actually shows in the swatch.
 *   - The preview container gets a SCOPED density class
 *     (`density-preview--<density>`) rather than reusing the global
 *     body class, so previewing "compact" doesn't compact the real list
 *     behind the open settings panel. The CSS targets the scoped class.
 *   - The caption names the density + a one-line "what it does" so the
 *     trade-off is legible without saving (mirrors the separator
 *     preview's caption style).
 *   - Defensive: an unknown density string resolves to "comfortable"
 *     (the default) via the same isDensity guard density.ts uses, so a
 *     tampered <select> can't leave the preview in an undefined state.
 */

import type { Density } from "./density";

/** Re-export so the popup imports the density list from one place. */
export { DENSITIES, densityLabel } from "./density";

function normalise(d: Density | string | null | undefined): Density {
  return d === "cozy" || d === "compact" ? d : "comfortable";
}

/** A stub clip row for the density preview. */
export interface DensityPreviewRow {
  /** Lead line — stands in for a clip preview. */
  title: string;
  /** Secondary line — stands in for the meta row (host - time). */
  meta: string;
  /** A single tag chip — hidden at compact density (mirrors the list). */
  tag: string;
}

/**
 * The fixed stub rows the preview paints. Representative content so the
 * density differences (row height, gap, tag-row visibility at compact)
 * are visible. Same three rows regardless of density — only the layout
 * the CSS applies changes.
 */
export function densityPreviewRows(): DensityPreviewRow[] {
  return [
    { title: "useEffect cleanup pattern", meta: "github.com - 2m ago", tag: "code" },
    { title: "Standup notes - shipping Friday", meta: "notion.so - 1h ago", tag: "work" },
    { title: "https://news.ycombinator.com", meta: "link - yesterday", tag: "read" },
  ];
}

/**
 * The scoped CSS class for the preview container at a given density.
 * Scoped (NOT the global body class) so previewing compact doesn't
 * compact the live list behind the panel. Comfortable is the base
 * (no modifier) so the default needs no extra CSS.
 *
 *   comfortable -> "density-preview"
 *   cozy        -> "density-preview density-preview--cozy"
 *   compact     -> "density-preview density-preview--compact"
 */
export function densityPreviewClass(d: Density | string | null | undefined): string {
  const den = normalise(d);
  return den === "comfortable"
    ? "density-preview"
    : `density-preview density-preview--${den}`;
}

/**
 * One-line caption naming the chosen density + what it trades. Mirrors
 * the separator preview's caption grammar ("name - effect").
 */
export function densityPreviewCaption(d: Density | string | null | undefined): string {
  const den = normalise(d);
  switch (den) {
    case "compact":
      return "Compact - tightest rows, tags hidden, ~30+ per screen";
    case "cozy":
      return "Cozy - trimmer rows, keeps the tag row and full thumb";
    case "comfortable":
    default:
      return "Comfortable - the roomy default, full spacing";
  }
}
