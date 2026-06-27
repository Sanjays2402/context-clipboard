/**
 * "Widen a calendar bucket" empty-state model.
 *
 * When a user filters to a calendar bucket (`is:today` or `is:yesterday`)
 * and it comes up EMPTY, the generic "try these operators" hint is poor
 * help — they don't want a different operator, they want the same view
 * with a wider net. Every calendar app answers an empty day with a
 * "show the week" affordance. This module is the pure decision behind a
 * one-tap "Widen to this week" chip: from the raw search box value, it
 * decides whether the query is a single narrow calendar bucket worth
 * widening and, if so, produces the rewritten query (the day operator
 * swapped for `is:thisweek`).
 *
 * No DOM — the popup renders the chip + binds the click; keeping the
 * decision here means the "is this a widen-able bucket?" gate + the
 * rewrite are exercised headless and stay consistent.
 *
 * Design decisions:
 *   - `is:today` / `is:yesterday` widen to `is:thisweek`; `is:thisweek`
 *     widens to `is:thismonth`. Each rung steps exactly one grain wider,
 *     so an empty narrow bucket always has a sensible "show the next size
 *     up" escape. We do NOT widen `is:thismonth` (there's no "this year"
 *     bucket yet) or the "last*" buckets (widening `is:lastweek` would
 *     land on `is:thisweek`, which excludes last week entirely — the
 *     wrong direction). Adding a "this year" rung later is a one-line
 *     extension of WIDEN_MAP.
 *   - The query must be JUST the bucket operator (after trimming /
 *     collapsing whitespace) — `is:today host:github.com` is a compound
 *     filter where a blunt "widen" would silently drop the host
 *     constraint, so we don't offer it. A single operator keeps the
 *     rewrite honest: swap one token, change nothing else.
 *   - The match is case-insensitive on the operator (the parser
 *     lowercases `is:` values) but otherwise exact, so a stray word
 *     ("is:today foo") doesn't trigger.
 *   - Returns a structured result (`canWiden` + the target query + a
 *     human label + the source bucket's noun) so the popup needs no
 *     string logic of its own — including the "No clips from <bucket>"
 *     headline, which reads `fromLabel`.
 */

/**
 * The buckets we offer to widen, each mapped to its next-grain-wider
 * target op. `fromLabel` is the human noun for the empty bucket (used in
 * the "No clips from <fromLabel>" headline); `label` is the button copy.
 */
const WIDEN_MAP: ReadonlyArray<{ from: string; to: string; label: string; fromLabel: string }> = [
  { from: "is:today", to: "is:thisweek", label: "Widen to this week", fromLabel: "today" },
  { from: "is:yesterday", to: "is:thisweek", label: "Widen to this week", fromLabel: "yesterday" },
  { from: "is:thisweek", to: "is:thismonth", label: "Widen to this month", fromLabel: "this week" },
];

export interface WidenSuggestion {
  /** True when the query is a lone bucket that can widen one grain up. */
  canWiden: boolean;
  /** The rewritten search-box value (the wider operator). Empty when !canWiden. */
  query: string;
  /** Button label, e.g. "Widen to this week". Empty when !canWiden. */
  label: string;
  /**
   * Human noun for the SOURCE bucket that came up empty, e.g. "today" /
   * "yesterday" / "this week" — for the "No clips from <fromLabel>"
   * headline. Empty when !canWiden so the popup never renders a partial
   * sentence.
   */
  fromLabel: string;
}

const NONE: WidenSuggestion = { canWiden: false, query: "", label: "", fromLabel: "" };

/**
 * Decide whether `raw` (the search box value) is a lone narrow calendar
 * bucket worth widening, and if so produce the wider query + chip label
 * + the source bucket's human noun.
 *
 * Returns `{ canWiden: false }` for anything that isn't EXACTLY one of
 * the widen-able bucket operators (compound queries, plain text, the
 * widest buckets, "last*" buckets, empty input) — the popup then falls
 * back to its generic operator hint.
 */
export function widenSuggestion(raw: string | null | undefined): WidenSuggestion {
  if (typeof raw !== "string") return NONE;
  // Collapse internal whitespace + trim so " is:today " and "is:today"
  // both match, but "is:today host:x" (two tokens) does not.
  const norm = raw.trim().replace(/\s+/g, " ").toLowerCase();
  if (!norm || norm.includes(" ")) return NONE;
  for (const entry of WIDEN_MAP) {
    if (norm === entry.from) {
      return { canWiden: true, query: entry.to, label: entry.label, fromLabel: entry.fromLabel };
    }
  }
  return NONE;
}
