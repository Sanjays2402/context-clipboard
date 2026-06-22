/**
 * Sanity: trash-row restore-and-pin combo button visibility.
 *
 * The combo button must be present only when the trashed clip was
 * unpinned at delete time — restoring an already-pinned clip would
 * make the combo a no-op (restore preserves the pinned flag), so we
 * hide it.
 *
 * Pure UI render-rule check — we replicate the popup's tiny helper
 * inline because it's a one-liner and we don't want to bundle the
 * 5k-line popup.ts for a single string test.
 *
 * Run with: node .cron-state/sanity-trash-restore-pin.mjs
 */

let pass = 0, fail = 0;
function ok(label, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`  FAIL  ${label}`); }
}

// Mirror the rule from popup.ts trashRow():
//   const wasPinned = !!t.pinned;
//   const pinBtn = wasPinned ? "" : `<button ...>`;
function pinBtnFor(trashed) {
  const wasPinned = !!trashed.pinned;
  return wasPinned ? "" : `<button class="trash-restore-pin" data-act="restore-pin">PIN</button>`;
}

// 1) Unpinned clip → combo button present.
{
  const out = pinBtnFor({ pinned: false });
  ok("unpinned: pin button present", out.includes("data-act=\"restore-pin\""));
}

// 2) Pinned clip → combo button absent (no double-pin work).
{
  const out = pinBtnFor({ pinned: true });
  ok("pinned: pin button absent", out === "");
}

// 3) Undefined pinned (legacy data) → treated as unpinned, button present.
{
  const out = pinBtnFor({});
  ok("undefined pinned: pin button present", out.includes("restore-pin"));
}

// 4) `pinned: 0` (falsy) → button present.
{
  const out = pinBtnFor({ pinned: 0 });
  ok("falsy pinned: pin button present", out.includes("restore-pin"));
}

// 5) `pinned: null` → button present.
{
  const out = pinBtnFor({ pinned: null });
  ok("null pinned: pin button present", out.includes("restore-pin"));
}

// 6) Truthy non-boolean (e.g. `pinned: 1` from a hand-crafted JSON
//    bundle) — treated as pinned, button absent.
{
  const out = pinBtnFor({ pinned: 1 });
  ok("truthy non-bool pinned: pin button absent", out === "");
}

// 7) Button carries the right action name so the click handler routes
//    to the restore-pin branch (not the plain restore branch).
{
  const out = pinBtnFor({ pinned: false });
  ok("button action: restore-pin", out.includes("data-act=\"restore-pin\""));
  ok("button class: trash-restore-pin", out.includes("trash-restore-pin"));
}

// 8) Button does NOT carry the plain restore action (would conflict
//    with the always-present Restore pill).
{
  const out = pinBtnFor({ pinned: false });
  ok("button no conflict with plain restore", !out.includes("data-act=\"restore\""));
}

console.log(`${pass}/${pass + fail} trash-restore-pin sanity checks passed`);
if (fail > 0) process.exit(1);
