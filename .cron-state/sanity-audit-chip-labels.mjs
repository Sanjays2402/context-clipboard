// Sanity: formatAuditChipLabel + buildAuditChipBody.
//
// Inline copies so this runs without a bundler. Covers parens format,
// percentage math, All-chip special-case (no %), zero-bucket defense,
// realistic 5-bucket distribution.

function roundPct(num, denom) {
  if (!Number.isFinite(num) || !Number.isFinite(denom)) return 0;
  if (denom <= 0) return 0;
  const raw = (num / denom) * 100;
  return Math.round(raw);
}

function formatAuditChipLabel(input) {
  const label = String(input.label || "").trim();
  const count = Math.max(0, Math.floor(Number(input.count) || 0));
  const total = Math.max(0, Math.floor(Number(input.total) || 0));
  const isAll = !!input.isAll;

  const text = `${label} (${count})`;

  if (isAll) {
    const noun = count === 1 ? "action" : "actions";
    return { text, title: `${label} · ${count} ${noun} in this view` };
  }

  if (total === 0 || count === 0) {
    return { text, title: `${label} · no actions in this view` };
  }
  const pct = roundPct(count, total);
  const noun = count === 1 ? "action" : "actions";
  return { text, title: `${label} · ${count} ${noun} · ${pct}% of visible ring` };
}

function buildAuditChipBody(input, escapeHtml) {
  const { title } = formatAuditChipLabel(input);
  const label = String(input.label || "").trim();
  const count = Math.max(0, Math.floor(Number(input.count) || 0));
  return {
    bodyHtml: `<span>${escapeHtml(label)}</span><em>(${count})</em>`,
    title,
  };
}

// Identity escapeHtml for tests — we don't pass HTML-unsafe labels.
const idEscape = (s) => s;

let pass = 0;
let total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}

// --- 1. formatAuditChipLabel: All chip has no percentage ----------------
check("all chip: text format",
  formatAuditChipLabel({ label: "All", count: 30, total: 30, isAll: true }).text,
  "All (30)");
check("all chip: tooltip plural",
  formatAuditChipLabel({ label: "All", count: 30, total: 30, isAll: true }).title,
  "All · 30 actions in this view");
check("all chip: tooltip singular",
  formatAuditChipLabel({ label: "All", count: 1, total: 1, isAll: true }).title,
  "All · 1 action in this view");
check("all chip: tooltip zero",
  formatAuditChipLabel({ label: "All", count: 0, total: 0, isAll: true }).title,
  "All · 0 actions in this view");

// --- 2. formatAuditChipLabel: bucket chip includes percentage -----------
check("bucket: text format",
  formatAuditChipLabel({ label: "Redact", count: 12, total: 32 }).text,
  "Redact (12)");
check("bucket: tooltip 38% (math: 12/32 = 37.5 → 38)",
  formatAuditChipLabel({ label: "Redact", count: 12, total: 32 }).title,
  "Redact · 12 actions · 38% of visible ring");
check("bucket: tooltip singular action",
  formatAuditChipLabel({ label: "Trash", count: 1, total: 10 }).title,
  "Trash · 1 action · 10% of visible ring");
check("bucket: 100% case (whole ring)",
  formatAuditChipLabel({ label: "TTL", count: 5, total: 5 }).title,
  "TTL · 5 actions · 100% of visible ring");
check("bucket: small percentage (rounded down)",
  formatAuditChipLabel({ label: "Host", count: 1, total: 100 }).title,
  "Host · 1 action · 1% of visible ring");
check("bucket: tiny percentage rounded to 0",
  formatAuditChipLabel({ label: "Host", count: 1, total: 250 }).title,
  "Host · 1 action · 0% of visible ring");

// --- 3. formatAuditChipLabel: zero-bucket defensive ---------------------
check("bucket: zero count → 'no actions'",
  formatAuditChipLabel({ label: "Scrub", count: 0, total: 30 }).title,
  "Scrub · no actions in this view");
check("bucket: zero total → 'no actions'",
  formatAuditChipLabel({ label: "Scrub", count: 5, total: 0 }).title,
  "Scrub · no actions in this view");
check("bucket: text still includes parens at zero",
  formatAuditChipLabel({ label: "Scrub", count: 0, total: 30 }).text,
  "Scrub (0)");

// --- 4. formatAuditChipLabel: defensive against bad input ---------------
check("defensive: NaN count → 0",
  formatAuditChipLabel({ label: "Redact", count: NaN, total: 30 }).text,
  "Redact (0)");
check("defensive: negative count → 0",
  formatAuditChipLabel({ label: "Redact", count: -5, total: 30 }).text,
  "Redact (0)");
check("defensive: string count → coerced",
  formatAuditChipLabel({ label: "Redact", count: "12", total: 30 }).text,
  "Redact (12)");
check("defensive: fractional count → floored",
  formatAuditChipLabel({ label: "Redact", count: 12.7, total: 30 }).text,
  "Redact (12)");
check("defensive: undefined label → empty parens",
  formatAuditChipLabel({ count: 5, total: 10 }).text,
  " (5)");
check("defensive: label trimmed",
  formatAuditChipLabel({ label: "  Redact  ", count: 1, total: 1 }).text,
  "Redact (1)");

// --- 5. formatAuditChipLabel: rounding edge cases -----------------------
// 5/10 = 50.0% → exactly 50
check("rounding: 50% boundary",
  formatAuditChipLabel({ label: "X", count: 5, total: 10 }).title,
  "X · 5 actions · 50% of visible ring");
// 1/3 = 33.333% → 33
check("rounding: 33.333 → 33",
  formatAuditChipLabel({ label: "X", count: 1, total: 3 }).title,
  "X · 1 action · 33% of visible ring");
// 2/3 = 66.666% → 67
check("rounding: 66.666 → 67",
  formatAuditChipLabel({ label: "X", count: 2, total: 3 }).title,
  "X · 2 actions · 67% of visible ring");
// 7/8 = 87.5% → 88 (Math.round rounds .5 up for positives)
check("rounding: 87.5 → 88",
  formatAuditChipLabel({ label: "X", count: 7, total: 8 }).title,
  "X · 7 actions · 88% of visible ring");

// --- 6. buildAuditChipBody: inner HTML preserves visual hierarchy -------
const body1 = buildAuditChipBody(
  { label: "Redact", count: 12, total: 32 },
  idEscape,
);
check("buildBody: span + em with parens",
  body1.bodyHtml,
  "<span>Redact</span><em>(12)</em>");
check("buildBody: title carries percentage",
  body1.title,
  "Redact · 12 actions · 38% of visible ring");

const bodyAll = buildAuditChipBody(
  { label: "All", count: 32, total: 32, isAll: true },
  idEscape,
);
check("buildBody: All chip skips percentage in tooltip",
  bodyAll.title,
  "All · 32 actions in this view");
check("buildBody: All chip parens count",
  bodyAll.bodyHtml,
  "<span>All</span><em>(32)</em>");

// --- 7. buildAuditChipBody: escapeHtml plumbed through ------------------
const escaped = buildAuditChipBody(
  { label: "X&Y", count: 1, total: 1 },
  (s) => s.replace(/&/g, "&amp;"),
);
check("buildBody: escapeHtml applied to label",
  escaped.bodyHtml,
  "<span>X&amp;Y</span><em>(1)</em>");

// --- 8. Realistic 5-bucket distribution ---------------------------------
// 30 total actions: Redact 12, Scrub 5, Lifecycle 8, Host 3, TTL 2.
const dist = [
  { label: "Redact", count: 12 },
  { label: "Scrub", count: 5 },
  { label: "Lifecycle", count: 8 },
  { label: "Host", count: 3 },
  { label: "TTL", count: 2 },
];
const TOTAL = 30;
const tooltips = dist.map((d) =>
  formatAuditChipLabel({ ...d, total: TOTAL }).title,
);
// 12/30 = 40, 5/30 = 17, 8/30 = 27, 3/30 = 10, 2/30 = 7
check("realistic: Redact 40%", tooltips[0],
  "Redact · 12 actions · 40% of visible ring");
check("realistic: Scrub 17%", tooltips[1],
  "Scrub · 5 actions · 17% of visible ring");
check("realistic: Lifecycle 27%", tooltips[2],
  "Lifecycle · 8 actions · 27% of visible ring");
check("realistic: Host 10%", tooltips[3],
  "Host · 3 actions · 10% of visible ring");
check("realistic: TTL 7%", tooltips[4],
  "TTL · 2 actions · 7% of visible ring");
// Sum of all percentages should be very close to 100 (rounding error ≤ 3).
const pctSum = tooltips
  .map((t) => parseInt(t.match(/(\d+)% of visible/)[1], 10))
  .reduce((a, b) => a + b, 0);
total++;
if (Math.abs(pctSum - 100) <= 3) pass++;
else console.error("FAIL realistic: percentage sum within tolerance got", pctSum);

// --- 9. text vs title divergence --------------------------------------
// The chip TEXT is short (label + parens). The TITLE is long (with %).
// Both come from the same input → consistency.
const tied = formatAuditChipLabel({ label: "X", count: 4, total: 16 });
check("text-title independence: text short",
  tied.text,
  "X (4)");
check("text-title independence: title long",
  tied.title,
  "X · 4 actions · 25% of visible ring");

console.log(`audit-chip-labels sanity: ${pass}/${total} pass`);
if (pass !== total) process.exit(1);
