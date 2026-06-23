// Sanity: bulk-lockpin — planBulkLockPin + isBulkLockPinActionable
// + formatBulkLockPinToast + formatBulkLockPinButtonTitle
//
// The bulk-bar "Lock + pin selection" combo button is ADDITIVE: it
// only ever ADDS the pin and lock bits; it never strips them. This
// is deliberate — the dedicated bulk-pin / bulk-lock buttons handle
// the toggle direction; the combo just performs the typical
// "this is irreplaceable AND keep at top" workflow in one chord.
//
// Truth-table the projection helper covers:
//   - !pinned && !locked → both writes (pin + lock)
//   - pinned && !locked → 1 lock write
//   - !pinned && locked → 1 pin write
//   - pinned && locked === true → no writes (alreadyBoth++)
//   - locked truthy non-bool (locked:1) → counts as needing lock
//     because strict gate
//
// Toast + button title use the projection so the user sees an
// honest "Locked+pinned N of M" or "All N already locked+pinned"
// label.

// --- Inlined module under test (mirrors src/lib/bulk-lockpin.ts) ---------

function planBulkLockPin(clips) {
  const plan = { pinWrites: 0, lockWrites: 0, alreadyBoth: 0, total: 0 };
  if (!Array.isArray(clips)) return plan;
  for (const c of clips) {
    if (!c || typeof c.id !== "string" || c.id.length === 0) continue;
    plan.total++;
    const isPinned = !!c.pinned;
    const isLocked = c.locked === true;
    if (isPinned && isLocked) {
      plan.alreadyBoth++;
      continue;
    }
    if (!isPinned) plan.pinWrites++;
    if (!isLocked) plan.lockWrites++;
  }
  return plan;
}

function isBulkLockPinActionable(clips) {
  const plan = planBulkLockPin(clips);
  if (plan.total === 0) return false;
  return plan.pinWrites > 0 || plan.lockWrites > 0;
}

function formatBulkLockPinToast(plan) {
  const total = Math.max(0, Math.floor(Number(plan.total) || 0));
  const skipped = Math.max(0, Math.floor(Number(plan.alreadyBoth) || 0));
  if (total === 0) return "Nothing to lock+pin";
  const safeSkipped = Math.min(skipped, total);
  const changed = total - safeSkipped;
  if (changed === 0) {
    return total === 1
      ? "Already locked+pinned"
      : `All ${total} already locked+pinned`;
  }
  const noun = changed === 1 ? "clip" : "clips";
  if (safeSkipped === 0) return `Locked+pinned ${changed} ${noun}`;
  return `Locked+pinned ${changed} of ${total} clips · ${safeSkipped} already both`;
}

function formatBulkLockPinButtonTitle(clips) {
  const plan = planBulkLockPin(clips);
  if (plan.total === 0) return "Lock + pin selection";
  const changed = plan.total - plan.alreadyBoth;
  if (changed === 0) {
    return plan.total === 1
      ? "Already locked + pinned"
      : `All ${plan.total} already locked + pinned`;
  }
  const noun = changed === 1 ? "clip" : "clips";
  if (plan.alreadyBoth === 0) return `Lock + pin ${changed} ${noun}`;
  return `Lock + pin ${changed} of ${plan.total} (${plan.alreadyBoth} already both)`;
}

// --- Harness -------------------------------------------------------------
let pass = 0, total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}

// --- 1. plan: defensive shapes ------------------------------------------
check("plan: empty array → zero everything",
  planBulkLockPin([]), { pinWrites: 0, lockWrites: 0, alreadyBoth: 0, total: 0 });
check("plan: null input → zero everything",
  planBulkLockPin(null), { pinWrites: 0, lockWrites: 0, alreadyBoth: 0, total: 0 });
check("plan: non-array (string) → zero everything",
  planBulkLockPin("oops"), { pinWrites: 0, lockWrites: 0, alreadyBoth: 0, total: 0 });
check("plan: array with null entries → skips them",
  planBulkLockPin([null, { id: "a" }, undefined, { id: "b" }]),
  { pinWrites: 2, lockWrites: 2, alreadyBoth: 0, total: 2 });
check("plan: entries with empty id skipped",
  planBulkLockPin([{ id: "" }, { id: "a" }]),
  { pinWrites: 1, lockWrites: 1, alreadyBoth: 0, total: 1 });

// --- 2. plan: truth table ----------------------------------------------
check("plan: pinned=false locked=false → both writes",
  planBulkLockPin([{ id: "a" }]),
  { pinWrites: 1, lockWrites: 1, alreadyBoth: 0, total: 1 });
check("plan: pinned=true locked=false → 1 lock write",
  planBulkLockPin([{ id: "a", pinned: true }]),
  { pinWrites: 0, lockWrites: 1, alreadyBoth: 0, total: 1 });
check("plan: pinned=false locked=true → 1 pin write",
  planBulkLockPin([{ id: "a", locked: true }]),
  { pinWrites: 1, lockWrites: 0, alreadyBoth: 0, total: 1 });
check("plan: pinned=true locked=true → already-both, no writes",
  planBulkLockPin([{ id: "a", pinned: true, locked: true }]),
  { pinWrites: 0, lockWrites: 0, alreadyBoth: 1, total: 1 });

// Strict gate: truthy non-bool counts as NOT locked (will get a write).
check("plan: pinned=true locked=1 (truthy non-bool) → 1 lock write (strict)",
  planBulkLockPin([{ id: "a", pinned: true, locked: 1 }]),
  { pinWrites: 0, lockWrites: 1, alreadyBoth: 0, total: 1 });
check("plan: pinned=true locked='yes' → 1 lock write (strict)",
  planBulkLockPin([{ id: "a", pinned: true, locked: "yes" }]),
  { pinWrites: 0, lockWrites: 1, alreadyBoth: 0, total: 1 });

// --- 3. plan: mixed selection -------------------------------------------
const mix = [
  { id: "1", pinned: true, locked: true },      // already both
  { id: "2", pinned: true },                    // needs lock
  { id: "3", locked: true },                    // needs pin
  { id: "4" },                                   // needs both
  { id: "5", pinned: true, locked: true },      // already both
];
check("plan: 5-clip mixed selection — 2 pin writes, 2 lock writes, 2 already-both",
  planBulkLockPin(mix),
  { pinWrites: 2, lockWrites: 2, alreadyBoth: 2, total: 5 });

// --- 4. isBulkLockPinActionable -----------------------------------------
check("actionable: empty selection → false", isBulkLockPinActionable([]), false);
check("actionable: every clip already both → false",
  isBulkLockPinActionable([{ id: "a", pinned: true, locked: true }]), false);
check("actionable: some clip needs at least one bit → true",
  isBulkLockPinActionable([{ id: "a", pinned: true, locked: true }, { id: "b" }]),
  true);
check("actionable: single clip needs both → true",
  isBulkLockPinActionable([{ id: "a" }]), true);
check("actionable: clip with locked:1 (strict-rejected) → true (would clean up)",
  isBulkLockPinActionable([{ id: "a", pinned: true, locked: 1 }]), true);

// --- 5. toast formatting -----------------------------------------------
check("toast: empty plan → 'Nothing to lock+pin'",
  formatBulkLockPinToast({ pinWrites: 0, lockWrites: 0, alreadyBoth: 0, total: 0 }),
  "Nothing to lock+pin");
check("toast: 1 clip already both → 'Already locked+pinned'",
  formatBulkLockPinToast({ pinWrites: 0, lockWrites: 0, alreadyBoth: 1, total: 1 }),
  "Already locked+pinned");
check("toast: 5 clips all already both → 'All 5 already locked+pinned'",
  formatBulkLockPinToast({ pinWrites: 0, lockWrites: 0, alreadyBoth: 5, total: 5 }),
  "All 5 already locked+pinned");
check("toast: 1 clip changed → singular 'clip'",
  formatBulkLockPinToast({ pinWrites: 1, lockWrites: 1, alreadyBoth: 0, total: 1 }),
  "Locked+pinned 1 clip");
check("toast: 3 clips changed → plural 'clips'",
  formatBulkLockPinToast({ pinWrites: 3, lockWrites: 3, alreadyBoth: 0, total: 3 }),
  "Locked+pinned 3 clips");
check("toast: 3 of 5 changed, 2 already both → mixed shape",
  formatBulkLockPinToast({ pinWrites: 2, lockWrites: 1, alreadyBoth: 2, total: 5 }),
  "Locked+pinned 3 of 5 clips · 2 already both");

// --- 6. button title formatting ----------------------------------------
check("title: empty selection → generic 'Lock + pin selection'",
  formatBulkLockPinButtonTitle([]), "Lock + pin selection");
check("title: 1 clip already both → 'Already locked + pinned'",
  formatBulkLockPinButtonTitle([{ id: "a", pinned: true, locked: true }]),
  "Already locked + pinned");
check("title: 4 clips all already both → 'All 4 already locked + pinned'",
  formatBulkLockPinButtonTitle([
    { id: "a", pinned: true, locked: true },
    { id: "b", pinned: true, locked: true },
    { id: "c", pinned: true, locked: true },
    { id: "d", pinned: true, locked: true },
  ]),
  "All 4 already locked + pinned");
check("title: 1 clip needs both → 'Lock + pin 1 clip'",
  formatBulkLockPinButtonTitle([{ id: "a" }]), "Lock + pin 1 clip");
check("title: 3 clips need both → 'Lock + pin 3 clips'",
  formatBulkLockPinButtonTitle([{ id: "a" }, { id: "b" }, { id: "c" }]),
  "Lock + pin 3 clips");
check("title: 3 of 5 need bits → 'Lock + pin 3 of 5 (2 already both)'",
  formatBulkLockPinButtonTitle(mix),
  "Lock + pin 3 of 5 (2 already both)");

// --- 7. realistic workflow end-to-end -----------------------------------
// User selects 8 clips: 3 untouched, 2 only pinned, 1 only locked, 2 both.
const realistic = [
  { id: "u1" },                                  // needs both
  { id: "u2" },                                  // needs both
  { id: "u3" },                                  // needs both
  { id: "p1", pinned: true },                    // needs lock
  { id: "p2", pinned: true },                    // needs lock
  { id: "l1", locked: true },                    // needs pin
  { id: "b1", pinned: true, locked: true },      // skip
  { id: "b2", pinned: true, locked: true },      // skip
];
const realPlan = planBulkLockPin(realistic);
check("realistic: 8-clip plan",
  realPlan, { pinWrites: 4, lockWrites: 5, alreadyBoth: 2, total: 8 });
check("realistic: title shape",
  formatBulkLockPinButtonTitle(realistic),
  "Lock + pin 6 of 8 (2 already both)");
check("realistic: toast shape",
  formatBulkLockPinToast(realPlan),
  "Locked+pinned 6 of 8 clips · 2 already both");

// --- 8. degenerate numeric inputs to toast ------------------------------
check("toast defensive: negative total → 'Nothing to lock+pin'",
  formatBulkLockPinToast({ pinWrites: 0, lockWrites: 0, alreadyBoth: 0, total: -5 }),
  "Nothing to lock+pin");
check("toast defensive: NaN total → 'Nothing to lock+pin'",
  formatBulkLockPinToast({ pinWrites: 0, lockWrites: 0, alreadyBoth: 0, total: NaN }),
  "Nothing to lock+pin");
check("toast defensive: skipped > total clamps to 0 changed",
  formatBulkLockPinToast({ pinWrites: 0, lockWrites: 0, alreadyBoth: 99, total: 3 }),
  "All 3 already locked+pinned");

console.log(`bulk-lockpin sanity: ${pass}/${total} passed`);
if (pass !== total) process.exit(1);
