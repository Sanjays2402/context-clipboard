// Sanity: lib/bulk-export formatBulkExportButtonTitle pre-commit hover.
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "ctxclip-exporttitle-"));
const out = join(dir, "bulk-export.mjs");
await build({ entryPoints: ["src/lib/bulk-export.ts"], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
const { formatBulkExportButtonTitle, formatBulkExportToast, formatExportBytes, utf8ByteLength, bulkExportJson } = await import(
  pathToFileURL(out).href
);

let pass = 0,
  fail = 0;
const eq = (a, b, msg) => {
  if (JSON.stringify(a) === JSON.stringify(b)) pass++;
  else {
    fail++;
    console.error(`FAIL ${msg}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
  }
};

// --- count > 0, no tag, with size ---
eq(
  formatBulkExportButtonTitle({ count: 3, bytes: 4300 }),
  "Export 3 selected clips as JSON (4.2 KB)",
  "3 clips + KB size",
);

// --- singular noun ---
eq(formatBulkExportButtonTitle({ count: 1, bytes: 742 }), "Export 1 selected clip as JSON (742 B)", "1 clip singular + B");

// --- thousands grouping in count ---
eq(
  formatBulkExportButtonTitle({ count: 1240, bytes: 5 * 1024 * 1024 }),
  "Export 1,240 selected clips as JSON (5.0 MB)",
  "grouped count + MB",
);

// --- with tag ---
eq(
  formatBulkExportButtonTitle({ count: 3, bytes: 4300, tag: "secrets" }),
  'Export 3 selected clips tagged "secrets" as JSON (4.2 KB)',
  "tagged variant",
);

// --- tag is trimmed ---
eq(
  formatBulkExportButtonTitle({ count: 2, bytes: 100, tag: "  code  " }),
  'Export 2 selected clips tagged "code" as JSON (100 B)',
  "tag trimmed",
);

// --- no size tail when bytes absent / zero / non-finite ---
eq(formatBulkExportButtonTitle({ count: 3 }), "Export 3 selected clips as JSON", "no bytes -> no tail");
eq(formatBulkExportButtonTitle({ count: 3, bytes: 0 }), "Export 3 selected clips as JSON", "0 bytes -> no tail");
eq(formatBulkExportButtonTitle({ count: 3, bytes: NaN }), "Export 3 selected clips as JSON", "NaN bytes -> no tail");

// --- count 0 cases ---
eq(formatBulkExportButtonTitle({ count: 0 }), "Export selected clips as JSON", "0 no tag -> generic");
eq(
  formatBulkExportButtonTitle({ count: 0, tag: "secrets" }),
  'No selected clips tagged "secrets" to export',
  "0 with tag -> honest empty",
);

// --- defensive numeric coercion ---
eq(formatBulkExportButtonTitle({ count: -5, bytes: 100 }), "Export selected clips as JSON", "negative count -> 0 branch");
eq(formatBulkExportButtonTitle({ count: 2.9, bytes: 100 }), "Export 2 selected clips as JSON (100 B)", "float count floored");

// --- PARITY: hover size matches what the toast + real serialization report ---
// Build a real envelope, measure its bytes, and confirm the hover's
// formatExportBytes(size) substring matches the toast's tail exactly.
const clips = [
  { id: "a", kind: "text", content: "hello", tags: ["x"] },
  { id: "b", kind: "text", content: "world world", tags: ["x"] },
];
const json = bulkExportJson(clips, { version: 4 });
const bytes = utf8ByteLength(json);
const hover = formatBulkExportButtonTitle({ count: 2, bytes });
const toast = formatBulkExportToast({ exported: 2, selected: 2, bytes });
const sizeStr = formatExportBytes(bytes);
eq(hover.includes(`(${sizeStr})`), true, "hover carries the real size in parens");
eq(toast.includes(sizeStr), true, "toast carries the same real size");
eq(hover.includes(sizeStr) && toast.includes(sizeStr), true, "hover + toast agree on size (pre/post parity)");

rmSync(dir, { recursive: true, force: true });
console.log(`bulk-export-title sanity: ${pass}/${pass + fail} pass`);
if (fail > 0) process.exit(1);
