// Sanity: "Widen a calendar bucket" empty-state model (lib/widen-bucket).
//
// When a lone calendar bucket (is:today / is:yesterday / is:thisweek)
// filters to an empty list, the popup offers a one-tap "Widen to …" chip
// that steps one grain wider (day -> week, week -> month) instead of the
// generic operator wall. widenSuggestion is the pure decision: from the
// raw search box value, return whether the query is a widen-able bucket +
// the rewritten (wider) query + a chip label + the source bucket's noun.
//
// Coverage:
//   1. is:today / is:yesterday -> widen to is:thisweek.
//   2. is:thisweek -> widen to is:thismonth (the new rung).
//   3. whitespace tolerance (leading/trailing/internal collapse).
//   4. case-insensitive operator match.
//   5. fromLabel (source bucket noun) for the headline.
//   6. NON-widen: compound queries, the widest bucket (is:thismonth),
//      "last*" buckets, plain text, empty, nullish, non-string.
//   7. result shape (canWiden flips query/label/fromLabel on/off).

// Inline copy of the helper (bundler-free harness).
const WIDEN_MAP = [
  { from: "is:today", to: "is:thisweek", label: "Widen to this week", fromLabel: "today" },
  { from: "is:yesterday", to: "is:thisweek", label: "Widen to this week", fromLabel: "yesterday" },
  { from: "is:thisweek", to: "is:thismonth", label: "Widen to this month", fromLabel: "this week" },
];
const NONE = { canWiden: false, query: "", label: "", fromLabel: "" };
function widenSuggestion(raw) {
  if (typeof raw !== "string") return NONE;
  const norm = raw.trim().replace(/\s+/g, " ").toLowerCase();
  if (!norm || norm.includes(" ")) return NONE;
  for (const entry of WIDEN_MAP) {
    if (norm === entry.from) {
      return { canWiden: true, query: entry.to, label: entry.label, fromLabel: entry.fromLabel };
    }
  }
  return NONE;
}

let p = 0,
  t = 0;
function ck(n, g, w) {
  t++;
  if (g === w) p++;
  else console.error("FAIL", n, "got", JSON.stringify(g), "want", JSON.stringify(w));
}

// 1. core day-bucket widen targets
const today = widenSuggestion("is:today");
ck("is:today widens", today.canWiden, true);
ck("is:today -> is:thisweek", today.query, "is:thisweek");
ck("is:today label", today.label, "Widen to this week");
const yest = widenSuggestion("is:yesterday");
ck("is:yesterday widens", yest.canWiden, true);
ck("is:yesterday -> is:thisweek", yest.query, "is:thisweek");

// 2. the new week -> month rung
const week = widenSuggestion("is:thisweek");
ck("is:thisweek widens (new rung)", week.canWiden, true);
ck("is:thisweek -> is:thismonth", week.query, "is:thismonth");
ck("is:thisweek label", week.label, "Widen to this month");

// 3. whitespace tolerance
ck("leading/trailing space tolerated", widenSuggestion("  is:today  ").canWiden, true);
ck("widen query is clean (no padding)", widenSuggestion("  is:today  ").query, "is:thisweek");
ck("week-rung whitespace tolerated", widenSuggestion("  is:thisweek ").query, "is:thismonth");

// 4. case-insensitive
ck("IS:TODAY (upper) widens", widenSuggestion("IS:TODAY").canWiden, true);
ck("Is:Yesterday (mixed) widens", widenSuggestion("Is:Yesterday").canWiden, true);
ck("IS:THISWEEK (upper) widens", widenSuggestion("IS:THISWEEK").query, "is:thismonth");

// 5. fromLabel for the headline
ck("is:today fromLabel = today", today.fromLabel, "today");
ck("is:yesterday fromLabel = yesterday", yest.fromLabel, "yesterday");
ck("is:thisweek fromLabel = this week", week.fromLabel, "this week");

// 6. NON-widen cases
ck("compound is:today host:x does NOT widen", widenSuggestion("is:today host:github.com").canWiden, false);
ck("compound is:thisweek kind:image does NOT widen", widenSuggestion("is:thisweek kind:image").canWiden, false);
ck("is:thismonth does NOT widen (no this-year yet)", widenSuggestion("is:thismonth").canWiden, false);
ck("is:lastweek does NOT widen", widenSuggestion("is:lastweek").canWiden, false);
ck("is:lastmonth does NOT widen", widenSuggestion("is:lastmonth").canWiden, false);
ck("plain text does NOT widen", widenSuggestion("hello world").canWiden, false);
ck("single word does NOT widen", widenSuggestion("today").canWiden, false);
ck("near-miss is:todayx does NOT widen", widenSuggestion("is:todayx").canWiden, false);
ck("near-miss is:thisweekx does NOT widen", widenSuggestion("is:thisweekx").canWiden, false);
ck("empty string does NOT widen", widenSuggestion("").canWiden, false);
ck("whitespace-only does NOT widen", widenSuggestion("   ").canWiden, false);
ck("null does NOT widen", widenSuggestion(null).canWiden, false);
ck("undefined does NOT widen", widenSuggestion(undefined).canWiden, false);
ck("number does NOT widen", widenSuggestion(42).canWiden, false);

// 7. non-widen result shape — query + label + fromLabel all empty
const none = widenSuggestion("plain text");
ck("non-widen query is empty", none.query, "");
ck("non-widen label is empty", none.label, "");
ck("non-widen fromLabel is empty", none.fromLabel, "");

console.log(`widen-bucket sanity: ${p}/${t} passed`);
if (p !== t) process.exit(1);
