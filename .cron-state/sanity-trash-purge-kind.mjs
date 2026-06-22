// Sanity for lib/trash-purge-kind.ts
//   summarizeTrashByKind(items) -> { text, image, link, all } each {count, bytes}
//   planTrashPurge(items, kind) -> { ids, count, bytes, kind }
//   formatPurgeConfirm(plan) -> string
//   formatPurgeButtonLabel(breakdown, kind) -> string | null
//
// Defensive against non-array input, missing id, non-string id, missing kind
// (treated as text), non-number/negative bytes (counted as 0).

import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = process.cwd();
const src = join(repo, "src/lib/trash-purge-kind.ts");
const tmp = mkdtempSync(join(tmpdir(), "tpk-"));
const outFile = join(tmp, "out.mjs");
execSync(`node_modules/.bin/esbuild --bundle --format=esm --platform=neutral --target=es2022 --outfile=${outFile} ${src}`, {
  cwd: repo,
  stdio: ["ignore", "ignore", "inherit"],
});
const { summarizeTrashByKind, planTrashPurge, formatPurgeConfirm, formatPurgeButtonLabel } =
  await import(outFile);

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; } else { fail++; console.error(`FAIL ${name}: ${detail || ""}`); }
}
function eq(name, got, want) {
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
}

const ZERO = { count: 0, bytes: 0 };
const zeroBreak = { text: ZERO, image: ZERO, link: ZERO, all: ZERO };

// --- summarize: defensive inputs ------------------------------------
eq("sum null",        summarizeTrashByKind(null),       zeroBreak);
eq("sum undefined",   summarizeTrashByKind(undefined),  zeroBreak);
eq("sum string",      summarizeTrashByKind("trash"),    zeroBreak);
eq("sum number",      summarizeTrashByKind(42),         zeroBreak);
eq("sum object",      summarizeTrashByKind({}),         zeroBreak);
eq("sum empty array", summarizeTrashByKind([]),         zeroBreak);

// --- summarize: per-kind tallies ------------------------------------
const sample = [
  { id: "a", kind: "text",  bytes: 100 },
  { id: "b", kind: "text",  bytes: 200 },
  { id: "c", kind: "image", bytes: 5000 },
  { id: "d", kind: "link",  bytes: 50 },
];
eq("sum 4 mixed", summarizeTrashByKind(sample), {
  text:  { count: 2, bytes: 300 },
  image: { count: 1, bytes: 5000 },
  link:  { count: 1, bytes: 50 },
  all:   { count: 4, bytes: 5350 },
});

// --- summarize: defensive per-entry ---------------------------------
const dirty = [
  null,
  undefined,
  "not an object",
  42,
  { id: "a", kind: "text", bytes: 100 },             // valid
  { id: "b", kind: "unknown", bytes: 50 },           // unknown kind -> text
  { id: "c" },                                       // missing kind -> text, missing bytes -> 0
  { id: "d", kind: "image", bytes: "not number" },   // string bytes -> 0
  { id: "e", kind: "image", bytes: -100 },           // negative bytes -> 0
  { id: "f", kind: "image", bytes: NaN },            // NaN bytes -> 0
  { id: "g", kind: "image", bytes: Infinity },       // Infinity bytes -> 0
  { id: "h", kind: "link",  bytes: 0 },              // zero bytes -> ok (counted)
];
eq("sum dirty inputs", summarizeTrashByKind(dirty), {
  text:  { count: 3, bytes: 150 },  // a, b (unknown coerced), c
  image: { count: 4, bytes: 0 },    // d, e, f, g (all bytes coerced to 0)
  link:  { count: 1, bytes: 0 },    // h
  all:   { count: 8, bytes: 150 },
});

// --- planTrashPurge: defensive inputs -------------------------------
eq("plan null", planTrashPurge(null, "all"),       { ids: [], count: 0, bytes: 0, kind: "all" });
eq("plan empty", planTrashPurge([], "image"),      { ids: [], count: 0, bytes: 0, kind: "image" });
eq("plan no match", planTrashPurge([{ id: "x", kind: "text", bytes: 100 }], "image"),
   { ids: [], count: 0, bytes: 0, kind: "image" });

// --- planTrashPurge: per-kind filter --------------------------------
eq("plan text only", planTrashPurge(sample, "text"),
   { ids: ["a", "b"], count: 2, bytes: 300, kind: "text" });
eq("plan image only", planTrashPurge(sample, "image"),
   { ids: ["c"], count: 1, bytes: 5000, kind: "image" });
eq("plan link only", planTrashPurge(sample, "link"),
   { ids: ["d"], count: 1, bytes: 50, kind: "link" });
eq("plan all", planTrashPurge(sample, "all"),
   { ids: ["a", "b", "c", "d"], count: 4, bytes: 5350, kind: "all" });

// --- planTrashPurge: skip malformed ids -----------------------------
const withBadIds = [
  { id: "good", kind: "text", bytes: 100 },
  { id: "", kind: "text", bytes: 200 },         // empty string id -> skip
  { id: null, kind: "text", bytes: 300 },       // null id -> skip
  { id: 42, kind: "text", bytes: 400 },         // number id -> skip
  { kind: "text", bytes: 500 },                 // missing id -> skip
  { id: "good2", kind: "text", bytes: 600 },
];
eq("plan skip bad ids", planTrashPurge(withBadIds, "text"),
   { ids: ["good", "good2"], count: 2, bytes: 700, kind: "text" });

// --- planTrashPurge: unknown-kind coerced to text -------------------
eq("plan unknown -> text", planTrashPurge(
  [{ id: "a", kind: "weird", bytes: 100 }], "text"),
   { ids: ["a"], count: 1, bytes: 100, kind: "text" });

// --- formatPurgeConfirm ---------------------------------------------
eq("confirm zero all", formatPurgeConfirm({ count: 0, bytes: 0, kind: "all" }),
   "Nothing trashed");
eq("confirm zero image", formatPurgeConfirm({ count: 0, bytes: 0, kind: "image" }),
   "Nothing trashed (no image clips in trash)");
eq("confirm 1 image with bytes", formatPurgeConfirm({ count: 1, bytes: 5000, kind: "image" }),
   "Permanently delete 1 image clip (~4.9 KB freed)? Other trash stays restorable.");
eq("confirm 5 image", formatPurgeConfirm({ count: 5, bytes: 50_000_000, kind: "image" }),
   "Permanently delete 5 image clips (~47.7 MB freed)? Other trash stays restorable.");
eq("confirm 12 text no bytes", formatPurgeConfirm({ count: 12, bytes: 0, kind: "text" }),
   "Permanently delete 12 text clips? Other trash stays restorable.");
eq("confirm 1 all", formatPurgeConfirm({ count: 1, bytes: 100, kind: "all" }),
   "Permanently delete 1 clip (~100 B freed)? Other trash stays restorable.");

// --- formatPurgeButtonLabel -----------------------------------------
const fullBreakdown = summarizeTrashByKind(sample);
eq("label text", formatPurgeButtonLabel(fullBreakdown, "text"),
   "Empty text (2 · 300 B)");
eq("label image", formatPurgeButtonLabel(fullBreakdown, "image"),
   "Empty images (1 · 4.9 KB)");
eq("label link", formatPurgeButtonLabel(fullBreakdown, "link"),
   "Empty links (1 · 50 B)");
eq("label all", formatPurgeButtonLabel(fullBreakdown, "all"),
   "Empty trash (4 · 5.2 KB)");
eq("label hide zero", formatPurgeButtonLabel(zeroBreak, "text"), null);
eq("label hide image", formatPurgeButtonLabel(zeroBreak, "image"), null);

// label without bytes (count without size — possible when all bytes are 0)
const noBytes = { text: { count: 3, bytes: 0 }, image: ZERO, link: ZERO, all: { count: 3, bytes: 0 } };
eq("label text count-only", formatPurgeButtonLabel(noBytes, "text"), "Empty text (3)");

// --- bytes hint tiers -----------------------------------------------
eq("hint 0 B", formatPurgeConfirm({ count: 1, bytes: 0, kind: "all" }),
   "Permanently delete 1 clip? Other trash stays restorable.");
eq("hint 999 B", formatPurgeConfirm({ count: 1, bytes: 999, kind: "all" }),
   "Permanently delete 1 clip (~999 B freed)? Other trash stays restorable.");
eq("hint 1 KB boundary", formatPurgeConfirm({ count: 1, bytes: 1024, kind: "all" }),
   "Permanently delete 1 clip (~1.0 KB freed)? Other trash stays restorable.");
eq("hint 1 MB", formatPurgeConfirm({ count: 1, bytes: 1024 * 1024, kind: "all" }),
   "Permanently delete 1 clip (~1.0 MB freed)? Other trash stays restorable.");
eq("hint 1 GB", formatPurgeConfirm({ count: 1, bytes: 1024 * 1024 * 1024, kind: "all" }),
   "Permanently delete 1 clip (~1.0 GB freed)? Other trash stays restorable.");

// --- realistic end-to-end -------------------------------------------
const realTrash = [
  { id: "t1", kind: "text", bytes: 1500, deletedAt: Date.now() - 1000 },
  { id: "t2", kind: "text", bytes: 800, deletedAt: Date.now() - 2000 },
  { id: "i1", kind: "image", bytes: 2_500_000, deletedAt: Date.now() - 3000 },
  { id: "i2", kind: "image", bytes: 3_000_000, deletedAt: Date.now() - 4000 },
  { id: "i3", kind: "image", bytes: 5_500_000, deletedAt: Date.now() - 5000 },
  { id: "l1", kind: "link", bytes: 200, deletedAt: Date.now() - 6000 },
];
const realBreak = summarizeTrashByKind(realTrash);
ok("real text count", realBreak.text.count === 2);
ok("real image count", realBreak.image.count === 3);
ok("real image bytes ~10MB", realBreak.image.bytes === 11_000_000);
ok("real all count", realBreak.all.count === 6);

const realImagePlan = planTrashPurge(realTrash, "image");
eq("real image ids", realImagePlan.ids, ["i1", "i2", "i3"]);
ok("real image bytes plan", realImagePlan.bytes === 11_000_000);
eq("real image confirm", formatPurgeConfirm(realImagePlan),
   "Permanently delete 3 image clips (~10.5 MB freed)? Other trash stays restorable.");
eq("real image label", formatPurgeButtonLabel(realBreak, "image"),
   "Empty images (3 · 10.5 MB)");

// --- input immutability ---------------------------------------------
const before = JSON.parse(JSON.stringify(sample));
summarizeTrashByKind(sample);
planTrashPurge(sample, "image");
eq("input not mutated", sample, before);

rmSync(tmp, { recursive: true, force: true });
console.log(`trash-purge-kind sanity: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
