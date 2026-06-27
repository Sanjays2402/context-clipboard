// Sanity: redundant day-divider suppression (lib/redundant-divider).
//
// When the user filters to EXACTLY a lone day bucket (is:today /
// is:yesterday), every clip in the list is from that one day, so the
// single "Today" / "Yesterday" divider leading the list is noise.
// isRedundantDayDivider is the pure decision: given the raw search query
// + the first divider's label, return whether to suppress that divider.
//
// Coverage:
//   1. is:today + "Today" -> suppress; is:yesterday + "Yesterday" -> suppress.
//   2. mismatched pairs (is:today + "Yesterday", etc) -> keep.
//   3. whitespace tolerance + case-insensitivity on the query.
//   4. compound queries, week/month buckets, plain text -> keep.
//   5. non-day dividers ("Pinned", "Mon Jun 22", "Earlier") -> keep.
//   6. defensive: empty/nullish query or label -> keep.

// Inline copies (bundler-free harness). Labels mirror day-group's
// exported TODAY_HEADER / YESTERDAY_HEADER constants.
const TODAY_HEADER = "Today";
const YESTERDAY_HEADER = "Yesterday";
const SUPPRESS_MAP = [
  { op: "is:today", label: TODAY_HEADER },
  { op: "is:yesterday", label: YESTERDAY_HEADER },
];
function normaliseQuery(raw) {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}
function isRedundantDayDivider(raw, headerLabel) {
  if (typeof headerLabel !== "string" || !headerLabel) return false;
  const norm = normaliseQuery(raw);
  if (!norm || norm.includes(" ")) return false;
  for (const entry of SUPPRESS_MAP) {
    if (norm === entry.op && headerLabel === entry.label) return true;
  }
  return false;
}

let p = 0,
  t = 0;
function ck(n, g, w) {
  t++;
  if (g === w) p++;
  else console.error("FAIL", n, "got", JSON.stringify(g), "want", JSON.stringify(w));
}

// 1. matching lone-day pairs suppress
ck("is:today + Today suppresses", isRedundantDayDivider("is:today", "Today"), true);
ck("is:yesterday + Yesterday suppresses", isRedundantDayDivider("is:yesterday", "Yesterday"), true);

// 2. mismatched pairs keep (label must match the op's bucket)
ck("is:today + Yesterday keeps", isRedundantDayDivider("is:today", "Yesterday"), false);
ck("is:yesterday + Today keeps", isRedundantDayDivider("is:yesterday", "Today"), false);

// 3. whitespace + case tolerance on the query
ck("padded is:today suppresses", isRedundantDayDivider("  is:today  ", "Today"), true);
ck("IS:TODAY (upper) suppresses", isRedundantDayDivider("IS:TODAY", "Today"), true);
ck("Is:Yesterday (mixed) suppresses", isRedundantDayDivider("Is:Yesterday", "Yesterday"), true);

// 4. compound / wider-bucket / text queries keep
ck("compound is:today host:x keeps", isRedundantDayDivider("is:today host:github.com", "Today"), false);
ck("is:thisweek keeps (spans days)", isRedundantDayDivider("is:thisweek", "Today"), false);
ck("is:thismonth keeps", isRedundantDayDivider("is:thismonth", "Today"), false);
ck("is:lastweek keeps", isRedundantDayDivider("is:lastweek", "Today"), false);
ck("plain text keeps", isRedundantDayDivider("hello", "Today"), false);
ck("near-miss is:todayx keeps", isRedundantDayDivider("is:todayx", "Today"), false);

// 5. non-day dividers keep even with a matching lone-day query
//    (e.g. a pinned tier on top -> "Pinned" divider, not "Today").
ck("is:today + Pinned keeps", isRedundantDayDivider("is:today", "Pinned"), false);
ck("is:today + dated label keeps", isRedundantDayDivider("is:today", "Mon Jun 22"), false);
ck("is:today + Earlier keeps", isRedundantDayDivider("is:today", "Earlier"), false);

// 6. defensive — empty / nullish query or label keeps
ck("empty query keeps", isRedundantDayDivider("", "Today"), false);
ck("whitespace query keeps", isRedundantDayDivider("   ", "Today"), false);
ck("null query keeps", isRedundantDayDivider(null, "Today"), false);
ck("undefined query keeps", isRedundantDayDivider(undefined, "Today"), false);
ck("null label keeps", isRedundantDayDivider("is:today", null), false);
ck("empty label keeps", isRedundantDayDivider("is:today", ""), false);
ck("non-string label keeps", isRedundantDayDivider("is:today", 5), false);

console.log(`redundant-divider sanity: ${p}/${t} passed`);
if (p !== t) process.exit(1);
