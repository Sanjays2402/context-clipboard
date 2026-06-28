// Sanity: ttl-banner pin-rescue cue parity across actionable tiers.
// Bundles the LIVE src module (the old sanity-ttl-banner.mjs inlined a
// stale copy and tested itself). Validates that imminent + soon now echo
// the rescue hint the expired tier already carried, plus tier boundaries.
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "ctxclip-ttlrescue-"));
const out = join(dir, "ttl-banner.mjs");
await build({ entryPoints: ["src/lib/ttl-banner.ts"], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
const { computeTtlBanner, TTL_RESCUE_HINT } = await import(pathToFileURL(out).href);

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const NOW = 1_700_000_000_000;

let pass = 0,
  total = 0;
const check = (name, got, want) => {
  total++;
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
};
const truthy = (name, got) => {
  total++;
  if (got) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got));
};

check("rescue hint constant", TTL_RESCUE_HINT, "pin to keep it");

// --- imminent tier (< 1h) carries the rescue cue ---
const imm = computeTtlBanner({ pinned: false, expiresAt: NOW + 12 * 60_000 }, NOW);
check("12m -> imminent", imm.tier, "imminent");
truthy("imminent detail starts 'at '", imm.detail.startsWith("at "));
truthy("imminent detail echoes rescue hint", imm.detail.includes(TTL_RESCUE_HINT));
truthy("imminent detail has em-dash seam", imm.detail.includes("\u2014"));

// --- soon tier (< 24h) carries the rescue cue ---
const soon = computeTtlBanner({ pinned: false, expiresAt: NOW + 3 * HOUR_MS + 12 * 60_000 }, NOW);
check("3h12m -> soon", soon.tier, "soon");
truthy("soon detail starts 'today at '", soon.detail.startsWith("today at "));
truthy("soon detail echoes rescue hint", soon.detail.includes(TTL_RESCUE_HINT));

// --- expired tier already had a rescue cue; still present (no regression) ---
const exp = computeTtlBanner({ pinned: false, expiresAt: NOW - 5 * 60_000 }, NOW);
check("expired tier", exp.tier, "expired");
truthy("expired detail mentions pinning", exp.detail.toLowerCase().includes("pin"));

// --- all three actionable tiers reference pinning (parity goal) ---
for (const [name, b] of [["imminent", imm], ["soon", soon], ["expired", exp]]) {
  truthy(`${name} tier references pinning`, b.detail.toLowerCase().includes("pin"));
}

// --- label text unchanged (cue lives in detail, not label) ---
check("imminent label unchanged", imm.label, "Expires in 12m");
check("soon label unchanged", soon.label, "Expires in 3h 12m");

// --- boundaries + short-circuits intact ---
check("exactly 1h -> soon (boundary)", computeTtlBanner({ pinned: false, expiresAt: NOW + HOUR_MS }, NOW).tier, "soon");
check("exactly 24h -> null (far future)", computeTtlBanner({ pinned: false, expiresAt: NOW + DAY_MS }, NOW), null);
check("pinned -> null", computeTtlBanner({ pinned: true, expiresAt: NOW + 1000 }, NOW), null);
check("no expiresAt -> null", computeTtlBanner({ pinned: false }, NOW), null);
check("far future -> null", computeTtlBanner({ pinned: false, expiresAt: NOW + 7 * DAY_MS }, NOW), null);

rmSync(dir, { recursive: true, force: true });
console.log(`ttl-rescue sanity: ${pass}/${total} pass`);
if (pass !== total) process.exit(1);
