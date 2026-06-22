/**
 * Sanity: site-rules-io serialize / parse / merge round-trips.
 *
 * Pure module — no IDB, no DOM. We bundle src/lib/site-rules-io.ts
 * via esbuild and exercise:
 *   - serializeRules / stringifyRules shape
 *   - parseRulesJson: happy path + every defensive guard
 *   - mergeRules: merge mode (incoming overrides same-host) +
 *     replace mode (wipe everything, take incoming)
 *   - round-trip preservation across all flag combinations
 *
 * Run with: node .cron-state/sanity-site-rules-io.mjs
 */
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const tmp = mkdtempSync(join(tmpdir(), "ctxclip-site-rules-io-"));
const entry = join(tmp, "entry.mjs");
writeFileSync(
  entry,
  `import * as io from ${JSON.stringify(resolve(repoRoot, "src/lib/site-rules-io.ts"))};
globalThis.__IO = io;`,
);
await build({
  entryPoints: [entry],
  bundle: true,
  format: "esm",
  platform: "neutral",
  outfile: join(tmp, "out.mjs"),
  logLevel: "silent",
});
await import(join(tmp, "out.mjs"));
const IO = globalThis.__IO;

let pass = 0, fail = 0;
function ok(label, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`  FAIL  ${label}`); }
}
function eq(label, a, b) {
  ok(`${label} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`, JSON.stringify(a) === JSON.stringify(b));
}

// Helper: build a live-shape rule.
function r(hostPattern, extras = {}) {
  return {
    id: `sr_${hostPattern.replace(/\W/g, "_")}`,
    hostPattern,
    createdAt: 1_700_000_000_000,
    ...extras,
  };
}

// ---- serializeRules / stringifyRules ----------------------------------
{
  const bundle = IO.serializeRules([
    r("github.com", { autoPin: true, autoTags: ["dev", "code"] }),
    r("*.bank.com", { autoRedact: true, customPatterns: ["ACC-\\d+"] }),
  ]);
  ok("envelope version=1", bundle.version === 1);
  ok("envelope source marker", bundle.source === "context-clipboard-site-rules");
  ok("envelope exportedAt is number", typeof bundle.exportedAt === "number");
  ok("envelope has 2 rules", bundle.rules.length === 2);
  // id + createdAt dropped from serialized rows
  ok("serialized: no id", !("id" in bundle.rules[0]));
  ok("serialized: no createdAt", !("createdAt" in bundle.rules[0]));
  // booleans preserved
  ok("serialized: autoPin preserved", bundle.rules[0].autoPin === true);
  ok("serialized: autoRedact preserved", bundle.rules[1].autoRedact === true);
  ok("serialized: autoTags preserved", JSON.stringify(bundle.rules[0].autoTags) === JSON.stringify(["dev", "code"]));
  // customPatterns preserved
  ok("serialized: customPatterns preserved", bundle.rules[1].customPatterns[0] === "ACC-\\d+");
  // stringifyRules round-trips through JSON
  const text = IO.stringifyRules([r("github.com")]);
  const back = JSON.parse(text);
  ok("stringify: valid JSON", back.version === 1);
  ok("stringify: pretty-printed (multi-line)", text.includes("\n"));
}

// Falsey flags drop out of the serialized shape (no noise).
{
  const bundle = IO.serializeRules([r("plain.com")]);
  ok("serialized: no autoPin when false", !("autoPin" in bundle.rules[0]));
  ok("serialized: no autoRedact when false", !("autoRedact" in bundle.rules[0]));
  ok("serialized: no skipCapture when false", !("skipCapture" in bundle.rules[0]));
  ok("serialized: no autoTags when empty", !("autoTags" in bundle.rules[0]));
  ok("serialized: no customPatterns when empty", !("customPatterns" in bundle.rules[0]));
}

// ---- parseRulesJson ---------------------------------------------------
// Happy path: envelope round-trips.
{
  const original = IO.stringifyRules([
    r("github.com", { autoPin: true }),
    r("*.bank.com", { autoRedact: true, customPatterns: ["ACC-\\d+"] }),
  ]);
  const parsed = IO.parseRulesJson(original);
  ok("parse envelope: ok", parsed.ok);
  ok("parse envelope: 2 rules", parsed.rules.length === 2);
  ok("parse envelope: no drops", parsed.dropped === 0);
  ok("parse envelope: rule 0 host", parsed.rules[0].hostPattern === "github.com");
  ok("parse envelope: rule 0 autoPin true", parsed.rules[0].autoPin === true);
  ok("parse envelope: wildcard preserved", parsed.rules[1].hostPattern === "*.bank.com");
}

// Bare array also works (hand-rolled paste).
{
  const text = JSON.stringify([{ hostPattern: "github.com", autoPin: true }]);
  const parsed = IO.parseRulesJson(text);
  ok("parse bare array: ok", parsed.ok);
  ok("parse bare array: 1 rule", parsed.rules.length === 1);
}

// Defensive: empty input → ok=false.
{
  const parsed = IO.parseRulesJson("");
  ok("parse empty: ok=false", parsed.ok === false);
  ok("parse empty: reason=empty", parsed.reason === "empty");
}

// Defensive: invalid JSON.
{
  const parsed = IO.parseRulesJson("not json {");
  ok("parse invalid: ok=false", parsed.ok === false);
  ok("parse invalid: reason mentions JSON", parsed.reason === "invalid JSON");
}

// Defensive: wrong shape (no rules array).
{
  const parsed = IO.parseRulesJson(JSON.stringify({ version: 1 }));
  ok("parse missing rules: ok=false", parsed.ok === false);
}

// Defensive: unsupported version.
{
  const parsed = IO.parseRulesJson(JSON.stringify({ version: 99, rules: [] }));
  ok("parse v99: ok=false", parsed.ok === false);
  ok("parse v99: reason mentions version", parsed.reason.includes("99"));
}

// Defensive: per-row validation drops bad rows but keeps good ones.
{
  const text = JSON.stringify({
    version: 1,
    rules: [
      { hostPattern: "github.com" }, // good
      { hostPattern: "" }, // blank
      { hostPattern: "has space.com" }, // whitespace in host
      { hostPattern: "**.bad" }, // double-glob
      { hostPattern: "*." }, // empty wildcard tail
      { hostPattern: "weird.com*" }, // trailing wildcard
      { hostPattern: "good2.com", autoPin: "yes" }, // truthy non-bool → autoPin dropped
      null, // garbage
      "string", // garbage
      { hostPattern: "good3.com", customPatterns: ["[bad regex"] }, // pattern fails compile → dropped from row
    ],
  });
  const parsed = IO.parseRulesJson(text);
  ok("parse defensive: ok=true", parsed.ok);
  ok("parse defensive: kept 3 rows", parsed.rules.length === 3);
  ok("parse defensive: dropped 7", parsed.dropped === 7);
  ok("parse defensive: good rows present", parsed.rules.map((r) => r.hostPattern).sort().join(",") === "github.com,good2.com,good3.com");
  ok("parse defensive: truthy non-bool autoPin dropped", !parsed.rules.find((r) => r.hostPattern === "good2.com").autoPin);
  ok("parse defensive: bad pattern dropped from good3.com", !parsed.rules.find((r) => r.hostPattern === "good3.com").customPatterns);
}

// Host normalisation: lowercase + trim.
{
  const text = JSON.stringify({
    version: 1,
    rules: [{ hostPattern: "  GITHUB.COM  " }],
  });
  const parsed = IO.parseRulesJson(text);
  ok("parse host normalisation: lowercased + trimmed", parsed.rules[0].hostPattern === "github.com");
}

// Tags cap + trim.
{
  const tags = Array.from({ length: 30 }, (_, i) => `tag${i}`);
  const text = JSON.stringify({
    version: 1,
    rules: [{ hostPattern: "x.com", autoTags: tags }],
  });
  const parsed = IO.parseRulesJson(text);
  ok("parse tags cap: capped at 20", parsed.rules[0].autoTags.length === 20);
}

// ---- mergeRules: merge mode -------------------------------------------
{
  const live = [
    r("github.com", { autoPin: true }),
    r("bank.com", { autoRedact: true }),
  ];
  const incoming = [
    { hostPattern: "github.com", autoPin: false, autoTags: ["new"] }, // updates github
    { hostPattern: "twitter.com", autoTags: ["social"] }, // adds
  ];
  const result = IO.mergeRules(live, incoming, "merge", 1_800_000_000_000);
  ok("merge: added=1", result.added === 1);
  ok("merge: updated=1", result.updated === 1);
  ok("merge: removed=0", result.removed === 0);
  ok("merge: 3 rules total", result.next.length === 3);
  // github should be updated in place (preserves id + createdAt)
  const github = result.next.find((r) => r.hostPattern === "github.com");
  ok("merge: github id preserved", github.id === "sr_github_com");
  ok("merge: github createdAt preserved", github.createdAt === live[0].createdAt);
  ok("merge: github autoTags updated", JSON.stringify(github.autoTags) === JSON.stringify(["new"]));
  ok("merge: github autoPin updated", github.autoPin === false);
  // bank stays
  const bank = result.next.find((r) => r.hostPattern === "bank.com");
  ok("merge: bank untouched", bank.id === "sr_bank_com");
  // twitter appended
  const twitter = result.next.find((r) => r.hostPattern === "twitter.com");
  ok("merge: twitter id fresh", twitter.id.startsWith("sr_"));
  ok("merge: twitter at end of list", result.next[2].hostPattern === "twitter.com");
}

// Merge: incoming with NO collisions — pure additive.
{
  const live = [r("github.com")];
  const incoming = [{ hostPattern: "twitter.com" }, { hostPattern: "linkedin.com" }];
  const result = IO.mergeRules(live, incoming, "merge");
  ok("merge no-collide: added=2", result.added === 2);
  ok("merge no-collide: updated=0", result.updated === 0);
  ok("merge no-collide: 3 rules", result.next.length === 3);
  ok("merge no-collide: original preserved at idx 0", result.next[0].hostPattern === "github.com");
}

// Merge: empty incoming → no-op.
{
  const live = [r("github.com")];
  const result = IO.mergeRules(live, [], "merge");
  ok("merge empty incoming: added=0", result.added === 0);
  ok("merge empty incoming: live preserved", result.next.length === 1);
}

// ---- mergeRules: replace mode -----------------------------------------
{
  const live = [
    r("github.com", { autoPin: true }),
    r("bank.com", { autoRedact: true }),
  ];
  const incoming = [
    { hostPattern: "twitter.com", autoTags: ["social"] },
  ];
  const result = IO.mergeRules(live, incoming, "replace");
  ok("replace: added=1", result.added === 1);
  ok("replace: updated=0", result.updated === 0);
  ok("replace: removed=2", result.removed === 2);
  ok("replace: 1 rule total", result.next.length === 1);
  ok("replace: twitter only", result.next[0].hostPattern === "twitter.com");
  ok("replace: fresh id", result.next[0].id.startsWith("sr_"));
}

// Replace with empty incoming wipes everything.
{
  const live = [r("github.com"), r("bank.com")];
  const result = IO.mergeRules(live, [], "replace");
  ok("replace empty: removed=2", result.removed === 2);
  ok("replace empty: 0 rules", result.next.length === 0);
}

// Replace with empty live + some incoming = simple add.
{
  const result = IO.mergeRules([], [{ hostPattern: "github.com" }], "replace");
  ok("replace empty live: added=1", result.added === 1);
  ok("replace empty live: removed=0", result.removed === 0);
}

// ---- mergeRules: input arrays NOT mutated -----------------------------
{
  const live = [r("github.com")];
  const incoming = [{ hostPattern: "twitter.com" }];
  const liveCopy = [...live];
  const incCopy = [...incoming];
  IO.mergeRules(live, incoming, "merge");
  ok("merge: live not mutated (length)", live.length === liveCopy.length);
  ok("merge: incoming not mutated (length)", incoming.length === incCopy.length);
  ok("merge: incoming[0] unchanged", incoming[0].hostPattern === "twitter.com");
}

// ---- Round-trip: every flag survives serialize → parse → merge -------
{
  const original = [
    r("github.com", {
      autoPin: true,
      autoRedact: true,
      skipCapture: true,
      autoScrubOrigin: true,
      autoTags: ["a", "b"],
      customPatterns: ["FOO-\\d+"],
    }),
  ];
  const text = IO.stringifyRules(original);
  const parsed = IO.parseRulesJson(text);
  ok("round-trip: parse ok", parsed.ok);
  const merged = IO.mergeRules([], parsed.rules, "merge");
  const out = merged.next[0];
  ok("round-trip: hostPattern", out.hostPattern === "github.com");
  ok("round-trip: autoPin", out.autoPin === true);
  ok("round-trip: autoRedact", out.autoRedact === true);
  ok("round-trip: skipCapture", out.skipCapture === true);
  ok("round-trip: autoScrubOrigin", out.autoScrubOrigin === true);
  ok("round-trip: autoTags", JSON.stringify(out.autoTags) === JSON.stringify(["a", "b"]));
  ok("round-trip: customPatterns", JSON.stringify(out.customPatterns) === JSON.stringify(["FOO-\\d+"]));
}

rmSync(tmp, { recursive: true, force: true });
console.log(`${pass}/${pass + fail} site-rules-io sanity checks passed`);
if (fail > 0) process.exit(1);
