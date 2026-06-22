// Sanity for lib/similar-nav.ts
//   buildSimilarNav(rawIds, pivotId) -> SimilarNav | null (dedup, filter pivot, etc.)
//   stepSimilarNav(nav, "prev"|"next") -> {id, index} | null with WRAP semantics
//   formatSimilarPosLabel(nav) -> "Similar N / M" or null
//   formatTraverseButtonLabel(matchCount) -> "Open all (N)" or null (when < 2)
//   isInSimilarNav(nav, id) -> bool
//   syncSimilarNav(nav, id) -> updated nav or null

import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = process.cwd();
const src = join(repo, "src/lib/similar-nav.ts");
const tmp = mkdtempSync(join(tmpdir(), "sn-"));
const outFile = join(tmp, "out.mjs");
execSync(`node_modules/.bin/esbuild --bundle --format=esm --platform=neutral --target=es2022 --outfile=${outFile} ${src}`, {
  cwd: repo,
  stdio: ["ignore", "ignore", "inherit"],
});
const { buildSimilarNav, stepSimilarNav, formatSimilarPosLabel, formatTraverseButtonLabel, isInSimilarNav, syncSimilarNav } =
  await import(outFile);

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; } else { fail++; console.error(`FAIL ${name}: ${detail || ""}`); }
}
function eq(name, got, want) {
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
}

// --- buildSimilarNav: defensive --------------------------------------
eq("build null",       buildSimilarNav(null, "p"),       null);
eq("build undefined",  buildSimilarNav(undefined, "p"),  null);
eq("build string",     buildSimilarNav("a,b", "p"),      null);
eq("build object",     buildSimilarNav({}, "p"),         null);
eq("build empty arr",  buildSimilarNav([], "p"),         null);
eq("build only-bad",   buildSimilarNav([null, undefined, 42, ""], "p"), null);
eq("build only-pivot", buildSimilarNav(["p", "p", "p"], "p"), null);
eq("build whitespace-only", buildSimilarNav(["   ", "\t\n"], "p"), null);

// --- buildSimilarNav: basic happy paths -----------------------------
eq("build trio",       buildSimilarNav(["a", "b", "c"], "p"),  { ids: ["a", "b", "c"], index: 0, pivotId: "p" });
eq("build single",     buildSimilarNav(["a"], "p"),            { ids: ["a"], index: 0, pivotId: "p" });
eq("build trim",       buildSimilarNav(["  a  ", "b "], "p"),  { ids: ["a", "b"], index: 0, pivotId: "p" });

// --- buildSimilarNav: dedup + filter pivot --------------------------
eq("build dedup",      buildSimilarNav(["a", "b", "a", "c", "b"], "p"),
   { ids: ["a", "b", "c"], index: 0, pivotId: "p" });
eq("build filter pivot", buildSimilarNav(["a", "p", "b", "p"], "p"),
   { ids: ["a", "b"], index: 0, pivotId: "p" });
eq("build skip non-string", buildSimilarNav(["a", 42, null, "b"], "p"),
   { ids: ["a", "b"], index: 0, pivotId: "p" });

// --- stepSimilarNav: defensive -------------------------------------
eq("step null nav", stepSimilarNav(null, "next"), null);
eq("step empty ids", stepSimilarNav({ ids: [], index: 0, pivotId: "p" }, "next"), null);

// --- stepSimilarNav: basic --------------------------------------------
const nav3 = { ids: ["a", "b", "c"], index: 0, pivotId: "p" };
eq("step next 0->1", stepSimilarNav(nav3, "next"), { id: "b", index: 1 });
eq("step next 1->2", stepSimilarNav({ ...nav3, index: 1 }, "next"), { id: "c", index: 2 });
eq("step next 2->wrap 0", stepSimilarNav({ ...nav3, index: 2 }, "next"), { id: "a", index: 0 });
eq("step prev 0->wrap 2", stepSimilarNav(nav3, "prev"), { id: "c", index: 2 });
eq("step prev 1->0", stepSimilarNav({ ...nav3, index: 1 }, "prev"), { id: "a", index: 0 });
eq("step prev 2->1", stepSimilarNav({ ...nav3, index: 2 }, "prev"), { id: "b", index: 1 });

// --- stepSimilarNav: single-entry (degenerate) ----------------------
const nav1 = { ids: ["only"], index: 0, pivotId: "p" };
eq("step single next", stepSimilarNav(nav1, "next"), { id: "only", index: 0 });
eq("step single prev", stepSimilarNav(nav1, "prev"), { id: "only", index: 0 });

// --- stepSimilarNav: 5-cycle round-trip -----------------------------
let cursor = { ids: ["a", "b", "c", "d", "e"], index: 0, pivotId: "p" };
const cyclePath = [];
for (let i = 0; i < 6; i++) {
  const r = stepSimilarNav(cursor, "next");
  cyclePath.push(r.id);
  cursor = { ...cursor, index: r.index };
}
eq("5-cycle next round-trip", cyclePath, ["b", "c", "d", "e", "a", "b"]);

// --- formatSimilarPosLabel ------------------------------------------
eq("pos null", formatSimilarPosLabel(null), null);
eq("pos empty", formatSimilarPosLabel({ ids: [], index: 0, pivotId: "p" }), null);
eq("pos 1/5", formatSimilarPosLabel({ ids: ["a","b","c","d","e"], index: 0, pivotId: "p" }), "Similar 1 / 5");
eq("pos 3/5", formatSimilarPosLabel({ ids: ["a","b","c","d","e"], index: 2, pivotId: "p" }), "Similar 3 / 5");
eq("pos 5/5", formatSimilarPosLabel({ ids: ["a","b","c","d","e"], index: 4, pivotId: "p" }), "Similar 5 / 5");

// --- formatTraverseButtonLabel --------------------------------------
eq("traverse 0",  formatTraverseButtonLabel(0),  null);
eq("traverse 1",  formatTraverseButtonLabel(1),  null);
eq("traverse 2",  formatTraverseButtonLabel(2),  "Open all (2)");
eq("traverse 5",  formatTraverseButtonLabel(5),  "Open all (5)");
eq("traverse NaN", formatTraverseButtonLabel(NaN), null);
eq("traverse Inf", formatTraverseButtonLabel(Infinity), null);
eq("traverse neg", formatTraverseButtonLabel(-3), null);

// --- isInSimilarNav --------------------------------------------------
ok("in null nav", isInSimilarNav(null, "a") === false);
ok("in empty id", isInSimilarNav(nav3, "") === false);
ok("in hit", isInSimilarNav(nav3, "b") === true);
ok("in miss", isInSimilarNav(nav3, "z") === false);

// --- syncSimilarNav --------------------------------------------------
eq("sync null", syncSimilarNav(null, "a"), null);
eq("sync empty id", syncSimilarNav(nav3, ""), null);
eq("sync hit", syncSimilarNav(nav3, "b"), { ids: ["a","b","c"], index: 1, pivotId: "p" });
eq("sync hit last", syncSimilarNav(nav3, "c"), { ids: ["a","b","c"], index: 2, pivotId: "p" });
eq("sync miss", syncSimilarNav(nav3, "z"), null);

// --- input immutability ----------------------------------------------
const before = JSON.parse(JSON.stringify(nav3));
stepSimilarNav(nav3, "next");
isInSimilarNav(nav3, "b");
syncSimilarNav(nav3, "b");
eq("nav not mutated", nav3, before);
const rawBefore = ["a", "b", "a", "c"];
const rawClone = [...rawBefore];
buildSimilarNav(rawBefore, "p");
eq("raw not mutated", rawBefore, rawClone);

// --- end-to-end: user opens similar -> walks 5 -> jumps via row --
let nav = buildSimilarNav(["s1", "s2", "s3", "s4", "s5"], "pivot");
ok("e2e initial", nav?.index === 0 && nav?.ids[0] === "s1");
// step next 4 times
for (let i = 0; i < 4; i++) {
  const r = stepSimilarNav(nav, "next");
  nav = { ...nav, index: r.index };
}
ok("e2e after 4 next", nav.index === 4 && nav.ids[nav.index] === "s5");
// user clicks a row to jump to s2
nav = syncSimilarNav(nav, "s2");
ok("e2e jump to s2", nav?.index === 1);
// step prev wraps to s1
const wrapPrev = stepSimilarNav(nav, "prev");
ok("e2e wrap prev to s1", wrapPrev.id === "s1" && wrapPrev.index === 0);

rmSync(tmp, { recursive: true, force: true });
console.log(`similar-nav sanity: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
