// Sanity: lib/note-tint-preview — the settings note caution-tint swatch.
// Bundles the REAL module (which delegates to lib/note-warning) so the
// preview's per-row verdicts are exercised against the SAME detector the
// palette tint + composer banner run on — no inline copy that could drift.
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "ctxclip-notetint-"));
async function load(entry, name) {
  const out = join(dir, name + ".mjs");
  await build({ entryPoints: [entry], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
  return import(pathToFileURL(out).href);
}
const { noteTintPreviewRows, noteTintPreviewCaption, noteTintPreviewRowCaption } = await load(
  "src/lib/note-tint-preview.ts",
  "note-tint-preview",
);
// Cross-check against the live detector the preview delegates to.
const { hasNoteWarning, firstWarningKeyword } = await load("src/lib/note-warning.ts", "note-warning");

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

const rows = noteTintPreviewRows();

// --- shape: at least one flagged + at least one plain (the contrast IS the lesson) ---
ok(rows.length >= 3, "at least 3 stub rows");
ok(rows.some((r) => r.flagged), "at least one flagged row");
ok(rows.some((r) => !r.flagged), "at least one plain row (baseline)");

// --- every row's verdict MATCHES the live detector (no drift) ---
for (const r of rows) {
  eq(r.flagged, hasNoteWarning(r.note), `flagged matches detector for "${r.note}"`);
  if (r.flagged) {
    eq(r.keyword, firstWarningKeyword(r.note), `keyword matches detector for "${r.note}"`);
    ok(r.keyword.length > 0, `flagged row carries a keyword: "${r.note}"`);
  } else {
    eq(r.keyword, "", `plain row has empty keyword: "${r.note}"`);
  }
}

// --- the specific stub notes trip / don't trip as designed ---
const byNote = (frag) => rows.find((r) => r.note.includes(frag));
ok(byNote("prod only").flagged, "prod caveat is flagged");
eq(byNote("prod only").keyword, "prod", "prod caveat keyword = prod");
ok(byNote("do not paste").flagged, "do-not-paste warning is flagged");
eq(byNote("do not paste").keyword, "do not", "do-not keyword = do not");
ok(byNote("staging URL").flagged, "staging URL is flagged");
eq(byNote("staging URL").keyword, "staging", "staging keyword = staging");
ok(!byNote("Q3 numbers").flagged, "ordinary reminder is NOT flagged");

// --- row caption grammar: names the keyword on flagged, empty on plain ---
eq(noteTintPreviewRowCaption(byNote("prod only")), "tinted: prod", "flagged row caption names keyword");
eq(noteTintPreviewRowCaption(byNote("Q3 numbers")), "", "plain row caption empty");
eq(noteTintPreviewRowCaption(null), "", "null row caption empty");
eq(noteTintPreviewRowCaption({ flagged: true, keyword: "" }), "tinted", "flagged-but-empty-keyword -> bare 'tinted'");
eq(noteTintPreviewRowCaption({ flagged: true, keyword: "  staging  " }), "tinted: staging", "caption trims keyword");

// --- top caption mentions the tint purpose + sample keywords ---
const cap = noteTintPreviewCaption();
ok(/caution keyword/i.test(cap), "caption mentions caution keyword");
ok(/warm-red/i.test(cap), "caption mentions the warm-red tint");

// --- determinism: same rows every call (pure) ---
eq(noteTintPreviewRows(), rows, "rows are deterministic");

rmSync(dir, { recursive: true, force: true });
console.log(`note-tint-preview sanity: ${pass}/${pass + fail} pass`);
if (fail > 0) process.exit(1);
