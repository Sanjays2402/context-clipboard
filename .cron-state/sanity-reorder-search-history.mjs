// Sanity: reorderSearchHistory.
//
// Inline copy of the lib/db.ts helper so this runs without a
// bundler. Mirrors the saved-search-reorder semantics: unknown
// queries silently pruned, dupes collapsed, missing entries tail-
// append in original order, no-op when order unchanged, returns
// null only when persisted history is empty.

// Tiny stub of the persistence layer — captures writes for
// assertion. Returns null/empty by default; tests reset between
// scenarios via setStored().
let _stored = [];
let _writeCount = 0;
function _listSearchHistory() { return Promise.resolve(_stored.slice()); }
function _writeSearchHistory(list) { _stored = list.slice(); _writeCount++; return Promise.resolve(); }
function setStored(list) { _stored = list.slice(); _writeCount = 0; }

// Inline copy of reorderSearchHistory(orderedQueries).
async function reorderSearchHistory(orderedQueries) {
  const list = await _listSearchHistory();
  if (list.length === 0) return null;
  const known = new Set(list);
  const seen = new Set();
  const head = [];
  for (const raw of orderedQueries) {
    if (typeof raw !== "string") continue;
    if (!known.has(raw)) continue;
    if (seen.has(raw)) continue;
    head.push(raw);
    seen.add(raw);
  }
  const tail = list.filter((q) => !seen.has(q));
  const next = [...head, ...tail];
  let same = next.length === list.length;
  if (same) {
    for (let i = 0; i < next.length; i++) {
      if (next[i] !== list[i]) { same = false; break; }
    }
  }
  if (same) return list;
  await _writeSearchHistory(next);
  return next;
}

let pass = 0;
let total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}

async function run() {
  // --- 1. Empty stored history → null ----------------------------------
  setStored([]);
  check("empty store → null",
    await reorderSearchHistory(["a", "b"]),
    null);
  check("empty store: no IDB write", _writeCount, 0);

  // --- 2. Basic swap ---------------------------------------------------
  setStored(["a", "b", "c"]);
  check("basic swap a/b/c → c/a/b",
    await reorderSearchHistory(["c", "a", "b"]),
    ["c", "a", "b"]);
  check("basic swap: 1 write", _writeCount, 1);

  // --- 3. No-op when order matches -------------------------------------
  setStored(["a", "b", "c"]);
  check("no-op when order matches",
    await reorderSearchHistory(["a", "b", "c"]),
    ["a", "b", "c"]);
  check("no-op: 0 writes", _writeCount, 0);

  // --- 4. Partial reorder — missing tail-appends in original order ----
  setStored(["a", "b", "c", "d"]);
  // User only dragged c and a; b + d should preserve their relative
  // order at the tail.
  check("partial reorder: head c/a, tail b/d preserved",
    await reorderSearchHistory(["c", "a"]),
    ["c", "a", "b", "d"]);

  // --- 5. Unknown queries pruned ---------------------------------------
  setStored(["a", "b", "c"]);
  check("unknown queries pruned silently",
    await reorderSearchHistory(["ghost", "c", "phantom", "a"]),
    ["c", "a", "b"]);

  // --- 6. Dupes collapsed ----------------------------------------------
  setStored(["a", "b", "c"]);
  check("dupes collapse to first occurrence",
    await reorderSearchHistory(["b", "b", "a", "c", "b"]),
    ["b", "a", "c"]);

  // --- 7. Defensive against non-string input ---------------------------
  setStored(["a", "b"]);
  check("non-string entries skipped",
    await reorderSearchHistory(["b", null, undefined, 42, { q: "a" }, "a"]),
    ["b", "a"]);

  // --- 8. All-unknown input → tail-only --------------------------------
  setStored(["a", "b", "c"]);
  // No reorder happened — everything tail-appends in original order.
  // Same as input, so no-op (no write).
  check("all-unknown → original order preserved (no-op)",
    await reorderSearchHistory(["x", "y", "z"]),
    ["a", "b", "c"]);
  check("all-unknown: 0 writes", _writeCount, 0);

  // --- 9. Empty input → original order (no-op) -------------------------
  setStored(["a", "b", "c"]);
  check("empty input → no-op",
    await reorderSearchHistory([]),
    ["a", "b", "c"]);
  check("empty input: 0 writes", _writeCount, 0);

  // --- 10. Single-entry store: any drag is a no-op ---------------------
  setStored(["alone"]);
  check("single entry: no-op",
    await reorderSearchHistory(["alone"]),
    ["alone"]);
  check("single entry: 0 writes", _writeCount, 0);

  // --- 11. Case-sensitive query identity -------------------------------
  setStored(["GitHub", "github"]);
  check("case-sensitive: GitHub != github",
    await reorderSearchHistory(["github", "GitHub"]),
    ["github", "GitHub"]);
  // Original was [GitHub, github] — should write.
  check("case-sensitive swap: 1 write", _writeCount, 1);

  // --- 12. Trim NOT applied (strict equality) --------------------------
  setStored(["abc"]);
  check("trim NOT applied — '  abc  ' is unknown",
    await reorderSearchHistory(["  abc  "]),
    ["abc"]);
  check("trim not applied: 0 writes (no-op)", _writeCount, 0);

  // --- 13. Operator queries preserved end-to-end -----------------------
  setStored(["host:github.com", "is:pinned", "kind:image"]);
  check("operator queries reorderable",
    await reorderSearchHistory(["kind:image", "host:github.com", "is:pinned"]),
    ["kind:image", "host:github.com", "is:pinned"]);

  // --- 14. Drag from middle to front -----------------------------------
  setStored(["a", "b", "c", "d", "e"]);
  // User dragged "d" to the front (just position "d" first; rest preserved).
  check("drag d to front (partial input)",
    await reorderSearchHistory(["d"]),
    ["d", "a", "b", "c", "e"]);

  // --- 15. Drag to end (explicit full input) ---------------------------
  setStored(["a", "b", "c"]);
  check("drag a to end (explicit order)",
    await reorderSearchHistory(["b", "c", "a"]),
    ["b", "c", "a"]);

  // --- 16. SEARCH_HISTORY_MAX cap respected ---------------------------
  // reorder doesn't TRUNCATE — that's pushSearchHistory's job. We
  // preserve whatever count the persisted list already has.
  const five = ["q1", "q2", "q3", "q4", "q5"];
  setStored(five);
  check("5-entry full ring reorderable",
    await reorderSearchHistory(["q5", "q4", "q3", "q2", "q1"]),
    ["q5", "q4", "q3", "q2", "q1"]);

  console.log(`reorder-search-history sanity: ${pass}/${total} pass`);
  if (pass !== total) process.exit(1);
}

run();
