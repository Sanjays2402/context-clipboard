// Sanity: parseJumpPattern + resolveJumpTarget tiers.
//
// We copy the logic inline (the functions are module-private in popup.ts)
// — keeping the test free of imports so it runs without a bundler.

function hostFromUrl(u) {
  if (!u) return "";
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function parseJumpPattern(raw) {
  const m = /^\s*g\s+([\w.*-]+)\s*$/i.exec(raw);
  if (!m) return null;
  return m[1].toLowerCase().replace(/^www\./, "");
}

function resolveJumpTarget(clips, prefix) {
  if (!prefix) return null;
  const p = prefix.toLowerCase();
  const scored = [];
  for (const c of clips) {
    const h = hostFromUrl(c.source && c.source.url);
    if (!h) continue;
    let rank = -1;
    if (h === p) rank = 0;
    else if (h.startsWith(p)) rank = 1;
    else if (h.includes(p)) rank = 2;
    if (rank < 0) continue;
    if (c.pinned) rank -= 0.1;
    scored.push({ clip: c, rank });
  }
  if (scored.length === 0) return null;
  scored.sort(
    (a, b) => a.rank - b.rank || b.clip.lastSeenAt - a.clip.lastSeenAt,
  );
  return scored[0].clip;
}

const clips = [
  { id: "a", lastSeenAt: 1000, pinned: false, source: { url: "https://github.com/foo" } },
  { id: "b", lastSeenAt: 2000, pinned: false, source: { url: "https://github.com/bar" } },
  { id: "c", lastSeenAt: 500,  pinned: true,  source: { url: "https://github.com/baz" } },
  { id: "d", lastSeenAt: 3000, pinned: false, source: { url: "https://gist.github.com/" } },
  { id: "e", lastSeenAt: 1500, pinned: false, source: { url: "https://news.ycombinator.com" } },
  { id: "f", lastSeenAt: 2500, pinned: false, source: { url: "" } },
];

let pass = 0;
let total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", got, "want", want);
}

// parseJumpPattern
check("parse: 'g github'", parseJumpPattern("g github"), "github");
check("parse: '  g  GitHub  '", parseJumpPattern("  g  GitHub  "), "github");
check("parse: 'g github.com'", parseJumpPattern("g github.com"), "github.com");
check("parse: 'g www.github.com'", parseJumpPattern("g www.github.com"), "github.com");
check("parse: 'github'", parseJumpPattern("github"), null);
check("parse: 'g'", parseJumpPattern("g"), null);
check("parse: 'g foo bar'", parseJumpPattern("g foo bar"), null);
check("parse: ''", parseJumpPattern(""), null);

// resolveJumpTarget
// Exact host wins; pinned tie-break inside the tier.
check(
  "resolve exact: 'github.com' → pinned c (rank -0.1) beats unpinned b",
  resolveJumpTarget(clips, "github.com")?.id,
  "c",
);
// Starts-with: same tier — most recent wins (no pinned in that tier).
check(
  "resolve starts-with: 'git' → exact still wins over starts-with",
  resolveJumpTarget(clips, "git")?.id,
  "c", // 'git' starts-with all github.* + gist.* hosts, exact still N/A → pinned c wins
);
// "news" only matches one — substring tier 2.
check(
  "resolve substring: 'news' → e",
  resolveJumpTarget(clips, "news")?.id,
  "e",
);
// No match → null
check(
  "resolve no-match: 'zzz' → null",
  resolveJumpTarget(clips, "zzz"),
  null,
);
// Empty prefix → null
check("resolve empty prefix → null", resolveJumpTarget(clips, ""), null);
// hostFrom('') skipped — clip f never scored
check(
  "resolve skips hostless clip",
  resolveJumpTarget([{ id: "x", lastSeenAt: 0, pinned: false, source: { url: "" } }], "any"),
  null,
);

console.log(`${pass}/${total} passed`);
if (pass !== total) process.exit(1);
