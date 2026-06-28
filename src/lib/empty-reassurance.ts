/**
 * "Empty is good news" reassurance model for the clip-list empty state.
 *
 * Most empty results want help: "no clips match, try these operators."
 * But a handful of filters are ones where finding NOTHING is exactly what
 * the user hoped for. `is:expired` is the canonical case — it surfaces the
 * clips whose own TTL has already lapsed (the ones the GC will sweep at
 * the next capture). Running it is a "what's about to be lost?" rescue
 * pass; an empty result means nothing is past due. Showing the generic
 * "no clips match — try kind:image / host:… / before:7d" operator wall
 * there is actively wrong: it frames a clean bill of health as a failed
 * search and buries the reassurance under a list of unrelated operators.
 *
 * This module is the pure decision behind a calmer empty state: from the
 * raw search box value, it decides whether the query is a lone operator
 * whose emptiness is REASSURING and, if so, returns a warm headline +
 * subtext ("Nothing past due" / "No clips have lapsed their TTL — nothing's
 * about to be swept.") so the popup can render that instead of the wall.
 *
 * No DOM — the popup renders the copy; keeping the decision here means the
 * "is this a reassurance-worthy empty?" gate + the copy are exercised
 * headless and stay in one place. It parallels lib/widen-bucket (which
 * answers an empty calendar bucket with a "widen" escape); this answers an
 * empty all-clear filter with a "you're good" message.
 *
 * Design decisions:
 *   - The query must be JUST the reassurance operator (after trimming /
 *     collapsing whitespace). A compound `is:expired host:github.com` is a
 *     scoped question — "is anything from github past due?" — where an
 *     empty result is still reassuring BUT the blunt headline would
 *     over-claim ("Nothing past due" when it means "nothing from github").
 *     So we gate to the lone operator and let compounds fall back to the
 *     generic hint, the same conservative line widen-bucket draws.
 *   - Case-insensitive on the operator (the parser lowercases `is:`
 *     values) but otherwise exact, so a stray word ("is:expired foo")
 *     doesn't trigger.
 *   - Returns a structured result (`reassure` + headline + subtext) so the
 *     popup needs no string logic of its own.
 *   - Extensible: the REASSURANCE_MAP is the single place to add another
 *     all-clear operator later (e.g. an "is:overquota" that's good when
 *     empty) — one row, no popup change.
 */

/**
 * The lone operators whose empty result is GOOD NEWS, each mapped to its
 * reassurance copy. `headline` is the warm one-liner; `subtext` explains
 * what the absence means so the all-clear is legible.
 */
const REASSURANCE_MAP: ReadonlyArray<{
  op: string;
  headline: string;
  subtext: string;
}> = [
  {
    op: "is:expired",
    headline: "Nothing past due",
    subtext: "No clips have lapsed their TTL — nothing's about to be swept.",
  },
];

export interface EmptyReassurance {
  /** True when the query is a lone all-clear operator that came up empty. */
  reassure: boolean;
  /** Warm headline, e.g. "Nothing past due". Empty when !reassure. */
  headline: string;
  /**
   * One-line explanation of what the absence means, e.g. "No clips have
   * lapsed their TTL — nothing's about to be swept." Empty when !reassure
   * so the popup never renders a partial message.
   */
  subtext: string;
}

const NONE: EmptyReassurance = { reassure: false, headline: "", subtext: "" };

/**
 * Decide whether `raw` (the search box value) is a lone all-clear
 * operator whose empty result should read as reassurance rather than a
 * failed search, and if so produce the headline + subtext.
 *
 * Returns `{ reassure: false }` for anything that isn't EXACTLY one of the
 * reassurance operators (compound queries, plain text, other operators,
 * empty input) — the popup then falls back to its generic operator hint.
 */
export function emptyReassurance(raw: string | null | undefined): EmptyReassurance {
  if (typeof raw !== "string") return NONE;
  // Collapse internal whitespace + trim so " is:expired " and "is:expired"
  // both match, but "is:expired host:x" (two tokens) does not.
  const norm = raw.trim().replace(/\s+/g, " ").toLowerCase();
  if (!norm || norm.includes(" ")) return NONE;
  for (const entry of REASSURANCE_MAP) {
    if (norm === entry.op) {
      return { reassure: true, headline: entry.headline, subtext: entry.subtext };
    }
  }
  return NONE;
}
