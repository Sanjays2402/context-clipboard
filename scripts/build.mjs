// Minimal build script: esbuild bundles TS → JS, copies static assets,
// writes the right manifest per target. Usage:
//   node scripts/build.mjs            -> builds both chrome + firefox
//   node scripts/build.mjs chrome     -> just chrome
//   node scripts/build.mjs firefox    -> just firefox
//   node scripts/build.mjs --watch    -> rebuild on change (both)

import { build, context } from "esbuild";
import { mkdir, copyFile, rm, readFile, writeFile, readdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const watch = args.includes("--watch");
const targets = args.filter((a) => !a.startsWith("--"));
const wanted = targets.length ? targets : ["chrome", "firefox"];

const entries = {
  background: "src/background.ts",
  content: "src/content.ts",
  "popup/popup": "src/popup/popup.ts",
};

async function buildTarget(target) {
  const outdir = path.join(root, "dist", target);
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });
  await mkdir(path.join(outdir, "popup"), { recursive: true });
  await mkdir(path.join(outdir, "icons"), { recursive: true });

  const opts = {
    entryPoints: Object.fromEntries(
      Object.entries(entries).map(([k, v]) => [k, path.join(root, v)]),
    ),
    bundle: true,
    format: "esm",
    target: "es2022",
    outdir,
    platform: "browser",
    sourcemap: true,
    logLevel: "info",
  };

  if (watch) {
    const ctx = await context(opts);
    await ctx.watch();
  } else {
    await build(opts);
  }

  // Copy static files
  await copyFile(
    path.join(root, "src/popup/popup.html"),
    path.join(outdir, "popup/popup.html"),
  );
  await copyFile(
    path.join(root, "src/popup/popup.css"),
    path.join(outdir, "popup/popup.css"),
  );

  // Manifest
  await copyFile(
    path.join(root, `manifests/${target}.json`),
    path.join(outdir, "manifest.json"),
  );

  // Bundle Tesseract is deferred to a future release; OCR is disabled in v0.3.1.

  // Icons: copy if present, else generate placeholders.
  const iconSrc = path.join(root, "icons");
  if (existsSync(iconSrc)) {
    for (const f of await readdir(iconSrc)) {
      await copyFile(path.join(iconSrc, f), path.join(outdir, "icons", f));
    }
  } else {
    // 1x1 transparent PNG placeholder
    const tinyPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      "base64",
    );
    for (const size of [16, 48, 128]) {
      await writeFile(path.join(outdir, "icons", `icon-${size}.png`), tinyPng);
    }
  }

  console.log(`✅ Built ${target} → ${path.relative(root, outdir)}`);
}

for (const t of wanted) {
  await buildTarget(t);
}

if (watch) {
  console.log("👀 Watching for changes…");
}
