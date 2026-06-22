// Sanity: clip-lock — partitionLocked + formatLockConfirm + formatLockedClipConfirm
//
// The per-clip "ask before deleting" lock gates EVERY delete path
// (row, keyboard Del, bulk-bar, right-click, detail) through a confirm
// when any selected clip carries the bit. This file exercises the
// pure helpers that drive those confirms so the popup wiring can stay
// declarative and the grammar is tested once.

// --- Module under test (inlined; mirrors src/lib/clip-lock.ts) ----------

function partitionLocked(clips) {
  const out = { locked: [], unlocked: [] };
  if (!Array.isArray(clips)) return out;
  for (const c of clips) {
    if (!c || typeof c.id !== "string" || c.id.length === 0) continue;
    if (c.locked === true) out.locked.push(c.id);
    else out.unlocked.push(c.id);
  }
  return out;
}

function formatLockConfirm(p) {
  const locked = p.locked.length;
  const unlocked = p.unlocked.length;
  if (locked === 0) return null;
  const plural = (n, s) => `${n} ${s}${n === 1 ? "" : "s"}`;
  if (unlocked === 0) {
    if (locked === 1) {
      return (
        `Delete 1 locked clip?\n\n` +
        `The clip is marked "ask before deleting". It still goes to trash (restorable for 7 days), ` +
        `but you wanted an explicit confirm.`
      );
    }
    return (
      `Delete ${plural(locked, "locked clip")}?\n\n` +
      `All ${locked} are marked "ask before deleting". They go to trash (restorable for 7 days), ` +
      `but you wanted an explicit confirm.`
    );
  }
  const total = locked + unlocked;
  return (
    `Delete ${plural(total, "clip")}? (${locked} locked)\n\n` +
    `${plural(locked, "clip")} ${locked === 1 ? "is" : "are"} marked "ask before deleting" — they ` +
    `go to trash too, but you wanted an explicit confirm.`
  );
}

function formatLockedClipConfirm(preview) {
  const raw = (preview || "").replace(/\s+/g, " ").trim();
  const snippet = raw.slice(0, 60);
  const label = snippet ? `"${snippet}${raw.length > 60 ? "…" : ""}"` : "this clip";
  return (
    `Delete the locked clip ${label}?\n\n` +
    `It's marked "ask before deleting". Goes to trash (restorable for 7 days).`
  );
}

// --- Test harness --------------------------------------------------------

let pass = 0;
let total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}
function checkContains(name, hay, needle) {
  total++;
  const ok = typeof hay === "string" && hay.includes(needle);
  if (ok) pass++;
  else console.error("FAIL", name, "in", JSON.stringify(hay), "missing", JSON.stringify(needle));
}

// --- 1. partitionLocked: empty + defensive shapes ------------------------
check("partition: empty array → {locked:[], unlocked:[]}",
  partitionLocked([]), { locked: [], unlocked: [] });
check("partition: null input → {locked:[], unlocked:[]}",
  partitionLocked(null), { locked: [], unlocked: [] });
check("partition: undefined input → {locked:[], unlocked:[]}",
  partitionLocked(undefined), { locked: [], unlocked: [] });
check("partition: non-array (string) → {locked:[], unlocked:[]}",
  partitionLocked("not an array"), { locked: [], unlocked: [] });
check("partition: non-array (object) → {locked:[], unlocked:[]}",
  partitionLocked({ id: "a" }), { locked: [], unlocked: [] });

// --- 2. partitionLocked: single clip --------------------------------------
check("partition: 1 unlocked clip",
  partitionLocked([{ id: "a" }]),
  { locked: [], unlocked: ["a"] });
check("partition: 1 locked clip",
  partitionLocked([{ id: "a", locked: true }]),
  { locked: ["a"], unlocked: [] });

// locked falsy values treated as unlocked.
check("partition: locked:false → unlocked",
  partitionLocked([{ id: "a", locked: false }]),
  { locked: [], unlocked: ["a"] });
check("partition: locked:undefined → unlocked",
  partitionLocked([{ id: "a", locked: undefined }]),
  { locked: [], unlocked: ["a"] });
check("partition: locked:null → unlocked",
  partitionLocked([{ id: "a", locked: null }]),
  { locked: [], unlocked: ["a"] });

// locked truthy but non-boolean: STRICT === true, so 1 / "yes" → unlocked.
// This is intentional: lock is a boolean intent, not a truthy fallback.
check("partition: locked:1 (truthy non-boolean) → unlocked (strict)",
  partitionLocked([{ id: "a", locked: 1 }]),
  { locked: [], unlocked: ["a"] });
check("partition: locked:'true' (string) → unlocked (strict)",
  partitionLocked([{ id: "a", locked: "true" }]),
  { locked: [], unlocked: ["a"] });

// --- 3. partitionLocked: mixed batch with order preservation -------------
check("partition: mixed batch preserves relative order",
  partitionLocked([
    { id: "a", locked: false },
    { id: "b", locked: true },
    { id: "c" },
    { id: "d", locked: true },
    { id: "e" },
  ]),
  { locked: ["b", "d"], unlocked: ["a", "c", "e"] });

// --- 4. partitionLocked: defensive bad entries ---------------------------
check("partition: drops null entries",
  partitionLocked([null, { id: "a" }, undefined, { id: "b", locked: true }]),
  { locked: ["b"], unlocked: ["a"] });
check("partition: drops entries with missing id",
  partitionLocked([{ locked: true }, { id: "a" }]),
  { locked: [], unlocked: ["a"] });
check("partition: drops entries with empty-string id",
  partitionLocked([{ id: "", locked: true }, { id: "a" }]),
  { locked: [], unlocked: ["a"] });
check("partition: drops entries with non-string id",
  partitionLocked([{ id: 42, locked: true }, { id: "a" }]),
  { locked: [], unlocked: ["a"] });

// --- 5. formatLockConfirm: only-unlocked → null --------------------------
check("format: empty partition → null",
  formatLockConfirm({ locked: [], unlocked: [] }), null);
check("format: only unlocked → null (caller skips confirm)",
  formatLockConfirm({ locked: [], unlocked: ["a", "b"] }), null);

// --- 6. formatLockConfirm: pure locked batch -----------------------------
const msg1 = formatLockConfirm({ locked: ["a"], unlocked: [] });
checkContains("format: 1 locked → '1 locked clip'", msg1, "Delete 1 locked clip?");
checkContains("format: 1 locked → explains why", msg1, "marked");
checkContains("format: 1 locked → '7 days'", msg1, "7 days");

const msg5 = formatLockConfirm({ locked: ["a", "b", "c", "d", "e"], unlocked: [] });
checkContains("format: 5 locked → '5 locked clips' (plural)", msg5, "Delete 5 locked clips?");
checkContains("format: 5 locked → 'All 5 are marked'", msg5, "All 5 are marked");

// --- 7. formatLockConfirm: mixed batch -----------------------------------
const msgMixed = formatLockConfirm({ locked: ["a", "b"], unlocked: ["c", "d", "e"] });
checkContains("format: 2+3 → 'Delete 5 clips? (2 locked)'", msgMixed, "Delete 5 clips? (2 locked)");
checkContains("format: 2 locked + 3 unlocked → '2 clips are marked'", msgMixed, "2 clips are marked");

const msg1plus3 = formatLockConfirm({ locked: ["a"], unlocked: ["c", "d", "e"] });
checkContains("format: 1+3 → 'Delete 4 clips? (1 locked)'", msg1plus3, "Delete 4 clips? (1 locked)");
// Subject-verb agreement: 1 clip IS marked, not ARE.
checkContains("format: 1+3 → '1 clip is marked' (singular verb)", msg1plus3, "1 clip is marked");

const msg2plus1 = formatLockConfirm({ locked: ["a", "b"], unlocked: ["c"] });
checkContains("format: 2+1 → 'Delete 3 clips? (2 locked)'", msg2plus1, "Delete 3 clips? (2 locked)");
checkContains("format: 2+1 → '2 clips are marked' (plural verb)", msg2plus1, "2 clips are marked");

// --- 8. formatLockedClipConfirm: single-clip flow -----------------------
checkContains("single-clip: includes preview slice",
  formatLockedClipConfirm("My very important snippet"),
  '"My very important snippet"');
checkContains("single-clip: 60-char cap with ellipsis",
  formatLockedClipConfirm("a".repeat(80)),
  `"${"a".repeat(60)}…"`);
checkContains("single-clip: exactly 60 chars → no ellipsis",
  formatLockedClipConfirm("a".repeat(60)),
  `"${"a".repeat(60)}"`);
check("single-clip: 60 chars → ellipsis NOT present",
  formatLockedClipConfirm("a".repeat(60)).includes("…"), false);
checkContains("single-clip: empty preview → 'this clip'",
  formatLockedClipConfirm(""), "Delete the locked clip this clip?");
checkContains("single-clip: null preview → 'this clip'",
  formatLockedClipConfirm(null), "Delete the locked clip this clip?");
checkContains("single-clip: undefined preview → 'this clip'",
  formatLockedClipConfirm(undefined), "Delete the locked clip this clip?");
checkContains("single-clip: whitespace-only → 'this clip'",
  formatLockedClipConfirm("   \n\t  "), "Delete the locked clip this clip?");
checkContains("single-clip: newlines collapsed",
  formatLockedClipConfirm("line one\n\nline two"),
  '"line one line two"');
checkContains("single-clip: tabs collapsed",
  formatLockedClipConfirm("a\tb\tc"),
  '"a b c"');
checkContains("single-clip: 7-day promise carried",
  formatLockedClipConfirm("foo"), "7 days");

// --- 9. Round-trip: ids in partition survive intact ---------------------
const round = partitionLocked([
  { id: "x", locked: true },
  { id: "y" },
  { id: "z", locked: true },
]);
check("round-trip: locked ids preserved", round.locked, ["x", "z"]);
check("round-trip: unlocked ids preserved", round.unlocked, ["y"]);

// --- 10. Stress: 100 clips with alternating lock state ------------------
const stress = [];
for (let i = 0; i < 100; i++) {
  stress.push({ id: `clip-${i}`, locked: i % 3 === 0 });
}
const stressPart = partitionLocked(stress);
check("stress: 34 locked from 100 alternating",
  stressPart.locked.length, 34); // 0, 3, 6, ..., 99 = 34 entries
check("stress: 66 unlocked from 100",
  stressPart.unlocked.length, 66);
// First and last entries land in the right buckets.
check("stress: first id (locked) is clip-0",
  stressPart.locked[0], "clip-0");
check("stress: last id (locked) is clip-99",
  stressPart.locked[stressPart.locked.length - 1], "clip-99");

console.log(`clip-lock sanity: ${pass}/${total} pass`);
if (pass !== total) process.exit(1);
