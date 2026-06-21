// Sanity test for the in-page palette's per-host ranking.
//
// The sort is buried inside `openPalette()` in src/content.ts (it
// closes over `activeHost` + the local `host(url)` helper), so we
// re-implement the same logic in plain JS here and confirm it
// orders a small fixture exactly the way the live palette will.
// This guards the contract: pinned ALWAYS first, then within each
// tier the active-tab host clips float above everything else, and
// recency tie-breaks elsewhere (preserved from input array order).

const HOST = (url) => {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

function rank(clips, activeHostRaw) {
  const activeHost = (activeHostRaw || "").toLowerCase().replace(/^www\./, "");
  return clips.slice().sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    if (activeHost) {
      const ah = HOST(a.source?.url) === activeHost ? 1 : 0;
      const bh = HOST(b.source?.url) === activeHost ? 1 : 0;
      if (ah !== bh) return bh - ah;
    }
    return 0;
  });
}

let failed = 0;
function expectOrder(actual, expectedIds, label) {
  const ids = actual.map((c) => c.id).join(",");
  const want = expectedIds.join(",");
  if (ids === want) {
    console.log(`  ok   ${label} → ${ids}`);
  } else {
    console.error(`  FAIL ${label}\n       want: ${want}\n       got:  ${ids}`);
    failed++;
  }
}

// Fixture: input is already lastSeenAt-desc (newest first). Mix of
// pinned/unpinned + hosts.
const fixture = [
  { id: "a", pinned: false, source: { url: "https://docs.github.com/x" } },
  { id: "b", pinned: false, source: { url: "https://example.com/y" } },
  { id: "c", pinned: true,  source: { url: "https://example.com/z" } },
  { id: "d", pinned: false, source: { url: "https://github.com/repo" } },
  { id: "e", pinned: true,  source: { url: "https://github.com/issue" } },
  { id: "f", pinned: false, source: { url: "https://other.io/w" } },
  { id: "g", pinned: false, source: {} },
];

// 1) No activeHost → pinned-first, otherwise stable input order.
expectOrder(
  rank(fixture, ""),
  ["c", "e", "a", "b", "d", "f", "g"],
  "no host = pinned-first, stable",
);

// 2) activeHost = github.com → 'e' (pinned github) floats above the
//    other pinned, then github unpinned 'a' + 'd' before the rest.
//    'a' is docs.github.com which strips to docs.github.com — different
//    from github.com, so it does NOT match. (We test exact-host match
//    only, no subdomain wildcard — that matches the live behavior.)
expectOrder(
  rank(fixture, "github.com"),
  ["e", "c", "d", "a", "b", "f", "g"],
  "github.com boost",
);

// 3) activeHost = docs.github.com → 'a' floats inside unpinned tier.
//    Pinned tier doesn't have a docs match so 'c' beats 'e' (stable
//    input order).
expectOrder(
  rank(fixture, "docs.github.com"),
  ["c", "e", "a", "b", "d", "f", "g"],
  "docs.github.com boost",
);

// 4) activeHost = example.com → 'c' was already pinned + matches;
//    unpinned 'b' floats above 'a'/'d'/'f'/'g'.
expectOrder(
  rank(fixture, "example.com"),
  ["c", "e", "b", "a", "d", "f", "g"],
  "example.com boost",
);

// 5) activeHost normalises www. → boost still works.
expectOrder(
  rank(fixture, "www.example.com"),
  ["c", "e", "b", "a", "d", "f", "g"],
  "www.example.com normalised",
);

// 6) Empty input is fine.
expectOrder(rank([], "github.com"), [], "empty input");

// 7) Only pinned clips — host boost still re-orders inside pinned tier.
const onlyPinned = [
  { id: "p1", pinned: true, source: { url: "https://a.com" } },
  { id: "p2", pinned: true, source: { url: "https://github.com" } },
  { id: "p3", pinned: true, source: { url: "https://b.com" } },
];
expectOrder(
  rank(onlyPinned, "github.com"),
  ["p2", "p1", "p3"],
  "host boost inside pinned",
);

// 8) Sort is stable when nothing matches — order preserved.
expectOrder(
  rank(fixture, "nowhere.example"),
  ["c", "e", "a", "b", "d", "f", "g"],
  "no matches → stable",
);

if (failed > 0) {
  console.error(`FAIL palette host-boost sanity (${failed} mismatch${failed === 1 ? "" : "es"})`);
  process.exit(1);
}
console.log("PASS palette host-boost sanity (8 checks)");
