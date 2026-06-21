/**
 * Sanity checks for the list-sort comparator.
 * Run with: node .cron-state/sanity-sort.mjs
 */
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const tmp = mkdtempSync(join(tmpdir(), "ctxclip-sort-"));
const entry = join(tmp, "entry.mjs");
writeFileSync(
  entry,
  `import { sortClips, sortLabel } from ${JSON.stringify(
    resolve(repoRoot, "src/lib/sort.ts"),
  )};
globalThis.__S = { sortClips, sortLabel };`,
);
await build({
  entryPoints: [entry],
  bundle: true,
  format: "esm",
  platform: "neutral",
  outfile: join(tmp, "out.mjs"),
  logLevel: "silent",
});
await import(join(tmp, "out.mjs"));
const { sortClips, sortLabel } = globalThis.__S;

let pass = 0;
let fail = 0;
function ok(label, cond) {
  if (cond) {
    pass++;
    console.log(`  pass  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}`);
  }
}

// Build a small fixture
const now = Date.now();
const clips = [
  { id: "a", pinned: false, lastSeenAt: now - 1000, hitCount: 5, bytes: 200, preview: "banana" },
  { id: "b", pinned: false, lastSeenAt: now - 500,  hitCount: 1, bytes: 50,  preview: "apple"  },
  { id: "c", pinned: true,  lastSeenAt: now - 9999, hitCount: 1, bytes: 10,  preview: "zebra"  },
  { id: "d", pinned: false, lastSeenAt: now - 200,  hitCount: 9, bytes: 800, preview: "cherry" },
  { id: "e", pinned: true,  lastSeenAt: now - 100,  hitCount: 2, bytes: 100, preview: "apricot"},
];

// Recent: pinned first (e then c by lastSeen), then unpinned d, b, a.
{
  const r = sortClips(clips, "recent").map((c) => c.id);
  ok("recent: pinned float to top", r[0] === "e" && r[1] === "c");
  ok("recent: unpinned ordered by lastSeenAt desc", r.slice(2).join("") === "dba");
}

// Oldest: pinned first (c then e by lastSeen asc), then unpinned a, b, d.
{
  const r = sortClips(clips, "oldest").map((c) => c.id);
  ok("oldest: pinned still float to top", r[0] === "c" && r[1] === "e");
  ok("oldest: unpinned ordered asc", r.slice(2).join("") === "abd");
}

// Hits: pinned first (c then e by recent tie-break? actually by hitCount desc — e=2, c=1)
{
  const r = sortClips(clips, "hits").map((c) => c.id);
  ok("hits: pinned top, sorted by hitCount within tier", r[0] === "e" && r[1] === "c");
  ok("hits: unpinned by hitCount desc", r.slice(2).join("") === "dab");
}

// Size: pinned top (e=100, c=10), unpinned d, a, b.
{
  const r = sortClips(clips, "size").map((c) => c.id);
  ok("size: pinned ordered by bytes desc within tier", r[0] === "e" && r[1] === "c");
  ok("size: unpinned by bytes desc", r.slice(2).join("") === "dab");
}

// Alpha: pinned (apricot, zebra), unpinned (apple, banana, cherry).
{
  const r = sortClips(clips, "alpha").map((c) => c.id);
  ok("alpha: pinned alpha within tier (apricot < zebra)", r[0] === "e" && r[1] === "c");
  ok("alpha: unpinned alpha (apple < banana < cherry)", r.slice(2).join("") === "bad");
}

// Stable: re-sorting an already-sorted list should be a fixed point.
{
  const once = sortClips(clips, "recent");
  const twice = sortClips(once, "recent");
  ok("recent is idempotent", once.map((c) => c.id).join("") === twice.map((c) => c.id).join(""));
}

// Pure: input array is not mutated.
{
  const before = clips.map((c) => c.id).join(",");
  sortClips(clips, "size");
  const after = clips.map((c) => c.id).join(",");
  ok("sortClips does not mutate input", before === after);
}

// Labels round-trip for every mode.
{
  const modes = ["recent", "oldest", "hits", "size", "alpha"];
  ok(
    "every mode has a non-empty label",
    modes.every((m) => typeof sortLabel(m) === "string" && sortLabel(m).length > 0),
  );
}

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass}/${pass + fail} sort sanity checks passed`);
if (fail > 0) process.exit(1);
