// Sanity: bulk-lock — bulk-bar lock/unlock toggle helpers.

import { build } from "esbuild";
import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const dir = mkdtempSync(join(tmpdir(), "ctxclip-bulklock-"));
await build({
  entryPoints: ["src/lib/bulk-lock.ts"],
  bundle: true,
  format: "esm",
  outfile: join(dir, "bulk-lock.mjs"),
  platform: "neutral",
  target: "es2022",
  sourcemap: false,
});
const mod = await import("file://" + join(dir, "bulk-lock.mjs"));
const { decideBulkLockIntent, countBulkLockWrites, formatBulkLockToast, formatBulkLockButtonTitle } = mod;

let pass = 0;
let total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}

// --- 1. decideBulkLockIntent --------------------------------------------
check("intent: empty array → null",
  decideBulkLockIntent([]), null);
check("intent: non-array → null",
  decideBulkLockIntent(null), null);
check("intent: all-locked → 'unlock'",
  decideBulkLockIntent([
    { id: "a", locked: true },
    { id: "b", locked: true },
    { id: "c", locked: true },
  ]), "unlock");
check("intent: all-unlocked → 'lock'",
  decideBulkLockIntent([
    { id: "a", locked: false },
    { id: "b" },
    { id: "c", locked: undefined },
  ]), "lock");
check("intent: mixed → 'lock'",
  decideBulkLockIntent([
    { id: "a", locked: true },
    { id: "b", locked: false },
    { id: "c", locked: true },
  ]), "lock");
check("intent: single locked → 'unlock'",
  decideBulkLockIntent([{ id: "a", locked: true }]), "unlock");
check("intent: single unlocked → 'lock'",
  decideBulkLockIntent([{ id: "a" }]), "lock");

// Strict ===true: locked:1 (truthy non-boolean) counts as unlocked here,
// so the bulk action would FORCE it to a proper boolean — that's right.
check("intent: locked:1 (truthy non-boolean) → 'lock' (cleanup)",
  decideBulkLockIntent([{ id: "a", locked: 1 }]), "lock");
check("intent: locked:'true' (string) → 'lock'",
  decideBulkLockIntent([{ id: "a", locked: "true" }]), "lock");

// Bad entries silently skipped — surviving entries decide.
check("intent: bad entries skipped + good are all-locked → 'unlock'",
  decideBulkLockIntent([
    null,
    { id: "" },
    { id: "good1", locked: true },
    { id: "good2", locked: true },
  ]), "unlock");

// --- 2. countBulkLockWrites ---------------------------------------------
const mixed = [
  { id: "a", locked: true },
  { id: "b", locked: false },
  { id: "c", locked: true },
  { id: "d" },
  { id: "e", locked: false },
];
check("count: lock intent → count of NOT locked (b, d, e = 3)",
  countBulkLockWrites(mixed, "lock"), 3);
check("count: unlock intent → count of locked (a, c = 2)",
  countBulkLockWrites(mixed, "unlock"), 2);
check("count: empty → 0",
  countBulkLockWrites([], "lock"), 0);
check("count: non-array → 0",
  countBulkLockWrites(null, "lock"), 0);

// Bad entries skipped.
check("count: bad entries skipped",
  countBulkLockWrites([null, { id: "" }, { id: "good", locked: true }], "unlock"), 1);

// --- 3. formatBulkLockToast — all-write paths ---------------------------
check("toast: lock all 1 → 'Locked 1 clip'",
  formatBulkLockToast({ intent: "lock", total: 1, writes: 1 }), "Locked 1 clip");
check("toast: lock all 5 → 'Locked 5 clips'",
  formatBulkLockToast({ intent: "lock", total: 5, writes: 5 }), "Locked 5 clips");
check("toast: unlock all 1 → 'Unlocked 1 clip'",
  formatBulkLockToast({ intent: "unlock", total: 1, writes: 1 }), "Unlocked 1 clip");
check("toast: unlock all 3 → 'Unlocked 3 clips'",
  formatBulkLockToast({ intent: "unlock", total: 3, writes: 3 }), "Unlocked 3 clips");

// --- 4. formatBulkLockToast — mixed selection ---------------------------
check("toast: lock 3 of 7 → mixed shape",
  formatBulkLockToast({ intent: "lock", total: 7, writes: 3 }),
  "Locked 3 of 7 clips · 4 already locked");
check("toast: unlock 2 of 5 → mixed shape",
  formatBulkLockToast({ intent: "unlock", total: 5, writes: 2 }),
  "Unlocked 2 of 5 clips · 3 already unlocked");

// --- 5. formatBulkLockToast — no-write paths ----------------------------
check("toast: lock zero of zero → 'Nothing to lock'",
  formatBulkLockToast({ intent: "lock", total: 0, writes: 0 }), "Nothing to lock");
check("toast: unlock zero of zero → 'Nothing to unlock'",
  formatBulkLockToast({ intent: "unlock", total: 0, writes: 0 }), "Nothing to unlock");
check("toast: lock writes=0 total=1 → 'Already locked'",
  formatBulkLockToast({ intent: "lock", total: 1, writes: 0 }), "Already locked");
check("toast: lock writes=0 total=5 → 'All 5 already locked'",
  formatBulkLockToast({ intent: "lock", total: 5, writes: 0 }), "All 5 already locked");
check("toast: unlock writes=0 total=3 → 'All 3 already unlocked'",
  formatBulkLockToast({ intent: "unlock", total: 3, writes: 0 }), "All 3 already unlocked");

// --- 6. formatBulkLockToast — defensive numbers -------------------------
check("toast: NaN writes coerced to 0",
  formatBulkLockToast({ intent: "lock", total: 5, writes: NaN }), "All 5 already locked");
check("toast: negative writes coerced to 0",
  formatBulkLockToast({ intent: "lock", total: 5, writes: -3 }), "All 5 already locked");
check("toast: fractional writes floored (3.7 → 3)",
  formatBulkLockToast({ intent: "lock", total: 7, writes: 3.7 }),
  "Locked 3 of 7 clips · 4 already locked");

// --- 7. formatBulkLockButtonTitle ---------------------------------------
check("title: null intent → generic",
  formatBulkLockButtonTitle({ intent: null, total: 0, writes: 0 }),
  "Toggle lock on selection");
check("title: lock all 1 → 'Lock this clip'",
  formatBulkLockButtonTitle({ intent: "lock", total: 1, writes: 1 }), "Lock this clip");
check("title: lock all 5 → 'Lock 5 clips'",
  formatBulkLockButtonTitle({ intent: "lock", total: 5, writes: 5 }), "Lock 5 clips");
check("title: unlock all 3 → 'Unlock 3 clips'",
  formatBulkLockButtonTitle({ intent: "unlock", total: 3, writes: 3 }), "Unlock 3 clips");
check("title: lock 3 of 7 (mixed) → skip count",
  formatBulkLockButtonTitle({ intent: "lock", total: 7, writes: 3 }),
  "Lock 3 of 7 (4 already locked)");
check("title: unlock 2 of 5 (mixed) → skip count",
  formatBulkLockButtonTitle({ intent: "unlock", total: 5, writes: 2 }),
  "Unlock 2 of 5 (3 already unlocked)");

// --- 8. End-to-end: realistic 8-clip selection --------------------------
const realistic = [
  { id: "r1", locked: true },
  { id: "r2", locked: false },
  { id: "r3", locked: true },
  { id: "r4" },
  { id: "r5", locked: false },
  { id: "r6", locked: true },
  { id: "r7", locked: undefined },
  { id: "r8", locked: false },
];
const intent = decideBulkLockIntent(realistic);
check("realistic: mixed selection → intent 'lock'", intent, "lock");
const writes = countBulkLockWrites(realistic, intent);
check("realistic: writes count (3 already locked + 5 unlocked) → 5",
  writes, 5);
check("realistic: toast for mixed lock",
  formatBulkLockToast({ intent, total: realistic.length, writes }),
  "Locked 5 of 8 clips · 3 already locked");
check("realistic: title for mixed lock",
  formatBulkLockButtonTitle({ intent, total: realistic.length, writes }),
  "Lock 5 of 8 (3 already locked)");

// All-locked case — unlock everything.
const allLocked = [
  { id: "a", locked: true },
  { id: "b", locked: true },
  { id: "c", locked: true },
];
const intent2 = decideBulkLockIntent(allLocked);
check("realistic: all-locked → intent 'unlock'", intent2, "unlock");
const writes2 = countBulkLockWrites(allLocked, intent2);
check("realistic: all-locked → writes = total (3)", writes2, 3);
check("realistic: toast for unlock-all",
  formatBulkLockToast({ intent: intent2, total: allLocked.length, writes: writes2 }),
  "Unlocked 3 clips");

console.log(`bulk-lock sanity: ${pass}/${total} pass`);
if (pass !== total) process.exit(1);
