// Sanity tests for src/lib/tag-from-notes.ts — the bulk-bar
// "Tag from notes" action (extract #hashtag tokens from clip
// notes and merge into the structured tag list).
//
// Run with: node .cron-state/sanity-tag-from-notes.mjs

import assert from "node:assert/strict";
import { build } from "esbuild";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "ctxclip-tfn-"));
try {
  await build({
    entryPoints: ["src/lib/tag-from-notes.ts"],
    bundle: true,
    format: "esm",
    outfile: join(tmp, "tag-from-notes.mjs"),
    platform: "neutral",
    target: "es2022",
    logLevel: "silent",
  });
  const {
    extractHashtagsFromNote,
    planTagFromNotes,
    mergedTagsForClip,
    isTagFromNotesActionable,
    formatTagFromNotesToast,
    formatTagFromNotesButtonTitle,
    MAX_TAGS_PER_NOTE,
  } = await import(join(tmp, "tag-from-notes.mjs"));

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

  // -------------------- extractHashtagsFromNote: defensive --------------------
  t("non-string note → []", () => {
    assert.deepEqual(extractHashtagsFromNote(undefined), []);
    assert.deepEqual(extractHashtagsFromNote(null), []);
    assert.deepEqual(extractHashtagsFromNote(42), []);
    assert.deepEqual(extractHashtagsFromNote({}), []);
  });

  t("empty / whitespace note → []", () => {
    assert.deepEqual(extractHashtagsFromNote(""), []);
    assert.deepEqual(extractHashtagsFromNote("   "), []);
  });

  t("note with no hashtags → []", () => {
    assert.deepEqual(extractHashtagsFromNote("just a plain note"), []);
  });

  // -------------------- extractHashtagsFromNote: parsing --------------------
  t("single hashtag at start of note", () => {
    assert.deepEqual(extractHashtagsFromNote("#staging"), ["staging"]);
  });

  t("hashtag mid-line preceded by whitespace", () => {
    assert.deepEqual(
      extractHashtagsFromNote("be careful #staging"),
      ["staging"],
    );
  });

  t("multiple hashtags space-separated", () => {
    assert.deepEqual(
      extractHashtagsFromNote("be careful #staging #deprecated #review"),
      ["staging", "deprecated", "review"],
    );
  });

  t("hashtag-immediately-after-text NOT a hashtag (#foo)", () => {
    // foo#bar style is rejected - that's URL fragment / Twitter
    // handle style, not a note hashtag.
    assert.deepEqual(extractHashtagsFromNote("see foo#bar"), []);
  });

  t("hashtag after punctuation accepted", () => {
    assert.deepEqual(extractHashtagsFromNote("done.#staging"), ["staging"]);
    assert.deepEqual(extractHashtagsFromNote("draft;#wip"), ["wip"]);
    assert.deepEqual(extractHashtagsFromNote("test(#deprecated)"), ["deprecated"]);
  });

  t("case-folded to lowercase", () => {
    assert.deepEqual(
      extractHashtagsFromNote("#Staging #DEPRECATED #ReviewQ3"),
      ["staging", "deprecated", "reviewq3"],
    );
  });

  t("dedups within single note (first-appearance order)", () => {
    assert.deepEqual(
      extractHashtagsFromNote("#staging then #STAGING and #staging again"),
      ["staging"],
    );
  });

  t("preserves dedup order across distinct tags", () => {
    assert.deepEqual(
      extractHashtagsFromNote("#a #b #a #c #b"),
      ["a", "b", "c"],
    );
  });

  t("hyphens mid-tag accepted (#review-q3)", () => {
    assert.deepEqual(
      extractHashtagsFromNote("#review-q3 #follow-up"),
      ["review-q3", "follow-up"],
    );
  });

  t("underscores accepted (#review_q3)", () => {
    assert.deepEqual(
      extractHashtagsFromNote("#review_q3"),
      ["review_q3"],
    );
  });

  t("digits accepted in tag body", () => {
    assert.deepEqual(
      extractHashtagsFromNote("#q3 #2026 #v1_alpha"),
      ["q3", "2026", "v1_alpha"],
    );
  });

  t("tag start char must be alphanumeric / underscore (no #-foo)", () => {
    assert.deepEqual(extractHashtagsFromNote("#-foo"), []);
    assert.deepEqual(extractHashtagsFromNote("#?bar"), []);
    assert.deepEqual(extractHashtagsFromNote("# foo"), []);
  });

  t("32-char per-tag cap", () => {
    const long = "a".repeat(40);
    const result = extractHashtagsFromNote(`#${long}`);
    assert.equal(result.length, 1);
    assert.equal(result[0].length, 32);
  });

  t("hashtag spanning newlines (multiline note)", () => {
    assert.deepEqual(
      extractHashtagsFromNote("first line #a\nsecond line #b"),
      ["a", "b"],
    );
  });

  t("16-tag cap per note", () => {
    const tags = Array.from({ length: 30 }, (_, i) => `#t${i}`);
    const note = tags.join(" ");
    const out = extractHashtagsFromNote(note);
    assert.equal(out.length, MAX_TAGS_PER_NOTE);
    assert.equal(out[0], "t0");
    assert.equal(out[MAX_TAGS_PER_NOTE - 1], `t${MAX_TAGS_PER_NOTE - 1}`);
  });

  // -------------------- mergedTagsForClip --------------------
  t("clip with no note → undefined (no-op)", () => {
    const c = { id: "a", tags: ["existing"] };
    assert.equal(mergedTagsForClip(c), undefined);
  });

  t("clip with note but no hashtags → undefined (no-op)", () => {
    const c = { id: "a", note: "just a plain note", tags: ["existing"] };
    assert.equal(mergedTagsForClip(c), undefined);
  });

  t("clip with note + hashtag that's already tagged → undefined (no-op)", () => {
    const c = { id: "a", note: "#staging", tags: ["staging"] };
    assert.equal(mergedTagsForClip(c), undefined);
  });

  t("case-insensitive existing-tag matching (#Staging vs staging)", () => {
    const c = { id: "a", note: "#Staging", tags: ["STAGING"] };
    assert.equal(mergedTagsForClip(c), undefined);
  });

  t("adds new hashtags, preserves existing-tag order", () => {
    const c = {
      id: "a",
      note: "#new1 #new2",
      tags: ["existing1", "existing2"],
    };
    const out = mergedTagsForClip(c);
    assert.deepEqual(out, ["existing1", "existing2", "new1", "new2"]);
  });

  t("mixed: some new, some already present", () => {
    const c = {
      id: "a",
      note: "#existing #new1 #EXISTING #new2",
      tags: ["existing", "other"],
    };
    const out = mergedTagsForClip(c);
    assert.deepEqual(out, ["existing", "other", "new1", "new2"]);
  });

  t("clip with no tags array → starts fresh", () => {
    const c = { id: "a", note: "#a #b" };
    const out = mergedTagsForClip(c);
    assert.deepEqual(out, ["a", "b"]);
  });

  t("clip with tags containing non-strings → filtered out", () => {
    const c = {
      id: "a",
      note: "#new",
      tags: ["valid", 42, null, ""],
    };
    const out = mergedTagsForClip(c);
    assert.deepEqual(out, ["valid", "new"]);
  });

  // -------------------- planTagFromNotes --------------------
  t("plan: empty selection → zero plan", () => {
    const p = planTagFromNotes([]);
    assert.equal(p.total, 0);
    assert.equal(p.changed, 0);
    assert.deepEqual(p.distinctNewTags, []);
  });

  t("plan: non-array input → zero plan", () => {
    const p = planTagFromNotes(null);
    assert.equal(p.total, 0);
  });

  t("plan: all clips without notes", () => {
    const p = planTagFromNotes([
      { id: "a", tags: [] },
      { id: "b", tags: [] },
    ]);
    assert.equal(p.total, 2);
    assert.equal(p.noNote, 2);
    assert.equal(p.changed, 0);
  });

  t("plan: notes without any hashtags", () => {
    const p = planTagFromNotes([
      { id: "a", note: "plain", tags: [] },
      { id: "b", note: "another plain", tags: [] },
    ]);
    assert.equal(p.total, 2);
    assert.equal(p.emptyNotes, 2);
    assert.equal(p.changed, 0);
  });

  t("plan: pure additions across clips", () => {
    const p = planTagFromNotes([
      { id: "a", note: "#staging #deprecated", tags: [] },
      { id: "b", note: "#staging", tags: [] },
    ]);
    assert.equal(p.total, 2);
    assert.equal(p.changed, 2);
    assert.equal(p.totalAdded, 3);
    assert.deepEqual(p.distinctNewTags, ["deprecated", "staging"]);
  });

  t("plan: mixed - some changed, some unchanged", () => {
    const p = planTagFromNotes([
      { id: "a", note: "#new", tags: [] },
      { id: "b", note: "#existing", tags: ["existing"] },
      { id: "c", note: "no tags here", tags: [] },
    ]);
    assert.equal(p.total, 3);
    assert.equal(p.changed, 1);
    assert.equal(p.unchanged, 1);
    assert.equal(p.emptyNotes, 1);
    assert.deepEqual(p.distinctNewTags, ["new"]);
  });

  t("plan: distinctNewTags deduplicated across the selection", () => {
    const p = planTagFromNotes([
      { id: "a", note: "#staging", tags: [] },
      { id: "b", note: "#staging", tags: [] },
      { id: "c", note: "#staging #deprecated", tags: [] },
    ]);
    assert.equal(p.changed, 3);
    assert.equal(p.totalAdded, 4); // 1+1+2
    assert.deepEqual(p.distinctNewTags, ["deprecated", "staging"]);
  });

  // -------------------- isTagFromNotesActionable --------------------
  t("actionable: empty selection → false", () => {
    assert.equal(isTagFromNotesActionable([]), false);
  });

  t("actionable: no hashtags anywhere → false", () => {
    assert.equal(
      isTagFromNotesActionable([
        { id: "a", note: "plain", tags: [] },
        { id: "b", tags: [] },
      ]),
      false,
    );
  });

  t("actionable: any clip with a new hashtag → true", () => {
    assert.equal(
      isTagFromNotesActionable([
        { id: "a", note: "plain", tags: [] },
        { id: "b", note: "#new", tags: [] },
      ]),
      true,
    );
  });

  t("actionable: only already-tagged hashtags → false", () => {
    assert.equal(
      isTagFromNotesActionable([
        { id: "a", note: "#existing", tags: ["existing"] },
      ]),
      false,
    );
  });

  // -------------------- formatTagFromNotesToast --------------------
  t("toast: total 0 → 'Nothing to tag'", () => {
    assert.equal(
      formatTagFromNotesToast({
        total: 0, emptyNotes: 0, noNote: 0, unchanged: 0,
        changed: 0, totalAdded: 0, distinctNewTags: [],
      }),
      "Nothing to tag",
    );
  });

  t("toast: every clip un-noted → 'Selection has no notes'", () => {
    assert.equal(
      formatTagFromNotesToast({
        total: 3, emptyNotes: 0, noNote: 3, unchanged: 0,
        changed: 0, totalAdded: 0, distinctNewTags: [],
      }),
      "Selection has no notes",
    );
  });

  t("toast: notes exist but no hashtags → 'No hashtags in any note'", () => {
    assert.equal(
      formatTagFromNotesToast({
        total: 3, emptyNotes: 3, noNote: 0, unchanged: 0,
        changed: 0, totalAdded: 0, distinctNewTags: [],
      }),
      "No hashtags in any note",
    );
  });

  t("toast: all already tagged → 'Already tagged'", () => {
    assert.equal(
      formatTagFromNotesToast({
        total: 3, emptyNotes: 0, noNote: 0, unchanged: 3,
        changed: 0, totalAdded: 0, distinctNewTags: ["staging"],
      }),
      "Already tagged",
    );
  });

  t("toast: 1 new tag to 1 clip → 'Added #x to 1 clip'", () => {
    assert.equal(
      formatTagFromNotesToast({
        total: 1, emptyNotes: 0, noNote: 0, unchanged: 0,
        changed: 1, totalAdded: 1, distinctNewTags: ["staging"],
      }),
      "Added #staging to 1 clip",
    );
  });

  t("toast: 1 distinct tag to N clips → plural noun", () => {
    assert.equal(
      formatTagFromNotesToast({
        total: 5, emptyNotes: 0, noNote: 0, unchanged: 0,
        changed: 5, totalAdded: 5, distinctNewTags: ["staging"],
      }),
      "Added #staging to 5 clips",
    );
  });

  t("toast: many distinct tags, 1 clip", () => {
    assert.equal(
      formatTagFromNotesToast({
        total: 1, emptyNotes: 0, noNote: 0, unchanged: 0,
        changed: 1, totalAdded: 3, distinctNewTags: ["a", "b", "c"],
      }),
      "Added 3 tags to 1 clip",
    );
  });

  t("toast: many distinct, many clips → 'across' form", () => {
    assert.equal(
      formatTagFromNotesToast({
        total: 6, emptyNotes: 0, noNote: 0, unchanged: 0,
        changed: 6, totalAdded: 9, distinctNewTags: ["a", "b", "c"],
      }),
      "Added 9 tags across 6 clips",
    );
  });

  // -------------------- formatTagFromNotesButtonTitle --------------------
  t("title: empty selection → generic invite", () => {
    assert.equal(
      formatTagFromNotesButtonTitle([]),
      "Tag selection from hashtags in notes",
    );
  });

  t("title: selection has no notes", () => {
    assert.match(
      formatTagFromNotesButtonTitle([
        { id: "a", tags: [] },
        { id: "b", tags: [] },
      ]),
      /No notes in selection/,
    );
  });

  t("title: selection has notes but no hashtags", () => {
    assert.match(
      formatTagFromNotesButtonTitle([
        { id: "a", note: "plain", tags: [] },
      ]),
      /No new hashtags found/,
    );
  });

  t("title: hashtags already structured", () => {
    assert.match(
      formatTagFromNotesButtonTitle([
        { id: "a", note: "#existing", tags: ["existing"] },
      ]),
      /already tagged/,
    );
  });

  t("title: 1 distinct, 1 clip → singular", () => {
    assert.equal(
      formatTagFromNotesButtonTitle([
        { id: "a", note: "#staging", tags: [] },
      ]),
      "Add #staging to 1 clip",
    );
  });

  t("title: 1 distinct, many clips → plural", () => {
    assert.equal(
      formatTagFromNotesButtonTitle([
        { id: "a", note: "#staging", tags: [] },
        { id: "b", note: "#staging", tags: [] },
      ]),
      "Add #staging to 2 clips",
    );
  });

  t("title: many distinct → 'across' form", () => {
    const out = formatTagFromNotesButtonTitle([
      { id: "a", note: "#a #b", tags: [] },
      { id: "b", note: "#c", tags: [] },
    ]);
    assert.match(out, /Add 3 tags across 2 clips/);
  });

  // -------------------- realistic end-to-end --------------------
  t("realistic 4-clip selection with mixed extraction", () => {
    const clips = [
      { id: "a", note: "be careful — #staging only", tags: ["python"] },
      { id: "b", note: "deprecated as of June, #deprecated #q3", tags: [] },
      { id: "c", note: "plain", tags: [] },
      { id: "d", note: "#staging #deprecated", tags: ["staging", "deprecated"] },
    ];
    const plan = planTagFromNotes(clips);
    assert.equal(plan.total, 4);
    assert.equal(plan.changed, 2); // a + b
    assert.equal(plan.unchanged, 1); // d
    assert.equal(plan.emptyNotes, 1); // c
    assert.equal(plan.noNote, 0);
    assert.equal(plan.totalAdded, 3); // staging + deprecated + q3
    assert.deepEqual(plan.distinctNewTags, ["deprecated", "q3", "staging"]);

    // Per-clip merge
    assert.deepEqual(mergedTagsForClip(clips[0]), ["python", "staging"]);
    assert.deepEqual(mergedTagsForClip(clips[1]), ["deprecated", "q3"]);
    assert.equal(mergedTagsForClip(clips[2]), undefined);
    assert.equal(mergedTagsForClip(clips[3]), undefined);

    // Toast
    assert.equal(
      formatTagFromNotesToast(plan),
      "Added 3 tags across 2 clips",
    );
  });

  console.log(`tag-from-notes sanity: ${pass}/${pass} pass`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
