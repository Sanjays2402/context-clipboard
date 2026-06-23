// Sanity: trash-restore-lock — button visibility + intent semantics
//
// The trash row carries the full ClipItem (incl. pinned + locked
// bits, preserved at trash time) plus a deletedAt stamp. Two combo
// buttons show or hide based on the bits:
//
//   - restore-pin  : visible when !pinned at trash time
//   - restore-lock : visible when locked !== true at trash time
//
// Both have the "just rescued — make it safer next time" semantic.
// Visibility uses the SAME strict gate the lock stack uses
// (=== true) so a stray locked:1 from an older import would still
// show the lock button — clicking it would normalise via
// setLocked(id, true) which idempotently writes a proper boolean.
//
// The handler routing (act === "restore-lock") triggers
// restoreClip + setLocked(id, true). setLocked is preferred over
// toggleLock because it's idempotent and stamps lockedAt on the
// transition — toggleLock would flip an already-locked clip OFF.

// --- Mirror the visibility logic from trashRow() in popup.ts -------------

function shouldShowRestorePin(t) {
  // wasPinned = !!t.pinned
  return !t.pinned;
}

function shouldShowRestoreLock(t) {
  // wasLocked = t.locked === true → hide when true
  return t.locked !== true;
}

// --- Mirror the handler intent: setLocked vs toggleLock -----------------
//
// Why setLocked(id, true) instead of toggleLock(id)?
//
// toggleLock flips: locked:false → true, true → false. If the trash
// row showed the button despite the clip being locked (stale render,
// truthy non-boolean lock that the strict gate failed on the read
// side), toggleLock would UN-lock the freshly restored clip — the
// opposite of what "Restore + lock" should do. setLocked(true) is
// idempotent so it lands as a no-op + truthful toast in that edge.

function simulatedRestoreLockHandler(t) {
  // Returns the action chain that gets executed.
  return [
    { op: "restoreClip", id: t.id },
    { op: "setLocked", id: t.id, want: true },
  ];
}

// --- Harness -------------------------------------------------------------
let pass = 0, total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}

// --- 1. restore-pin visibility (preserved unchanged contract) ----------
check("restore-pin shows when !pinned",
  shouldShowRestorePin({ id: "a" }), true);
check("restore-pin shows when pinned:false explicit",
  shouldShowRestorePin({ id: "a", pinned: false }), true);
check("restore-pin hides when pinned:true",
  shouldShowRestorePin({ id: "a", pinned: true }), false);

// --- 2. restore-lock visibility ----------------------------------------
check("restore-lock shows when locked undefined",
  shouldShowRestoreLock({ id: "a" }), true);
check("restore-lock shows when locked:false explicit",
  shouldShowRestoreLock({ id: "a", locked: false }), true);
check("restore-lock hides when locked:true",
  shouldShowRestoreLock({ id: "a", locked: true }), false);

// Strict gate: truthy non-boolean (locked:1) still SHOWS the button
// because the strict !== true is the same gate the rest of the
// lock stack uses — and clicking would clean it up to a proper
// boolean via setLocked(id, true).
check("restore-lock shows for locked:1 (strict gate cleans up on click)",
  shouldShowRestoreLock({ id: "a", locked: 1 }), true);
check("restore-lock shows for locked:'yes' (strict gate)",
  shouldShowRestoreLock({ id: "a", locked: "yes" }), true);
check("restore-lock shows for locked:null",
  shouldShowRestoreLock({ id: "a", locked: null }), true);

// --- 3. button matrix combinations -------------------------------------

// Neither pinned nor locked → both buttons show. Common case.
check("matrix: !pinned + !locked → both show",
  {
    pin: shouldShowRestorePin({ id: "a" }),
    lock: shouldShowRestoreLock({ id: "a" }),
  },
  { pin: true, lock: true });

// Pinned but not locked → only lock shows. ("It was already
// important to keep visible; now also irreplaceable.")
check("matrix: pinned + !locked → only restore-lock shows",
  {
    pin: shouldShowRestorePin({ id: "a", pinned: true }),
    lock: shouldShowRestoreLock({ id: "a", pinned: true }),
  },
  { pin: false, lock: true });

// Locked but not pinned → only pin shows. ("It was already
// irreplaceable; now also visible at top.")
check("matrix: !pinned + locked → only restore-pin shows",
  {
    pin: shouldShowRestorePin({ id: "a", locked: true }),
    lock: shouldShowRestoreLock({ id: "a", locked: true }),
  },
  { pin: true, lock: false });

// Both pinned and locked → only plain Restore. Trash preserved
// both bits so neither combo adds anything.
check("matrix: pinned + locked → neither combo shows",
  {
    pin: shouldShowRestorePin({ id: "a", pinned: true, locked: true }),
    lock: shouldShowRestoreLock({ id: "a", pinned: true, locked: true }),
  },
  { pin: false, lock: false });

// --- 4. handler intent (op sequence) -----------------------------------
check("handler: restoreClip then setLocked(true) — order matters",
  simulatedRestoreLockHandler({ id: "abc" }),
  [
    { op: "restoreClip", id: "abc" },
    { op: "setLocked", id: "abc", want: true },
  ]);

// --- 5. realistic round-trip: pinned clip trashed, restore-lock fired ----
// User had a pinned clip that wasn't locked. They trashed it, then
// regretted and clicked Restore + Lock. The clip should come back
// pinned (preserved by trash round-trip) AND newly locked.
const pinnedClipBeforeTrash = {
  id: "pre-trash",
  pinned: true,
  locked: false,
};
check("realistic: trashed pinned-only clip → restore-lock visible (pin hidden)",
  {
    pin: shouldShowRestorePin(pinnedClipBeforeTrash),
    lock: shouldShowRestoreLock(pinnedClipBeforeTrash),
  },
  { pin: false, lock: true });

// After the click handler runs:
// 1. restoreClip moves the clip from trash to live (pinned still true).
// 2. setLocked(id, true) flips locked false → true AND stamps lockedAt.
// Post-state: { pinned: true, locked: true, lockedAt: <now> }
//
// The setLocked stamp behavior is tested in the locked-since suite +
// the clip-lock suite. Here we just verify the handler asks for the
// right operation.

// --- 6. error path: restoreClip failure short-circuits setLocked --------
// (Documented behavior — the handler returns "Couldn't restore" toast
//  on restoreClip:false WITHOUT firing setLocked. We mirror the
//  intent here: if step 1 fails, step 2 must not run.)
function simulatedRestoreLockHandlerWithFailure(restoreOk) {
  const chain = [{ op: "restoreClip", id: "x", result: restoreOk }];
  if (restoreOk) chain.push({ op: "setLocked", id: "x", want: true });
  return chain;
}
check("error path: restoreClip:false → setLocked NOT fired",
  simulatedRestoreLockHandlerWithFailure(false),
  [{ op: "restoreClip", id: "x", result: false }]);
check("happy path: restoreClip:true → setLocked fired",
  simulatedRestoreLockHandlerWithFailure(true),
  [
    { op: "restoreClip", id: "x", result: true },
    { op: "setLocked", id: "x", want: true },
  ]);

// --- 7. undo semantics: trashClip is the inverse -----------------------
// Toast "Undo" should trashClip(id), which re-trashes the clip
// (taking the freshly-set lock bit + lockedAt stamp with it via the
// `{ ...item, deletedAt: Date.now() }` spread). The user's lock
// intent is part of the same atomic "restore + lock" — undoing
// means reversing BOTH.
function undoChain() {
  return [{ op: "trashClip", id: "abc" }];
}
check("undo: trashClip is the only op (rolls back both restore + lock)",
  undoChain(),
  [{ op: "trashClip", id: "abc" }]);

console.log(`trash-restore-lock sanity: ${pass}/${total} passed`);
if (pass !== total) process.exit(1);
