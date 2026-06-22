// Sanity for lib/template-token-count.ts — pure module so we transpile + load.
// Mirrors the contract:
//   countTemplateTokens(body) -> { placeholders, unique, names }
//   formatTokenPillLabel(count) -> "1 token: x" / "1 token × N" / "N tokens" / "N tokens · M placeholders" / null
//   formatTokenPillTooltip(count, maxNames=8) -> "N unique · M placeholders (a, b, ...) — will expand on copy" / null
//
// Grammar must match src/lib/templates.ts: /\{\{\s*([a-zA-Z][a-zA-Z0-9_-]*)\s*(?:\|([^}]*?))?\s*\}\}/g
// Empty {{}}, digit-start {{1bad}}, unclosed {{x — all invalid.

import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = process.cwd();
const src = join(repo, "src/lib/template-token-count.ts");
const tmp = mkdtempSync(join(tmpdir(), "ttc-"));
const outFile = join(tmp, "out.mjs");
execSync(`node_modules/.bin/esbuild --bundle --format=esm --platform=neutral --target=es2022 --outfile=${outFile} ${src}`, {
  cwd: repo,
  stdio: ["ignore", "ignore", "inherit"],
});
const { countTemplateTokens, formatTokenPillLabel, formatTokenPillTooltip } = await import(outFile);

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; } else { fail++; console.error(`FAIL ${name}: ${detail || ""}`); }
}
function eq(name, got, want) {
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
}

// --- countTemplateTokens: defensive inputs --------------------------
eq("count null",       countTemplateTokens(null),        { placeholders: 0, unique: 0, names: [] });
eq("count undefined",  countTemplateTokens(undefined),   { placeholders: 0, unique: 0, names: [] });
eq("count number",     countTemplateTokens(42),          { placeholders: 0, unique: 0, names: [] });
eq("count object",     countTemplateTokens({}),          { placeholders: 0, unique: 0, names: [] });
eq("count array",      countTemplateTokens([]),          { placeholders: 0, unique: 0, names: [] });
eq("count empty",      countTemplateTokens(""),          { placeholders: 0, unique: 0, names: [] });
eq("count whitespace", countTemplateTokens("   \n\t  "), { placeholders: 0, unique: 0, names: [] });

// --- countTemplateTokens: plain text (no tokens) --------------------
eq("plain text", countTemplateTokens("hello world"), { placeholders: 0, unique: 0, names: [] });
eq("almost-token open", countTemplateTokens("{{ foo"), { placeholders: 0, unique: 0, names: [] });
eq("almost-token close", countTemplateTokens("foo }}"), { placeholders: 0, unique: 0, names: [] });
eq("empty braces", countTemplateTokens("{{}}"), { placeholders: 0, unique: 0, names: [] });
eq("digit-start invalid", countTemplateTokens("{{1bad}}"), { placeholders: 0, unique: 0, names: [] });
eq("hash invalid", countTemplateTokens("{{#nope}}"), { placeholders: 0, unique: 0, names: [] });
eq("unclosed", countTemplateTokens("{{date"), { placeholders: 0, unique: 0, names: [] });

// --- countTemplateTokens: single token ------------------------------
eq("one token",          countTemplateTokens("Hi {{name}}"),   { placeholders: 1, unique: 1, names: ["name"] });
eq("one token w fallback", countTemplateTokens("{{name|guest}}"), { placeholders: 1, unique: 1, names: ["name"] });
eq("one token w hyphen", countTemplateTokens("{{my-token}}"),  { placeholders: 1, unique: 1, names: ["my-token"] });
eq("one token w underscore", countTemplateTokens("{{my_token}}"), { placeholders: 1, unique: 1, names: ["my_token"] });
eq("one token w digits", countTemplateTokens("{{token1}}"),    { placeholders: 1, unique: 1, names: ["token1"] });
eq("one token w whitespace inside", countTemplateTokens("{{  date  }}"), { placeholders: 1, unique: 1, names: ["date"] });

// --- countTemplateTokens: repeated token (1 unique, N placeholders) -
eq("repeated same case", countTemplateTokens("{{date}} {{date}}"), { placeholders: 2, unique: 1, names: ["date"] });
eq("repeated mixed case", countTemplateTokens("{{Date}} {{date}} {{DATE}}"), { placeholders: 3, unique: 1, names: ["date"] });
eq("repeated 5x", countTemplateTokens("{{x}}{{x}}{{x}}{{x}}{{x}}"), { placeholders: 5, unique: 1, names: ["x"] });

// --- countTemplateTokens: multiple unique ---------------------------
eq("two unique", countTemplateTokens("{{date}} {{host}}"), { placeholders: 2, unique: 2, names: ["date", "host"] });
eq("three unique sorted", countTemplateTokens("{{zebra}} {{alpha}} {{mango}}"), { placeholders: 3, unique: 3, names: ["alpha", "mango", "zebra"] });
eq("mixed unique + repeats", countTemplateTokens("{{user}} said {{user}} on {{date}}"), { placeholders: 3, unique: 2, names: ["date", "user"] });
eq("fallback ignored in name", countTemplateTokens("{{title|untitled}} {{TITLE|other}}"), { placeholders: 2, unique: 1, names: ["title"] });

// --- countTemplateTokens: realistic snippets ------------------------
eq("realistic chat", countTemplateTokens("Hi from {{host}} on {{date}}\nPR: {{title|untitled}} <{{url}}>"),
   { placeholders: 4, unique: 4, names: ["date", "host", "title", "url"] });
eq("realistic uuid", countTemplateTokens("{{uuid}}-{{time}}-{{uuid}}"),
   { placeholders: 3, unique: 2, names: ["time", "uuid"] });

// --- countTemplateTokens: stateless regex (no lastIndex leak) -------
const body1 = "{{a}} {{b}}";
const body2 = "{{c}}";
const r1 = countTemplateTokens(body1);
const r2 = countTemplateTokens(body2);
const r1b = countTemplateTokens(body1);
eq("stateless 1st", r1, { placeholders: 2, unique: 2, names: ["a", "b"] });
eq("stateless 2nd", r2, { placeholders: 1, unique: 1, names: ["c"] });
eq("stateless 1st-repeat", r1b, { placeholders: 2, unique: 2, names: ["a", "b"] });

// --- formatTokenPillLabel -------------------------------------------
eq("label zero",  formatTokenPillLabel({ placeholders: 0, unique: 0, names: [] }), null);
eq("label 1u 1p", formatTokenPillLabel({ placeholders: 1, unique: 1, names: ["date"] }), "1 token: date");
eq("label 1u 3p", formatTokenPillLabel({ placeholders: 3, unique: 1, names: ["x"] }), "1 token × 3");
eq("label 3u 3p", formatTokenPillLabel({ placeholders: 3, unique: 3, names: ["a", "b", "c"] }), "3 tokens");
eq("label 2u 5p", formatTokenPillLabel({ placeholders: 5, unique: 2, names: ["a", "b"] }), "2 tokens · 5 placeholders");
eq("label edge unique=0 placeholders>0", formatTokenPillLabel({ placeholders: 2, unique: 0, names: [] }), null);

// --- formatTokenPillTooltip -----------------------------------------
eq("tip zero", formatTokenPillTooltip({ placeholders: 0, unique: 0, names: [] }), null);
eq("tip edge unique=0", formatTokenPillTooltip({ placeholders: 2, unique: 0, names: [] }), null);
eq("tip 1u 1p", formatTokenPillTooltip({ placeholders: 1, unique: 1, names: ["date"] }),
   "1 unique token (date) — will expand on copy");
eq("tip 1u 3p", formatTokenPillTooltip({ placeholders: 3, unique: 1, names: ["x"] }),
   "1 unique · 3 placeholders (x) — will expand on copy");
eq("tip 3u 3p", formatTokenPillTooltip({ placeholders: 3, unique: 3, names: ["a", "b", "c"] }),
   "3 unique tokens (a, b, c) — will expand on copy");
eq("tip 2u 5p", formatTokenPillTooltip({ placeholders: 5, unique: 2, names: ["x", "y"] }),
   "2 unique · 5 placeholders (x, y) — will expand on copy");
eq("tip cap default 8", formatTokenPillTooltip({ placeholders: 10, unique: 10, names: ["a","b","c","d","e","f","g","h","i","j"] }),
   "10 unique tokens (a, b, c, d, e, f, g, h + 2 more) — will expand on copy");
eq("tip cap small", formatTokenPillTooltip({ placeholders: 3, unique: 3, names: ["a","b","c"] }, 1),
   "3 unique tokens (a + 2 more) — will expand on copy");
eq("tip cap zero coerces to 1", formatTokenPillTooltip({ placeholders: 3, unique: 3, names: ["a","b","c"] }, 0),
   "3 unique tokens (a + 2 more) — will expand on copy");
eq("tip cap negative coerces to 1", formatTokenPillTooltip({ placeholders: 3, unique: 3, names: ["a","b","c"] }, -5),
   "3 unique tokens (a + 2 more) — will expand on copy");
eq("tip cap fractional floor", formatTokenPillTooltip({ placeholders: 3, unique: 3, names: ["a","b","c"] }, 2.9),
   "3 unique tokens (a, b + 1 more) — will expand on copy");

// --- End-to-end realistic flows -------------------------------------
const realisticBody = "Hello {{name|friend}}, today is {{date}} ({{weekday}}). From {{host}}: {{url}}";
const realCount = countTemplateTokens(realisticBody);
eq("realistic count", realCount, { placeholders: 5, unique: 5, names: ["date", "host", "name", "url", "weekday"] });
eq("realistic label", formatTokenPillLabel(realCount), "5 tokens");
eq("realistic tooltip", formatTokenPillTooltip(realCount),
   "5 unique tokens (date, host, name, url, weekday) — will expand on copy");

const repeatedBody = "{{user}} said hello. {{user}} typed a message. {{user}} closed the tab.";
const repeatedCount = countTemplateTokens(repeatedBody);
eq("repeated count", repeatedCount, { placeholders: 3, unique: 1, names: ["user"] });
eq("repeated label", formatTokenPillLabel(repeatedCount), "1 token × 3");
eq("repeated tooltip", formatTokenPillTooltip(repeatedCount),
   "1 unique · 3 placeholders (user) — will expand on copy");

// --- cleanup --------------------------------------------------------
rmSync(tmp, { recursive: true, force: true });

console.log(`template-token-count sanity: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
