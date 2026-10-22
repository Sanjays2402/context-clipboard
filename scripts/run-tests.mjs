// Runs every unit test (scripts/test-*.mjs) and sanity check
// (.cron-state/sanity-*.mjs) in parallel and reports one pass/fail summary.
// Scripts that import Playwright are end-to-end tests and need a built
// dist/chrome plus a browser, so they only run with --e2e.
//
// Run: node scripts/run-tests.mjs [--e2e | --e2e-only] [name-filter...]
import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "..", "..");
const args = process.argv.slice(2);
const e2eOnly = args.includes("--e2e-only");
const withE2e = e2eOnly || args.includes("--e2e");
const filters = args.filter((a) => !a.startsWith("--"));
const TIMEOUT_MS = 120_000;

const list = (dir, re) =>
  readdirSync(join(root, dir))
    .filter((f) => re.test(f))
    .sort()
    .map((f) => join(root, dir, f));

const all = [
  ...list("scripts", /^test-.*\.mjs$/),
  ...list(".cron-state", /^sanity-.*\.mjs$/),
].map((file) => ({
  file,
  name: relative(root, file).replaceAll("\\", "/"),
  e2e: /from\s+["']playwright["']/.test(readFileSync(file, "utf8")),
}));

const selected = all.filter(
  (t) =>
    (e2eOnly ? t.e2e : withE2e || !t.e2e) &&
    (filters.length === 0 || filters.some((f) => t.name.includes(f))),
);
const skipped = all.filter((t) => t.e2e && !withE2e).length;

if (selected.length === 0) {
  console.error("No tests matched.");
  process.exit(1);
}

function run(t) {
  return new Promise((done) => {
    const started = Date.now();
    const child = spawn(process.execPath, [t.file], { cwd: root });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => {
      out += `\n[run-tests] timed out after ${TIMEOUT_MS / 1000}s`;
      child.kill();
    }, TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ ...t, ok: code === 0, out, ms: Date.now() - started });
    });
  });
}

// E2E tests each serve dist/ on their own port and launch a browser, so
// keep them sequential; everything else fans out across cores.
const queue = [...selected];
const results = [];
const workers = Array.from(
  { length: e2eOnly ? 1 : Math.max(1, availableParallelism() - 1) },
  async () => {
    while (queue.length) {
      const t = queue.shift();
      const r = await run(t);
      results.push(r);
      process.stdout.write(r.ok ? "." : "F");
    }
  },
);
await Promise.all(workers);
process.stdout.write("\n");

const failed = results.filter((r) => !r.ok).sort((a, b) => a.name.localeCompare(b.name));
for (const r of failed) {
  console.log(`\n✗ ${r.name}\n${r.out.trimEnd().split("\n").slice(-25).join("\n")}`);
}
const note = skipped ? ` (${skipped} e2e skipped; pass --e2e to include)` : "";
console.log(`\n${results.length - failed.length}/${results.length} test files passed${note}`);
process.exit(failed.length ? 1 : 0);
