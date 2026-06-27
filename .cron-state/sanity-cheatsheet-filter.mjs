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
const weekRow = "is:today · is:yesterday · is:thisweek · is:lastweek\n   local calendar day / week buckets";
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
ck("'is:' matches an operator row", cheatsheetRowMatches(weekRow, "is:"), true);
ck("'is:thisweek' matches the week row", cheatsheetRowMatches(weekRow, "is:thisweek"), true);
ck("'week' matches the week row", cheatsheetRowMatches(weekRow, "week"), true);

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

console.log(`cheatsheet-filter sanity: ${p}/${t} passed`);
if (p !== t) process.exit(1);
