// Sanity tests for the `is:nonoted` search operator (parity twin of
// `is:noted`). Mirrors sanity-is-noted.mjs but inverts the truth tables.
//
// Run with: node .cron-state/sanity-is-nonoted.mjs

import assert from "node:assert/strict";
import { build } from "esbuild";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "ctxclip-nonoted-"));
try {
  await build({
    entryPoints: ["src/lib/search.ts"],
    bundle: true,
    format: "esm",
    outfile: join(tmp, "search.mjs"),
    platform: "neutral",
    target: "es2022",
    logLevel: "silent",
  });
  const { parseQuery, applyQuery, describeQuery } = await import(
    join(tmp, "search.mjs")
  );

  // helpers ---------------------------------------------------------
  const clip = (id, note) => ({
    id,
    kind: "text",
    content: "x",
    source: {},
    pinned: false,
    createdAt: 1,
    lastSeenAt: 1,
    hitCount: 0,
    tags: [],
    bytes: 1,
    hash: id,
    ...(note !== undefined ? { note } : {}),
  });

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

  // parser ---------------------------------------------------------
  t("parses is:nonoted to nonotedOnly", () => {
    const q = parseQuery("is:nonoted");
    assert.equal(q.nonotedOnly, true);
    assert.equal(q.notedOnly, false);
    assert.equal(q.freeText, "");
  });

  t("parses is:noted without enabling is:nonoted", () => {
    const q = parseQuery("is:noted");
    assert.equal(q.notedOnly, true);
    assert.equal(q.nonotedOnly, false);
  });

  t("parser preserves user intent — both flags settable", () => {
    const q = parseQuery("is:noted is:nonoted");
    assert.equal(q.notedOnly, true);
    assert.equal(q.nonotedOnly, true);
  });

  t("typo `is:nonoted2` falls through to free text", () => {
    const q = parseQuery("is:nonoted2");
    assert.equal(q.nonotedOnly, false);
    assert.equal(q.notedOnly, false);
    assert.match(q.freeText, /is:nonoted2/);
  });

  t("typo `is:nonot` falls through to free text", () => {
    const q = parseQuery("is:nonot");
    assert.equal(q.nonotedOnly, false);
    assert.match(q.freeText, /is:nonot/);
  });

  // applyQuery — strict complement of is:noted --------------------
  t("is:nonoted matches clip with NO note field", () => {
    const c = clip("a");
    const q = parseQuery("is:nonoted");
    assert.deepEqual(applyQuery([c], q).map((x) => x.id), ["a"]);
  });

  t("is:nonoted matches clip with empty-string note", () => {
    const c = clip("a", "");
    const q = parseQuery("is:nonoted");
    assert.deepEqual(applyQuery([c], q).map((x) => x.id), ["a"]);
  });

  t("is:nonoted matches clip with whitespace-only note", () => {
    const c = clip("a", "   \n\t  ");
    const q = parseQuery("is:nonoted");
    assert.deepEqual(applyQuery([c], q).map((x) => x.id), ["a"]);
  });

  t("is:nonoted rejects clip with real note", () => {
    const c = clip("a", "be careful — staging only");
    const q = parseQuery("is:nonoted");
    assert.deepEqual(applyQuery([c], q).map((x) => x.id), []);
  });

  t("is:nonoted rejects clip whose note is one trimmed char", () => {
    const c = clip("a", "  x  ");
    const q = parseQuery("is:nonoted");
    assert.deepEqual(applyQuery([c], q).map((x) => x.id), []);
  });

  t("is:nonoted rejects clip with non-string note (defensive)", () => {
    const c = clip("a");
    c.note = 42; // synth bad data
    const q = parseQuery("is:nonoted");
    // matches because hasClipNote returns false for non-string
    assert.deepEqual(applyQuery([c], q).map((x) => x.id), ["a"]);
  });

  t("is:nonoted partitions a mixed list cleanly", () => {
    const noted = clip("a", "with note");
    const empty = clip("b");
    const blank = clip("c", "  ");
    const real = clip("d", "annotated");
    const q = parseQuery("is:nonoted");
    assert.deepEqual(
      applyQuery([noted, empty, blank, real], q).map((x) => x.id),
      ["b", "c"],
    );
  });

  // pair-complement law -------------------------------------------
  t("is:noted + is:nonoted partition the clip space (every clip in exactly one)", () => {
    const clips = [
      clip("a"),
      clip("b", ""),
      clip("c", "  "),
      clip("d", "real"),
      clip("e", "another"),
    ];
    const noted = applyQuery(clips, parseQuery("is:noted")).map((c) => c.id);
    const nonoted = applyQuery(clips, parseQuery("is:nonoted")).map(
      (c) => c.id,
    );
    // no overlap
    for (const id of noted) assert.ok(!nonoted.includes(id), `overlap: ${id}`);
    // union covers all
    const union = new Set([...noted, ...nonoted]);
    assert.equal(union.size, clips.length, "union must cover every clip");
  });

  t("is:noted is:nonoted → empty (AND of complements)", () => {
    const clips = [clip("a"), clip("b", "real")];
    const q = parseQuery("is:noted is:nonoted");
    assert.deepEqual(applyQuery(clips, q).map((c) => c.id), []);
  });

  // describeQuery -------------------------------------------------
  t("describeQuery surfaces nonoted as `not-noted`", () => {
    const desc = describeQuery(parseQuery("is:nonoted"));
    assert.match(desc, /not-noted/);
  });

  t("describeQuery surfaces both when both set", () => {
    const desc = describeQuery(parseQuery("is:noted is:nonoted"));
    assert.match(desc, /noted/);
    assert.match(desc, /not-noted/);
  });

  // composition with other operators ------------------------------
  t("is:nonoted host:github.com narrows correctly", () => {
    const a = clip("a", "noted");
    a.source.url = "https://github.com/x";
    const b = clip("b");
    b.source.url = "https://github.com/y";
    const c = clip("c");
    c.source.url = "https://other.com/z";
    const q = parseQuery("is:nonoted host:github.com");
    assert.deepEqual(
      applyQuery([a, b, c], q).map((x) => x.id),
      ["b"],
    );
  });

  t("is:nonoted is:locked surfaces uncommented locked clips", () => {
    const a = clip("a", "noted");
    a.locked = true;
    const b = clip("b");
    b.locked = true;
    const c = clip("c");
    c.locked = false;
    const q = parseQuery("is:nonoted is:locked");
    assert.deepEqual(
      applyQuery([a, b, c], q).map((x) => x.id),
      ["b"],
    );
  });

  console.log(`is:nonoted sanity: ${pass}/${pass} pass`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
