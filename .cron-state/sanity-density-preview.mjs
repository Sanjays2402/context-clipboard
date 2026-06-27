// Sanity: settings density-preview model (lib/density-preview).
//
// The Row-density control pairs with a live preview: three stub clip
// rows rendered at the chosen density (scoped class so the live list
// isn't touched) + a caption naming the trade-off. This harness builds
// the real module with esbuild and exercises the pure helpers.
//
// Coverage:
//   1. densityPreviewRows: fixed 3 representative rows (title/meta/tag).
//   2. densityPreviewClass: scoped class per density (comfortable = base,
//      cozy/compact add a modifier); NOT the global body class.
//   3. densityPreviewCaption: names the density + its trade-off.
//   4. defensive: unknown/null density -> comfortable.

import { build } from "esbuild";
import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const dir = mkdtempSync(join(tmpdir(), "ctxclip-density-preview-"));
await build({
  entryPoints: ["src/lib/density-preview.ts"],
  bundle: true,
  format: "esm",
  outfile: join(dir, "density-preview.mjs"),
  platform: "neutral",
  target: "es2022",
  sourcemap: false,
});
const mod = await import("file://" + join(dir, "density-preview.mjs"));
const { densityPreviewRows, densityPreviewClass, densityPreviewCaption, DENSITIES } = mod;

let pass = 0;
let total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}
function checkTrue(name, got) {
  total++;
  if (got === true) pass++;
  else console.error("FAIL", name, "expected true, got", JSON.stringify(got));
}

// 1. rows
const rows = densityPreviewRows();
check("rows: exactly 3 stub rows", rows.length, 3);
checkTrue("rows: each has title/meta/tag",
  rows.every((r) => typeof r.title === "string" && r.title.length > 0 &&
    typeof r.meta === "string" && r.meta.length > 0 &&
    typeof r.tag === "string" && r.tag.length > 0));
checkTrue("rows: deterministic (same content each call)",
  JSON.stringify(densityPreviewRows()) === JSON.stringify(rows));

// 2. scoped class — comfortable is the base, cozy/compact add a modifier
check("class: comfortable = base only", densityPreviewClass("comfortable"), "density-preview");
check("class: cozy adds modifier", densityPreviewClass("cozy"), "density-preview density-preview--cozy");
check("class: compact adds modifier", densityPreviewClass("compact"), "density-preview density-preview--compact");
// Must NOT be the global body class (compact-rows / cozy-rows) — that
// would compact the live list behind the panel.
checkTrue("class: never emits the global body class",
  !densityPreviewClass("compact").includes("compact-rows") &&
  !densityPreviewClass("cozy").includes("cozy-rows"));

// 3. caption — names density + trade-off, distinct per tier
const capComfort = densityPreviewCaption("comfortable");
const capCozy = densityPreviewCaption("cozy");
const capCompact = densityPreviewCaption("compact");
checkTrue("caption: comfortable names it", /comfortable/i.test(capComfort));
checkTrue("caption: cozy names it", /cozy/i.test(capCozy));
checkTrue("caption: compact names it", /compact/i.test(capCompact));
checkTrue("caption: all three distinct",
  capComfort !== capCozy && capCozy !== capCompact && capComfort !== capCompact);

// 4. defensive — unknown/null density -> comfortable behaviour
check("defensive: unknown class -> base", densityPreviewClass("huge"), "density-preview");
check("defensive: null class -> base", densityPreviewClass(null), "density-preview");
check("defensive: undefined class -> base", densityPreviewClass(undefined), "density-preview");
check("defensive: unknown caption -> comfortable", densityPreviewCaption("huge"), capComfort);
check("defensive: null caption -> comfortable", densityPreviewCaption(null), capComfort);

// DENSITIES re-export present + ordered
check("DENSITIES re-exported in order", DENSITIES, ["comfortable", "cozy", "compact"]);

console.log(`density-preview sanity: ${pass}/${total} pass`);
if (pass !== total) process.exit(1);
