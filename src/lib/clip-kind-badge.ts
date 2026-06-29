/**
 * Code / prose classification badge for the detail meta row.
 *
 * The quick-chip strip already shows "Code (N)" / "Prose (N)" counts over
 * the whole history, and `is:code` / `is:prose` filter the list. But when
 * you're staring at ONE clip in the detail view, there was no at-a-glance
 * signal for which bucket it falls in — you had to read the body and judge
 * for yourself, or notice whether the syntax tint kicked in.
 *
 * This module decides the small monochrome badge that paints in the detail
 * meta row: "code" (the classifier recognised a language, or the user
 * pinned one) or "prose" (text/link the classifier declined). Clicking it
 * jumps the list to the matching filter — the single-clip companion to the
 * Code/Prose quick-chips. Image clips get no badge (neither code nor
 * prose), so the function returns null and the caller hides the row.
 *
 * Pure: no DOM, no clipboard. Reuses the exact codeMatches / proseMatches
 * predicates behind the `is:code` / `is:prose` filters + the quick-chip
 * counts, so the badge can never disagree with what the filter would show
 * — a clip badged "code" is one `is:code` surfaces, full stop.
 */

import { codeMatches, proseMatches } from "./search";

export interface ClipKindBadgeInput {
  kind: "text" | "image" | "link";
  content: string;
  /** Per-clip forced language id (or "none"); steers codeMatches. */
  langOverride?: string;
}

export interface ClipKindBadge {
  /** The bucket — drives the label + the filter operator. */
  kind: "code" | "prose";
  /** Visible badge text (lowercase to match the extension's mono chrome). */
  label: string;
  /** Search operator the badge applies on click ("is:code" / "is:prose"). */
  op: string;
  /** Hover/title affordance telegraphing the click. */
  title: string;
}

/**
 * Decide the code/prose badge for a clip, or null when there's nothing to
 * show (image clips — neither code nor prose). Delegates the bucket
 * decision to the same codeMatches/proseMatches predicates the search
 * filter uses, so the badge, the quick-chip counts, and the filter always
 * agree.
 *
 * Order matters only for clarity: codeMatches honours the per-clip
 * langOverride first (a pinned language is code, a forced-"none" is prose),
 * then sniffs the body. proseMatches is the exact inverse for text/link, so
 * exactly one of the two is true for any non-image clip — we test code
 * first and fall through to prose.
 */
export function clipKindBadge(
  c: ClipKindBadgeInput | null | undefined,
): ClipKindBadge | null {
  if (!c) return null;
  // Image clips are excluded from BOTH buckets (the body is a data URL),
  // so there's no meaningful badge — hide the row.
  if (c.kind === "image") return null;
  if (codeMatches(c)) {
    return {
      kind: "code",
      label: "code",
      op: "is:code",
      title: "Detected as code \u00b7 click to filter to code clips",
    };
  }
  // proseMatches is the inverse of codeMatches for text/link, so this is
  // always true here — but call it explicitly so a future change to the
  // predicates (e.g. a third bucket) fails loud rather than mis-badging.
  if (proseMatches(c)) {
    return {
      kind: "prose",
      label: "prose",
      op: "is:prose",
      title: "Plain prose \u00b7 click to filter to prose clips",
    };
  }
  return null;
}
