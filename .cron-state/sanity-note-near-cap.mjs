// Sanity: lib/note-count graduated amber "near" tier.
// esbuild-bundle the TS to ESM in a temp dir, import, assert. Removed by caller.
import { build } from "esbuild";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "ctxclip-nearcap-"));
const out = join(dir, "note-count.mjs");
await build({
  entryPoints: ["src/lib/note-count.ts"],
  bundle: true,
  format: "esm",
  outfile: out,
  logLevel: "silent",
});
const { noteCountState, NEAR_CAP_RATIO } = await import(pathToFileURL(out).href);

let pass = 0,
  fail = 0;
const eq = (a, b, msg) => {
  const A = JSON.stringify(a),
    B = JSON.stringify(b);
  if (A === B) pass++;
  else {
    fail++;
    console.error(`FAIL ${msg}: got ${A} want ${B}`);
  }
};

const CAP = 2000;
const NEAR = Math.ceil(CAP * NEAR_CAP_RATIO); // 1800

// --- ratio constant ---
eq(NEAR_CAP_RATIO, 0.9, "ratio is 0.9");
eq(NEAR, 1800, "near threshold = 1800 at cap 2000");

// --- tier boundaries ---
eq(noteCountState("").tier, "normal", "empty -> normal");
eq(noteCountState("x".repeat(1799)).tier, "normal", "1799 -> normal (below near)");
eq(noteCountState("x".repeat(1800)).tier, "near", "1800 -> near (exact threshold)");
eq(noteCountState("x".repeat(1999)).tier, "near", "1999 -> near");
eq(noteCountState("x".repeat(2000)).tier, "near", "2000 (== cap) -> near, NOT over");
eq(noteCountState("x".repeat(2001)).tier, "over", "2001 -> over");

// --- predicate independence: nearCap excludes the over region ---
eq(noteCountState("x".repeat(1800)).nearCap, true, "1800 nearCap true");
eq(noteCountState("x".repeat(2000)).nearCap, true, "2000 nearCap true");
eq(noteCountState("x".repeat(2001)).nearCap, false, "2001 nearCap false (over takes it)");
eq(noteCountState("x".repeat(2001)).overCap, true, "2001 overCap true");
eq(noteCountState("x".repeat(1799)).nearCap, false, "1799 nearCap false");

// --- exactly-cap survives whole (matches sanitizer): not over ---
eq(noteCountState("x".repeat(2000)).overCap, false, "2000 not over (survives whole)");

// --- mutual exclusivity: tier is a single verdict ---
for (const n of [0, 1799, 1800, 2000, 2001]) {
  const s = noteCountState("x".repeat(n));
  const flags = [s.tier === "near", s.tier === "over"].filter(Boolean).length;
  eq(flags <= 1, true, `tier single-valued at len ${n}`);
}

// --- label grouping unchanged ---
eq(noteCountState("x".repeat(1234)).label, "1,234 / 2,000", "label grouped");

// --- defensive: nullish / non-string ---
eq(noteCountState(null).tier, "normal", "null -> normal");
eq(noteCountState(undefined).length, 0, "undefined -> len 0");
eq(noteCountState(42).tier, "normal", "number -> normal");

// --- custom cap scales the threshold ---
eq(noteCountState("x".repeat(90), 100).tier, "near", "90/100 -> near (90%)");
eq(noteCountState("x".repeat(89), 100).tier, "normal", "89/100 -> normal");
eq(noteCountState("x".repeat(101), 100).tier, "over", "101/100 -> over");

// --- degenerate cap: near threshold floored at 1, never traps empty ---
eq(noteCountState("", 1).tier, "normal", "empty at cap 1 -> normal (not near)");
eq(noteCountState("x", 1).tier, "near", "1 char at cap 1 -> near");

// --- ratio: clamped [0,1] fill driving the progress-bar gauge ---
eq(noteCountState("").ratio, 0, "empty -> ratio 0");
eq(noteCountState("x".repeat(1000)).ratio, 0.5, "1000/2000 -> ratio 0.5");
eq(noteCountState("x".repeat(1800)).ratio, 0.9, "1800/2000 -> ratio 0.9 (near threshold)");
eq(noteCountState("x".repeat(2000)).ratio, 1, "2000 (== cap) -> ratio 1 (full bar)");
eq(noteCountState("x".repeat(2001)).ratio, 1, "2001 (over) -> ratio clamped to 1");
eq(noteCountState("x".repeat(5000)).ratio, 1, "way over -> ratio still clamped to 1");
// ratio scales with a custom cap.
eq(noteCountState("x".repeat(25), 100).ratio, 0.25, "25/100 -> ratio 0.25");
eq(noteCountState("x".repeat(150), 100).ratio, 1, "150/100 -> ratio clamped to 1");
// ratio never goes negative / NaN on degenerate input.
eq(noteCountState(null).ratio, 0, "null draft -> ratio 0");
// ratio is always within [0,1] across a sweep (the bar can never overflow).
for (const n of [0, 1, 500, 1799, 1800, 2000, 2001, 9999]) {
  const r = noteCountState("x".repeat(n)).ratio;
  eq(r >= 0 && r <= 1, true, `ratio in [0,1] at len ${n}`);
}

rmSync(dir, { recursive: true, force: true });
console.log(`note-near-cap sanity: ${pass}/${pass + fail} pass`);
if (fail > 0) process.exit(1);
