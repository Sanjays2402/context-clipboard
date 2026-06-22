// Sanity: findLastForgottenHost + formatAge.
//
// Inline copies of src/lib/last-forgotten-host.ts so the test runs
// without a bundler. Covers happy path (newest forget-host found),
// non-forget kinds skipped, missing/empty host defended, empty &
// non-array inputs, multi-forget ordering, and formatAge math.

function findLastForgottenHost(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  for (const e of entries) {
    if (e.kind !== "forget-host") continue;
    const host = (e.host || "").trim();
    if (!host) continue;
    return {
      host,
      at: e.at,
      entryId: e.id,
      detail: e.detail,
    };
  }
  return null;
}

function formatAge(at, now = Date.now()) {
  const delta = Math.max(0, now - at);
  if (delta < 30_000) return "just now";
  const s = Math.floor(delta / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
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

// --- 1. Empty inputs ----------------------------------------------------
check("empty array → null", findLastForgottenHost([]), null);
check("null input → null", findLastForgottenHost(null), null);
check("undefined input → null", findLastForgottenHost(undefined), null);
check("non-array → null", findLastForgottenHost({ entries: [] }), null);
check("non-array string → null", findLastForgottenHost("nope"), null);

// --- 2. No forget-host kind → null --------------------------------------
const onlyOthers = [
  { id: "a1", kind: "redact", at: NOW - 100, clipId: "c1", host: "github.com", detail: "12 chars" },
  { id: "a2", kind: "trash", at: NOW - 200, clipId: "c2" },
  { id: "a3", kind: "archive", at: NOW - 300, clipId: "c3" },
];
check(
  "no forget-host entries → null",
  findLastForgottenHost(onlyOthers),
  null,
);

// --- 3. Happy path: newest-first wins ----------------------------------
const happy = [
  { id: "a1", kind: "redact", at: NOW - 100, clipId: "c1" },
  { id: "a2", kind: "forget-host", at: NOW - 200, clipId: "", host: "github.com", detail: "5 clips" },
  { id: "a3", kind: "forget-host", at: NOW - 500, clipId: "", host: "old.example", detail: "2 clips" },
];
const found = findLastForgottenHost(happy);
check("newest forget-host wins (host)", found?.host, "github.com");
check("newest forget-host wins (entryId)", found?.entryId, "a2");
check("at preserved", found?.at, NOW - 200);
check("detail preserved", found?.detail, "5 clips");

// --- 4. Skips entries with missing/empty host --------------------------
const malformed = [
  { id: "x1", kind: "forget-host", at: NOW - 100, clipId: "", host: "" },
  { id: "x2", kind: "forget-host", at: NOW - 200, clipId: "", host: "   " }, // whitespace
  { id: "x3", kind: "forget-host", at: NOW - 300, clipId: "" }, // no host field
  { id: "x4", kind: "forget-host", at: NOW - 400, clipId: "", host: "real.com" },
];
const skipped = findLastForgottenHost(malformed);
check("first valid host wins (skipped 3 malformed)", skipped?.host, "real.com");
check("malformed-skipped entryId is x4", skipped?.entryId, "x4");

// --- 5. Trims whitespace from host -------------------------------------
const padded = [
  { id: "p1", kind: "forget-host", at: NOW, clipId: "", host: "  github.com  " },
];
check("host trimmed", findLastForgottenHost(padded)?.host, "github.com");

// --- 6. Newest-first order matters (no internal sort) -------------------
// The audit ring is conventionally newest-first; this helper trusts it.
// If a caller hands us reverse-sorted data, the OLDEST forget-host wins
// (documenting the contract via test).
const reversed = [
  { id: "r1", kind: "forget-host", at: NOW - 500, clipId: "", host: "old.com" },
  { id: "r2", kind: "forget-host", at: NOW - 100, clipId: "", host: "new.com" },
];
check(
  "trusts input order — first in list wins (old.com here, contract doc)",
  findLastForgottenHost(reversed)?.host,
  "old.com",
);

// --- 7. Mixed kinds — only forget-host counts ---------------------------
const mixed = [
  { id: "m1", kind: "redact", at: NOW, clipId: "c1", host: "github.com" },
  { id: "m2", kind: "scrub-origin", at: NOW - 50, clipId: "c2", host: "github.com" },
  { id: "m3", kind: "forget-host", at: NOW - 100, clipId: "", host: "target.io", detail: "1 clip" },
  { id: "m4", kind: "redact", at: NOW - 200, clipId: "c3", host: "github.com" },
];
check(
  "mixed kinds — first forget-host wins (redact + scrub skipped)",
  findLastForgottenHost(mixed)?.host,
  "target.io",
);

// --- 8. Detail field optional -------------------------------------------
const noDetail = [{ id: "n1", kind: "forget-host", at: NOW, clipId: "", host: "h.com" }];
check("detail undefined when audit row lacks it", findLastForgottenHost(noDetail)?.detail, undefined);

// --- 9. formatAge math --------------------------------------------------
check("formatAge: 0s → 'just now'", formatAge(NOW, NOW), "just now");
check("formatAge: 29s → 'just now' (under 30s)", formatAge(NOW - 29_000, NOW), "just now");
check("formatAge: 30s → '30s ago' (boundary)", formatAge(NOW - 30_000, NOW), "30s ago");
check("formatAge: 59s → '59s ago'", formatAge(NOW - 59_000, NOW), "59s ago");
check("formatAge: 60s → '1m ago'", formatAge(NOW - 60_000, NOW), "1m ago");
check("formatAge: 30m → '30m ago'", formatAge(NOW - 30 * 60_000, NOW), "30m ago");
check("formatAge: 1h → '1h ago'", formatAge(NOW - 3_600_000, NOW), "1h ago");
check("formatAge: 5h → '5h ago'", formatAge(NOW - 5 * 3_600_000, NOW), "5h ago");
check("formatAge: 1d → '1d ago'", formatAge(NOW - 86_400_000, NOW), "1d ago");
check("formatAge: 7d → '7d ago'", formatAge(NOW - 7 * 86_400_000, NOW), "7d ago");
check("formatAge: future → 'just now' (clamped to 0)", formatAge(NOW + 5_000_000, NOW), "just now");

// --- 10. Real-world audit ring shape (newest-first by convention) -------
const realistic = [
  { id: "pa_n3z_a1", kind: "trash", at: NOW - 50, clipId: "c5" },
  { id: "pa_n3y_b2", kind: "redact", at: NOW - 100, clipId: "c4", host: "github.com", detail: "8 chars" },
  { id: "pa_n3x_c3", kind: "forget-host", at: NOW - 200, clipId: "", host: "bank.com", detail: "from 4 clips" },
  { id: "pa_n3w_d4", kind: "archive", at: NOW - 400, clipId: "c2" },
  { id: "pa_n3v_e5", kind: "forget-host", at: NOW - 500, clipId: "", host: "old.example", detail: "from 1 clip" },
];
const realFound = findLastForgottenHost(realistic);
check("realistic ring: bank.com wins (newer than old.example)", realFound?.host, "bank.com");
check("realistic ring: entryId pa_n3x_c3", realFound?.entryId, "pa_n3x_c3");
check("realistic ring: detail 'from 4 clips'", realFound?.detail, "from 4 clips");

console.log(`last-forgotten-host sanity: ${pass}/${total} pass`);
if (pass !== total) process.exit(1);
