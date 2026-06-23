// Sanity tests for src/lib/clip-note-markdown.ts — the combined
// "Copy clip + note as Markdown" send-to row that emits fenced-code
// body + Markdown blockquote note in a single copy.
//
// Run with: node .cron-state/sanity-clip-note-markdown.mjs

import assert from "node:assert/strict";
import { build } from "esbuild";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "ctxclip-cnm-"));
try {
  await build({
    entryPoints: ["src/lib/clip-note-markdown.ts"],
    bundle: true,
    format: "esm",
    outfile: join(tmp, "clip-note-markdown.mjs"),
    platform: "neutral",
    target: "es2022",
    logLevel: "silent",
  });
  const {
    clipAndNoteAsMarkdown,
    clipAndNoteAsMarkdownAvailable,
  } = await import(join(tmp, "clip-note-markdown.mjs"));

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

  // -------------------- availability gate --------------------
  t("null clip → undefined / unavailable", () => {
    assert.equal(clipAndNoteAsMarkdown(null), undefined);
    assert.equal(clipAndNoteAsMarkdown(undefined), undefined);
    assert.equal(clipAndNoteAsMarkdownAvailable(null), false);
    assert.equal(clipAndNoteAsMarkdownAvailable(undefined), false);
  });

  t("image kind → undefined regardless of note", () => {
    const c = { kind: "image", content: "data:image/png;base64,xx", note: "fine" };
    assert.equal(clipAndNoteAsMarkdown(c), undefined);
    assert.equal(clipAndNoteAsMarkdownAvailable(c), false);
  });

  t("non-string content → undefined", () => {
    const c = { kind: "text", content: null, note: "fine" };
    assert.equal(clipAndNoteAsMarkdown(c), undefined);
    assert.equal(clipAndNoteAsMarkdownAvailable(c), false);
  });

  t("empty content → undefined", () => {
    const c = { kind: "text", content: "", note: "fine" };
    assert.equal(clipAndNoteAsMarkdown(c), undefined);
    assert.equal(clipAndNoteAsMarkdownAvailable(c), false);
  });

  t("whitespace-only content → undefined", () => {
    const c = { kind: "text", content: "   \n\t  ", note: "fine" };
    assert.equal(clipAndNoteAsMarkdown(c), undefined);
    assert.equal(clipAndNoteAsMarkdownAvailable(c), false);
  });

  t("missing note → undefined", () => {
    const c = { kind: "text", content: "body" };
    assert.equal(clipAndNoteAsMarkdown(c), undefined);
    assert.equal(clipAndNoteAsMarkdownAvailable(c), false);
  });

  t("empty note → undefined", () => {
    const c = { kind: "text", content: "body", note: "" };
    assert.equal(clipAndNoteAsMarkdown(c), undefined);
    assert.equal(clipAndNoteAsMarkdownAvailable(c), false);
  });

  t("whitespace-only note → undefined", () => {
    const c = { kind: "text", content: "body", note: "   \n  " };
    assert.equal(clipAndNoteAsMarkdown(c), undefined);
    assert.equal(clipAndNoteAsMarkdownAvailable(c), false);
  });

  t("non-string note → undefined", () => {
    const c = { kind: "text", content: "body", note: 42 };
    assert.equal(clipAndNoteAsMarkdown(c), undefined);
    assert.equal(clipAndNoteAsMarkdownAvailable(c), false);
  });

  // -------------------- output shape --------------------
  t("text clip with note → fenced-code + blockquote", () => {
    const out = clipAndNoteAsMarkdown({
      kind: "text",
      content: "console.log('hi')",
      note: "be careful",
    });
    assert.match(out, /^```.*\nconsole\.log\('hi'\)\n```\n\n> be careful$/);
  });

  t("link clip with note → fenced-code + blockquote", () => {
    const out = clipAndNoteAsMarkdown({
      kind: "link",
      content: "https://example.com/foo",
      note: "staging only",
    });
    assert.match(out, /^```\n?https:\/\/example\.com\/foo\n```\n\n> staging only$/);
  });

  t("code clip gets language tag", () => {
    const out = clipAndNoteAsMarkdown({
      kind: "text",
      content: "def hello():\n    return 42",
      note: "Python helper",
    });
    // detectCodeLang should pick up def/return as Python-ish
    assert.match(out, /^```\w+\ndef hello\(\):\n    return 42\n```\n\n> Python helper$/);
  });

  t("output uses two-newline paragraph separator", () => {
    const out = clipAndNoteAsMarkdown({
      kind: "text",
      content: "body",
      note: "note",
    });
    // Exactly one occurrence of \n\n between the fence-close and `> note`
    const matches = out.match(/```\n\n>/g) ?? [];
    assert.equal(matches.length, 1);
  });

  // -------------------- multi-line notes --------------------
  t("multi-line note preserves line breaks via > prefix per line", () => {
    const out = clipAndNoteAsMarkdown({
      kind: "text",
      content: "snippet",
      note: "first line\nsecond line\nthird line",
    });
    // Each note line gets its own > prefix
    assert(out.includes("> first line"));
    assert(out.includes("> second line"));
    assert(out.includes("> third line"));
  });

  t("note with internal blank line gets >-placeholder", () => {
    const out = clipAndNoteAsMarkdown({
      kind: "text",
      content: "body",
      note: "para one\n\npara two",
    });
    // Internal blank becomes a bare `>` placeholder so paragraph
    // breaks survive Markdown rendering.
    assert(out.includes("> para one"));
    assert(out.includes(">\n"));
    assert(out.includes("> para two"));
  });

  t("note CRLF normalised to LF in output", () => {
    const out = clipAndNoteAsMarkdown({
      kind: "text",
      content: "body",
      note: "line one\r\nline two",
    });
    assert(!out.includes("\r"));
    assert(out.includes("> line one\n> line two"));
  });

  // -------------------- byte-identical to component composition --------------------
  t("output equals fenced-code + '\\n\\n' + noteAsMarkdownBlockquote (composition)", async () => {
    // Quick ESM build of the two component modules so we can verify
    // the combined output IS the sum of its parts (no drift).
    const tmp2 = mkdtempSync(join(tmpdir(), "ctxclip-cnm-comp-"));
    try {
      await build({
        entryPoints: [
          "src/lib/send-to.ts",
          "src/lib/note-markdown.ts",
        ],
        bundle: true,
        format: "esm",
        outdir: tmp2,
        platform: "neutral",
        target: "es2022",
        logLevel: "silent",
      });
      const sendTo = await import(join(tmp2, "send-to.js"));
      const noteMd = await import(join(tmp2, "note-markdown.js"));
      const c = {
        id: "c",
        kind: "text",
        content: "console.log('x')",
        note: "be careful",
        source: {},
      };
      const fence = sendTo.fencedCodeForClip(c);
      const bq = noteMd.noteAsMarkdownBlockquote(c);
      const combined = clipAndNoteAsMarkdown(c);
      assert.equal(combined, fence + "\n\n" + bq);
    } finally {
      rmSync(tmp2, { recursive: true, force: true });
    }
  });

  // -------------------- defensive --------------------
  t("clip missing kind field → still formats (kind only blocks image)", () => {
    // The gate is `kind === "image"` → reject. Any other value (or
    // missing) falls through to the body+note checks, so a clip
    // without kind but with body+note produces output. Matches the
    // gate predicate's semantics — image is the only kind that
    // CANNOT be fenced-code'd; everything else (text, link, future
    // kinds) can.
    const c = { content: "body", note: "fine" };
    const out = clipAndNoteAsMarkdown(c);
    assert(typeof out === "string");
    assert(out.includes("body"));
    assert(out.includes("> fine"));
  });

  t("predicate matches formatter for the same clip", () => {
    const fixtures = [
      { kind: "text", content: "body", note: "fine" }, // both → true
      { kind: "text", content: "body" }, // no note → false
      { kind: "text", content: "", note: "fine" }, // no body → false
      { kind: "image", content: "data:x", note: "fine" }, // image → false
      null,
    ];
    for (const c of fixtures) {
      const formatted = clipAndNoteAsMarkdown(c);
      const available = clipAndNoteAsMarkdownAvailable(c);
      assert.equal(!!formatted, available, "predicate must match formatter availability");
    }
  });

  console.log(`clip-note-markdown sanity: ${pass}/${pass} pass`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
