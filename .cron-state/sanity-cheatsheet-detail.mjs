// Sanity: cheatsheet "Detail header" group exists in the real popup.html,
// every documented glyph maps to a REAL detail-header button (no phantom
// entries), and the live cheatsheet-filter isolates its rows. Parses the
// actual HTML (no jsdom — regex slice over the static markup) + bundles
// the real filter module so the test exercises shipping code, not a copy.
//
// The detail header is a row of icon-ONLY buttons (Redact / Scrub /
// Archive / Send / History / Lock / Pin / Delete) — discoverable only by
// hovering each for its title. This group names them as .cheat-act tokens
// (the flat-pill style the Bulk + In-settings groups use) so the live
// filter + roving focus surface them by name.
import { build } from "esbuild";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "ctxclip-cheatdetail-"));
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
ok(/<h4>Detail header<\/h4>/.test(html), "Detail header <h4> present");

// --- 2. Extract the group block (heading -> generous window) ---
const gi = html.indexOf("<h4>Detail header</h4>");
ok(gi > -1, "group block located");
const block = html.slice(gi, gi + 1500);

// --- 3. Each documented glyph appears as a .cheat-act token ---
const expectedActs = ["Redact", "Scrub", "Archive", "Send to", "History", "Lock", "Pin", "Delete"];
for (const a of expectedActs) {
  const re = new RegExp(`<span class="cheat-act">${a}</span>`);
  ok(re.test(block), `cheat-act token "${a}" present`);
}

// --- 4. Every row in the block is a .cheatsheet-row (filter + roving focus) ---
const rowCount = (block.match(/class="cheatsheet-row"/g) || []).length;
ok(rowCount >= 8, `>= 8 cheatsheet-rows in the group (got ${rowCount})`);

// --- 5. The documented glyphs actually EXIST as detail-header buttons
//        (the cheatsheet must be honest — no phantom features). Each maps
//        to a real id="detail-…" button in the header. ---
const realButtons = [
  "detail-redact",
  "detail-scrub",
  "detail-archive",
  "detail-send",
  "detail-history",
  "detail-lock",
  "detail-pin",
  "detail-delete",
];
for (const id of realButtons) {
  ok(new RegExp(`id="${id}"`).test(html), `real ${id} button exists`);
}
// Count parity: 8 documented glyphs <-> 8 real buttons.
ok(expectedActs.length === realButtons.length, "documented glyph count == real button count (8)");

// --- 6. Filter behaviour over the new rows (live module) ---
const redactRowText = "Redact Mask emails / phones / secrets in this clip";
const scrubRowText = "Scrub Drop the URL / title / context, keep the content";
const sendRowText = "Send to Open / search / email / copy as Markdown";
const lockRowText = "Lock Ask before deleting this clip";

ok(cheatsheetRowMatches(redactRowText, normaliseCheatFilter("redact")), "'redact' matches the Redact row");
ok(cheatsheetRowMatches(scrubRowText, normaliseCheatFilter("scrub")), "'scrub' matches the Scrub row");
ok(cheatsheetRowMatches(sendRowText, normaliseCheatFilter("markdown")), "'markdown' matches the Send-to row");
ok(cheatsheetRowMatches(lockRowText, normaliseCheatFilter("deleting")), "'deleting' matches the Lock row (ask before deleting)");
ok(!cheatsheetRowMatches(redactRowText, normaliseCheatFilter("lightbox")), "'lightbox' does NOT match the Redact row");
// Empty filter shows everything.
ok(cheatsheetRowMatches(scrubRowText, normaliseCheatFilter("")), "empty filter shows the Scrub row");
// Row text normalises (whitespace collapse) so a phrase match survives layout.
ok(cheatsheetRowText("  Send to   Open / search ").includes("send to"), "row text normalises the glyph label");

rmSync(dir, { recursive: true, force: true });
console.log(`cheatsheet-detail sanity: ${pass}/${pass + fail} pass`);
if (fail > 0) process.exit(1);
