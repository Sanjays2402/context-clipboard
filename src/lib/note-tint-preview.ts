/**
 * Settings preview model for the note caution-keyword tint.
 *
 * The in-page palette tints a clip's row warm-red when its note carries a
 * caution keyword (prod / staging / "do not" / secret / …) — see
 * lib/note-warning — and the note composer now surfaces a live banner
 * naming the matched keyword at authoring time. But BOTH of those only
 * appear once you've already written a flagged note: there's no place in
 * the UI that says "here's WHAT trips the warm tint, and here's what it
 * looks like" before you ever type one. A user wondering "why did that
 * clip go red?" has to reverse-engineer the rule.
 *
 * This is that explainer — a small settings swatch that paints a few stub
 * note rows, the flagged ones carrying the same warm tint the palette
 * applies, each labelled with the keyword that fired. It's the note-tint
 * sibling of the density preview + the bulk-separator preview: an abstract
 * behaviour made concrete right where the user can study it.
 *
 * This module owns the PURE side: the fixed stub note strings + the
 * per-row verdict (flagged? which keyword?). The verdict is DELEGATED to
 * lib/note-warning (hasNoteWarning + firstWarningKeyword), the EXACT same
 * detection the palette tint and the composer banner run on, so the
 * preview can never claim a tint the live surfaces wouldn't apply — and if
 * the keyword list grows there, the preview's verdicts grow with it for
 * free. No DOM — the popup builds the rows + applies the tint class.
 *
 * Design decisions:
 *   - The stub notes are fixed + representative: a couple that DO trip the
 *     tint (a production caveat, a "do not paste" warning, a staging URL)
 *     and one that DOESN'T (an ordinary reminder). Showing both the tinted
 *     AND the plain row side by side is what makes the rule legible — the
 *     contrast IS the lesson. Same "fixed deterministic content" contract
 *     the density preview uses.
 *   - Each flagged row carries its matched keyword (canonical-cased, via
 *     firstWarningKeyword) so the caption can read "tinted: prod" — naming
 *     the trigger, not just showing a red row. Specific tells the user
 *     WHY, the same way the composer banner does.
 *   - The plain row's `keyword` is empty + `flagged` false, so the caller
 *     paints it as a normal note row (no tint) — the baseline the tinted
 *     rows contrast against.
 *   - Pure + deterministic: the verdicts come from the live detector run
 *     over the fixed strings, so a headless test asserts the SAME rows the
 *     popup renders. No popup-side string logic.
 */

import { hasNoteWarning, firstWarningKeyword } from "./note-warning";

/** A stub note row for the settings tint preview. */
export interface NoteTintPreviewRow {
  /** The stub note text rendered in the row. */
  note: string;
  /** True when the note trips the caution tint (palette would warm-red it). */
  flagged: boolean;
  /**
   * The matched keyword (canonical lowercase, as in NOTE_WARNING_KEYWORDS),
   * e.g. "prod" / "staging" / "do not". Empty when not flagged so the
   * caller never renders a partial "tinted: " caption.
   */
  keyword: string;
}

/**
 * The fixed stub notes the preview paints. Two trip the tint (a production
 * caveat + a "do not paste" warning + a staging URL), one stays plain (an
 * ordinary reminder) so the swatch shows the tinted/plain contrast that
 * makes the rule legible. The verdict for EACH is computed live from
 * lib/note-warning, so the preview rows always match what the palette +
 * composer banner would do — no hard-coded "this one is red" that could
 * drift from the detector.
 */
const PREVIEW_NOTES: readonly string[] = [
  "prod only — never paste into the live console",
  "do not paste this token anywhere public",
  "staging URL, swap before shipping",
  "reminder: ask Dana about the Q3 numbers",
];

/**
 * Build the stub note rows for the settings tint preview, each with its
 * live flagged/keyword verdict. Pure — the caller renders the rows +
 * applies the warm-tint class to the flagged ones. Deterministic: the
 * same fixed notes + the same detector yield the same rows every call.
 */
export function noteTintPreviewRows(): NoteTintPreviewRow[] {
  return PREVIEW_NOTES.map((note) => {
    const flagged = hasNoteWarning(note);
    // firstWarningKeyword returns the canonical-cased trigger; defensive
    // fallback to "" if the two detectors ever disagree (they share a list,
    // so they shouldn't) so the row never carries "(undefined)".
    const keyword = flagged ? firstWarningKeyword(note) || "" : "";
    return { note, flagged, keyword };
  });
}

/**
 * One-line caption explaining the swatch. Names the tint's purpose +
 * mirrors the density/separator preview caption grammar so the settings
 * previews read consistently.
 */
export function noteTintPreviewCaption(): string {
  return "Notes with a caution keyword (prod, staging, do not, secret, \u2026) tint warm-red when you reach for the clip.";
}

/**
 * Per-row caption for a flagged row, naming the keyword that fired, e.g.
 * "tinted: prod". Returns empty string for an unflagged row (the caller
 * shows no caption there — the plain row is the baseline). Split out so
 * the "(keyword)" grammar is a single testable unit, mirroring the
 * composer banner's keyword-naming.
 */
export function noteTintPreviewRowCaption(row: NoteTintPreviewRow | null | undefined): string {
  if (!row || !row.flagged) return "";
  const kw = typeof row.keyword === "string" ? row.keyword.trim() : "";
  return kw ? `tinted: ${kw}` : "tinted";
}
