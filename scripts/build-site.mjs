// Builds the GitHub Pages site in docs/ (served from main /docs):
//   - bundles src/site/demo.ts (which uses the real lib/search parser)
//     into docs/assets/demo.js
//   - stamps package.json's version into docs/index.html: every
//     <span data-version>X.Y.Z</span> and every release-download URL
//
// Run: node scripts/build-site.mjs
// CI re-runs this and fails if docs/ changes, so the site can't drift
// from the code or the version.
import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "..", "..");
const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

await build({
  entryPoints: [join(root, "src/site/demo.ts")],
  outfile: join(root, "docs/assets/demo.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  minify: true,
  legalComments: "none",
  logLevel: "warning",
});

const htmlPath = join(root, "docs/index.html");
const html = await readFile(htmlPath, "utf8");
const stamped = html
  .replace(/(<span data-version>)[^<]*(<\/span>)/g, `$1${version}$2`)
  .replace(
    /releases\/download\/v[\d.]+\/context-clipboard-(chrome|firefox)-[\d.]+\.zip/g,
    `releases/download/v${version}/context-clipboard-$1-${version}.zip`,
  );
if (stamped !== html) await writeFile(htmlPath, stamped);

console.log(`✅ Built site for v${version} → docs/`);
