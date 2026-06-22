// Sanity: buildAuditExport + stringifyAuditExport + auditExportFilename.
//
// Inline copies of src/lib/audit-export-json.ts so the test runs
// without a bundler. Covers envelope shape (version/source/count/
// retention), entry cleanup (undefined fields stripped), input
// immutability (caller's array untouched), filename format, and
// edge cases (empty / zero-retention / missing-opts).

function buildAuditExport(entries, opts = {}) {
  const clean = entries.map((e) => {
    const out = {
      id: e.id,
      kind: e.kind,
      at: e.at,
      clipId: e.clipId,
    };
    if (e.host) out.host = e.host;
    if (e.detail) out.detail = e.detail;
    return out;
  });
  const env = {
    version: 1,
    exportedAt: opts.now ?? Date.now(),
    source: "context-clipboard/audit",
    count: clean.length,
    entries: clean,
  };
  if (typeof opts.retention === "number" && opts.retention > 0) {
    env.retention = opts.retention;
  }
  return env;
}

function stringifyAuditExport(env) {
  return JSON.stringify(env, null, 2);
}

function auditExportFilename(at = Date.now()) {
  const iso = new Date(at).toISOString();
  const day = iso.slice(0, 10);
  return `context-clipboard-audit-${day}.json`;
}

let pass = 0;
let total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}

const NOW = 1_700_000_000_000;

// --- 1. Envelope shape -------------------------------------------------
const empty = buildAuditExport([], { now: NOW, retention: 30 });
check("empty: version=1", empty.version, 1);
check("empty: source set", empty.source, "context-clipboard/audit");
check("empty: exportedAt mirrors now opt", empty.exportedAt, NOW);
check("empty: count=0", empty.count, 0);
check("empty: entries=[]", empty.entries, []);
check("empty: retention=30 stamped", empty.retention, 30);

const noRetention = buildAuditExport([], { now: NOW });
check("no retention opt → field absent", "retention" in noRetention, false);

const zeroRetention = buildAuditExport([], { now: NOW, retention: 0 });
check("retention=0 → field absent (treated as missing)", "retention" in zeroRetention, false);

const negativeRetention = buildAuditExport([], { now: NOW, retention: -5 });
check("retention<0 → field absent", "retention" in negativeRetention, false);

// --- 2. Entry cleanup --------------------------------------------------
const raw = [
  { id: "a1", kind: "redact", at: NOW - 1000, clipId: "c1", host: "github.com", detail: "12 chars" },
  { id: "a2", kind: "forget-host", at: NOW - 2000, clipId: "", host: "bank.com", detail: "from 4 clips" },
  // entry with undefined optional fields — should be omitted from output.
  { id: "a3", kind: "trash", at: NOW - 3000, clipId: "c2", host: undefined, detail: undefined },
  // entry with empty-string optional fields — should ALSO be omitted (falsy).
  { id: "a4", kind: "archive", at: NOW - 4000, clipId: "c3", host: "", detail: "" },
];

const env = buildAuditExport(raw, { now: NOW, retention: 100 });
check("count matches entries length", env.count, 4);
check("entries length", env.entries.length, 4);

// First entry: all fields present.
check("a1 has id", env.entries[0].id, "a1");
check("a1 has host", env.entries[0].host, "github.com");
check("a1 has detail", env.entries[0].detail, "12 chars");

// Second: forget-host with empty clipId.
check("a2 clipId=''", env.entries[1].clipId, "");
check("a2 has host", env.entries[1].host, "bank.com");

// Third: undefined optionals stripped.
check("a3 host absent (undefined input)", "host" in env.entries[2], false);
check("a3 detail absent (undefined input)", "detail" in env.entries[2], false);

// Fourth: empty-string optionals stripped (falsy guard).
check("a4 host absent (empty string)", "host" in env.entries[3], false);
check("a4 detail absent (empty string)", "detail" in env.entries[3], false);

// --- 3. Input immutability --------------------------------------------
const original = [{ id: "x1", kind: "redact", at: NOW, clipId: "c", host: "h", detail: "d" }];
const before = JSON.stringify(original);
buildAuditExport(original, { now: NOW });
check("input array not mutated", JSON.stringify(original), before);

// --- 4. stringifyAuditExport ------------------------------------------
const small = buildAuditExport([raw[0]], { now: NOW });
const text = stringifyAuditExport(small);
check("stringify produces 2-space indent",
  text.includes("  \"version\": 1") || text.includes('  "version": 1'),
  true,
);
check("stringify is parseable round-trip",
  JSON.parse(text).source,
  "context-clipboard/audit",
);
check("stringify preserves count",
  JSON.parse(text).count,
  1,
);

// --- 5. auditExportFilename -------------------------------------------
const utcDay = new Date(NOW).toISOString().slice(0, 10);
check("filename uses YYYY-MM-DD prefix",
  auditExportFilename(NOW),
  `context-clipboard-audit-${utcDay}.json`,
);
check("filename ends .json",
  auditExportFilename(NOW).endsWith(".json"),
  true,
);

// Two calls with different timestamps produce different filenames
// when the day differs.
const oneDayLater = NOW + 86_400_000;
const nextDay = new Date(oneDayLater).toISOString().slice(0, 10);
check("filename rolls over on day boundary",
  auditExportFilename(oneDayLater),
  `context-clipboard-audit-${nextDay}.json`,
);

// --- 6. Defaults / edge cases -----------------------------------------
const noOpts = buildAuditExport(raw);
check("no opts → exportedAt is a number", typeof noOpts.exportedAt, "number");
check("no opts → no retention field", "retention" in noOpts, false);

// Large ring (100 entries, the privacy_audit cap) still round-trips.
const big = Array.from({ length: 100 }, (_, i) => ({
  id: `b${i}`, kind: "redact", at: NOW - i * 1000, clipId: `c${i}`,
}));
const bigEnv = buildAuditExport(big, { now: NOW, retention: 100 });
check("100-entry envelope count", bigEnv.count, 100);
check("100-entry envelope first id", bigEnv.entries[0].id, "b0");
check("100-entry envelope last id", bigEnv.entries[99].id, "b99");

// --- 7. Order preservation --------------------------------------------
const ordered = [
  { id: "z", kind: "trash", at: NOW - 100, clipId: "" },
  { id: "a", kind: "redact", at: NOW - 200, clipId: "" },
  { id: "m", kind: "archive", at: NOW - 50, clipId: "" },
];
const orderedEnv = buildAuditExport(ordered, { now: NOW });
check("order preserved (no sort)",
  orderedEnv.entries.map((e) => e.id),
  ["z", "a", "m"],
);

console.log(`audit-export-json sanity: ${pass}/${total} pass`);
if (pass !== total) process.exit(1);
