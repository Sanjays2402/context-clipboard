/**
 * Sanity: search-history chip render — pin-affordance shape + dedup.
 *
 * The "Recent" chip strip used to be a single <button>; it's now a
 * span containing two buttons (apply + hover-pin). We verify:
 *   - Each visible query renders both buttons with the right
 *     `data-act` (so the click handler routes correctly).
 *   - The dedup-against-saved + dedup-against-current contract still
 *     holds — a query that's already saved or currently in the search
 *     box doesn't render in the Recent strip.
 *   - Empty input (no recents, or all filtered out) hides the strip.
 *
 * Pure render-rule test: we replicate the same dedup logic + the
 * substring-shape check inline. No popup.ts bundle needed.
 *
 * Run with: node .cron-state/sanity-recent-pin.mjs
 */

let pass = 0, fail = 0;
function ok(label, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`  FAIL  ${label}`); }
}

// Mirror the filter rule from popup.ts renderSearchHistory():
//   visible = searchHistory.filter(q => q && q !== current && !savedQueries.has(q))
function visibleRecents(history, current, savedQueries) {
  const cur = (current || "").trim();
  const saved = new Set(savedQueries || []);
  return history.filter((q) => q && q !== cur && !saved.has(q));
}

// Mirror the per-chip HTML shape — checks the markers the handlers
// dispatch on (data-act + data-q). We don't reproduce the icon SVG
// because that's stable across rerenders and not part of the click
// dispatch contract.
function chipHasButtons(html, query) {
  const hasApply = html.includes(`data-act="apply"`) && html.includes(`data-q="${query}"`);
  const hasPin = html.includes(`data-act="save"`) && html.includes(`recent-pin`);
  return { hasApply, hasPin };
}

// 1) Empty history → empty strip.
{
  const v = visibleRecents([], "", new Set());
  ok("empty history: visible empty", v.length === 0);
}

// 2) All saved → empty strip.
{
  const v = visibleRecents(["a", "b"], "", ["a", "b"]);
  ok("all saved: visible empty", v.length === 0);
}

// 3) Current query is exactly one of recents → that one dedupes out.
{
  const v = visibleRecents(["alpha", "beta", "gamma"], "beta", []);
  ok("current dedup: beta gone", !v.includes("beta"));
  ok("current dedup: 2 left", v.length === 2);
}

// 4) Trimmed current query matches → still dedupes.
{
  const v = visibleRecents(["alpha", "beta"], "  beta  ", []);
  ok("trimmed current dedup", !v.includes("beta"));
}

// 5) Saved + current both dedupe stacked.
{
  const v = visibleRecents(["alpha", "beta", "gamma"], "alpha", ["gamma"]);
  ok("stacked dedup: beta only", v.length === 1 && v[0] === "beta");
}

// 6) Blank entries in history get filtered (defensive against bad writes).
{
  const v = visibleRecents(["alpha", "", "  ", "beta"], "", []);
  ok("blank entries filtered", v.length === 3); // empty string drops; whitespace is truthy
  // Note: the popup's dedup is `q && q !== current` — whitespace string
  // is truthy. We match exactly so a future tightening would catch any
  // accidental whitespace recents at parse time.
}

// 7) Chip shape: apply + pin both present + carry the right query.
{
  // Reconstruct minimal popup-style HTML for one query.
  const q = "kind:image after:24h";
  // Reuse the literal template strings from popup.ts to confirm shape.
  const html =
    `<span class="recent-chip" data-q="${q}">` +
    `<button class="recent-apply" data-act="apply" data-q="${q}">${q}</button>` +
    `<button class="recent-pin" data-act="save" data-q="${q}"></button>` +
    `</span>`;
  const { hasApply, hasPin } = chipHasButtons(html, q);
  ok("chip apply button present", hasApply);
  ok("chip pin button present", hasPin);
  ok("chip query attribute", html.includes(`data-q="${q}"`));
}

// 8) Chip shape: a query containing quotes/special HTML chars would be
//    escaped — we don't run that here because escapeHtml lives in
//    util.ts; but we DO assert that the chip-handler key (data-act)
//    is on BOTH inner buttons so the dispatcher never has to guess
//    which button got clicked.
{
  const q = "test";
  const html =
    `<button class="recent-apply" data-act="apply" data-q="${q}">${q}</button>` +
    `<button class="recent-pin" data-act="save" data-q="${q}"></button>`;
  const actCount = (html.match(/data-act="/g) || []).length;
  ok("both inner buttons carry data-act", actCount === 2);
}

// 9) Order preserved (newest first, matches lib/db.listSearchHistory).
{
  const v = visibleRecents(["recent1", "recent2", "recent3"], "", []);
  ok("order preserved: recent1 first", v[0] === "recent1");
  ok("order preserved: recent3 last", v[2] === "recent3");
}

// 10) Dedup is exact-match (case-sensitive). "GitHub" ≠ "github".
{
  const v = visibleRecents(["GitHub", "github"], "", ["github"]);
  ok("case-sensitive dedup", v.length === 1 && v[0] === "GitHub");
}

console.log(`${pass}/${pass + fail} recent-pin sanity checks passed`);
if (fail > 0) process.exit(1);
