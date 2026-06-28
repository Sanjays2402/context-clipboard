// Sanity: lib/bulk-clipboard byte-budget warning for large bulk copies.
// Bundles the REAL module so the budget predicate + toast-tail helper are
// exercised against shipping code. Covers both copy paths via the generic
// string-layering helper (works on plain + Markdown toasts alike).
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "ctxclip-copybudget-"));
const out = join(dir, "bulk-clipboard.mjs");
await build({ entryPoints: ["src/lib/bulk-clipboard.ts"], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
const {
  BULK_COPY_BUDGET_BYTES,
  exceedsCopyBudget,
  appendCopyBudgetWarning,
  appendCopyBudgetTitleWarning,
  planBulkCopy,
  formatBulkCopyToast,
} = await import(pathToFileURL(out).href);

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
const ok = (cond, msg) => {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL ${msg}`);
  }
};

const MIB = 1024 * 1024;

// --- the budget constant is 1 MiB ---
eq(BULK_COPY_BUDGET_BYTES, MIB, "budget is 1 MiB");

// --- predicate: strictly greater-than the budget ---
eq(exceedsCopyBudget(0), false, "0 bytes -> within budget");
eq(exceedsCopyBudget(MIB - 1), false, "just under -> within");
eq(exceedsCopyBudget(MIB), false, "exactly at budget -> within (not over)");
eq(exceedsCopyBudget(MIB + 1), true, "just over -> exceeds");
eq(exceedsCopyBudget(5 * MIB), true, "5 MiB -> exceeds");
// defensive: non-finite / negative never warns
eq(exceedsCopyBudget(NaN), false, "NaN -> within (no spurious warning)");
eq(exceedsCopyBudget(-100), false, "negative -> within");
eq(exceedsCopyBudget(Infinity), false, "Infinity -> within (not finite)");

// --- toast tail: unchanged within budget, warned over ---
eq(appendCopyBudgetWarning("Copied 3 clips", 500), "Copied 3 clips", "within budget -> message unchanged");
eq(
  appendCopyBudgetWarning("Copied 3 clips", MIB),
  "Copied 3 clips",
  "at budget -> message unchanged (not over)",
);
const warned = appendCopyBudgetWarning("Copied 3 clips", Math.round(1.4 * MIB));
ok(warned.startsWith("Copied 3 clips"), "warned toast keeps the original receipt");
ok(/large paste/.test(warned), "warned toast names a large paste");
ok(/1\.4 MB/.test(warned), "warned toast shows the size (matches formatCopyBytes)");
ok(/truncate/.test(warned), "warned toast mentions truncation risk");

// --- works on ANY toast string (covers the Markdown path too) ---
eq(
  appendCopyBudgetWarning("Copied 2 clips as Markdown", 100),
  "Copied 2 clips as Markdown",
  "Markdown toast unchanged within budget",
);
ok(
  /large paste/.test(appendCopyBudgetWarning("Copied 2 clips as Markdown", 3 * MIB)),
  "Markdown toast gets the same warning when over",
);

// --- end-to-end: a real >1MB plan triggers the warning on its own toast ---
const bigBody = "x".repeat(MIB + 5000); // > 1 MiB of ASCII -> > 1 MiB bytes
const bigPlan = planBulkCopy([{ id: "1", kind: "text", content: bigBody }]);
ok(bigPlan.bytes > MIB, "big plan exceeds the budget in bytes");
const bigToast = appendCopyBudgetWarning(formatBulkCopyToast(bigPlan), bigPlan.bytes);
ok(/large paste/.test(bigToast), "real big-plan toast carries the warning");

// --- a small real plan stays clean ---
const smallPlan = planBulkCopy([{ id: "1", kind: "text", content: "hello" }]);
ok(smallPlan.bytes < MIB, "small plan within budget");
eq(
  appendCopyBudgetWarning(formatBulkCopyToast(smallPlan), smallPlan.bytes),
  formatBulkCopyToast(smallPlan),
  "small real-plan toast unchanged",
);

// --- title variant: unchanged within budget, warned over ---
eq(appendCopyBudgetTitleWarning("Copy 3 clips as text (500 chars)", 500), "Copy 3 clips as text (500 chars)", "title within budget -> unchanged");
eq(appendCopyBudgetTitleWarning("Copy 3 clips", MIB), "Copy 3 clips", "title at budget -> unchanged (not over)");
const warnedTitle = appendCopyBudgetTitleWarning("Copy 3 clips", Math.round(1.4 * MIB));
ok(warnedTitle.startsWith("Copy 3 clips"), "title warning keeps the original tooltip");
ok(/over 1 MB/.test(warnedTitle), "title warning names the budget breach");
ok(/1\.4 MB/.test(warnedTitle), "title warning shows the size (formatCopyBytes)");
ok(/truncate/.test(warnedTitle), "title warning mentions truncation risk");
// defensive: NaN never warns the title either
eq(appendCopyBudgetTitleWarning("Copy", NaN), "Copy", "title NaN -> unchanged");

// --- single-clip skip: a deliberate 1-clip pick never warns ---
const overOne = Math.round(1.4 * MIB);
eq(appendCopyBudgetWarning("Copied 1 clip", overOne, 1), "Copied 1 clip", "1 clip over budget -> no warning");
ok(/large paste/.test(appendCopyBudgetWarning("Copied 2 clips", overOne, 2)), "2 clips over budget -> warns");
eq(appendCopyBudgetTitleWarning("Copy 1 clip", overOne, 1), "Copy 1 clip", "title 1 clip -> no warning");
ok(/over 1 MB/.test(appendCopyBudgetTitleWarning("Copy 3 clips", overOne, 3)), "title 3 clips -> warns");
// count <= 0 (nothing copyable) also stays quiet
eq(appendCopyBudgetWarning("Nothing", overOne, 0), "Nothing", "0 clips -> no warning");
// default count (omitted) still warns — back-compat
ok(/large paste/.test(appendCopyBudgetWarning("Copied", overOne)), "omitted count defaults to warn");

rmSync(dir, { recursive: true, force: true });
console.log(`copy-budget sanity: ${pass}/${pass + fail} pass`);
if (fail > 0) process.exit(1);
