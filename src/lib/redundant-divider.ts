/**
 * "Redundant day-divider suppression" model.
 *
 * The clip list paints a sticky day-group divider ("Today", "Yesterday",
 * "Mon Jun 22") before the first clip of each calendar-day run. That's
 * useful when the list spans several days — it anchors WHERE in time you
 * are. But when the user has filtered to EXACTLY one calendar day via the
 * `is:today` / `is:yesterday` quick-chip (or types the operator), every
 * clip in the list is from that one day, so a single "Today" divider at
 * the very top is pure noise: it says "Today" above a list that is, by
 * construction, entirely today. This module is the pure decision behind
 * dropping that one redundant divider so the list starts a row higher.
 *
 * No DOM — the popup computes the day-header infos as usual, then asks
 * this module "given the active search query and this header's label,
 * should I suppress it?" for the FIRST (and only the first) divider, and
 * skips rendering it when the answer is yes.
 *
 * Design decisions:
 *   - Suppress ONLY when the query is EXACTLY the matching lone day
 *     bucket: `is:today` paired with a "Today" divider, or `is:yesterday`
 *     paired with a "Yesterday" divider. A compound query (`is:today
 *     host:x`) still filters to one day but the user added structure, and
 *     more importantly there could be a pinned tier above — so we keep the
 *     contract tight: a single bucket operator, nothing else. The same
 *     trim/collapse/lowercase normalisation `widenSuggestion` uses, so
 *     " is:today " matches but "is:today foo" doesn't.
 *   - Only the DAY buckets suppress. `is:thisweek` / `is:thismonth` span
 *     multiple days, so their dividers ("Today", "Yesterday", "Mon Jun
 *     22", ...) are doing real work — nothing to suppress. There's no
 *     single divider that equals "this week".
 *   - We gate on the DIVIDER LABEL, not just the query, and the labels
 *     come from day-group's exported constants (TODAY_HEADER /
 *     YESTERDAY_HEADER) — the same strings dayLabel emits — so the
 *     suppressor can never drift from the renderer. If a pinned clip
 *     somehow sits at the top (its divider would be "Pinned", not
 *     "Today"), the label won't match and we DON'T suppress, which is
 *     correct: the "Today" divider then leads the unpinned run and is
 *     meaningful again.
 *   - Suppression applies to the FIRST divider only (caller's
 *     responsibility). A lone-day filter can only ever produce one
 *     day-run anyway, but scoping to index 0 keeps the contract obvious
 *     and defends against any future multi-run edge.
 */

import { TODAY_HEADER, YESTERDAY_HEADER } from "./day-group";

/** The lone day-bucket operators that each map to a single divider label. */
const SUPPRESS_MAP: ReadonlyArray<{ op: string; label: string }> = [
  { op: "is:today", label: TODAY_HEADER },
  { op: "is:yesterday", label: YESTERDAY_HEADER },
];

/**
 * Normalise a raw search-box value the same way the bucket operators are
 * matched elsewhere: trim ends, collapse internal whitespace, lowercase.
 * A multi-token query (anything with an internal space after collapse) is
 * NOT a lone bucket, so callers treat it as "no suppression".
 */
function normaliseQuery(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Decide whether the FIRST day-divider (with label `headerLabel`) is
 * redundant given the active search query `raw`, and should therefore be
 * suppressed.
 *
 * True only when `raw` is EXACTLY one of the lone day-bucket operators
 * AND `headerLabel` is that bucket's divider label (`is:today` +
 * "Today", or `is:yesterday` + "Yesterday"). Everything else — compound
 * queries, week/month buckets, a "Pinned"/dated divider, an empty query,
 * a nullish label — returns false (keep the divider).
 */
export function isRedundantDayDivider(
  raw: string | null | undefined,
  headerLabel: string | null | undefined,
): boolean {
  if (typeof headerLabel !== "string" || !headerLabel) return false;
  const norm = normaliseQuery(raw);
  if (!norm || norm.includes(" ")) return false;
  for (const entry of SUPPRESS_MAP) {
    if (norm === entry.op && headerLabel === entry.label) return true;
  }
  return false;
}
