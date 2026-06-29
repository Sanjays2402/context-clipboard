/**
 * Complement suggestion for an empty code/prose filter.
 *
 * When a user filters to `is:code` and the history happens to be ALL prose
 * (zero code clips), the generic "No clips match — try kind:image / host:…"
 * operator wall is unhelpful: the answer isn't a different operator, it's
 * the OTHER half of the same code/prose split. Same the other way: an empty
 * `is:prose` on a code-only history wants the nudge toward `is:code`.
 *
 * This module is the pure decision behind that nudge. Given the raw search
 * box value and the live code/prose counts (the same ones the Code/Prose
 * quick-chips show), it decides whether the query is a lone `is:code` /
 * `is:prose` that came up empty WHILE the complement bucket has clips — and
 * if so returns the complement operator + a warm headline/label so the
 * popup can offer a one-tap switch instead of the operator wall.
 *
 * It parallels lib/empty-reassurance (an all-clear empty) and
 * lib/widen-bucket (a too-narrow calendar bucket): each answers a SPECIFIC
 * flavour of empty result with the right escape hatch. This one answers
 * "you asked for the half of your history that's empty" with "here's the
 * half that isn't".
 *
 * Design decisions:
 *   - Gated to EXACTLY a lone `is:code` / `is:prose` query (after trim +
 *     whitespace-collapse + lowercase). A compound `is:code host:github.com`
 *     is a scoped question where "show me prose instead" would silently drop
 *     the host constraint — so compounds fall through to the generic hint,
 *     the same conservative line widen-bucket + empty-reassurance draw.
 *   - Only suggests when the COMPLEMENT bucket is non-empty. Suggesting
 *     "Show prose" when there's no prose either would just swap one empty
 *     result for another — pointless. Both empty → generic hint.
 *   - Returns a structured result so the popup needs no string logic.
 *
 * No DOM — the popup renders the copy + wires the button's data-query to
 * `complementOp`, reusing the same swap path the widen-bucket button uses.
 */

export interface CodeProseCounts {
  /** How many clips the classifier reads as code (the is:code tally). */
  code: number;
  /** How many clips read as prose (the is:prose tally). */
  prose: number;
}

export interface ComplementSuggestion {
  /** True when a lone code/prose filter came up empty but its twin has clips. */
  suggest: boolean;
  /** The operator to switch to ("is:prose" / "is:code"). Empty when !suggest. */
  complementOp: string;
  /** Warm headline, e.g. "No code clips". Empty when !suggest. */
  headline: string;
  /** Button label, e.g. "Show prose clips (12)". Empty when !suggest. */
  label: string;
  /** One-line explanation. Empty when !suggest. */
  subtext: string;
}

const NONE: ComplementSuggestion = {
  suggest: false,
  complementOp: "",
  headline: "",
  label: "",
  subtext: "",
};

/**
 * Decide whether `raw` is a lone `is:code` / `is:prose` that came up empty
 * while the complement bucket has clips, and if so produce the switch
 * suggestion. Returns `{ suggest: false }` for anything else (compound
 * queries, other operators, plain text, empty input, or a complement that's
 * ALSO empty) so the popup falls back to its generic operator hint.
 *
 * `counts` are the live whole-history code/prose tallies (the same ones the
 * quick-chips render). They drive both the gate (is the complement
 * non-empty?) and the label count.
 */
export function complementSuggestion(
  raw: string | null | undefined,
  counts: CodeProseCounts | null | undefined,
): ComplementSuggestion {
  if (typeof raw !== "string") return NONE;
  const norm = raw.trim().replace(/\s+/g, " ").toLowerCase();
  if (!norm || norm.includes(" ")) return NONE;
  const code = Math.max(0, Math.trunc(counts?.code ?? 0));
  const prose = Math.max(0, Math.trunc(counts?.prose ?? 0));
  if (norm === "is:code") {
    // Empty is:code while prose exists → nudge toward is:prose.
    if (prose <= 0) return NONE;
    return {
      suggest: true,
      complementOp: "is:prose",
      headline: "No code clips",
      label: `Show prose clips (${prose})`,
      subtext: "Your history is all prose right now \u2014 nothing reads as code.",
    };
  }
  if (norm === "is:prose") {
    // Empty is:prose while code exists → nudge toward is:code.
    if (code <= 0) return NONE;
    return {
      suggest: true,
      complementOp: "is:code",
      headline: "No prose clips",
      label: `Show code clips (${code})`,
      subtext: "Your history is all code right now \u2014 nothing reads as prose.",
    };
  }
  return NONE;
}
