/**
 * Sanity: groupTrashByHost — bucket / sort / minCount math.
 *
 * Pure helper — no IDB, no DOM. We bundle the lib file with esbuild
 * and exercise it against fixture data.
 *
 * Run with: node .cron-state/sanity-trash-host-rollup.mjs
 */
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// Bundle the helper alongside lib/util (it imports hostFrom).
const tmp = mkdtempSync(join(tmpdir(), "ctxclip-trash-host-"));
const entry = join(tmp, "entry.mjs");
writeFileSync(
  entry,
  `import * as m from ${JSON.stringify(resolve(repoRoot, "src/lib/trash-host-rollup.ts"))};
globalThis.__M = m;`,
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
const M = globalThis.__M;

let pass = 0, fail = 0;
function ok(label, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`  FAIL  ${label}`); }
}

function tr(host, deletedAt) {
  return { source: { url: host ? `https://${host}/some/path` : undefined }, deletedAt };
}

// 1) Empty input → empty output.
let out = M.groupTrashByHost([]);
ok("empty: []", Array.isArray(out) && out.length === 0);

// 2) Single host, single row, default minCount=2 → filtered out.
out = M.groupTrashByHost([tr("github.com", 1000)]);
ok("single below minCount: dropped", out.length === 0);

// 3) Two from same host → present, count=2.
out = M.groupTrashByHost([tr("github.com", 1000), tr("github.com", 2000)]);
ok("pair: bucket present", out.length === 1);
ok("pair: host normalised", out[0].host === "github.com");
ok("pair: count=2", out[0].count === 2);
ok("pair: newestDeletedAt is max", out[0].newestDeletedAt === 2000);

// 4) www. stripped (matches hostFrom semantics).
out = M.groupTrashByHost([
  tr("www.github.com", 1000),
  tr("github.com", 2000),
]);
ok("www-strip: collapsed to single bucket", out.length === 1);
ok("www-strip: host without www", out[0].host === "github.com");
ok("www-strip: count=2", out[0].count === 2);

// 5) Sort: count desc.
out = M.groupTrashByHost([
  tr("a.com", 100),
  tr("a.com", 101),
  tr("b.com", 200),
  tr("b.com", 201),
  tr("b.com", 202),
]);
ok("sort: 2 buckets", out.length === 2);
ok("sort: b.com first (count=3)", out[0].host === "b.com" && out[0].count === 3);
ok("sort: a.com second (count=2)", out[1].host === "a.com" && out[1].count === 2);

// 6) Tie on count → newestDeletedAt desc breaks tie.
out = M.groupTrashByHost([
  tr("old.com", 100),
  tr("old.com", 200),
  tr("fresh.com", 9000),
  tr("fresh.com", 9100),
]);
ok("tie: fresh first", out[0].host === "fresh.com");
ok("tie: old second", out[1].host === "old.com");

// 7) Tie on count AND newestDeletedAt → alphabetical.
out = M.groupTrashByHost([
  tr("b.com", 100),
  tr("b.com", 100),
  tr("a.com", 100),
  tr("a.com", 100),
]);
ok("3-way tie: a first (alpha)", out[0].host === "a.com");
ok("3-way tie: b second", out[1].host === "b.com");

// 8) Empty url skipped (no host) — and rows are still counted only
//    for valid hosts.
out = M.groupTrashByHost([
  tr("github.com", 1000),
  tr("github.com", 2000),
  tr(null, 3000),
  tr(null, 4000),
]);
ok("no-url: skipped", out.length === 1);
ok("no-url: count only valid rows", out[0].count === 2);

// 9) Custom minCount=3 — drops 2-row buckets.
out = M.groupTrashByHost(
  [
    tr("a.com", 1),
    tr("a.com", 2),
    tr("b.com", 1),
    tr("b.com", 2),
    tr("b.com", 3),
  ],
  3,
);
ok("minCount=3: only b.com", out.length === 1 && out[0].host === "b.com");

// 10) minCount=1 — surfaces everything (per-row affordance would still
//     exist, but caller can opt-in for a fuller view).
out = M.groupTrashByHost(
  [tr("a.com", 1), tr("b.com", 2)],
  1,
);
ok("minCount=1: both surface", out.length === 2);

// 11) Long input — count math holds across many rows.
const long = [];
for (let i = 0; i < 50; i++) long.push(tr("hot.com", 1000 + i));
for (let i = 0; i < 3; i++) long.push(tr("cold.com", 500 + i));
out = M.groupTrashByHost(long);
ok("long: hot first count=50", out[0].host === "hot.com" && out[0].count === 50);
ok("long: cold second count=3", out[1].host === "cold.com" && out[1].count === 3);
ok("long: hot newest = 1049", out[0].newestDeletedAt === 1049);

// 12) Same host, exact-duplicate deletedAt — count grows, newest stays equal.
out = M.groupTrashByHost([
  tr("dup.com", 1000),
  tr("dup.com", 1000),
  tr("dup.com", 1000),
]);
ok("dup-ts: count=3", out[0].count === 3);
ok("dup-ts: newest=1000", out[0].newestDeletedAt === 1000);

// 13) Mixed-host pinned counterexample — pinned bit is not relevant to
//     this helper (it works on TrashedClip-like rows; pinned lives on
//     ClipItem which extends). We verify the input shape stays loose.
out = M.groupTrashByHost([
  { source: { url: "https://x.io/foo" }, deletedAt: 1, pinned: true },
  { source: { url: "https://x.io/bar" }, deletedAt: 2, pinned: false },
]);
ok("loose shape: still groups", out.length === 1 && out[0].host === "x.io");
ok("loose shape: ignores extra fields", out[0].count === 2);

rmSync(tmp, { recursive: true, force: true });
console.log(`${pass}/${pass + fail} trash-host-rollup sanity checks passed`);
if (fail > 0) process.exit(1);
