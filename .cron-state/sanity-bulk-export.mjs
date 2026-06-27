// Sanity: bulk-export — "Export selected" envelope builder + filename
// + toast helpers. Mirrors the shape Settings → Export produces so the
// JSON round-trips through importAll cleanly.

import { build } from "esbuild";
import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const dir = mkdtempSync(join(tmpdir(), "ctxclip-bulkexport-"));
await build({
  entryPoints: ["src/lib/bulk-export.ts"],
  bundle: true,
  format: "esm",
  outfile: join(dir, "bulk-export.mjs"),
  platform: "neutral",
  target: "es2022",
  sourcemap: false,
});
const mod = await import("file://" + join(dir, "bulk-export.mjs"));
const {
  buildBulkExportEnvelope,
  bulkExportJson,
  bulkExportFilename,
  formatBulkExportToast,
  formatBulkExportTagToast,
  formatExportBytes,
  utf8ByteLength,
} = mod;

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

// --- 1. buildBulkExportEnvelope: basic shape ----------------------------
const sampleClips = [
  { id: "a", kind: "text", content: "hello", source: { url: "https://a.com" }, tags: [], pinned: false, lastSeenAt: 1 },
  { id: "b", kind: "image", content: "data:img", source: {}, tags: [], pinned: true, lastSeenAt: 2 },
  { id: "c", kind: "link", content: "https://c.com", source: { url: "https://c.com" }, tags: ["x"], pinned: false, lastSeenAt: 3 },
];

const env1 = buildBulkExportEnvelope(sampleClips);
checkTrue("envelope: returns non-null for 3-clip selection", env1 !== null);
check("envelope: clips length matches input", env1.clips.length, 3);
check("envelope: source marker", env1.source, "bulk-export");
check("envelope: selectionSize matches", env1.selectionSize, 3);
checkTrue("envelope: version is a positive number", typeof env1.version === "number" && env1.version > 0);
checkTrue("envelope: exportedAt is a number", typeof env1.exportedAt === "number");
check("envelope: preserves clip ids in order", env1.clips.map((c) => c.id), ["a", "b", "c"]);

// --- 2. version + exportedAt overrides ----------------------------------
const env2 = buildBulkExportEnvelope(sampleClips, { version: 4, exportedAt: 1700000000000 });
check("envelope: version override honored", env2.version, 4);
check("envelope: exportedAt override honored", env2.exportedAt, 1700000000000);

// Defensive — bad version falls back to 1
const env3 = buildBulkExportEnvelope(sampleClips, { version: 0 });
check("envelope: version=0 falls back to 1", env3.version, 1);
const env4 = buildBulkExportEnvelope(sampleClips, { version: -5 });
check("envelope: negative version falls back to 1", env4.version, 1);
const env5 = buildBulkExportEnvelope(sampleClips, { version: NaN });
check("envelope: NaN version falls back to 1", env5.version, 1);
const env6 = buildBulkExportEnvelope(sampleClips, { version: Infinity });
check("envelope: Infinity version falls back to 1", env6.version, 1);
const env7 = buildBulkExportEnvelope(sampleClips, { version: 3.7 });
check("envelope: fractional version floors", env7.version, 3);

// --- 3. Defensive: bad inputs -------------------------------------------
check("envelope: null input → null", buildBulkExportEnvelope(null), null);
check("envelope: undefined input → null", buildBulkExportEnvelope(undefined), null);
check("envelope: non-array input → null", buildBulkExportEnvelope({ id: "x" }), null);
check("envelope: empty array → null", buildBulkExportEnvelope([]), null);

// Bad entries silently dropped.
const mixedBad = [
  null,
  undefined,
  { id: "" },
  { id: 42 },
  { id: "good" },
  { /* no id at all */ kind: "text" },
];
const envMixed = buildBulkExportEnvelope(mixedBad);
check("envelope: bad entries dropped, only 'good' survives",
  envMixed.clips.map((c) => c.id), ["good"]);
check("envelope: selectionSize reflects cleaned count, not input length",
  envMixed.selectionSize, 1);

// All-bad input → null (nothing to envelope).
check("envelope: all-bad input → null",
  buildBulkExportEnvelope([null, { id: "" }, { id: 42 }]), null);

// --- 4. bulkExportJson: pretty-printed + valid JSON ---------------------
const json1 = bulkExportJson(sampleClips);
checkTrue("json: returns non-empty string", typeof json1 === "string" && json1.length > 0);
checkTrue("json: parses back to object", (() => {
  try {
    JSON.parse(json1);
    return true;
  } catch {
    return false;
  }
})());
checkTrue("json: indented (multi-line)", json1.includes("\n"));
const parsed = JSON.parse(json1);
check("json: round-trip preserves source marker", parsed.source, "bulk-export");
check("json: round-trip preserves clip count", parsed.clips.length, 3);
check("json: round-trip preserves first clip content", parsed.clips[0].content, "hello");

// json from bad input → null
check("json: null input → null", bulkExportJson(null), null);
check("json: empty array → null", bulkExportJson([]), null);

// --- 5. Importable shape — minimal contract required by importAll -------
// importAll requires { clips: [...] } — version + exportedAt are
// surfaced but not strictly required. Confirm both are present.
const env8 = buildBulkExportEnvelope(sampleClips);
checkTrue("import-shape: env.clips is an array", Array.isArray(env8.clips));
checkTrue("import-shape: env.version present", typeof env8.version === "number");
checkTrue("import-shape: env.exportedAt present", typeof env8.exportedAt === "number");

// Full ClipItem fields round-trip untouched (the popup hands us the
// whole stored ClipItem so pinned/tags/hitCount/hash/etc. survive).
const richClip = {
  id: "rich",
  kind: "text",
  content: "body",
  preview: "body",
  source: { url: "https://x.com", title: "X" },
  tags: ["a", "b"],
  pinned: true,
  archived: false,
  locked: true,
  hitCount: 5,
  bytes: 4,
  hash: "deadbeef",
  template: false,
  createdAt: 1700000000000,
  lastSeenAt: 1700000000001,
};
const envRich = buildBulkExportEnvelope([richClip]);
check("rich: pinned bit round-trips", envRich.clips[0].pinned, true);
check("rich: locked bit round-trips", envRich.clips[0].locked, true);
check("rich: tags array round-trips",
  Array.isArray(envRich.clips[0].tags) && envRich.clips[0].tags.join(",") === "a,b", true);
check("rich: hash round-trips", envRich.clips[0].hash, "deadbeef");
check("rich: hitCount round-trips", envRich.clips[0].hitCount, 5);

// --- 6. bulkExportFilename ----------------------------------------------
const fixedDate = new Date("2026-06-22T15:00:00Z");
check("filename: standard shape",
  bulkExportFilename({ count: 3, now: fixedDate }),
  "context-clipboard-2026-06-22-3clips-bulk.json");

check("filename: singular not pluralised (just '1clips' for grammar simplicity)",
  bulkExportFilename({ count: 1, now: fixedDate }),
  "context-clipboard-2026-06-22-1clips-bulk.json");

// Defensive number handling
check("filename: NaN count → 0",
  bulkExportFilename({ count: NaN, now: fixedDate }),
  "context-clipboard-2026-06-22-0clips-bulk.json");
check("filename: negative count → 0",
  bulkExportFilename({ count: -5, now: fixedDate }),
  "context-clipboard-2026-06-22-0clips-bulk.json");
check("filename: fractional count floors",
  bulkExportFilename({ count: 3.9, now: fixedDate }),
  "context-clipboard-2026-06-22-3clips-bulk.json");

// Default date branch (no `now` passed) — just verify shape
const fnDefault = bulkExportFilename({ count: 2 });
checkTrue("filename: default date uses today (matches YYYY-MM-DD shape)",
  /^context-clipboard-\d{4}-\d{2}-\d{2}-2clips-bulk\.json$/.test(fnDefault));

// Invalid Date passed in → falls back to new Date()
const fnBadDate = bulkExportFilename({ count: 5, now: new Date("not-a-date") });
checkTrue("filename: invalid Date falls back to today",
  /^context-clipboard-\d{4}-\d{2}-\d{2}-5clips-bulk\.json$/.test(fnBadDate));

// Non-Date `now` ignored
const fnNotDate = bulkExportFilename({ count: 7, now: "2026-01-01" });
checkTrue("filename: non-Date `now` falls back to today",
  /^context-clipboard-\d{4}-\d{2}-\d{2}-7clips-bulk\.json$/.test(fnNotDate));

// --- 7. formatBulkExportToast -------------------------------------------
check("toast: 0/0 → 'Nothing to export'",
  formatBulkExportToast({ exported: 0, selected: 0 }), "Nothing to export");
check("toast: 1 of 1 → 'Exported 1 clip'",
  formatBulkExportToast({ exported: 1, selected: 1 }), "Exported 1 clip");
check("toast: 3 of 3 → 'Exported 3 clips'",
  formatBulkExportToast({ exported: 3, selected: 3 }), "Exported 3 clips");
check("toast: 5 of 5 → 'Exported 5 clips'",
  formatBulkExportToast({ exported: 5, selected: 5 }), "Exported 5 clips");

// Partial export (defensive — should not happen in practice)
check("toast: 3 of 5 → partial shape",
  formatBulkExportToast({ exported: 3, selected: 5 }),
  "Exported 3 of 5 clips (2 skipped)");
check("toast: 1 of 5 → partial shape singular exported but plural total",
  formatBulkExportToast({ exported: 1, selected: 5 }),
  "Exported 1 of 5 clip (4 skipped)");

// selected=0 + exported>0 — treat as clean (defensive)
check("toast: selected=0 falls back to clean shape",
  formatBulkExportToast({ exported: 3, selected: 0 }), "Exported 3 clips");

// Defensive number handling
check("toast: NaN exported → nothing",
  formatBulkExportToast({ exported: NaN, selected: 3 }), "Nothing to export");
check("toast: negative exported → nothing",
  formatBulkExportToast({ exported: -2, selected: 3 }), "Nothing to export");
check("toast: fractional exported floors",
  formatBulkExportToast({ exported: 3.7, selected: 4 }),
  "Exported 3 of 4 clips (1 skipped)");

// --- 8. End-to-end: realistic 5-clip bulk export ------------------------
const realistic = [
  { id: "r1", kind: "text", content: "snippet 1", source: { url: "https://github.com/r1" }, tags: ["code"], pinned: false, hash: "h1", bytes: 9, lastSeenAt: 1 },
  { id: "r2", kind: "text", content: "snippet 2", source: { url: "https://github.com/r2" }, tags: [], pinned: true, hash: "h2", bytes: 9, lastSeenAt: 2 },
  { id: "r3", kind: "link", content: "https://example.com/x", source: { url: "https://example.com/x", title: "X" }, tags: [], pinned: false, hash: "h3", bytes: 22, lastSeenAt: 3 },
  { id: "r4", kind: "image", content: "data:image/png;base64,xxx", source: {}, tags: [], pinned: false, hash: "h4", bytes: 100, lastSeenAt: 4 },
  { id: "r5", kind: "text", content: "snippet 5", source: { url: "https://news.ycombinator.com/" }, tags: ["news"], pinned: false, locked: true, hash: "h5", bytes: 9, lastSeenAt: 5 },
];
const envR = buildBulkExportEnvelope(realistic, { version: 4 });
check("realistic: 5 clips exported", envR.clips.length, 5);
check("realistic: version 4 honored", envR.version, 4);
check("realistic: selectionSize=5", envR.selectionSize, 5);
const jsonR = bulkExportJson(realistic, { version: 4 });
const parsedR = JSON.parse(jsonR);
check("realistic: roundtrip preserves locked bit", parsedR.clips[4].locked, true);
check("realistic: roundtrip preserves pinned bit", parsedR.clips[1].pinned, true);
check("realistic: roundtrip preserves image data URL",
  parsedR.clips[3].content, "data:image/png;base64,xxx");
const fnR = bulkExportFilename({ count: 5, now: fixedDate });
check("realistic: filename surfaces count + bulk marker",
  fnR, "context-clipboard-2026-06-22-5clips-bulk.json");
const toastR = formatBulkExportToast({ exported: 5, selected: 5 });
check("realistic: clean toast", toastR, "Exported 5 clips");

// --- 9. Byte-receipt tail (formatExportBytes + utf8ByteLength + toasts) ---
// formatExportBytes — mirrors the storage-panel grammar.
check("bytes: <1KB reads B", formatExportBytes(742), "742 B");
check("bytes: 1024 reads 1.0 KB", formatExportBytes(1024), "1.0 KB");
check("bytes: KB tier", formatExportBytes(12_595), "12.3 KB");
check("bytes: MB tier", formatExportBytes(4_404_019), "4.2 MB");
check("bytes: GB tier 2dp", formatExportBytes(1_148_903_751), "1.07 GB");
check("bytes: 0 reads 0 B", formatExportBytes(0), "0 B");
check("bytes: negative reads 0 B", formatExportBytes(-5), "0 B");
check("bytes: NaN reads 0 B", formatExportBytes(NaN), "0 B");

// utf8ByteLength — ASCII = 1 byte/char, multibyte counts UTF-8 bytes.
check("utf8: ascii 1 byte/char", utf8ByteLength("hello"), 5);
check("utf8: empty string 0", utf8ByteLength(""), 0);
check("utf8: null 0", utf8ByteLength(null), 0);
check("utf8: 2-byte char (e-acute)", utf8ByteLength("\u00e9"), 2);
check("utf8: 3-byte char (CJK)", utf8ByteLength("\u4e2d"), 3);
check("utf8: 4-byte char (emoji surrogate pair)", utf8ByteLength("\u{1f600}"), 4);
// The actual export JSON byte length should match what TextEncoder sees.
checkTrue("utf8: matches TextEncoder on real JSON",
  utf8ByteLength(jsonR) === new TextEncoder().encode(jsonR).length);

// Toast receipt tail — bytes>0 appends " — <size>"; absent/0 omits it.
check("toast: clean + bytes appends receipt",
  formatBulkExportToast({ exported: 3, selected: 3, bytes: 4_404_019 }),
  "Exported 3 clips \u2014 4.2 MB");
check("toast: partial + bytes appends receipt",
  formatBulkExportToast({ exported: 3, selected: 5, bytes: 12_595 }),
  "Exported 3 of 5 clips (2 skipped) \u2014 12.3 KB");
check("toast: bytes=0 omits tail (legacy-identical)",
  formatBulkExportToast({ exported: 3, selected: 3, bytes: 0 }),
  "Exported 3 clips");
check("toast: bytes absent omits tail (legacy-identical)",
  formatBulkExportToast({ exported: 3, selected: 3 }),
  "Exported 3 clips");
check("toast: nothing-to-export ignores bytes",
  formatBulkExportToast({ exported: 0, selected: 0, bytes: 9999 }),
  "Nothing to export");
// Large counts now group with commas in the toast head.
check("toast: count grouping with commas",
  formatBulkExportToast({ exported: 1234, selected: 1234 }),
  "Exported 1,234 clips");

// Tag toast carries the same receipt tail.
check("tag-toast: clean + bytes appends receipt",
  formatBulkExportTagToast({ exported: 2, selected: 5, tag: "secrets", bytes: 742 }),
  "Exported 2 of 5 selected clips (tag: secrets) \u2014 742 B");
check("tag-toast: all-selected + bytes",
  formatBulkExportTagToast({ exported: 3, selected: 3, tag: "code", bytes: 1024 }),
  "Exported 3 clips (tag: code) \u2014 1.0 KB");
check("tag-toast: zero-match ignores bytes",
  formatBulkExportTagToast({ exported: 0, selected: 5, tag: "nope", bytes: 9999 }),
  "No selected clips tagged \"nope\"");

console.log(`bulk-export sanity: ${pass}/${total} pass`);
if (pass !== total) process.exit(1);
