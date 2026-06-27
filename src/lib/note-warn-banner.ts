/**
 * Note-composer live caution-warning banner model.
 *
 * The in-page palette already tints a clip's row warm-red when its note
 * carries a caution keyword (prod / staging / "do not" / secret / …) —
 * see lib/note-warning. That tint is a paste-time safety net: the user
 * reaching for Cmd+Shift+V sees at a glance that THIS clip needs a second
 * look. But the loop was open at the AUTHORING end — when you type the
 * note, nothing tells you "heads up, this note will flag the clip." You
 * only discover the consequence later, in a different surface.
 *
 * This module closes that loop. As the user types in the note composer,
 * it inspects the draft and decides whether a small inline banner should
 * appear — "This note will flag the clip (prod) — it'll show a caution
 * tint when you reach for it later." That makes the downstream behaviour
 * visible at the moment of writing, the way a form previews its own
 * validation. It reuses the EXACT same detection (hasNoteWarning +
 * firstWarningKeyword) the palette tint runs on, so the authoring preview
 * and the paste-time tint can never disagree on what counts as a caution.
 *
 * Pure — no DOM. The composer calls this on every `input` event, shows
 * the banner when `flagged` is true with the returned text, hides it
 * otherwise. Keeping the decision here means the gate + the copy are
 * exercised headless and stay in lock-step with the palette.
 *
 * Design decisions:
 *   - Detection is DELEGATED to lib/note-warning (single source of truth).
 *     We do not re-implement the keyword scan — if the list grows there,
 *     the banner grows with it for free, and the two surfaces can't drift.
 *   - The banner is informational, never blocking. A flagged note still
 *     saves exactly as before; this is a heads-up, not a gate. So the
 *     model returns only what to SHOW, never a "can't save" verdict.
 *   - We surface the FIRST matched keyword (canonical-cased, via
 *     firstWarningKeyword) so the copy is specific ("flag the clip
 *     (staging)") rather than a vague "this looks risky". Specific tells
 *     the user WHY, so they can decide it's a false positive and ignore it.
 *   - Empty / whitespace / non-string drafts yield "not flagged" — a
 *     blank composer shows no banner. Same empty contract as the
 *     sanitizer + palette predicate.
 */

import { hasNoteWarning, firstWarningKeyword } from "./note-warning";

export interface NoteWarnBanner {
  /** True when the draft contains a caution keyword (palette would tint it). */
  flagged: boolean;
  /**
   * The first matched keyword (canonical lowercase, as in
   * NOTE_WARNING_KEYWORDS), e.g. "prod" / "staging" / "do not". Empty
   * when not flagged — the caller never renders a partial sentence.
   */
  keyword: string;
  /**
   * Ready-to-render banner text, e.g.
   * "This note will flag the clip (prod) — it'll show a caution tint
   * when you reach for it later." Empty when not flagged.
   */
  text: string;
}

const NOT_FLAGGED: NoteWarnBanner = { flagged: false, keyword: "", text: "" };

/**
 * Decide whether the note draft should surface the caution banner, and
 * with what copy. Pure — runs the same detection the palette tint uses
 * so the authoring preview and the paste-time tint agree exactly.
 *
 * Returns `{ flagged: false }` for any draft the palette wouldn't tint
 * (no caution keyword, empty, whitespace-only, non-string) so the
 * composer hides the banner in those cases.
 */
export function noteWarnBanner(draft: string | null | undefined): NoteWarnBanner {
  if (typeof draft !== "string") return NOT_FLAGGED;
  if (!hasNoteWarning(draft)) return NOT_FLAGGED;
  // hasNoteWarning fired, so a keyword exists; firstWarningKeyword
  // returns it (canonical form). Defensive: if the two ever drift
  // (they're built from the same list, so they shouldn't), fall back
  // to a generic noun rather than rendering "(undefined)".
  const kw = firstWarningKeyword(draft) || "";
  return {
    flagged: true,
    keyword: kw,
    text: formatNoteWarnBannerText(kw),
  };
}

/**
 * Build the banner copy for a given matched keyword. Split out so the
 * grammar (and the "(keyword)" parenthetical vs a bare phrasing when the
 * keyword is somehow empty) is a single testable unit.
 *
 * With a keyword:  "This note will flag the clip (prod) — it'll show a
 *                   caution tint when you reach for it later."
 * Without one:     "This note will flag the clip — it'll show a caution
 *                   tint when you reach for it later." (defensive only;
 *                   noteWarnBanner only reaches here when flagged.)
 */
export function formatNoteWarnBannerText(keyword: string | null | undefined): string {
  const kw = typeof keyword === "string" ? keyword.trim() : "";
  const subject = kw ? `flag the clip (${kw})` : "flag the clip";
  return `This note will ${subject} \u2014 it'll show a caution tint when you reach for it later.`;
}
