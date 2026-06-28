// Sanity: lib/empty-reassurance — the "empty is good news" gate for the
// clip-list empty state, now covering BOTH TTL operators (is:expired +
// is:expiring). esbuild-bundle the real TS to ESM, import, assert.
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "ctxclip-reassure-"));
const out = join(dir, "empty-reassurance.mjs");
await build({
  entryPoints: ["src/lib/empty-reassurance.ts"],
  bundle: true,
  format: "esm",
  outfile: out,
  logLevel: "silent",
});
const { emptyReassurance } = await import(pathToFileURL(out).href);

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

// --- is:expired: lone operator reassures with the past-due copy ---
const expired = emptyReassurance("is:expired");
eq(expired.reassure, true, "is:expired reassures");
eq(expired.headline, "Nothing past due", "is:expired headline");
eq(expired.subtext, "No clips have lapsed their TTL — nothing's about to be swept.", "is:expired subtext");

// --- is:expiring: the NEW sibling — lone operator reassures with timer copy ---
const expiring = emptyReassurance("is:expiring");
eq(expiring.reassure, true, "is:expiring reassures");
eq(expiring.headline, "Nothing on a timer", "is:expiring headline");
eq(expiring.subtext, "No clips have a TTL set — nothing's scheduled to expire.", "is:expiring subtext");

// --- the two TTL operators are DISTINCT copy (not the same message) ---
eq(expired.headline !== expiring.headline, true, "expired/expiring headlines differ");
eq(expired.subtext !== expiring.subtext, true, "expired/expiring subtexts differ");

// --- case-insensitive (parser lowercases is: values) ---
eq(emptyReassurance("IS:EXPIRING").reassure, true, "uppercase is:expiring reassures");
eq(emptyReassurance("Is:Expiring").headline, "Nothing on a timer", "mixed-case headline");

// --- whitespace tolerance: trim + collapse, lone operator survives ---
eq(emptyReassurance("  is:expiring  ").reassure, true, "padded is:expiring reassures");

// --- compound queries do NOT reassure (would over-claim) ---
eq(emptyReassurance("is:expiring host:github.com").reassure, false, "compound is:expiring no reassure");
eq(emptyReassurance("is:expired foo").reassure, false, "is:expired + word no reassure");
eq(emptyReassurance("is:expiring is:expired").reassure, false, "two operators no reassure");

// --- non-reassurance operators fall through to the generic hint ---
eq(emptyReassurance("is:pinned").reassure, false, "is:pinned not in map");
eq(emptyReassurance("is:archived").reassure, false, "is:archived not in map");
eq(emptyReassurance("kind:image").reassure, false, "kind:image not in map");

// --- empty / nullish input never reassures (no partial message) ---
eq(emptyReassurance("").reassure, false, "empty string no reassure");
eq(emptyReassurance("   ").reassure, false, "whitespace-only no reassure");
eq(emptyReassurance(null), { reassure: false, headline: "", subtext: "" }, "null -> NONE");
eq(emptyReassurance(undefined).reassure, false, "undefined no reassure");
eq(emptyReassurance(42).reassure, false, "non-string no reassure");

// --- a non-reassure result carries empty headline + subtext (caller never
//     renders a partial message) ---
const none = emptyReassurance("is:pinned");
eq(none.headline, "", "non-reassure headline empty");
eq(none.subtext, "", "non-reassure subtext empty");

rmSync(dir, { recursive: true, force: true });
console.log(`empty-reassurance sanity: ${pass}/${pass + fail} pass`);
if (fail > 0) process.exit(1);
