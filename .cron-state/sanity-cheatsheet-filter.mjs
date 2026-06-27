// Sanity: cheatsheet shortcut-filter model (lib/cheatsheet-filter).
//
// The `?` cheatsheet grew a live filter input: type "lock" and only
// matching rows survive, empty groups hide, a "no matches" note shows
// when nothing fits. cheatsheetRowMatches is the pure decision behind
// each row's visibility. This harness exercises the matcher + the two
// normalisers (inline copies, bundler-free).
//
// Coverage:
//   1. empty / whitespace query matches everything (filter off).
//   2. case-insensitive substring match over the row text.
//   3. operator-style needles (is:) match operator rows.
//   4. non-match returns false; nullish row never matches a real needle.
//   5. row-text normalisation collapses layout whitespace.
//   6. the new per-operator Calendar buckets + Lifecycle rows each match
//      their own operator (the dense cram-row was split into one row per
//      bucket so each is independently findable).

function normaliseCheatFilter(query) {
  if (typeof query !== "string") return "";
  return query.trim().toLowerCase();
}
function cheatsheetRowText(raw) {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().toLowerCase();
}
function cheatsheetRowMatches(rowText, query) {
  const q = normaliseCheatFilter(query);
  if (!q) return true;
  const hay = cheatsheetRowText(rowText);
  if (!hay) return false;
  return hay.includes(q);
}

let p = 0,
  t = 0;
function ck(n, g, w) {
  t++;
  if (g === w) p++;
  else console.error("FAIL", n, "got", JSON.stringify(g), "want", JSON.stringify(w));
}

// A representative row as the popup sees it (textContent concatenates
// the <kbd> glyphs + the <span> description, with layout whitespace).
const lockRow = "P\n            Pin / unpin active";
// Calendar buckets are now ONE row per operator (the old cram-row split).
const todayRow = "is:today\n            since local midnight";
const thisWeekRow = "is:thisweek\n            this local week (Mon start)";
const lastMonthRow = "is:lastmonth\n            the previous calendar month";
// Lifecycle group rows.
const expiredRow = "is:expired\n            past due — about to be purged";
const notedRow = "is:noted\n            carries a note · is:nonoted inverts";
const imageRow = "Enter / Space\n  Open image in lightbox";

// 1. filter off
ck("empty query matches", cheatsheetRowMatches(lockRow, ""), true);
ck("whitespace query matches (filter off)", cheatsheetRowMatches(lockRow, "   "), true);
ck("null query matches (filter off)", cheatsheetRowMatches(lockRow, null), true);

// 2. case-insensitive substring
ck("'pin' matches the Pin row", cheatsheetRowMatches(lockRow, "pin"), true);
ck("'PIN' (upper) matches", cheatsheetRowMatches(lockRow, "PIN"), true);
ck("'unpin' matches", cheatsheetRowMatches(lockRow, "unpin"), true);
ck("'image' matches the lightbox row", cheatsheetRowMatches(imageRow, "image"), true);

// 3. operator-style needles
ck("'is:' matches an operator row", cheatsheetRowMatches(thisWeekRow, "is:"), true);
ck("'is:thisweek' matches the week row", cheatsheetRowMatches(thisWeekRow, "is:thisweek"), true);
ck("'week' matches the week row", cheatsheetRowMatches(thisWeekRow, "week"), true);

// 4. non-match
ck("'redact' does NOT match the Pin row", cheatsheetRowMatches(lockRow, "redact"), false);
ck("'zzz' matches nothing", cheatsheetRowMatches(imageRow, "zzz"), false);
ck("null row never matches a real needle", cheatsheetRowMatches(null, "pin"), false);
ck("undefined row never matches a real needle", cheatsheetRowMatches(undefined, "pin"), false);
ck("empty row never matches a real needle", cheatsheetRowMatches("", "pin"), false);

// 5. normalisation
ck("row text collapses whitespace", cheatsheetRowText(lockRow), "p pin / unpin active");
ck("normalise trims + lowercases", normaliseCheatFilter("  Lock  "), "lock");
ck("normalise of non-string -> empty", normaliseCheatFilter(42), "");

// 6. each split calendar/lifecycle row is independently findable
ck("'is:today' finds the today row", cheatsheetRowMatches(todayRow, "is:today"), true);
ck("'midnight' finds the today row by description", cheatsheetRowMatches(todayRow, "midnight"), true);
ck("'is:lastmonth' finds the last-month row", cheatsheetRowMatches(lastMonthRow, "is:lastmonth"), true);
// "is:today" must NOT bleed into "is:thisweek" (substring isolation —
// the old single cram-row matched ALL six on any one needle).
ck("'is:lastmonth' does NOT match the today row", cheatsheetRowMatches(todayRow, "is:lastmonth"), false);
ck("'is:thisweek' does NOT match the last-month row", cheatsheetRowMatches(lastMonthRow, "is:thisweek"), false);
// Lifecycle rows.
ck("'is:expired' finds the expired row", cheatsheetRowMatches(expiredRow, "is:expired"), true);
ck("'purged' finds the expired row by description", cheatsheetRowMatches(expiredRow, "purged"), true);
ck("'is:nonoted' finds the noted row (inverse named in desc)", cheatsheetRowMatches(notedRow, "is:nonoted"), true);
ck("'expired' does NOT match the noted row", cheatsheetRowMatches(notedRow, "expired"), false);

console.log(`cheatsheet-filter sanity: ${p}/${t} passed`);
if (p !== t) process.exit(1);

