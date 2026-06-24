// Sanity tests for src/lib/tag-from-notes-clear.ts — the bulk-bar
// "Tag from notes + clear notes" combo action.
//
// Run with: node .cron-state/sanity-tag-from-notes-clear.mjs

import assert from "node:assert/strict";
import { build } from "esbuild";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "ctxclip-tfnc-"));
try {
  await build({
    entryPoints: ["src/lib/tag-from-notes-clear.ts"],
    bundle: true,
    format: "esm",
    outfile: join(tmp, "tag-from-notes-clear.mjs"),
    platform: "neutral",
    target: "es2022",
    logLevel: "silent",
  });
  const {
    perClipActionForCombo,
    planTagFromNotesAndClear,
    isTagFromNotesAndClearActionable,
    formatTagFromNotesAndClearToast,
    formatTagFromNotesAndClearButtonTitle,
  } = await import(join(tmp, "tag-from-notes-clear.mjs"));

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

  // -------------------- perClipActionForCombo: defensive --------------------
  t("null clip → undefined", () =>
    assert.equal(perClipActionForCombo(null), undefined));
  t("undefined → undefined", () =>
    assert.equal(perClipActionForCombo(undefined), undefined));
  t("missing id → undefined", () =>
    assert.equal(perClipActionForCombo({ note: "#a" }), undefined));
  t("empty id → undefined", () =>
    assert.equal(perClipActionForCombo({ id: "", note: "#a" }), undefined));
  t("non-string id → undefined", () =>
    assert.equal(perClipActionForCombo({ id: 42, note: "#a" }), undefined));
  t("no note → undefined", () =>
    assert.equal(perClipActionForCombo({ id: "a" }), undefined));
  t("note without hashtags → undefined", () =>
    assert.equal(
      perClipActionForCombo({ id: "a", note: "plain text reminder" }),
      undefined,
    ));

  // -------------------- perClipActionForCombo: positive --------------------
  t("note with single new hashtag → promote AND clear", () => {
    const a = perClipActionForCombo({
      id: "a",
      note: "#staging",
      tags: [],
    });
    assert.ok(a);
    assert.equal(a.id, "a");
    assert.deepEqual(a.mergedTags, ["staging"]);
    assert.equal(a.clearNote, true);
    assert.equal(a.added, 1);
  });
  t("note with all-already-tagged hashtags → no clear", () => {
    const a = perClipActionForCombo({
      id: "a",
      note: "#staging #wip",
      tags: ["staging", "wip"],
    });
    assert.ok(a);
    assert.equal(a.clearNote, false);
    assert.equal(a.added, 0);
    assert.equal(a.mergedTags, undefined);
  });
  t("note with mixed: promote AND clear (at least one new)", () => {
    const a = perClipActionForCombo({
      id: "a",
      note: "#staging #wip",
      tags: ["wip"],
    });
    assert.ok(a);
    assert.equal(a.added, 1);
    assert.equal(a.clearNote, true);
    assert.deepEqual(a.mergedTags, ["wip", "staging"]);
  });
  t("case-insensitive: #STAGING with existing 'staging' → no clear", () => {
    const a = perClipActionForCombo({
      id: "a",
      note: "#STAGING",
      tags: ["staging"],
    });
    assert.equal(a.added, 0);
    assert.equal(a.clearNote, false);
  });

  // -------------------- planTagFromNotesAndClear --------------------
  t("plan: null clips → empty", () => {
    const p = planTagFromNotesAndClear(null);
    assert.equal(p.total, 0);
    assert.equal(p.promoteAndClear, 0);
    assert.deepEqual(p.distinctNewTags, []);
  });
  t("plan: empty array → empty", () => {
    const p = planTagFromNotesAndClear([]);
    assert.equal(p.total, 0);
    assert.equal(p.noPromote, 0);
  });
  t("plan: single clip with new hashtags", () => {
    const p = planTagFromNotesAndClear([
      { id: "a", note: "#staging #wip", tags: [] },
    ]);
    assert.equal(p.total, 1);
    assert.equal(p.promoteAndClear, 1);
    assert.equal(p.cleared, 1);
    assert.equal(p.totalAdded, 2);
    assert.deepEqual(p.distinctNewTags, ["staging", "wip"]);
  });
  t("plan: single clip with no extractable hashtags", () => {
    const p = planTagFromNotesAndClear([
      { id: "a", note: "plain text", tags: [] },
    ]);
    assert.equal(p.total, 1);
    assert.equal(p.noPromote, 1);
    assert.equal(p.promoteAndClear, 0);
    assert.equal(p.cleared, 0);
  });
  t("plan: single clip with all-already-tagged hashtags", () => {
    const p = planTagFromNotesAndClear([
      { id: "a", note: "#staging", tags: ["staging"] },
    ]);
    assert.equal(p.total, 1);
    assert.equal(p.alreadyTagged, 1);
    assert.equal(p.promoteAndClear, 0);
    assert.equal(p.cleared, 0);
  });
  t("plan: mixed selection - some promote, some no, some already", () => {
    const p = planTagFromNotesAndClear([
      { id: "a", note: "#staging", tags: [] },           // promote+clear
      { id: "b", note: "plain", tags: [] },               // noPromote
      { id: "c", note: "#wip", tags: ["wip"] },           // alreadyTagged
      { id: "d", note: "#new #other", tags: [] },         // promote+clear
      { id: "e", note: "", tags: [] },                     // noPromote (empty note)
    ]);
    assert.equal(p.total, 5);
    assert.equal(p.promoteAndClear, 2);
    assert.equal(p.cleared, 2);
    assert.equal(p.alreadyTagged, 1);
    assert.equal(p.noPromote, 2);
    assert.equal(p.totalAdded, 3); // staging, new, other
    assert.deepEqual(p.distinctNewTags, ["new", "other", "staging"]);
  });
  t("plan: defensive against null entries in array", () => {
    const p = planTagFromNotesAndClear([
      null,
      { id: "a", note: "#x", tags: [] },
      undefined,
    ]);
    assert.equal(p.total, 1);
    assert.equal(p.promoteAndClear, 1);
  });
  t("plan: same hashtag across multiple clips counts once in distinctNewTags", () => {
    const p = planTagFromNotesAndClear([
      { id: "a", note: "#staging", tags: [] },
      { id: "b", note: "#staging here", tags: [] },
      { id: "c", note: "#staging again", tags: [] },
    ]);
    assert.equal(p.promoteAndClear, 3);
    assert.equal(p.totalAdded, 3); // 3 clips × 1 new tag each
    assert.deepEqual(p.distinctNewTags, ["staging"]); // distinct = 1
  });

  // -------------------- isTagFromNotesAndClearActionable --------------------
  t("actionable: null → false", () =>
    assert.equal(isTagFromNotesAndClearActionable(null), false));
  t("actionable: empty array → false", () =>
    assert.equal(isTagFromNotesAndClearActionable([]), false));
  t("actionable: all no-hashtag clips → false", () =>
    assert.equal(
      isTagFromNotesAndClearActionable([
        { id: "a", note: "plain", tags: [] },
        { id: "b", note: "more plain", tags: [] },
      ]),
      false,
    ));
  t("actionable: all already-tagged → false", () =>
    assert.equal(
      isTagFromNotesAndClearActionable([
        { id: "a", note: "#x", tags: ["x"] },
        { id: "b", note: "#y", tags: ["y"] },
      ]),
      false,
    ));
  t("actionable: at least one promote-and-clear → true", () =>
    assert.equal(
      isTagFromNotesAndClearActionable([
        { id: "a", note: "#staging", tags: [] },
        { id: "b", note: "plain", tags: [] },
      ]),
      true,
    ));

  // -------------------- formatTagFromNotesAndClearToast --------------------
  t("toast: empty plan (total=0) → 'Nothing to tag'", () =>
    assert.equal(
      formatTagFromNotesAndClearToast({ total: 0 }),
      "Nothing to tag",
    ));
  t("toast: nothing to promote, all no-hashtags → 'Selection has no hashtags'", () =>
    assert.equal(
      formatTagFromNotesAndClearToast(
        planTagFromNotesAndClear([
          { id: "a", note: "plain", tags: [] },
          { id: "b", note: "more plain", tags: [] },
        ]),
      ),
      "Selection has no hashtags",
    ));
  t("toast: nothing to promote, but hashtags exist → 'Already tagged'", () =>
    assert.equal(
      formatTagFromNotesAndClearToast(
        planTagFromNotesAndClear([
          { id: "a", note: "#x", tags: ["x"] },
        ]),
      ),
      "Already tagged",
    ));
  t("toast: single tag, single clip → tightest form", () =>
    assert.equal(
      formatTagFromNotesAndClearToast(
        planTagFromNotesAndClear([
          { id: "a", note: "#staging", tags: [] },
        ]),
      ),
      "Added #staging · cleared 1 note",
    ));
  t("toast: single tag, multiple clips", () =>
    assert.equal(
      formatTagFromNotesAndClearToast(
        planTagFromNotesAndClear([
          { id: "a", note: "#staging", tags: [] },
          { id: "b", note: "#staging more", tags: [] },
          { id: "c", note: "#staging end", tags: [] },
        ]),
      ),
      "Added #staging to 3 clips · cleared 3 notes",
    ));
  t("toast: multiple distinct tags", () =>
    assert.equal(
      formatTagFromNotesAndClearToast(
        planTagFromNotesAndClear([
          { id: "a", note: "#x #y", tags: [] },
          { id: "b", note: "#y #z", tags: [] },
        ]),
      ),
      "Added 4 tags across 2 clips · cleared 2 notes",
    ));

  // -------------------- formatTagFromNotesAndClearButtonTitle --------------------
  t("button title: empty selection → invite", () =>
    assert.equal(
      formatTagFromNotesAndClearButtonTitle([]),
      "Tag selection from hashtags in notes, then clear those notes",
    ));
  t("button title: null → invite", () =>
    assert.equal(
      formatTagFromNotesAndClearButtonTitle(null),
      "Tag selection from hashtags in notes, then clear those notes",
    ));
  t("button title: all-no-hashtags → disambiguated label", () =>
    assert.equal(
      formatTagFromNotesAndClearButtonTitle([
        { id: "a", note: "plain", tags: [] },
      ]),
      "No hashtags in any selected note - nothing to promote or clear",
    ));
  t("button title: all-already-tagged → disambiguated", () =>
    assert.equal(
      formatTagFromNotesAndClearButtonTitle([
        { id: "a", note: "#x", tags: ["x"] },
      ]),
      "All extracted hashtags already tagged - nothing to clear",
    ));
  t("button title: single tag, single clip", () =>
    assert.equal(
      formatTagFromNotesAndClearButtonTitle([
        { id: "a", note: "#staging", tags: [] },
      ]),
      "Add #staging to 1 clip, then clear 1 note",
    ));
  t("button title: single tag, multiple clips", () =>
    assert.equal(
      formatTagFromNotesAndClearButtonTitle([
        { id: "a", note: "#staging", tags: [] },
        { id: "b", note: "#staging", tags: [] },
      ]),
      "Add #staging to 2 clips, then clear 2 notes",
    ));
  t("button title: multiple tags, multiple clips", () =>
    assert.equal(
      formatTagFromNotesAndClearButtonTitle([
        { id: "a", note: "#x #y", tags: [] },
        { id: "b", note: "#z", tags: [] },
      ]),
      "Add 3 tags across 2 clips, then clear 2 notes",
    ));

  // -------------------- realistic end-to-end --------------------
  t("realistic: hashtag-only notes get cleared, prose-with-hashtag notes also cleared (by design)", () => {
    const clips = [
      { id: "1", note: "#staging", tags: [] },
      { id: "2", note: "be careful: #staging URL only", tags: [] },
      { id: "3", note: "no hashtags here, just prose", tags: [] },
      { id: "4", note: "#draft", tags: ["draft"] }, // already tagged
    ];
    const plan = planTagFromNotesAndClear(clips);
    assert.equal(plan.total, 4);
    assert.equal(plan.promoteAndClear, 2); // clip 1 + clip 2
    assert.equal(plan.noPromote, 1);       // clip 3
    assert.equal(plan.alreadyTagged, 1);   // clip 4
    assert.equal(plan.cleared, 2);
    assert.deepEqual(plan.distinctNewTags, ["staging"]);
    assert.equal(
      formatTagFromNotesAndClearToast(plan),
      "Added #staging to 2 clips · cleared 2 notes",
    );
    // Verify per-clip:
    assert.equal(perClipActionForCombo(clips[0]).clearNote, true);
    assert.equal(perClipActionForCombo(clips[1]).clearNote, true);
    assert.equal(perClipActionForCombo(clips[2]), undefined);
    assert.equal(perClipActionForCombo(clips[3]).clearNote, false);
  });
  t("realistic: idempotent re-run is no-op (everything already tagged)", () => {
    const clipsAfterFirstRun = [
      { id: "1", note: "#staging", tags: ["staging"] },
      { id: "2", note: "be careful: #staging URL only", tags: ["staging"] },
    ];
    // Both clips kept their notes (because the test "imagines" the
    // user pressed standalone Tag-from-notes, not the combo). On
    // combo re-run, every hashtag is already tagged.
    const plan = planTagFromNotesAndClear(clipsAfterFirstRun);
    assert.equal(plan.promoteAndClear, 0);
    assert.equal(plan.alreadyTagged, 2);
    assert.equal(formatTagFromNotesAndClearToast(plan), "Already tagged");
    assert.equal(isTagFromNotesAndClearActionable(clipsAfterFirstRun), false);
  });

  console.log(`tag-from-notes-clear: ${pass} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
