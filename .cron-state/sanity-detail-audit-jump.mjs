// Sanity: precheckAuditJump + describeAuditJump.
//
// Inline copies of src/lib/detail-audit-jump.ts so this runs without
// a bundler. Covers null/empty detailId guard, non-array entries
// fallback, count math, defensive entry shapes, and the describe
// tooltip variants.

function precheckAuditJump(detailId, entries) {
  if (typeof detailId !== "string" || !detailId.trim()) {
    return { canJump: false, clipId: "", matchingCount: 0 };
  }
  const id = detailId.trim();
  let count = 0;
  if (Array.isArray(entries)) {
    for (const raw of entries) {
      if (!raw || typeof raw !== "object") continue;
      if (typeof raw.clipId === "string" && raw.clipId === id) count++;
    }
  }
  return { canJump: true, clipId: id, matchingCount: count };
}

function describeAuditJump(p) {
  if (!p.canJump) return "";
  if (p.matchingCount === 0) {
    return "No audit actions on this clip yet — opens an empty scope";
  }
  if (p.matchingCount === 1) {
    return "Scope the audit panel to this clip's 1 action";
  }
  return `Scope the audit panel to this clip's ${p.matchingCount} actions`;
}

let pass = 0;
let total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}

// --- 1. detailId guard ---------------------------------------------------
check("null detailId → no jump",
  precheckAuditJump(null, []),
  { canJump: false, clipId: "", matchingCount: 0 });
check("undefined detailId → no jump",
  precheckAuditJump(undefined, []),
  { canJump: false, clipId: "", matchingCount: 0 });
check("empty string detailId → no jump",
  precheckAuditJump("", []),
  { canJump: false, clipId: "", matchingCount: 0 });
check("whitespace-only detailId → no jump",
  precheckAuditJump("   ", []),
  { canJump: false, clipId: "", matchingCount: 0 });
check("number detailId → no jump",
  precheckAuditJump(42, []),
  { canJump: false, clipId: "", matchingCount: 0 });
check("object detailId → no jump",
  precheckAuditJump({ id: "abc" }, []),
  { canJump: false, clipId: "", matchingCount: 0 });

// --- 2. detailId trim ----------------------------------------------------
check("detailId trimmed",
  precheckAuditJump("  abc-123  ", []),
  { canJump: true, clipId: "abc-123", matchingCount: 0 });

// --- 3. entries-not-array fallback ---------------------------------------
check("null entries → can jump, 0 count",
  precheckAuditJump("c1", null),
  { canJump: true, clipId: "c1", matchingCount: 0 });
check("undefined entries → can jump, 0 count",
  precheckAuditJump("c1", undefined),
  { canJump: true, clipId: "c1", matchingCount: 0 });
check("string entries → can jump, 0 count",
  precheckAuditJump("c1", "not an array"),
  { canJump: true, clipId: "c1", matchingCount: 0 });
check("object entries → can jump, 0 count",
  precheckAuditJump("c1", { entries: [] }),
  { canJump: true, clipId: "c1", matchingCount: 0 });

// --- 4. count math -------------------------------------------------------
const entriesA = [
  { id: "a1", kind: "redact", clipId: "c1", at: 1 },
  { id: "a2", kind: "trash", clipId: "c1", at: 2 },
  { id: "a3", kind: "archive", clipId: "c2", at: 3 },
  { id: "a4", kind: "redact", clipId: "c1", at: 4 },
];
check("count matches for c1 (3)",
  precheckAuditJump("c1", entriesA),
  { canJump: true, clipId: "c1", matchingCount: 3 });
check("count matches for c2 (1)",
  precheckAuditJump("c2", entriesA),
  { canJump: true, clipId: "c2", matchingCount: 1 });
check("no matches for unknown clipId",
  precheckAuditJump("c-nope", entriesA),
  { canJump: true, clipId: "c-nope", matchingCount: 0 });

// --- 5. defensive entry shapes -------------------------------------------
const messy = [
  null,
  undefined,
  "not-an-entry",
  42,
  { clipId: "c1" }, // ok
  { kind: "redact" }, // no clipId
  { clipId: null }, // wrong type
  { clipId: 99 }, // wrong type
  { clipId: "c1", kind: "trash" }, // ok
  { clipId: "" }, // empty doesn't match anything but doesn't crash
];
check("messy entries filtered, c1 count=2",
  precheckAuditJump("c1", messy),
  { canJump: true, clipId: "c1", matchingCount: 2 });

// --- 6. trimmed id matches non-trimmed entry clipId ---------------------
const exactA = [
  { clipId: "abc" },
  { clipId: " abc " }, // entries are NOT trimmed — must NOT match
  { clipId: "abc" },
];
check("entry clipId trim is NOT applied (strict equality)",
  precheckAuditJump("abc", exactA),
  { canJump: true, clipId: "abc", matchingCount: 2 });

// --- 7. empty array ------------------------------------------------------
check("empty entries → can jump, 0 count",
  precheckAuditJump("c1", []),
  { canJump: true, clipId: "c1", matchingCount: 0 });

// --- 8. describe variants ------------------------------------------------
check("describe: no-jump → empty string",
  describeAuditJump({ canJump: false, clipId: "", matchingCount: 0 }),
  "");
check("describe: 0 matches → 'no actions yet'",
  describeAuditJump({ canJump: true, clipId: "c1", matchingCount: 0 }),
  "No audit actions on this clip yet — opens an empty scope");
check("describe: 1 match → singular",
  describeAuditJump({ canJump: true, clipId: "c1", matchingCount: 1 }),
  "Scope the audit panel to this clip's 1 action");
check("describe: 2 matches → plural with count",
  describeAuditJump({ canJump: true, clipId: "c1", matchingCount: 2 }),
  "Scope the audit panel to this clip's 2 actions");
check("describe: 47 matches → plural with count",
  describeAuditJump({ canJump: true, clipId: "c1", matchingCount: 47 }),
  "Scope the audit panel to this clip's 47 actions");

// --- 9. realistic ring ---------------------------------------------------
const ring = [];
for (let i = 0; i < 30; i++) {
  ring.push({ id: `a${i}`, kind: i % 3 === 0 ? "trash" : "redact", clipId: i % 5 === 0 ? "target" : `c${i}`, at: 1_700_000_000_000 - i * 1000 });
}
// targets: i=0,5,10,15,20,25 → 6
const realistic = precheckAuditJump("target", ring);
check("realistic ring: 6/30 match target",
  realistic,
  { canJump: true, clipId: "target", matchingCount: 6 });
check("realistic ring: describe reads 'this clip's 6 actions'",
  describeAuditJump(realistic),
  "Scope the audit panel to this clip's 6 actions");

console.log(`detail-audit-jump sanity: ${pass}/${total} pass`);
if (pass !== total) process.exit(1);
