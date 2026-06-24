// Sanity tests for src/lib/hashtag-discovery.ts — Cmd+K command
// surfacing the hashtag distribution across the visible clip set.
//
// Run with: node .cron-state/sanity-hashtag-discovery.mjs

import assert from "node:assert/strict";
import { build } from "esbuild";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "ctxclip-hd-"));
try {
  await build({
    entryPoints: ["src/lib/hashtag-discovery.ts"],
    bundle: true,
    format: "esm",
    outfile: join(tmp, "hashtag-discovery.mjs"),
    platform: "neutral",
    target: "es2022",
    logLevel: "silent",
  });
  const {
    discoverHashtagsInNotes,
    formatHashtagDiscoveryToast,
    formatHashtagDiscoveryHint,
  } = await import(join(tmp, "hashtag-discovery.mjs"));

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

  // -------------------- discoverHashtagsInNotes: defensive --------------------
  t("null input → empty report", () => {
    const r = discoverHashtagsInNotes(null);
    assert.equal(r.scanned, 0);
    assert.equal(r.distinctTags, 0);
    assert.deepEqual(r.entries, []);
  });
  t("undefined input → empty report", () => {
    const r = discoverHashtagsInNotes(undefined);
    assert.equal(r.scanned, 0);
  });
  t("non-array input → empty report", () => {
    assert.equal(discoverHashtagsInNotes("not array").scanned, 0);
    assert.equal(discoverHashtagsInNotes(42).scanned, 0);
    assert.equal(discoverHashtagsInNotes({}).scanned, 0);
  });
  t("empty array → scanned=0, no entries", () => {
    const r = discoverHashtagsInNotes([]);
    assert.equal(r.scanned, 0);
    assert.equal(r.clipsWithHashtags, 0);
    assert.equal(r.distinctTags, 0);
    assert.deepEqual(r.entries, []);
  });
  t("array with all-null entries → scanned but no extraction", () => {
    const r = discoverHashtagsInNotes([null, undefined, null]);
    assert.equal(r.scanned, 3);
    assert.equal(r.distinctTags, 0);
  });

  // -------------------- discoverHashtagsInNotes: basic extraction --------------------
  t("single clip with one hashtag", () => {
    const r = discoverHashtagsInNotes([{ id: "a", note: "#staging only" }]);
    assert.equal(r.scanned, 1);
    assert.equal(r.clipsWithHashtags, 1);
    assert.equal(r.distinctTags, 1);
    assert.equal(r.entries[0].tag, "staging");
    assert.equal(r.entries[0].clipCount, 1);
    assert.equal(r.entries[0].alreadyTagged, false);
  });
  t("single clip with multiple distinct hashtags", () => {
    const r = discoverHashtagsInNotes([
      { id: "a", note: "be careful — #staging #deprecated #review" },
    ]);
    assert.equal(r.distinctTags, 3);
    assert.deepEqual(
      r.entries.map((e) => e.tag).sort(),
      ["deprecated", "review", "staging"],
    );
    // Each appears in 1 clip → equal counts → ascending tag-name tiebreak
    assert.equal(r.entries[0].clipCount, 1);
  });
  t("single clip with NO note → skipped", () => {
    const r = discoverHashtagsInNotes([{ id: "a", note: undefined }]);
    assert.equal(r.scanned, 1);
    assert.equal(r.clipsWithHashtags, 0);
    assert.equal(r.distinctTags, 0);
  });
  t("single clip with note but no hashtags → no extraction", () => {
    const r = discoverHashtagsInNotes([
      { id: "a", note: "plain text without tags" },
    ]);
    assert.equal(r.scanned, 1);
    assert.equal(r.clipsWithHashtags, 0);
    assert.equal(r.distinctTags, 0);
  });

  // -------------------- aggregation across multiple clips --------------------
  t("same hashtag across 3 clips → clipCount=3", () => {
    const r = discoverHashtagsInNotes([
      { id: "a", note: "test #staging" },
      { id: "b", note: "another #staging clip" },
      { id: "c", note: "#staging baseline" },
    ]);
    assert.equal(r.scanned, 3);
    assert.equal(r.clipsWithHashtags, 3);
    assert.equal(r.distinctTags, 1);
    assert.equal(r.entries[0].tag, "staging");
    assert.equal(r.entries[0].clipCount, 3);
  });
  t("same hashtag appearing TWICE in one note still counts ONE clip", () => {
    const r = discoverHashtagsInNotes([
      { id: "a", note: "#staging is #staging" },
    ]);
    assert.equal(r.entries[0].clipCount, 1);
  });
  t("mixed: some clips share, some are unique", () => {
    const r = discoverHashtagsInNotes([
      { id: "a", note: "#staging #wip" },
      { id: "b", note: "#staging clip" },
      { id: "c", note: "#review-q3 only" },
      { id: "d", note: "no tags" },
      { id: "e", note: "#staging again" },
    ]);
    assert.equal(r.scanned, 5);
    assert.equal(r.clipsWithHashtags, 4); // d skipped
    assert.equal(r.distinctTags, 3); // staging, wip, review-q3
    // Top: staging (3 clips)
    assert.equal(r.entries[0].tag, "staging");
    assert.equal(r.entries[0].clipCount, 3);
    // Then wip (1) + review-q3 (1) tied → ascending tag-name tiebreak
    assert.equal(r.entries[1].tag, "review-q3");
    assert.equal(r.entries[1].clipCount, 1);
    assert.equal(r.entries[2].tag, "wip");
    assert.equal(r.entries[2].clipCount, 1);
  });

  // -------------------- alreadyTagged tracking --------------------
  t("alreadyTagged=true when single clip already carries structured tag", () => {
    const r = discoverHashtagsInNotes([
      { id: "a", note: "#staging note", tags: ["staging"] },
    ]);
    assert.equal(r.entries[0].alreadyTagged, true);
  });
  t("alreadyTagged=true when ALL clips with hashtag also carry structured", () => {
    const r = discoverHashtagsInNotes([
      { id: "a", note: "#staging here", tags: ["staging"] },
      { id: "b", note: "and #staging there", tags: ["staging", "other"] },
    ]);
    assert.equal(r.entries[0].alreadyTagged, true);
  });
  t("alreadyTagged=false when ANY clip is missing structured tag", () => {
    const r = discoverHashtagsInNotes([
      { id: "a", note: "#staging here", tags: ["staging"] },
      { id: "b", note: "and #staging there" }, // no structured tag
    ]);
    assert.equal(r.entries[0].alreadyTagged, false);
  });
  t("alreadyTagged: case-insensitive match against structured tags", () => {
    // Hashtag lowercased on extract, structured tag is "Staging" - the
    // discovery normalises to lowercase for comparison so they match.
    const r = discoverHashtagsInNotes([
      { id: "a", note: "#staging", tags: ["Staging"] },
    ]);
    assert.equal(r.entries[0].alreadyTagged, true);
  });
  t("alreadyTagged: per-hashtag (multi-tag clip)", () => {
    // Clip has #foo and #bar in note; structured tags = ['foo']; only
    // #foo should report alreadyTagged=true, #bar stays false.
    const r = discoverHashtagsInNotes([
      { id: "a", note: "#foo #bar", tags: ["foo"] },
    ]);
    const foo = r.entries.find((e) => e.tag === "foo");
    const bar = r.entries.find((e) => e.tag === "bar");
    assert.equal(foo.alreadyTagged, true);
    assert.equal(bar.alreadyTagged, false);
  });

  // -------------------- sorting --------------------
  t("entries sorted descending by clipCount", () => {
    const r = discoverHashtagsInNotes([
      { id: "a", note: "#low" },
      { id: "b", note: "#mid" },
      { id: "c", note: "#mid #high" },
      { id: "d", note: "#high #mid" },
      { id: "e", note: "#high" },
    ]);
    assert.equal(r.entries[0].tag, "high");
    assert.equal(r.entries[0].clipCount, 3);
    assert.equal(r.entries[1].tag, "mid");
    assert.equal(r.entries[1].clipCount, 3);
    assert.equal(r.entries[2].tag, "low");
    assert.equal(r.entries[2].clipCount, 1);
  });
  t("alphabetical tiebreak for equal clipCount", () => {
    const r = discoverHashtagsInNotes([
      { id: "a", note: "#zebra" },
      { id: "b", note: "#apple" },
      { id: "c", note: "#mango" },
    ]);
    // All count=1, ascending alpha: apple, mango, zebra
    assert.equal(r.entries[0].tag, "apple");
    assert.equal(r.entries[1].tag, "mango");
    assert.equal(r.entries[2].tag, "zebra");
  });

  // -------------------- topN --------------------
  t("topN limits entries but distinctTags reflects FULL count", () => {
    const r = discoverHashtagsInNotes(
      [
        { id: "a", note: "#a #b #c #d #e" },
      ],
      { topN: 2 },
    );
    assert.equal(r.distinctTags, 5);
    assert.equal(r.entries.length, 2);
  });
  t("topN=0 → falls back to all (treated as no cap)", () => {
    const r = discoverHashtagsInNotes(
      [{ id: "a", note: "#a #b #c" }],
      { topN: 0 },
    );
    assert.equal(r.entries.length, 3);
  });
  t("topN negative → falls back to all", () => {
    const r = discoverHashtagsInNotes(
      [{ id: "a", note: "#a #b #c" }],
      { topN: -5 },
    );
    assert.equal(r.entries.length, 3);
  });
  t("topN NaN → falls back to all", () => {
    const r = discoverHashtagsInNotes(
      [{ id: "a", note: "#a #b #c" }],
      { topN: NaN },
    );
    assert.equal(r.entries.length, 3);
  });
  t("topN larger than distinct → no over-fetch", () => {
    const r = discoverHashtagsInNotes(
      [{ id: "a", note: "#a #b" }],
      { topN: 100 },
    );
    assert.equal(r.entries.length, 2);
  });

  // -------------------- formatHashtagDiscoveryToast --------------------
  t("toast: empty report → no-hashtags message", () => {
    assert.equal(
      formatHashtagDiscoveryToast(discoverHashtagsInNotes([])),
      "No hashtags found in notes",
    );
  });
  t("toast: report with notes but no hashtags → no-hashtags message", () => {
    assert.equal(
      formatHashtagDiscoveryToast(
        discoverHashtagsInNotes([{ id: "a", note: "plain note" }]),
      ),
      "No hashtags found in notes",
    );
  });
  t("toast: single hashtag single clip", () => {
    assert.equal(
      formatHashtagDiscoveryToast(
        discoverHashtagsInNotes([{ id: "a", note: "#wip" }]),
      ),
      "Found #wip in 1 clip",
    );
  });
  t("toast: single hashtag multiple clips (plural noun)", () => {
    assert.equal(
      formatHashtagDiscoveryToast(
        discoverHashtagsInNotes([
          { id: "a", note: "#wip" },
          { id: "b", note: "#wip" },
          { id: "c", note: "#wip" },
        ]),
      ),
      "Found #wip in 3 clips",
    );
  });
  t("toast: 2-3 distinct lists them inline", () => {
    const r = discoverHashtagsInNotes([
      { id: "a", note: "#a #b" },
      { id: "b", note: "#c" },
    ]);
    const out = formatHashtagDiscoveryToast(r);
    assert.match(out, /^Found #a, #b, #c \(3 tags across 2 clips\)$/);
  });
  t("toast: 4+ distinct → headline + top 3 hint", () => {
    const r = discoverHashtagsInNotes([
      { id: "a", note: "#aa #bb #cc" },
      { id: "b", note: "#aa #bb #dd" },
      { id: "c", note: "#aa #ee" },
    ]);
    // Counts: aa=3, bb=2, cc=1, dd=1, ee=1 → distinctTags=5
    const out = formatHashtagDiscoveryToast(r);
    assert.equal(out, "Found 5 hashtags (top: #aa, #bb, #cc)");
  });

  // -------------------- formatHashtagDiscoveryHint --------------------
  t("hint: empty scan → invite copy", () => {
    assert.equal(
      formatHashtagDiscoveryHint(discoverHashtagsInNotes([])),
      "Find hashtags hiding in your notes",
    );
  });
  t("hint: scanned but no hashtags → 'no hashtags in any visible note'", () => {
    assert.equal(
      formatHashtagDiscoveryHint(
        discoverHashtagsInNotes([{ id: "a", note: "no tags" }]),
      ),
      "No hashtags in any visible note",
    );
  });
  t("hint: single hashtag single clip (singular noun)", () => {
    assert.equal(
      formatHashtagDiscoveryHint(
        discoverHashtagsInNotes([{ id: "a", note: "#wip" }]),
      ),
      "1 hashtag across 1 clip",
    );
  });
  t("hint: multiple hashtags multiple clips (plural)", () => {
    assert.equal(
      formatHashtagDiscoveryHint(
        discoverHashtagsInNotes([
          { id: "a", note: "#a #b" },
          { id: "b", note: "#c" },
        ]),
      ),
      "3 hashtags across 2 clips",
    );
  });
  t("hint: null report defensively", () => {
    assert.equal(
      formatHashtagDiscoveryHint(null),
      "Find hashtags hiding in your notes",
    );
  });

  // -------------------- realistic end-to-end --------------------
  t("realistic: 12-clip workspace with mixed hashtag distribution", () => {
    const clips = [
      { id: "1", note: "#staging only", tags: [] },
      { id: "2", note: "#staging env", tags: ["staging"] },
      { id: "3", note: "be careful — #staging", tags: [] },
      { id: "4", note: "#wip - revisit", tags: ["draft"] },
      { id: "5", note: "#wip notes", tags: [] },
      { id: "6", note: "#deprecated as of v2", tags: ["deprecated"] },
      { id: "7", note: "" }, // empty
      { id: "8", note: undefined }, // no note
      { id: "9", note: "plain note no hashtags" },
      { id: "10", note: "#review-q3 #wip combined" },
      { id: "11", note: "internal #secret rotation" },
      { id: "12", note: "#staging end" },
    ];
    const r = discoverHashtagsInNotes(clips);
    assert.equal(r.scanned, 12);
    assert.equal(r.clipsWithHashtags, 9); // 1,2,3,4,5,6,10,11,12
    // distinct: staging(4), wip(3), deprecated(1), review-q3(1), secret(1)
    assert.equal(r.distinctTags, 5);
    assert.equal(r.entries[0].tag, "staging");
    assert.equal(r.entries[0].clipCount, 4);
    assert.equal(r.entries[0].alreadyTagged, false); // 1,3,12 don't carry it
    assert.equal(r.entries[1].tag, "wip");
    assert.equal(r.entries[1].clipCount, 3);
    // deprecated, review-q3, secret all count=1 → alpha order
    const tail = r.entries.slice(2).map((e) => e.tag);
    assert.deepEqual(tail, ["deprecated", "review-q3", "secret"]);
    // 'deprecated' clip carries the structured tag → alreadyTagged=true
    assert.equal(r.entries.find((e) => e.tag === "deprecated").alreadyTagged, true);
  });

  console.log(`hashtag-discovery: ${pass} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
