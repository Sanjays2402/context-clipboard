// Sanity: cheatsheet "In settings" group exists in the real popup.html
// and the live cheatsheet-filter isolates its rows. Parses the actual
// HTML (no jsdom — regex slice over the static markup) + bundles the
// real filter module so the test exercises shipping code, not a copy.
//
// The settings panel grew (export/import, density, per-site rules,
// privacy audit, blur previews) but had ZERO cheatsheet coverage. This
// group documents those non-keystroke features as .cheat-act tokens (the
// same flat-pill style the Bulk-actions group uses) so the live filter +
// roving focus pick them up for free.
import { build } from "esbuild";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "ctxclip-cheatsettings-"));
const out = join(dir, "cheatsheet-filter.mjs");
await build({ entryPoints: ["src/lib/cheatsheet-filter.ts"], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
const { cheatsheetRowMatches, cheatsheetRowText, normaliseCheatFilter } = await import(pathToFileURL(out).href);

const html = readFileSync("src/popup/popup.html", "utf8");

let pass = 0,
  fail = 0;
const ok = (cond, msg) => {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL ${msg}`);
  }
};

// --- 1. The group heading exists ---
ok(/<h4>In settings<\/h4>/.test(html), "In settings <h4> present");

// --- 2. Extract the group block (heading -> generous window) ---
const gi = html.indexOf("<h4>In settings</h4>");
ok(gi > -1, "group block located");
const block = html.slice(gi, gi + 1400);

// --- 3. Each documented settings feature appears as a .cheat-act token ---
const expectedActs = ["Export", "Import", "Density", "Per-site rules", "Privacy audit", "Blur previews"];
for (const a of expectedActs) {
  const re = new RegExp(`<span class="cheat-act">${a.replace(/[-]/g, "\\-")}</span>`);
  ok(re.test(block), `cheat-act token "${a}" present`);
}

// --- 4. Every row in the block is a .cheatsheet-row (filter + roving focus) ---
const rowCount = (block.match(/class="cheatsheet-row"/g) || []).length;
ok(rowCount >= 6, `>= 6 cheatsheet-rows in the group (got ${rowCount})`);

// --- 5. The documented features actually EXIST elsewhere in the popup
//        (the cheatsheet must be honest — no phantom features). ---
ok(/id="export-btn"/.test(html), "real Export button exists");
ok(/id="import-btn"/.test(html), "real Import button exists");
ok(/id="s-density-preview"/.test(html), "real density control exists");
ok(/id="site-rules-section"/.test(html), "real per-site rules section exists");
ok(/<span class="trash-title">Privacy audit<\/span>/.test(html), "real privacy audit section exists");
ok(/Blur previews until I hover/.test(html), "real blur-previews toggle exists");

// --- 6. Filter behaviour over the new rows (live module) ---
const densityRowText = "Density Comfortable / cozy / compact row height";
const rulesRowText = "Per-site rules Auto tag / pin / redact / lock by host";
const auditRowText = "Privacy audit Log of recent redact / scrub / forget actions";
const importRowText = "Import Merge a JSON backup — dedupes by content";

ok(cheatsheetRowMatches(densityRowText, normaliseCheatFilter("density")), "'density' matches the Density row");
ok(cheatsheetRowMatches(rulesRowText, normaliseCheatFilter("redact")), "'redact' matches the Per-site rules row");
ok(cheatsheetRowMatches(auditRowText, normaliseCheatFilter("privacy")), "'privacy' matches the Privacy audit row");
ok(cheatsheetRowMatches(importRowText, normaliseCheatFilter("backup")), "'backup' matches the Import row");
ok(!cheatsheetRowMatches(densityRowText, normaliseCheatFilter("lightbox")), "'lightbox' does NOT match the Density row");
// Empty filter shows everything.
ok(cheatsheetRowMatches(rulesRowText, normaliseCheatFilter("")), "empty filter shows the Per-site rules row");
// Row text normalises (whitespace collapse) so a phrase match survives layout.
ok(cheatsheetRowText("  Per-site rules   Auto tag ").includes("per-site rules"), "row text normalises the settings label");

rmSync(dir, { recursive: true, force: true });
console.log(`cheatsheet-settings sanity: ${pass}/${pass + fail} pass`);
if (fail > 0) process.exit(1);
