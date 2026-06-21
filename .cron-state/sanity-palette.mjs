/**
 * Sanity checks for the command palette fuzzy matcher.
 * Run with: node .cron-state/sanity-palette.mjs
 *
 * No popup / IDB — pure functions only. Compiles a tiny TS stub
 * inline with esbuild's transform so we don't need a build step.
 */
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const tmp = mkdtempSync(join(tmpdir(), "ctxclip-palette-"));
const entry = join(tmp, "entry.mjs");
writeFileSync(
  entry,
  `import { rankActions, scoreAction, boldedLabel } from ${JSON.stringify(
    resolve(repoRoot, "src/lib/palette.ts"),
  )};
globalThis.__P = { rankActions, scoreAction, boldedLabel };`,
);
await build({
  entryPoints: [entry],
  bundle: true,
  format: "esm",
  platform: "neutral",
  outfile: join(tmp, "out.mjs"),
  logLevel: "silent",
});
const mod = await import(join(tmp, "out.mjs"));
void mod;
const { rankActions, scoreAction, boldedLabel } = globalThis.__P;

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

const actions = [
  { id: "pin-all", label: "Pin all 12 filtered", group: "Bulk", run: () => {} },
  { id: "unpin-all", label: "Unpin all 12 filtered", group: "Bulk", run: () => {} },
  { id: "show-images", label: "Show images only", group: "Filter", keywords: "kind:image picture", run: () => {} },
  { id: "show-pinned", label: "Show pinned only", group: "Filter", run: () => {} },
  { id: "clear-filters", label: "Clear all filters", group: "Filter", run: () => {} },
  { id: "export", label: "Export with current filter", group: "Export", run: () => {} },
  { id: "settings", label: "Open settings", group: "Navigate", run: () => {} },
  { id: "trash", label: "Empty trash", group: "Trash", run: () => {}, available: false },
];

// Empty needle returns every available action.
{
  const r = rankActions(actions, "");
  ok("empty needle returns 7 (skips unavailable)", r.length === 7);
}

// Substring match — best hit at the front of the label.
{
  const r = rankActions(actions, "pin");
  ok("substring 'pin' ranks Pin all first", r[0].action.id === "pin-all");
  ok("substring 'pin' includes Unpin too", r.find((m) => m.action.id === "unpin-all"));
  ok("substring 'pin' includes Show pinned", r.find((m) => m.action.id === "show-pinned"));
}

// Keyword match — should pick up "image" via the `keywords` field on a label that doesn't contain it.
{
  const m = scoreAction(actions[2], "picture");
  ok("keyword 'picture' matches Show images", m !== null);
}

// Acronym / sequential — 'sps' should match "Show Pinned only".
{
  const m = scoreAction(actions[3], "spo");
  ok("acronym 'spo' matches 'Show pinned only'", m !== null);
}

// Negative case — gibberish returns null.
{
  const m = scoreAction(actions[0], "zzzqx");
  ok("gibberish returns null", m === null);
}

// Unavailable actions are filtered out of rankActions.
{
  const r = rankActions(actions, "trash");
  ok("unavailable 'Empty trash' not surfaced", r.find((m) => m.action.id === "trash") == null);
}

// Bolded label HTML escapes properly and wraps matches.
{
  const html = boldedLabel("A<b>B", [0, 2]);
  ok("boldedLabel escapes < and >", html.includes("&lt;") && html.includes("&gt;"));
  ok("boldedLabel wraps matched chars in <b>", html.includes("<b>A</b>"));
}

// Boundary preference — 'cf' should rank 'Clear all filters' (CF at word starts) above unrelated matches.
{
  const r = rankActions(actions, "cf");
  ok("'cf' ranks Clear all filters first", r[0].action.id === "clear-filters");
}

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass}/${pass + fail} palette sanity checks passed`);
if (fail > 0) process.exit(1);
