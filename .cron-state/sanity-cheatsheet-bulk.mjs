// Sanity: cheatsheet "Bulk actions" group exists in the real popup.html
// and the live cheatsheet-filter isolates its rows. Parses the actual
// HTML (no jsdom — regex slice over the static markup) + bundles the
// real filter module so the test exercises shipping code, not a copy.
import { build } from "esbuild";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "ctxclip-cheatbulk-"));
const out = join(dir, "cheatsheet-filter.mjs");
await build({ entryPoints: ["src/lib/cheatsheet-filter.ts"], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
const { cheatsheetRowMatches, cheatsheetRowText, normaliseCheatFilter } = await import(pathToFileURL(out).href);

const html = readFileSync("src/popup/popup.html", "utf8");
const css = readFileSync("src/popup/popup.css", "utf8");

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
ok(/<h4>Bulk actions<\/h4>/.test(html), "Bulk actions <h4> present");

// --- 2. Extract the group block (heading -> next </div> group close) ---
const gi = html.indexOf("<h4>Bulk actions</h4>");
ok(gi > -1, "group block located");
// Slice a generous window covering the group's rows.
const block = html.slice(gi, gi + 1800);

// --- 3. Each expected bulk action appears as a .cheat-act token ---
const expectedActs = [
  "Copy",
  "Copy as Markdown",
  "Export",
  "Tag",
  "Note",
  "Pin",
  "Lock",
  "Lock + pin",
  "Delete",
];
for (const a of expectedActs) {
  const re = new RegExp(`<span class="cheat-act">${a.replace(/[+]/g, "\\+")}</span>`);
  ok(re.test(block), `cheat-act token "${a}" present`);
}

// --- 4. The Esc-clears-selection row uses a real <kbd> (it IS a key) ---
ok(/<kbd>Esc<\/kbd><span>Clear the selection/.test(block), "Esc row is a kbd, not a cheat-act");

// --- 5. Every row in the block is a .cheatsheet-row (filter + roving focus pick them up) ---
const rowCount = (block.match(/class="cheatsheet-row"/g) || []).length;
ok(rowCount >= 10, `>= 10 cheatsheet-rows in the group (got ${rowCount})`);

// --- 6. CSS for the new token exists + sits left (overrides right-aligned span) ---
ok(/\.cheatsheet-row \.cheat-act\s*\{/.test(css), ".cheat-act CSS rule present");
ok(/\.cheat-act[\s\S]*?text-align:\s*left/.test(css), ".cheat-act is left-aligned");
ok(/\.cheat-act[\s\S]*?margin-left:\s*0/.test(css), ".cheat-act resets the right-float margin");

// --- 7. Filter behaviour over the new rows (live module) ---
// Reconstruct a couple of rows' textContent the way the DOM would.
const lockRowText = "Lock Toggle confirm-before-delete";
const exportRowText = "Export Selection to JSON (optional tag filter)";
const copyMdRowText = "Copy as Markdown Each clip in its source-cited block";

ok(cheatsheetRowMatches(lockRowText, normaliseCheatFilter("lock")), "'lock' matches the Lock row");
ok(cheatsheetRowMatches(exportRowText, normaliseCheatFilter("json")), "'json' matches the Export row");
ok(cheatsheetRowMatches(copyMdRowText, normaliseCheatFilter("markdown")), "'markdown' matches the Copy-as-MD row");
ok(!cheatsheetRowMatches(lockRowText, normaliseCheatFilter("image")), "'image' does NOT match the Lock row");
// Empty filter shows everything.
ok(cheatsheetRowMatches(exportRowText, normaliseCheatFilter("")), "empty filter shows the Export row");
// Row text normalises (whitespace collapse) so a phrase match survives layout.
ok(cheatsheetRowText("  Lock + pin   Keep at top ").includes("lock + pin"), "row text normalises bulk action label");

rmSync(dir, { recursive: true, force: true });
console.log(`cheatsheet-bulk sanity: ${pass}/${pass + fail} pass`);
if (fail > 0) process.exit(1);
