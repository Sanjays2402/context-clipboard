// Sanity tests for the bulk-note pure module — the bulk-bar
// "Add note to selection" planner, toast formatter, and button
// title helper.
//
// Run with: node .cron-state/sanity-bulk-note.mjs

import assert from "node:assert/strict";
import { build } from "esbuild";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "ctxclip-bulknote-"));
try {
  await build({
    entryPoints: ["src/lib/bulk-note.ts"],
    bundle: true,
    format: "esm",
    outfile: join(tmp, "bulk-note.mjs"),
    platform: "neutral",
    target: "es2022",
    logLevel: "silent",
  });
  const {
    planBulkNote,
    isBulkNoteActionable,
    formatBulkNoteToast,
    formatBulkNoteButtonTitle,
  } = await import(join(tmp, "bulk-note.mjs"));

  let pass = 0;
  const t = (msg, fn) => {
    try {
      fn();
      pass++;
    } catch (e) {
      console.error(`FAIL ${msg}: ${e.message}`);
      process.exit(1);
    }
  };

  const clip = (id, note) =>
    note === undefined ? { id } : { id, note };

  // --- planBulkNote shape ---

  t("empty array → all-zero plan", () => {
    const plan = planBulkNote([], "hello");
    assert.equal(plan.total, 0);
    assert.equal(plan.created, 0);
    assert.equal(plan.replaced, 0);
    assert.equal(plan.cleared, 0);
    assert.equal(plan.unchanged, 0);
  });

  t("non-array → defensive zero plan", () => {
    const plan = planBulkNote(null, "x");
    assert.equal(plan.total, 0);
  });

  t("counts created when no prior note", () => {
    const plan = planBulkNote([clip("a"), clip("b")], "new note");
    assert.equal(plan.total, 2);
    assert.equal(plan.created, 2);
    assert.equal(plan.replaced, 0);
  });

  t("counts replaced when prior note differs", () => {
    const plan = planBulkNote(
      [clip("a", "old"), clip("b", "different")],
      "new",
    );
    assert.equal(plan.replaced, 2);
    assert.equal(plan.created, 0);
  });

  t("mixed create + replace counted separately", () => {
    const plan = planBulkNote(
      [clip("a"), clip("b", "old"), clip("c")],
      "new",
    );
    assert.equal(plan.created, 2);
    assert.equal(plan.replaced, 1);
  });

  t("identical existing note → unchanged", () => {
    const plan = planBulkNote([clip("a", "same")], "same");
    assert.equal(plan.unchanged, 1);
    assert.equal(plan.created, 0);
    assert.equal(plan.replaced, 0);
  });

  t("empty input clears existing notes", () => {
    const plan = planBulkNote(
      [clip("a", "old"), clip("b", "another")],
      "",
    );
    assert.equal(plan.cleared, 2);
    assert.equal(plan.finalValue, undefined);
  });

  t("empty input on notesless clips → no-op", () => {
    const plan = planBulkNote([clip("a"), clip("b")], "");
    assert.equal(plan.unchanged, 2);
    assert.equal(plan.cleared, 0);
  });

  t("whitespace input sanitises to undefined (clear)", () => {
    const plan = planBulkNote([clip("a", "old")], "   \t   ");
    assert.equal(plan.cleared, 1);
    assert.equal(plan.finalValue, undefined);
  });

  t("over-cap input gets sliced to 2000 chars", () => {
    const huge = "x".repeat(5000);
    const plan = planBulkNote([clip("a")], huge);
    assert.equal(plan.finalValue.length, 2000);
    assert.equal(plan.created, 1);
  });

  t("control chars stripped from input", () => {
    const plan = planBulkNote([clip("a")], "hi\u0000\u0001there");
    assert.equal(plan.finalValue, "hithere");
  });

  t("idempotent: re-running with the same input → all unchanged", () => {
    const first = planBulkNote([clip("a"), clip("b")], "stable");
    // Simulate the apply: every clip now has note=stable
    const after = [
      { id: "a", note: "stable" },
      { id: "b", note: "stable" },
    ];
    const second = planBulkNote(after, "stable");
    assert.equal(second.unchanged, 2);
    assert.equal(second.created + second.replaced + second.cleared, 0);
  });

  t("defensive: missing id entries skipped", () => {
    const plan = planBulkNote(
      [{ note: "x" }, clip("a"), { id: "", note: "y" }, clip("b")],
      "z",
    );
    assert.equal(plan.total, 2);
  });

  // --- isBulkNoteActionable ---

  t("empty selection not actionable", () => {
    assert.equal(isBulkNoteActionable([], "x"), false);
  });

  t("all-unchanged not actionable", () => {
    const r = isBulkNoteActionable(
      [clip("a", "same"), clip("b", "same")],
      "same",
    );
    assert.equal(r, false);
  });

  t("any change → actionable", () => {
    const r = isBulkNoteActionable(
      [clip("a", "same"), clip("b", "other")],
      "same",
    );
    assert.equal(r, true);
  });

  t("clear actionable when at least one has a note", () => {
    const r = isBulkNoteActionable([clip("a", "x"), clip("b")], "");
    assert.equal(r, true);
  });

  // --- formatBulkNoteToast ---

  t("total 0 → 'Nothing to note'", () => {
    assert.equal(
      formatBulkNoteToast({
        total: 0,
        created: 0,
        replaced: 0,
        cleared: 0,
        unchanged: 0,
        finalValue: "x",
      }),
      "Nothing to note",
    );
  });

  t("all unchanged plural", () => {
    assert.equal(
      formatBulkNoteToast({
        total: 5,
        created: 0,
        replaced: 0,
        cleared: 0,
        unchanged: 5,
        finalValue: "x",
      }),
      "All 5 already match",
    );
  });

  t("all unchanged singular", () => {
    assert.equal(
      formatBulkNoteToast({
        total: 1,
        created: 0,
        replaced: 0,
        cleared: 0,
        unchanged: 1,
        finalValue: "x",
      }),
      "Already matches",
    );
  });

  t("pure create plural", () => {
    assert.equal(
      formatBulkNoteToast({
        total: 3,
        created: 3,
        replaced: 0,
        cleared: 0,
        unchanged: 0,
        finalValue: "x",
      }),
      "Noted 3 clips",
    );
  });

  t("pure create singular", () => {
    assert.equal(
      formatBulkNoteToast({
        total: 1,
        created: 1,
        replaced: 0,
        cleared: 0,
        unchanged: 0,
        finalValue: "x",
      }),
      "Noted 1 clip",
    );
  });

  t("pure replace plural", () => {
    assert.equal(
      formatBulkNoteToast({
        total: 4,
        created: 0,
        replaced: 4,
        cleared: 0,
        unchanged: 0,
        finalValue: "x",
      }),
      "Replaced 4 notes",
    );
  });

  t("pure replace singular", () => {
    assert.equal(
      formatBulkNoteToast({
        total: 1,
        created: 0,
        replaced: 1,
        cleared: 0,
        unchanged: 0,
        finalValue: "x",
      }),
      "Replaced 1 note",
    );
  });

  t("mixed create + replace surfaces both", () => {
    const out = formatBulkNoteToast({
      total: 5,
      created: 3,
      replaced: 2,
      cleared: 0,
      unchanged: 0,
      finalValue: "x",
    });
    assert.equal(out, "Noted 3 clips (2 replaced)");
  });

  t("clear plural", () => {
    assert.equal(
      formatBulkNoteToast({
        total: 3,
        created: 0,
        replaced: 0,
        cleared: 3,
        unchanged: 0,
        finalValue: undefined,
      }),
      "Cleared 3 notes",
    );
  });

  t("clear singular", () => {
    assert.equal(
      formatBulkNoteToast({
        total: 1,
        created: 0,
        replaced: 0,
        cleared: 1,
        unchanged: 0,
        finalValue: undefined,
      }),
      "Cleared 1 note",
    );
  });

  // --- formatBulkNoteButtonTitle ---

  t("empty selection → generic", () => {
    assert.match(
      formatBulkNoteButtonTitle([]),
      /Add a note to the selection/,
    );
  });

  t("non-array → generic", () => {
    assert.match(
      formatBulkNoteButtonTitle(null),
      /Add a note to the selection/,
    );
  });

  t("all-unannotated singular", () => {
    assert.equal(formatBulkNoteButtonTitle([clip("a")]), "Add a note to 1 clip");
  });

  t("all-unannotated plural", () => {
    assert.equal(
      formatBulkNoteButtonTitle([clip("a"), clip("b"), clip("c")]),
      "Add a note to 3 clips",
    );
  });

  t("all-already-noted plural", () => {
    assert.equal(
      formatBulkNoteButtonTitle([clip("a", "x"), clip("b", "y")]),
      "Replace 2 existing notes",
    );
  });

  t("all-already-noted singular", () => {
    assert.equal(
      formatBulkNoteButtonTitle([clip("a", "x")]),
      "Replace 1 existing note",
    );
  });

  t("mixed surfaces existing count", () => {
    const out = formatBulkNoteButtonTitle([
      clip("a"),
      clip("b", "x"),
      clip("c", "y"),
    ]);
    assert.match(out, /Add or replace/);
    assert.match(out, /2 already noted/);
  });

  console.log(`bulk-note sanity: ${pass}/${pass} pass`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
