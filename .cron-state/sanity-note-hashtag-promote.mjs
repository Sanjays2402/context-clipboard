// Sanity tests for src/lib/note-hashtag-promote.ts — the per-clip
// "Promote N #tags" chip in the detail-view note-row foot.
//
// Run with: node .cron-state/sanity-note-hashtag-promote.mjs

import assert from "node:assert/strict";
import { build } from "esbuild";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "ctxclip-nhp-"));
try {
  await build({
    entryPoints: ["src/lib/note-hashtag-promote.ts"],
    bundle: true,
    format: "esm",
    outfile: join(tmp, "note-hashtag-promote.mjs"),
    platform: "neutral",
    target: "es2022",
    logLevel: "silent",
  });
  const {
    planNoteHashtagPromote,
    isNoteHashtagPromoteActionable,
    formatNoteHashtagPromoteLabel,
    formatNoteHashtagPromoteTooltip,
    formatNoteHashtagPromoteToast,
  } = await import(join(tmp, "note-hashtag-promote.mjs"));

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

  // -------------------- planNoteHashtagPromote: defensive --------------------
  t("null clip → empty plan", () => {
    const p = planNoteHashtagPromote(null);
    assert.deepEqual(p.pending, []);
    assert.deepEqual(p.alreadyTagged, []);
    assert.equal(p.mergedTags, undefined);
  });
  t("undefined clip → empty plan", () => {
    const p = planNoteHashtagPromote(undefined);
    assert.deepEqual(p.pending, []);
  });
  t("missing id → empty plan", () => {
    const p = planNoteHashtagPromote({ note: "#a #b" });
    assert.deepEqual(p.pending, []);
  });
  t("empty id → empty plan", () => {
    const p = planNoteHashtagPromote({ id: "", note: "#a" });
    assert.deepEqual(p.pending, []);
  });
  t("non-string id → empty plan", () => {
    const p = planNoteHashtagPromote({ id: 42, note: "#a" });
    assert.deepEqual(p.pending, []);
  });
  t("missing note → empty plan", () => {
    const p = planNoteHashtagPromote({ id: "a" });
    assert.deepEqual(p.pending, []);
  });
  t("non-string note → empty plan", () => {
    const p = planNoteHashtagPromote({ id: "a", note: 42 });
    assert.deepEqual(p.pending, []);
  });
  t("empty note → empty plan", () => {
    const p = planNoteHashtagPromote({ id: "a", note: "" });
    assert.deepEqual(p.pending, []);
  });
  t("note without hashtags → empty plan", () => {
    const p = planNoteHashtagPromote({ id: "a", note: "plain text reminder" });
    assert.deepEqual(p.pending, []);
  });

  // -------------------- planNoteHashtagPromote: extraction --------------------
  t("single new hashtag → pending=[name], mergedTags includes it", () => {
    const p = planNoteHashtagPromote({
      id: "a",
      note: "#staging only",
      tags: [],
    });
    assert.deepEqual(p.pending, ["staging"]);
    assert.deepEqual(p.alreadyTagged, []);
    assert.deepEqual(p.mergedTags, ["staging"]);
  });
  t("multiple new hashtags → pending in note-order", () => {
    const p = planNoteHashtagPromote({
      id: "a",
      note: "be careful — #staging #deprecated #review",
      tags: [],
    });
    assert.deepEqual(p.pending, ["staging", "deprecated", "review"]);
    assert.deepEqual(p.mergedTags, ["staging", "deprecated", "review"]);
  });
  t("hashtag already in tags → alreadyTagged, NOT pending", () => {
    const p = planNoteHashtagPromote({
      id: "a",
      note: "#staging note",
      tags: ["staging"],
    });
    assert.deepEqual(p.pending, []);
    assert.deepEqual(p.alreadyTagged, ["staging"]);
    assert.equal(p.mergedTags, undefined);
  });
  t("mixed: some new some already", () => {
    const p = planNoteHashtagPromote({
      id: "a",
      note: "#staging #wip #deprecated",
      tags: ["wip"],
    });
    assert.deepEqual(p.pending, ["staging", "deprecated"]);
    assert.deepEqual(p.alreadyTagged, ["wip"]);
    // mergedTags preserves existing tag order, appends NEW in note order
    assert.deepEqual(p.mergedTags, ["wip", "staging", "deprecated"]);
  });
  t("case-insensitive match against structured tags", () => {
    // Hashtag lowercased on extract, structured tag is "Staging"
    const p = planNoteHashtagPromote({
      id: "a",
      note: "#staging",
      tags: ["Staging"],
    });
    assert.deepEqual(p.pending, []);
    assert.deepEqual(p.alreadyTagged, ["staging"]);
  });
  t("case-insensitive: #STAGING with existing 'staging'", () => {
    const p = planNoteHashtagPromote({
      id: "a",
      note: "#STAGING",
      tags: ["staging"],
    });
    assert.deepEqual(p.pending, []);
    assert.deepEqual(p.alreadyTagged, ["staging"]);
  });
  t("duplicate hashtag in note counts ONCE", () => {
    const p = planNoteHashtagPromote({
      id: "a",
      note: "#staging is #staging",
      tags: [],
    });
    assert.deepEqual(p.pending, ["staging"]);
    assert.deepEqual(p.mergedTags, ["staging"]);
  });
  t("hyphenated hashtag", () => {
    const p = planNoteHashtagPromote({
      id: "a",
      note: "#review-q3 follow-up",
      tags: [],
    });
    assert.deepEqual(p.pending, ["review-q3"]);
  });
  t("non-array tags → treated as empty", () => {
    const p = planNoteHashtagPromote({
      id: "a",
      note: "#staging",
      tags: null,
    });
    assert.deepEqual(p.pending, ["staging"]);
  });
  t("tags with non-string entries → filtered out", () => {
    const p = planNoteHashtagPromote({
      id: "a",
      note: "#staging",
      tags: [42, null, "other"],
    });
    // Only "other" recognised as existing tag; #staging is still new
    assert.deepEqual(p.pending, ["staging"]);
  });

  // -------------------- isNoteHashtagPromoteActionable --------------------
  t("actionable: null → false", () =>
    assert.equal(isNoteHashtagPromoteActionable(null), false));
  t("actionable: no hashtags → false", () =>
    assert.equal(
      isNoteHashtagPromoteActionable({
        id: "a",
        note: "plain text",
        tags: [],
      }),
      false,
    ));
  t("actionable: every hashtag already tagged → false", () =>
    assert.equal(
      isNoteHashtagPromoteActionable({
        id: "a",
        note: "#staging #wip",
        tags: ["staging", "wip"],
      }),
      false,
    ));
  t("actionable: at least one new hashtag → true", () =>
    assert.equal(
      isNoteHashtagPromoteActionable({
        id: "a",
        note: "#staging",
        tags: [],
      }),
      true,
    ));
  t("actionable: mixed new + already → true", () =>
    assert.equal(
      isNoteHashtagPromoteActionable({
        id: "a",
        note: "#staging #wip",
        tags: ["wip"],
      }),
      true,
    ));

  // -------------------- formatNoteHashtagPromoteLabel --------------------
  t("label: empty pending → ''", () =>
    assert.equal(
      formatNoteHashtagPromoteLabel({ pending: [], alreadyTagged: [] }),
      "",
    ));
  t("label: 1 pending → 'Promote #x'", () =>
    assert.equal(
      formatNoteHashtagPromoteLabel({
        pending: ["staging"],
        alreadyTagged: [],
      }),
      "Promote #staging",
    ));
  t("label: 2 pending → 'Promote #x, #y'", () =>
    assert.equal(
      formatNoteHashtagPromoteLabel({
        pending: ["staging", "wip"],
        alreadyTagged: [],
      }),
      "Promote #staging, #wip",
    ));
  t("label: 3 pending → 'Promote #x, #y, #z'", () =>
    assert.equal(
      formatNoteHashtagPromoteLabel({
        pending: ["a", "b", "c"],
        alreadyTagged: [],
      }),
      "Promote #a, #b, #c",
    ));
  t("label: 4 pending → count form 'Promote 4 tags'", () =>
    assert.equal(
      formatNoteHashtagPromoteLabel({
        pending: ["a", "b", "c", "d"],
        alreadyTagged: [],
      }),
      "Promote 4 tags",
    ));
  t("label: 10 pending → count form", () =>
    assert.equal(
      formatNoteHashtagPromoteLabel({
        pending: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"],
        alreadyTagged: [],
      }),
      "Promote 10 tags",
    ));
  t("label: null plan → ''", () =>
    assert.equal(formatNoteHashtagPromoteLabel(null), ""));

  // -------------------- formatNoteHashtagPromoteTooltip --------------------
  t("tooltip: empty pending → ''", () =>
    assert.equal(
      formatNoteHashtagPromoteTooltip({ pending: [], alreadyTagged: [] }),
      "",
    ));
  t("tooltip: 1 pending, no already → single-line", () =>
    assert.equal(
      formatNoteHashtagPromoteTooltip({
        pending: ["staging"],
        alreadyTagged: [],
      }),
      "Add #staging to this clip's tags",
    ));
  t("tooltip: 2 pending → list form", () =>
    assert.equal(
      formatNoteHashtagPromoteTooltip({
        pending: ["staging", "wip"],
        alreadyTagged: [],
      }),
      "Add #staging, #wip to this clip's tags",
    ));
  t("tooltip: pending + already → two lines", () =>
    assert.equal(
      formatNoteHashtagPromoteTooltip({
        pending: ["staging"],
        alreadyTagged: ["wip"],
      }),
      "Add #staging to this clip's tags\nAlready tagged: #wip",
    ));
  t("tooltip: pending + multiple already", () =>
    assert.equal(
      formatNoteHashtagPromoteTooltip({
        pending: ["staging"],
        alreadyTagged: ["wip", "draft"],
      }),
      "Add #staging to this clip's tags\nAlready tagged: #wip, #draft",
    ));
  t("tooltip: null plan → ''", () =>
    assert.equal(formatNoteHashtagPromoteTooltip(null), ""));

  // -------------------- formatNoteHashtagPromoteToast --------------------
  t("toast: empty → 'Already tagged'", () =>
    assert.equal(
      formatNoteHashtagPromoteToast({ pending: [], alreadyTagged: [] }),
      "Already tagged",
    ));
  t("toast: 1 → 'Added #x'", () =>
    assert.equal(
      formatNoteHashtagPromoteToast({
        pending: ["staging"],
        alreadyTagged: [],
      }),
      "Added #staging",
    ));
  t("toast: 2 → 'Added #x, #y'", () =>
    assert.equal(
      formatNoteHashtagPromoteToast({
        pending: ["staging", "wip"],
        alreadyTagged: [],
      }),
      "Added #staging, #wip",
    ));
  t("toast: 3 → 'Added #x, #y, #z'", () =>
    assert.equal(
      formatNoteHashtagPromoteToast({
        pending: ["a", "b", "c"],
        alreadyTagged: [],
      }),
      "Added #a, #b, #c",
    ));
  t("toast: 4 → count form 'Added 4 tags'", () =>
    assert.equal(
      formatNoteHashtagPromoteToast({
        pending: ["a", "b", "c", "d"],
        alreadyTagged: [],
      }),
      "Added 4 tags",
    ));
  t("toast: null plan → 'Already tagged'", () =>
    assert.equal(formatNoteHashtagPromoteToast(null), "Already tagged"));

  // -------------------- mergedTags preserves existing tag order --------------------
  t("merged: existing first, new appended in note-order", () => {
    const p = planNoteHashtagPromote({
      id: "a",
      note: "#zebra #apple",
      tags: ["existing1", "existing2"],
    });
    assert.deepEqual(p.mergedTags, ["existing1", "existing2", "zebra", "apple"]);
  });
  t("merged: existing tags preserved exactly (no re-sort/dedup)", () => {
    const p = planNoteHashtagPromote({
      id: "a",
      note: "#new1",
      tags: ["B-tag", "a-tag", "C-tag"],
    });
    // Existing order should be preserved verbatim - this is the
    // contract of mergedTagsForClip from tag-from-notes.
    assert.deepEqual(p.mergedTags, ["B-tag", "a-tag", "C-tag", "new1"]);
  });

  // -------------------- realistic end-to-end --------------------
  t("realistic: chip cycle - paint, click, paint-empty", () => {
    // BEFORE click: chip visible
    const before = planNoteHashtagPromote({
      id: "clip1",
      note: "needs review - #staging only, also #wip",
      tags: ["existing"],
    });
    assert.equal(isNoteHashtagPromoteActionable({
      id: "clip1",
      note: "needs review - #staging only, also #wip",
      tags: ["existing"],
    }), true);
    assert.equal(formatNoteHashtagPromoteLabel(before), "Promote #staging, #wip");
    assert.deepEqual(before.mergedTags, ["existing", "staging", "wip"]);
    // AFTER click (tags now include the promoted ones): chip hidden
    const after = planNoteHashtagPromote({
      id: "clip1",
      note: "needs review - #staging only, also #wip",
      tags: ["existing", "staging", "wip"],
    });
    assert.deepEqual(after.pending, []);
    assert.deepEqual(after.alreadyTagged, ["staging", "wip"]);
    assert.equal(isNoteHashtagPromoteActionable({
      id: "clip1",
      note: "needs review - #staging only, also #wip",
      tags: ["existing", "staging", "wip"],
    }), false);
    assert.equal(formatNoteHashtagPromoteLabel(after), "");
  });
  t("realistic: user types another hashtag - chip reappears", () => {
    const after1 = planNoteHashtagPromote({
      id: "clip1",
      note: "review - #staging only, also #wip",
      tags: ["staging", "wip"],
    });
    assert.deepEqual(after1.pending, []);
    // User adds #urgent to the note - chip should reappear
    const after2 = planNoteHashtagPromote({
      id: "clip1",
      note: "review - #staging only, also #wip and #urgent",
      tags: ["staging", "wip"],
    });
    assert.deepEqual(after2.pending, ["urgent"]);
    assert.deepEqual(after2.alreadyTagged, ["staging", "wip"]);
    assert.equal(formatNoteHashtagPromoteLabel(after2), "Promote #urgent");
  });

  console.log(`note-hashtag-promote: ${pass} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
