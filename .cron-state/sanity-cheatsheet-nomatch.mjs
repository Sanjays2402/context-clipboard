// Sanity: cheatsheet no-match note names the missed query.
//
// When a filter narrows the `?` sheet to zero rows, the centered note used
// to read a flat "No shortcuts match that filter." This bundles the REAL
// lib/cheatsheet-filter so cheatsheetNoMatchText is exercised against
// shipping code: it should name the query ("No shortcut matches 'foo'.")
// and fall back to the generic line when the filter is off.
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "ctxclip-cheatnomatch-"));
const out = join(dir, "cheatsheet-filter.mjs");
await build({ entryPoints: ["src/lib/cheatsheet-filter.ts"], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
const { cheatsheetNoMatchText } = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const eq = (a, b, msg) => {
  if (a === b) pass++;
  else { fail++; console.error(`FAIL ${msg}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); }
};

// filter off -> generic line (note is hidden anyway, no query to name)
eq(cheatsheetNoMatchText(""), "No shortcuts match that filter.", "empty -> generic");
eq(cheatsheetNoMatchText("   "), "No shortcuts match that filter.", "whitespace -> generic");
eq(cheatsheetNoMatchText(null), "No shortcuts match that filter.", "null -> generic");
eq(cheatsheetNoMatchText(42), "No shortcuts match that filter.", "non-string -> generic");

// names the query (lowercased + trimmed, curly quotes)
eq(cheatsheetNoMatchText("lock"), "No shortcut matches \u2018lock\u2019.", "names lock");
eq(cheatsheetNoMatchText("  Lock  "), "No shortcut matches \u2018lock\u2019.", "trims + lowercases");
eq(cheatsheetNoMatchText("is:expired"), "No shortcut matches \u2018is:expired\u2019.", "operator query");

// caps long queries with an ellipsis so the note can't blow out
const long = "x".repeat(40);
eq(cheatsheetNoMatchText(long), `No shortcut matches \u2018${"x".repeat(24)}\u2026\u2019.`, "long query capped");

// strips embedded quotes + control chars so the wrap reads clean
eq(cheatsheetNoMatchText("a'b\"c"), "No shortcut matches \u2018abc\u2019.", "quotes stripped");
eq(cheatsheetNoMatchText("a\nb"), "No shortcut matches \u2018ab\u2019.", "control chars stripped");

rmSync(dir, { recursive: true, force: true });
console.log(`cheatsheet-nomatch sanity: ${pass}/${pass + fail} pass`);
if (fail > 0) process.exit(1);
