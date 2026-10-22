// Store-ready packages: release build (no sourcemaps), then one zip per
// target at dist/context-clipboard-<target>-<version>.zip, with
// manifest.json at the zip root as the Chrome Web Store / AMO expect.
// Uses Node's zlib (deflateRawSync + crc32, Node >= 22.2) — no zip dep.
//
// Run: node scripts/package.mjs [chrome|firefox]
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";

const root = resolve(fileURLToPath(import.meta.url), "..", "..");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const targets = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const wanted = targets.length ? targets : ["chrome", "firefox"];

execFileSync(process.execPath, [join(root, "scripts/build.mjs"), ...wanted, "--release"], {
  cwd: root,
  stdio: "inherit",
});

function walk(dir) {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
}

// Fixed DOS timestamp (1980-01-01) so the same build gives the same zip.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

function zip(files, base) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(relative(base, file).replaceAll("\\", "/"));
    const data = readFileSync(file);
    const packed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + packed.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

for (const target of wanted) {
  const base = join(root, "dist", target);
  const files = walk(base);
  const maps = files.filter((f) => f.endsWith(".map"));
  if (maps.length) throw new Error(`release build left sourcemaps: ${maps.join(", ")}`);
  const manifest = JSON.parse(readFileSync(join(base, "manifest.json"), "utf8"));
  if (manifest.version !== version) {
    throw new Error(`manifest version ${manifest.version} != package.json ${version}`);
  }
  const out = join(root, "dist", `context-clipboard-${target}-${version}.zip`);
  const buf = zip(files, base);
  writeFileSync(out, buf);
  console.log(`📦 ${relative(root, out)} (${files.length} files, ${(buf.length / 1024).toFixed(1)} KB)`);
}
