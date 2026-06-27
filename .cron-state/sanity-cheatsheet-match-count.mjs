// Sanity: cheatsheet match-count label (lib/cheatsheet-filter).
//
// The cheatsheet filter input shows a live "N of M" badge so the user
// sees how aggressively their query narrowed the ~31-row sheet.
// cheatsheetMatchLabel is the pure grammar: given matched / total / the
// query, produce "6 of 31", "No matches", or "" (filter off -> badge
// hidden). Bad inputs clamp rather than render nonsense.
//
// Coverage:
//   1. filter off (empty/whitespace/nullish query) -> "".
//   2. some rows match -> "N of M".
//   3. zero matches with an active filter -> "No matches".
//   4. clamping: matched > total, negative, NaN, non-finite total.
//   5. all rows match -> "M of M".

function normaliseCheatFilter(query) {
  if (typeof query !== "string") return "";
  return query.trim().toLowerCase();
}
function cheatsheetMatchLabel(matched, total, query) {
  const q = normaliseCheatFilter(query);
  if (!q) return "";
  const tot = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  const rawM = Number.isFinite(matched) ? Math.floor(matched) : 0;
  const m = Math.min(Math.max(rawM, 0), tot);
  if (m === 0) return "No matches";
  return `${m} of ${tot}`;
}

let p = 0,
  t = 0;
function ck(n, g, w) {
  t++;
  if (g === w) p++;
  else console.error("FAIL", n, "got", JSON.stringify(g), "want", JSON.stringify(w));
}

// 1. filter off -> "" (badge hidden) regardless of counts
ck("empty query -> ''", cheatsheetMatchLabel(6, 31, ""), "");
ck("whitespace query -> ''", cheatsheetMatchLabel(6, 31, "   "), "");
ck("null query -> ''", cheatsheetMatchLabel(6, 31, null), "");
ck("undefined query -> ''", cheatsheetMatchLabel(6, 31, undefined), "");
ck("non-string query -> ''", cheatsheetMatchLabel(6, 31, 42), "");

// 2. some rows match
ck("6 of 31", cheatsheetMatchLabel(6, 31, "lock"), "6 of 31");
ck("1 of 31", cheatsheetMatchLabel(1, 31, "omnibox"), "1 of 31");
ck("query trimmed/lowered still counts", cheatsheetMatchLabel(3, 10, "  IS:  "), "3 of 10");

// 3. zero matches with an active filter -> "No matches"
ck("0 matches -> No matches", cheatsheetMatchLabel(0, 31, "zzzz"), "No matches");
ck("0 of 0 (no rows) -> No matches", cheatsheetMatchLabel(0, 0, "x"), "No matches");

// 4. clamping — never render nonsense
ck("matched > total clamps to total", cheatsheetMatchLabel(40, 31, "x"), "31 of 31");
ck("negative matched clamps to 0 -> No matches", cheatsheetMatchLabel(-3, 31, "x"), "No matches");
ck("NaN matched -> 0 -> No matches", cheatsheetMatchLabel(NaN, 31, "x"), "No matches");
ck("non-finite total -> 0 -> No matches", cheatsheetMatchLabel(5, Infinity, "x"), "No matches");
ck("negative total -> 0 -> No matches", cheatsheetMatchLabel(5, -10, "x"), "No matches");
ck("fractional counts floored", cheatsheetMatchLabel(6.9, 31.4, "x"), "6 of 31");

// 5. all rows match
ck("all match -> M of M", cheatsheetMatchLabel(31, 31, "e"), "31 of 31");

console.log(`cheatsheet-match-count sanity: ${p}/${t} passed`);
if (p !== t) process.exit(1);
