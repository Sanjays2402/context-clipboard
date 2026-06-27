// Sanity: "Widen a calendar bucket" empty-state model (lib/widen-bucket).
//
// When a lone day bucket (is:today / is:yesterday) filters to an empty
// list, the popup offers a one-tap "Widen to this week" chip instead of
// the generic operator wall. widenSuggestion is the pure decision: from
// the raw search box value, return whether the query is a widen-able day
// bucket + the rewritten (wider) query + a chip label.
//
// Coverage:
//   1. is:today / is:yesterday -> widen to is:thisweek.
//   2. whitespace tolerance (leading/trailing/internal collapse).
//   3. case-insensitive operator match.
//   4. NON-widen: compound queries, week buckets, plain text, empty,
//      nullish, non-string.
//   5. result shape (canWiden flips query/label on/off).

// Inline copy of the helper (bundler-free harness).
const WIDEN_MAP = [
  { from: "is:today", to: "is:thisweek", label: "Widen to this week" },
  { from: "is:yesterday", to: "is:thisweek", label: "Widen to this week" },
];
const NONE = { canWiden: false, query: "", label: "" };
function widenSuggestion(raw) {
  if (typeof raw !== "string") return NONE;
  const norm = raw.trim().replace(/\s+/g, " ").toLowerCase();
  if (!norm || norm.includes(" ")) return NONE;
  for (const entry of WIDEN_MAP) {
    if (norm === entry.from) {
      return { canWiden: true, query: entry.to, label: entry.label };
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

// 1. core widen targets
const today = widenSuggestion("is:today");
ck("is:today widens", today.canWiden, true);
ck("is:today -> is:thisweek", today.query, "is:thisweek");
ck("is:today label", today.label, "Widen to this week");
const yest = widenSuggestion("is:yesterday");
ck("is:yesterday widens", yest.canWiden, true);
ck("is:yesterday -> is:thisweek", yest.query, "is:thisweek");

// 2. whitespace tolerance
ck("leading/trailing space tolerated", widenSuggestion("  is:today  ").canWiden, true);
ck("widen query is clean (no padding)", widenSuggestion("  is:today  ").query, "is:thisweek");

// 3. case-insensitive
ck("IS:TODAY (upper) widens", widenSuggestion("IS:TODAY").canWiden, true);
ck("Is:Yesterday (mixed) widens", widenSuggestion("Is:Yesterday").canWiden, true);

// 4. NON-widen cases
ck("compound is:today host:x does NOT widen", widenSuggestion("is:today host:github.com").canWiden, false);
ck("is:thisweek does NOT widen (no this-month yet)", widenSuggestion("is:thisweek").canWiden, false);
ck("is:lastweek does NOT widen", widenSuggestion("is:lastweek").canWiden, false);
ck("plain text does NOT widen", widenSuggestion("hello world").canWiden, false);
ck("single word does NOT widen", widenSuggestion("today").canWiden, false);
ck("near-miss is:todayx does NOT widen", widenSuggestion("is:todayx").canWiden, false);
ck("empty string does NOT widen", widenSuggestion("").canWiden, false);
ck("whitespace-only does NOT widen", widenSuggestion("   ").canWiden, false);
ck("null does NOT widen", widenSuggestion(null).canWiden, false);
ck("undefined does NOT widen", widenSuggestion(undefined).canWiden, false);
ck("number does NOT widen", widenSuggestion(42).canWiden, false);

// 5. non-widen result shape — query + label both empty
const none = widenSuggestion("plain text");
ck("non-widen query is empty", none.query, "");
ck("non-widen label is empty", none.label, "");

console.log(`widen-bucket sanity: ${p}/${t} passed`);
if (p !== t) process.exit(1);
