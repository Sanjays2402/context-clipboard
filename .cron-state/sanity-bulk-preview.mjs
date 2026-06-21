/**
 * Sanity: bulk-preview confirm message builder.
 *
 * Bundles src/lib/bulk-preview.ts via esbuild and probes both
 * `buildBulkPreviewMessage` (multi-line confirm string) and the
 * `truncatePreview` helper.
 *
 * Run with: node .cron-state/sanity-bulk-preview.mjs
 */
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const dir = mkdtempSync(join(tmpdir(), "ctxclip-bulk-preview-"));
try {
  await build({
    entryPoints: ["src/lib/bulk-preview.ts"],
    bundle: true,
    format: "esm",
    outfile: join(dir, "bp.mjs"),
    platform: "neutral",
    target: "es2022",
    sourcemap: false,
  });
  const mod = await import("file://" + join(dir, "bp.mjs"));

  let pass = 0,
    total = 0;
  function check(name, got, want) {
    total++;
    if (got === want) pass++;
    else
      console.error(
        "FAIL",
        name,
        "got",
        JSON.stringify(got),
        "want",
        JSON.stringify(want),
      );
  }
  function checkContains(name, hay, needle) {
    total++;
    if (typeof hay === "string" && hay.includes(needle)) pass++;
    else console.error("FAIL", name, "missing", JSON.stringify(needle), "in", JSON.stringify(hay));
  }

  // --- truncatePreview ---
  check("trunc: preview wins over content", mod.truncatePreview({ preview: "hello", content: "world" }), "hello");
  check("trunc: falls back to content when preview is empty", mod.truncatePreview({ preview: "", content: "world" }), "world");
  check("trunc: falls back to content when preview missing", mod.truncatePreview({ content: "world" }), "world");
  check("trunc: empty body shows (empty)", mod.truncatePreview({}), "(empty)");
  check("trunc: whitespace-only body shows (empty)", mod.truncatePreview({ content: "   \n\t " }), "(empty)");
  check("trunc: collapses internal whitespace",
    mod.truncatePreview({ content: "line1\nline2\n\nline3" }), "line1 line2 line3");
  check("trunc: trims to max with ellipsis",
    mod.truncatePreview({ content: "x".repeat(80) }, 60), "x".repeat(60) + "…");
  check("trunc: under max returns unchanged",
    mod.truncatePreview({ content: "short" }, 60), "short");
  check("trunc: exact-max returns unchanged",
    mod.truncatePreview({ content: "a".repeat(60) }, 60), "a".repeat(60));

  // --- buildBulkPreviewMessage ---
  const sampleA = [
    { preview: "Hello world", kind: "text" },
    { preview: "function foo() {", kind: "text" },
    { preview: "Image · 800×600", kind: "image" },
  ];
  // Standard 47-clip case
  const msgA = mod.buildBulkPreviewMessage("Archive", 47, sampleA);
  check("47 clips: head", msgA.split("\n")[0], "Archive 47 clips?");
  checkContains("47 clips: blank line after head", msgA, "?\n\nFirst 3:");
  checkContains("47 clips: bullet rows present", msgA, "  • Hello world");
  checkContains("47 clips: image preview included", msgA, "  • Image · 800×600");
  checkContains("47 clips: +N tail", msgA, "+ 44 more");

  // Singular form: 1 clip
  const msgB = mod.buildBulkPreviewMessage("Pin", 1, [{ preview: "just one" }]);
  check("1 clip: head uses singular", msgB.split("\n")[0], "Pin 1 clip?");
  checkContains("1 clip: First 1: header", msgB, "First 1:");
  // No +N more tail when count == sample
  check("1 clip: NO +N more tail", msgB.includes("more"), false);

  // Exactly 3 clips: head plural, no tail
  const msgC = mod.buildBulkPreviewMessage("Unarchive", 3, sampleA);
  check("3 clips: plural head", msgC.split("\n")[0], "Unarchive 3 clips?");
  check("3 clips: no +N more (exact sample size)", msgC.includes("more"), false);

  // 0 clips: returns just the head (defensive)
  const msgD = mod.buildBulkPreviewMessage("Tag", 0, []);
  check("0 clips: just head, no preview block", msgD, "Tag 0 clips?");

  // More samples than sampleSize: extras are clipped
  const big = Array.from({ length: 10 }, (_, i) => ({ preview: `item ${i}` }));
  const msgE = mod.buildBulkPreviewMessage("Archive", 100, big);
  checkContains("clipped to first 3 by default", msgE, "  • item 0");
  checkContains("clipped to first 3 by default", msgE, "  • item 2");
  check("clipped: item 3 NOT in preview", msgE.includes("item 3"), false);
  checkContains("clipped: +N more reflects total count", msgE, "+ 97 more");

  // Custom sampleSize via opts
  const msgF = mod.buildBulkPreviewMessage("Archive", 50, big, { sampleSize: 5 });
  checkContains("custom sampleSize=5: First 5: header", msgF, "First 5:");
  checkContains("custom sampleSize=5: item 4 IN preview", msgF, "  • item 4");
  check("custom sampleSize=5: item 5 NOT in preview", msgF.includes("item 5"), false);

  // Custom previewMax for long bodies
  const msgG = mod.buildBulkPreviewMessage("Archive", 30, [
    { content: "x".repeat(200) },
    { content: "y".repeat(200) },
    { content: "z".repeat(200) },
  ], { previewMax: 20 });
  checkContains("custom previewMax=20: trims with ellipsis", msgG, "  • " + "x".repeat(20) + "…");

  // Multi-line content gets flattened
  const msgH = mod.buildBulkPreviewMessage("Archive", 30, [
    { content: "first line\nsecond line\nthird line" },
    { preview: "a" },
    { preview: "b" },
  ]);
  checkContains("multi-line content collapsed", msgH, "  • first line second line third line");

  // Whitespace-only content shows (empty)
  const msgI = mod.buildBulkPreviewMessage("Archive", 30, [
    { content: "   \n   " },
    { preview: "ok" },
    { preview: "ok2" },
  ]);
  checkContains("whitespace-only content shows (empty)", msgI, "  • (empty)");

  if (pass === total) {
    console.log(`PASS — ${pass}/${total} bulk-preview sanity checks`);
  } else {
    console.error(`FAIL — ${pass}/${total} bulk-preview sanity checks`);
    process.exit(1);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
