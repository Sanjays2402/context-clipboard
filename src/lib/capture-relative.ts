/**
 * Warm "captured <relative>" breadcrumb for the detail view.
 *
 * The detail meta row already shows a precise capture timestamp
 * (`toLocaleString` — "6/27/2026, 3:14:08 AM"). That's exact but cold:
 * for a clip grabbed a few hours ago, a human reads "earlier today" far
 * faster than parsing a full datetime. This module turns a capture
 * timestamp into a warm, conversational relative phrase for the RECENT
 * calendar buckets — reusing the exact same local-calendar predicates the
 * `is:today` / `is:thisweek` / `is:thismonth` search operators are built
 * on, so the breadcrumb and the filters can never disagree about where
 * "this week" starts.
 *
 * Pure — no DOM, no clock beyond the caller-supplied `now` (so the
 * phrasing is deterministic + testable). The popup renders the precise
 * timestamp as before and appends this phrase as a muted breadcrumb next
 * to it, hiding the breadcrumb when the phrase is empty.
 *
 * Design decisions:
 *   - The phrase covers ONLY the six recent calendar buckets the rest of
 *     the UI speaks in: today, yesterday, this week, last week, this
 *     month, last month. For anything OLDER the raw timestamp already
 *     reads as a plain date ("in Mar 2025" would just duplicate it), so
 *     we return "" and the popup hides the breadcrumb — the warmth only
 *     pays off for clips recent enough that a relative phrase beats the
 *     date. This keeps the breadcrumb from ever being redundant noise.
 *   - Buckets are tested NARROWEST-first (today, then yesterday, then
 *     this week, ...) because the calendar predicates nest: today is a
 *     subset of this week is a subset of this month. First match wins, so
 *     a clip from this morning reads "earlier today", not "earlier this
 *     month". `is:lastweek` / `is:lastmonth` are disjoint from the
 *     `this*` buckets, and last-week is tested before last-month so a
 *     clip that falls in both (a last week that straddles the month
 *     boundary) gets the tighter, warmer "last week".
 *   - "today" is split: a clip from the last ~couple minutes reads "just
 *     now" (the warmest possible), otherwise "earlier today". The minute
 *     threshold keeps "just now" honest — a clip from 3 hours ago is not
 *     "just now".
 *   - Phrases are bare relative nouns ("earlier today", "last week") so
 *     the popup can compose them as "Captured earlier today" or render
 *     them as a standalone "· earlier today" chip without re-casing.
 *   - Defensive: a non-finite timestamp (or non-finite `now`) yields ""
 *     so the breadcrumb simply doesn't render rather than throwing in the
 *     detail-open path; a future-stamped clip (clock skew) is NOT today /
 *     this week (the predicates gate both ends) and falls through to "".
 */

import {
  isToday,
  isYesterday,
  isThisWeek,
  isLastWeek,
  isThisMonth,
  isLastMonth,
} from "./today-filter";

/** Under this many ms old, a same-day clip reads "just now". ~2 minutes. */
const JUST_NOW_MS = 120_000;

/**
 * The warm relative phrase for a capture timestamp, or "" when the clip
 * is older than last month (the raw date already reads fine) or the
 * input is unusable.
 *
 * Returns one of: "just now", "earlier today", "yesterday", "earlier
 * this week", "last week", "earlier this month", "last month", or "".
 *
 * @param ts   the clip's capture time (createdAt), Unix ms.
 * @param now  the reference instant (defaults to the live clock).
 */
export function captureRelative(
  ts: number | null | undefined,
  now: number = Date.now(),
): string {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return "";
  const ref = Number.isFinite(now) ? now : Date.now();
  // Narrowest-first: the calendar predicates nest (today ⊂ this week ⊂
  // this month), so the first match is always the tightest, warmest
  // bucket. last-week / last-month are disjoint from the this* buckets.
  if (isToday(ts, ref)) {
    // A clip from the last couple minutes is "just now"; anything else
    // today is "earlier today". The delta can be negative for a slightly
    // future-stamped clip (clock skew) that's still on today's calendar
    // day — treat that as "just now" too (it's effectively now).
    return ref - ts <= JUST_NOW_MS ? "just now" : "earlier today";
  }
  if (isYesterday(ts, ref)) return "yesterday";
  if (isThisWeek(ts, ref)) return "earlier this week";
  if (isLastWeek(ts, ref)) return "last week";
  if (isThisMonth(ts, ref)) return "earlier this month";
  if (isLastMonth(ts, ref)) return "last month";
  // Older than last month — the raw timestamp already reads as a date,
  // so a relative phrase would only duplicate it. No breadcrumb.
  return "";
}

/**
 * The composed breadcrumb sentence ("Captured earlier today"), or "" when
 * there's no warm phrase to show. A convenience for callers that want the
 * full line rather than composing the verb themselves; the bare phrase
 * (`captureRelative`) stays available for chip-style rendering.
 */
export function captureRelativeLabel(
  ts: number | null | undefined,
  now: number = Date.now(),
): string {
  const phrase = captureRelative(ts, now);
  return phrase ? `Captured ${phrase}` : "";
}
