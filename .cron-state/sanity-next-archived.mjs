// Sanity: nextArchivedClipId + archivedClipsSorted + describeArchiveCycle.
//
// Inline copies of src/lib/next-archived.ts so this runs without a
// bundler. Covers empty / defensive / single / multi / wrap /
// cursor-not-in-set / cursor-not-archived / tie-breaker math, plus
// the describe variants for the Cmd+K label.

function archivedClipsSorted(clips, axis = "lastSeenAt") {
  if (!Array.isArray(clips)) return [];
  const out = clips.filter(
    (c) => c && typeof c.id === "string" && c.id.length > 0 && c.archived === true,
  );
  out.sort((a, b) => {
    const av = typeof a[axis] === "number" ? a[axis] : 0;
    const bv = typeof b[axis] === "number" ? b[axis] : 0;
    if (bv !== av) return bv - av;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
  return out;
}

function nextArchivedClipId(clips, currentId, axis = "lastSeenAt") {
  const sorted = archivedClipsSorted(clips, axis);
  if (sorted.length === 0) return null;
  if (typeof currentId !== "string" || !currentId) return sorted[0].id;
  const idx = sorted.findIndex((c) => c.id === currentId);
  if (idx < 0) return sorted[0].id;
  if (sorted.length === 1) return sorted[0].id;
  const next = (idx + 1) % sorted.length;
  return sorted[next].id;
}

function prevArchivedClipId(clips, currentId, axis = "lastSeenAt") {
  const sorted = archivedClipsSorted(clips, axis);
  if (sorted.length === 0) return null;
  if (typeof currentId !== "string" || !currentId)
    return sorted[sorted.length - 1].id;
  const idx = sorted.findIndex((c) => c.id === currentId);
  if (idx < 0) return sorted[sorted.length - 1].id;
  if (sorted.length === 1) return sorted[0].id;
  const prev = (idx - 1 + sorted.length) % sorted.length;
  return sorted[prev].id;
}

function describeArchiveCycle(count) {
  if (!Number.isFinite(count) || count <= 0) {
    return {
      label: "Jump to next archived clip",
      hint: "No archived clips to cycle through",
    };
  }
  if (count === 1) {
    return {
      label: "Jump to next archived clip · 1 archived",
      hint: "Only one archived clip — opens it",
    };
  }
  return {
    label: `Jump to next archived clip · ${count} archived`,
    hint: "Open detail-view for the next archived clip (wraps)",
  };
}

function describeArchiveCycleReverse(count) {
  if (!Number.isFinite(count) || count <= 0) {
    return {
      label: "Jump to previous archived clip",
      hint: "No archived clips to cycle through",
    };
  }
  if (count === 1) {
    return {
      label: "Jump to previous archived clip · 1 archived",
      hint: "Only one archived clip — opens it",
    };
  }
  return {
    label: `Jump to previous archived clip · ${count} archived`,
    hint: "Open detail-view for the previous archived clip (wraps)",
  };
}

let pass = 0;
let total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}

// --- 1. Defensive: bad inputs --------------------------------------------
check("null clips → []", archivedClipsSorted(null), []);
check("undefined clips → []", archivedClipsSorted(undefined), []);
check("string clips → []", archivedClipsSorted("nope"), []);
check("object clips → []", archivedClipsSorted({ clips: [] }), []);
check("empty array → []", archivedClipsSorted([]), []);

// --- 2. Filtering: only archived survive ---------------------------------
const mixed = [
  { id: "a", archived: true, lastSeenAt: 100 },
  { id: "b", archived: false, lastSeenAt: 200 },
  { id: "c", archived: true, lastSeenAt: 300 },
  { id: "d", lastSeenAt: 400 }, // no archived field
  { id: "e", archived: "yes", lastSeenAt: 500 }, // wrong type
  { id: "f", archived: 1, lastSeenAt: 600 }, // wrong type
];
check("filter: only archived=true survive",
  archivedClipsSorted(mixed).map((c) => c.id),
  ["c", "a"]);

// --- 3. Defensive entry shapes -------------------------------------------
const messy = [
  null,
  undefined,
  "not-a-clip",
  { archived: true }, // no id
  { id: "", archived: true }, // empty id
  { id: 42, archived: true }, // non-string id
  { id: "ok", archived: true, lastSeenAt: 10 },
];
check("filter: defensive against bad shapes",
  archivedClipsSorted(messy).map((c) => c.id),
  ["ok"]);

// --- 4. Sort by lastSeenAt desc ------------------------------------------
const series = [
  { id: "old", archived: true, lastSeenAt: 100 },
  { id: "new", archived: true, lastSeenAt: 300 },
  { id: "mid", archived: true, lastSeenAt: 200 },
];
check("sort: newest first",
  archivedClipsSorted(series).map((c) => c.id),
  ["new", "mid", "old"]);

// --- 5. Tie-breaker: id desc when timestamps equal -----------------------
const tied = [
  { id: "alpha", archived: true, lastSeenAt: 100 },
  { id: "bravo", archived: true, lastSeenAt: 100 },
  { id: "charlie", archived: true, lastSeenAt: 100 },
];
check("tie-breaker: id desc when ts equal",
  archivedClipsSorted(tied).map((c) => c.id),
  ["charlie", "bravo", "alpha"]);

// --- 6. Sort axis: createdAt ---------------------------------------------
const created = [
  { id: "x", archived: true, lastSeenAt: 999, createdAt: 100 },
  { id: "y", archived: true, lastSeenAt: 1, createdAt: 500 },
  { id: "z", archived: true, lastSeenAt: 500, createdAt: 300 },
];
check("axis=createdAt sorts by createdAt desc",
  archivedClipsSorted(created, "createdAt").map((c) => c.id),
  ["y", "z", "x"]);

// --- 7. Missing axis values default to 0 ---------------------------------
const noTs = [
  { id: "withTs", archived: true, lastSeenAt: 100 },
  { id: "noTs", archived: true }, // no lastSeenAt
];
check("missing lastSeenAt treated as 0 (loses to populated)",
  archivedClipsSorted(noTs).map((c) => c.id),
  ["withTs", "noTs"]);

// --- 8. nextArchivedClipId: empty clips → null ---------------------------
check("next: empty clips → null",
  nextArchivedClipId([], null),
  null);
check("next: no archived → null",
  nextArchivedClipId([{ id: "a", archived: false }], null),
  null);
check("next: null clips → null",
  nextArchivedClipId(null, null),
  null);

// --- 9. nextArchivedClipId: no cursor → first ----------------------------
check("next: no cursor → first archived",
  nextArchivedClipId(series, null),
  "new");
check("next: empty-string cursor → first archived",
  nextArchivedClipId(series, ""),
  "new");
check("next: undefined cursor → first archived",
  nextArchivedClipId(series, undefined),
  "new");

// --- 10. nextArchivedClipId: cursor not archived → first -----------------
const allClipsBoth = [
  { id: "live1", archived: false, lastSeenAt: 1000 },
  { id: "arc1", archived: true, lastSeenAt: 100 },
  { id: "arc2", archived: true, lastSeenAt: 200 },
];
check("next: live cursor → first archived",
  nextArchivedClipId(allClipsBoth, "live1"),
  "arc2");
check("next: unknown cursor → first archived",
  nextArchivedClipId(allClipsBoth, "ghost"),
  "arc2");

// --- 11. nextArchivedClipId: single archived → that one ------------------
const single = [{ id: "only", archived: true, lastSeenAt: 100 }];
check("next: single archived, no cursor → that one",
  nextArchivedClipId(single, null),
  "only");
check("next: single archived, cursor IS that one → still that one",
  nextArchivedClipId(single, "only"),
  "only");

// --- 12. nextArchivedClipId: wrap math -----------------------------------
const cycle = [
  { id: "a", archived: true, lastSeenAt: 100 },
  { id: "b", archived: true, lastSeenAt: 200 },
  { id: "c", archived: true, lastSeenAt: 300 },
];
// Sorted: c, b, a
check("next: cursor=c → b",
  nextArchivedClipId(cycle, "c"),
  "b");
check("next: cursor=b → a",
  nextArchivedClipId(cycle, "b"),
  "a");
check("next: cursor=a → wrap to c",
  nextArchivedClipId(cycle, "a"),
  "c");

// --- 13. describeArchiveCycle variants -----------------------------------
check("describe: 0 → no archived",
  describeArchiveCycle(0),
  { label: "Jump to next archived clip", hint: "No archived clips to cycle through" });
check("describe: negative → no archived",
  describeArchiveCycle(-5),
  { label: "Jump to next archived clip", hint: "No archived clips to cycle through" });
check("describe: NaN → no archived",
  describeArchiveCycle(NaN),
  { label: "Jump to next archived clip", hint: "No archived clips to cycle through" });
check("describe: Infinity → no archived",
  describeArchiveCycle(Infinity),
  { label: "Jump to next archived clip", hint: "No archived clips to cycle through" });
check("describe: 1 → singular only-one variant",
  describeArchiveCycle(1),
  { label: "Jump to next archived clip · 1 archived", hint: "Only one archived clip — opens it" });
check("describe: 2 → plural",
  describeArchiveCycle(2),
  { label: "Jump to next archived clip · 2 archived", hint: "Open detail-view for the next archived clip (wraps)" });
check("describe: 47 → plural with count",
  describeArchiveCycle(47),
  { label: "Jump to next archived clip · 47 archived", hint: "Open detail-view for the next archived clip (wraps)" });

// --- 14. Realistic ring + cycle ------------------------------------------
const ring = [];
for (let i = 0; i < 10; i++) {
  ring.push({ id: `c${i}`, archived: i % 2 === 0, lastSeenAt: 1_700_000_000_000 - i * 1000 });
}
// archived = c0, c2, c4, c6, c8 (lastSeenAt desc: c0 newest)
const archivedIds = archivedClipsSorted(ring).map((c) => c.id);
check("realistic ring: archived ids sorted",
  archivedIds,
  ["c0", "c2", "c4", "c6", "c8"]);
check("realistic ring: c0 → c2",
  nextArchivedClipId(ring, "c0"),
  "c2");
check("realistic ring: c8 → c0 (wrap)",
  nextArchivedClipId(ring, "c8"),
  "c0");

// --- 15. prevArchivedClipId: defensive / empty ---------------------------
check("prev: empty clips → null",
  prevArchivedClipId([], null),
  null);
check("prev: no archived → null",
  prevArchivedClipId([{ id: "a", archived: false }], null),
  null);
check("prev: null clips → null",
  prevArchivedClipId(null, null),
  null);

// --- 16. prevArchivedClipId: no cursor → tail (mirror of next's "first") -
check("prev: no cursor → last archived (oldest)",
  prevArchivedClipId(series, null),
  "old");
check("prev: empty-string cursor → last archived",
  prevArchivedClipId(series, ""),
  "old");
check("prev: undefined cursor → last archived",
  prevArchivedClipId(series, undefined),
  "old");

// --- 17. prevArchivedClipId: cursor not archived → tail ------------------
check("prev: live cursor → last archived",
  prevArchivedClipId(allClipsBoth, "live1"),
  "arc1");
check("prev: unknown cursor → last archived",
  prevArchivedClipId(allClipsBoth, "ghost"),
  "arc1");

// --- 18. prevArchivedClipId: single archived → that one ------------------
check("prev: single archived, no cursor → that one",
  prevArchivedClipId(single, null),
  "only");
check("prev: single archived, cursor IS that one → still that one",
  prevArchivedClipId(single, "only"),
  "only");

// --- 19. prevArchivedClipId: wrap math (reverse) ------------------------
// Sorted: c, b, a
check("prev: cursor=c → wrap to a (head wraps to tail)",
  prevArchivedClipId(cycle, "c"),
  "a");
check("prev: cursor=b → c",
  prevArchivedClipId(cycle, "b"),
  "c");
check("prev: cursor=a → b",
  prevArchivedClipId(cycle, "a"),
  "b");

// --- 20. Forward + reverse round-trip: cycle invariant -------------------
// Walking next then prev from any cursor → land back on the cursor
// (cycle length > 1). Confirms the two directions are inverse.
for (const start of ["a", "b", "c"]) {
  const fwd = nextArchivedClipId(cycle, start);
  const roundTrip = prevArchivedClipId(cycle, fwd);
  check(`round-trip: next(${start}) → prev → ${start}`,
    roundTrip,
    start);
}

// --- 21. describeArchiveCycleReverse variants ----------------------------
check("describe-rev: 0 → no archived",
  describeArchiveCycleReverse(0),
  { label: "Jump to previous archived clip", hint: "No archived clips to cycle through" });
check("describe-rev: negative → no archived",
  describeArchiveCycleReverse(-3),
  { label: "Jump to previous archived clip", hint: "No archived clips to cycle through" });
check("describe-rev: NaN → no archived",
  describeArchiveCycleReverse(NaN),
  { label: "Jump to previous archived clip", hint: "No archived clips to cycle through" });
check("describe-rev: Infinity → no archived",
  describeArchiveCycleReverse(Infinity),
  { label: "Jump to previous archived clip", hint: "No archived clips to cycle through" });
check("describe-rev: 1 → singular",
  describeArchiveCycleReverse(1),
  { label: "Jump to previous archived clip · 1 archived", hint: "Only one archived clip — opens it" });
check("describe-rev: 2 → plural",
  describeArchiveCycleReverse(2),
  { label: "Jump to previous archived clip · 2 archived", hint: "Open detail-view for the previous archived clip (wraps)" });
check("describe-rev: 47 → plural with count",
  describeArchiveCycleReverse(47),
  { label: "Jump to previous archived clip · 47 archived", hint: "Open detail-view for the previous archived clip (wraps)" });

// --- 22. Realistic ring: prev direction ---------------------------------
// archived = c0, c2, c4, c6, c8 (lastSeenAt desc: c0 newest)
check("realistic ring: prev(c0) → c8 (wrap)",
  prevArchivedClipId(ring, "c0"),
  "c8");
check("realistic ring: prev(c4) → c2",
  prevArchivedClipId(ring, "c4"),
  "c2");
check("realistic ring: prev(c8) → c6",
  prevArchivedClipId(ring, "c8"),
  "c6");

console.log(`next-archived sanity: ${pass}/${total} pass`);
if (pass !== total) process.exit(1);
