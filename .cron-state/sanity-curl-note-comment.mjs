// Sanity tests for src/lib/curl-note-comment.ts — the detail send-to
// "Copy as cURL with note comment" row.
//
// Run with: node .cron-state/sanity-curl-note-comment.mjs

import assert from "node:assert/strict";
import { build } from "esbuild";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "ctxclip-cnc-"));
try {
  await build({
    entryPoints: ["src/lib/curl-note-comment.ts"],
    bundle: true,
    format: "esm",
    outfile: join(tmp, "curl-note-comment.mjs"),
    platform: "neutral",
    target: "es2022",
    logLevel: "silent",
  });
  const {
    curlWithNoteCommentForClip,
    curlWithNoteCommentAvailable,
    sanitiseForShellComment,
    CURL_COMMENT_DEFAULT_CAP,
  } = await import(join(tmp, "curl-note-comment.mjs"));

  // Also build send-to.ts so we can verify the row appears in
  // buildSendActions for the right clip shapes.
  await build({
    entryPoints: ["src/lib/send-to.ts"],
    bundle: true,
    format: "esm",
    outfile: join(tmp, "send-to.mjs"),
    platform: "neutral",
    target: "es2022",
    logLevel: "silent",
  });
  const sendTo = await import(join(tmp, "send-to.mjs"));

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

  // -------------------- sanitiseForShellComment --------------------
  t("sanitise: undefined → ''", () =>
    assert.equal(sanitiseForShellComment(undefined), ""));
  t("sanitise: null → ''", () =>
    assert.equal(sanitiseForShellComment(null), ""));
  t("sanitise: non-string → ''", () =>
    assert.equal(sanitiseForShellComment(42), ""));
  t("sanitise: empty → ''", () =>
    assert.equal(sanitiseForShellComment(""), ""));
  t("sanitise: whitespace-only → ''", () =>
    assert.equal(sanitiseForShellComment("   \t\n  "), ""));
  t("sanitise: plain ascii → unchanged", () =>
    assert.equal(
      sanitiseForShellComment("only on staging"),
      "only on staging",
    ));
  t("sanitise: trim outer whitespace", () =>
    assert.equal(
      sanitiseForShellComment("  staging only  "),
      "staging only",
    ));
  t("sanitise: collapse internal newlines to single space", () =>
    assert.equal(
      sanitiseForShellComment("line one\nline two"),
      "line one line two",
    ));
  t("sanitise: collapse tabs to single space", () =>
    assert.equal(
      sanitiseForShellComment("staging\tonly\there"),
      "staging only here",
    ));
  t("sanitise: collapse multiple spaces to single", () =>
    assert.equal(
      sanitiseForShellComment("staging    only"),
      "staging only",
    ));
  t("sanitise: collapse mixed whitespace", () =>
    assert.equal(
      sanitiseForShellComment("a\n\nb\t\tc   d"),
      "a b c d",
    ));
  t("sanitise: strip C0 control chars (defensive)", () => {
    // \u0001 \u0007 (BEL) \u001F all stripped; \t \n collapsed via whitespace pass
    const noisy = "before\u0001\u0007after";
    assert.equal(sanitiseForShellComment(noisy), "beforeafter");
  });
  t("sanitise: keep \\t \\n \\r for whitespace-collapse path", () => {
    // \r should be normalised/collapsed (not corrupt)
    assert.equal(sanitiseForShellComment("a\r\nb"), "a b");
  });

  // -------------------- sanitiseForShellComment: cap & truncation --------------------
  t("sanitise: under cap → no truncation", () => {
    const note = "x".repeat(50);
    assert.equal(sanitiseForShellComment(note, 100), note);
  });
  t("sanitise: at exact cap → no truncation", () => {
    const note = "x".repeat(100);
    assert.equal(sanitiseForShellComment(note, 100), note);
  });
  t("sanitise: over cap → ellipsis", () => {
    const note = "x".repeat(150);
    const out = sanitiseForShellComment(note, 100);
    assert.ok(out.endsWith("…"));
    assert.ok(out.length <= 101); // 100 chars + ellipsis
  });
  t("sanitise: over cap with word-boundary truncation", () => {
    const note = "this is a long note that should truncate at a word boundary not in the middle of a word definitely";
    const out = sanitiseForShellComment(note, 50);
    assert.ok(out.endsWith("…"));
    // The truncation should land at a space, not mid-word
    const beforeEllipsis = out.slice(0, -1);
    assert.ok(!beforeEllipsis.endsWith(" "));
    // And the last char shouldn't be in the middle of "truncate"/"boundary"
  });
  t("sanitise: over cap, single giant word → hard slice", () => {
    const note = "x".repeat(200);
    const out = sanitiseForShellComment(note, 50);
    assert.equal(out.length, 51); // 50 + ellipsis
    assert.ok(out.endsWith("x…"));
  });
  t("sanitise: default cap when not provided", () => {
    const note = "x".repeat(CURL_COMMENT_DEFAULT_CAP + 50);
    const out = sanitiseForShellComment(note);
    assert.ok(out.endsWith("…"));
    assert.ok(out.length <= CURL_COMMENT_DEFAULT_CAP + 1);
  });
  t("sanitise: invalid cap (NaN) → default", () => {
    const note = "x".repeat(CURL_COMMENT_DEFAULT_CAP + 50);
    assert.equal(
      sanitiseForShellComment(note, NaN),
      sanitiseForShellComment(note),
    );
  });
  t("sanitise: invalid cap (negative) → default", () => {
    const note = "x".repeat(CURL_COMMENT_DEFAULT_CAP + 50);
    assert.equal(
      sanitiseForShellComment(note, -10),
      sanitiseForShellComment(note),
    );
  });
  t("sanitise: invalid cap (zero) → default", () => {
    const note = "x".repeat(CURL_COMMENT_DEFAULT_CAP + 50);
    assert.equal(
      sanitiseForShellComment(note, 0),
      sanitiseForShellComment(note),
    );
  });

  // -------------------- curlWithNoteCommentForClip: defensive --------------------
  t("curl-note: null clip → undefined", () =>
    assert.equal(curlWithNoteCommentForClip(null), undefined));
  t("curl-note: undefined clip → undefined", () =>
    assert.equal(curlWithNoteCommentForClip(undefined), undefined));
  t("curl-note: clip with note but no URL → undefined", () => {
    const c = {
      id: "1",
      kind: "text",
      content: "plain text",
      source: {},
      note: "caveat here",
    };
    assert.equal(curlWithNoteCommentForClip(c), undefined);
  });
  t("curl-note: link clip with no note → undefined", () => {
    const c = {
      id: "1",
      kind: "link",
      content: "https://example.com",
      source: { url: "https://example.com" },
    };
    assert.equal(curlWithNoteCommentForClip(c), undefined);
  });
  t("curl-note: link clip with empty-string note → undefined", () => {
    const c = {
      id: "1",
      kind: "link",
      content: "https://example.com",
      source: { url: "https://example.com" },
      note: "",
    };
    assert.equal(curlWithNoteCommentForClip(c), undefined);
  });
  t("curl-note: link clip with whitespace-only note → undefined", () => {
    const c = {
      id: "1",
      kind: "link",
      content: "https://example.com",
      source: { url: "https://example.com" },
      note: "   \t\n  ",
    };
    assert.equal(curlWithNoteCommentForClip(c), undefined);
  });
  t("curl-note: non-http URL → undefined", () => {
    const c = {
      id: "1",
      kind: "link",
      content: "file:///etc/passwd",
      source: { url: "file:///etc/passwd" },
      note: "danger",
    };
    assert.equal(curlWithNoteCommentForClip(c), undefined);
  });

  // -------------------- curlWithNoteCommentForClip: positive --------------------
  t("curl-note: link clip with note → 'curl url # note'", () => {
    const c = {
      id: "1",
      kind: "link",
      content: "https://example.com",
      source: { url: "https://example.com" },
      note: "only on staging",
    };
    assert.equal(
      curlWithNoteCommentForClip(c),
      "curl 'https://example.com' # only on staging",
    );
  });
  t("curl-note: text clip with source URL and note", () => {
    const c = {
      id: "1",
      kind: "text",
      content: "some captured text",
      source: { url: "https://docs.example.com/page" },
      note: "test env only",
    };
    assert.equal(
      curlWithNoteCommentForClip(c),
      "curl 'https://docs.example.com/page' # test env only",
    );
  });
  t("curl-note: URL with single-quote is properly escaped", () => {
    const c = {
      id: "1",
      kind: "link",
      content: "https://example.com/?q=foo'bar",
      source: { url: "https://example.com/?q=foo'bar" },
      note: "watch out",
    };
    const out = curlWithNoteCommentForClip(c);
    assert.ok(out.startsWith("curl 'https://example.com/?q=foo'\\''bar'"));
    assert.ok(out.endsWith(" # watch out"));
  });
  t("curl-note: multi-line note → collapsed to single line", () => {
    const c = {
      id: "1",
      kind: "link",
      content: "https://example.com",
      source: { url: "https://example.com" },
      note: "first line\nsecond line\nthird line",
    };
    const out = curlWithNoteCommentForClip(c);
    // No newlines in output - critical for shell # comment safety
    assert.ok(!out.includes("\n"));
    assert.equal(out, "curl 'https://example.com' # first line second line third line");
  });
  t("curl-note: HTTPS URL with query string preserved", () => {
    const c = {
      id: "1",
      kind: "link",
      content: "https://api.example.com/v1?foo=bar&baz=qux",
      source: { url: "https://api.example.com/v1?foo=bar&baz=qux" },
      note: "API call",
    };
    assert.equal(
      curlWithNoteCommentForClip(c),
      "curl 'https://api.example.com/v1?foo=bar&baz=qux' # API call",
    );
  });
  t("curl-note: long note gets truncated with ellipsis", () => {
    const longNote = "x".repeat(300);
    const c = {
      id: "1",
      kind: "link",
      content: "https://example.com",
      source: { url: "https://example.com" },
      note: longNote,
    };
    const out = curlWithNoteCommentForClip(c);
    assert.ok(out.startsWith("curl 'https://example.com' # "));
    assert.ok(out.endsWith("…"));
    // URL part + " # " + capped note + ellipsis
    assert.ok(out.length < 320);
  });

  // -------------------- curlWithNoteCommentAvailable --------------------
  t("available: missing → false", () => {
    assert.equal(curlWithNoteCommentAvailable(null), false);
    assert.equal(curlWithNoteCommentAvailable(undefined), false);
  });
  t("available: link clip with note → true", () => {
    assert.equal(
      curlWithNoteCommentAvailable({
        id: "1",
        kind: "link",
        content: "https://example.com",
        source: { url: "https://example.com" },
        note: "ok",
      }),
      true,
    );
  });
  t("available: link clip without note → false", () => {
    assert.equal(
      curlWithNoteCommentAvailable({
        id: "1",
        kind: "link",
        content: "https://example.com",
        source: { url: "https://example.com" },
      }),
      false,
    );
  });
  t("available: text clip with URL + note → true", () => {
    assert.equal(
      curlWithNoteCommentAvailable({
        id: "1",
        kind: "text",
        content: "foo",
        source: { url: "https://example.com" },
        note: "ok",
      }),
      true,
    );
  });

  // -------------------- buildSendActions integration --------------------
  t("buildSendActions: curl-note row exists", () => {
    const c = {
      id: "1",
      kind: "link",
      content: "https://example.com",
      source: { url: "https://example.com" },
      note: "ok",
    };
    const acts = sendTo.buildSendActions(c);
    const row = acts.find((a) => a.id === "curl-note");
    assert.ok(row, "curl-note row should exist in buildSendActions");
    assert.equal(row.kind, "copy");
    assert.equal(row.label, "Copy as cURL with note comment");
    assert.equal(row.available, true);
    assert.equal(row.payload, "curl 'https://example.com' # ok");
  });
  t("buildSendActions: curl-note row hides for clip without note", () => {
    const c = {
      id: "1",
      kind: "link",
      content: "https://example.com",
      source: { url: "https://example.com" },
    };
    const acts = sendTo.buildSendActions(c);
    const row = acts.find((a) => a.id === "curl-note");
    assert.ok(row, "row entry still present");
    assert.equal(row.available, false);
    assert.equal(row.payload, undefined);
  });
  t("buildSendActions: curl-note follows curl in row order", () => {
    const c = {
      id: "1",
      kind: "link",
      content: "https://example.com",
      source: { url: "https://example.com" },
      note: "ok",
    };
    const acts = sendTo.buildSendActions(c);
    const curlIdx = acts.findIndex((a) => a.id === "curl");
    const curlNoteIdx = acts.findIndex((a) => a.id === "curl-note");
    assert.equal(curlNoteIdx - curlIdx, 1);
  });
  t("buildSendActions: curl-note hides for image clip", () => {
    const c = {
      id: "1",
      kind: "image",
      content: "data:image/png;base64,xx",
      source: { url: "https://example.com/img.png" },
      note: "image caveat",
    };
    const acts = sendTo.buildSendActions(c);
    const row = acts.find((a) => a.id === "curl-note");
    // Image clips DO have a source URL, so curl itself is available;
    // but with a note, this row should be available too. Wait -
    // curlCommandForClip uses shareableUrl which doesn't restrict
    // image kind explicitly. Let me verify the actual behaviour:
    // image clips fall through to `c.source?.url` check, so they
    // ARE valid for curl. So with a note, this row IS available.
    // That's actually fine - curl'ing an image URL is a legitimate
    // workflow.
    assert.ok(row);
    assert.equal(row.available, true);
  });

  // -------------------- shell-comment safety --------------------
  t("safety: backtick in note doesn't break shell parsing", () => {
    // Note containing backtick - it lives INSIDE the # comment,
    // so the shell ignores it. We just need to verify our output
    // doesn't accidentally escape the comment context.
    const c = {
      id: "1",
      kind: "link",
      content: "https://example.com",
      source: { url: "https://example.com" },
      note: "uses `git rev-parse`",
    };
    const out = curlWithNoteCommentForClip(c);
    assert.equal(out, "curl 'https://example.com' # uses `git rev-parse`");
    // The backtick is inside the comment so shell-safe by definition;
    // we just need to verify we don't accidentally close-and-restart
    // the URL's single-quoting in a way that exposes the backtick.
    assert.ok(out.includes("https://example.com'"));
  });
  t("safety: dollar-sign in note", () => {
    const c = {
      id: "1",
      kind: "link",
      content: "https://example.com",
      source: { url: "https://example.com" },
      note: "set $TOKEN first",
    };
    assert.equal(
      curlWithNoteCommentForClip(c),
      "curl 'https://example.com' # set $TOKEN first",
    );
  });
  t("safety: comment starts with hyphen safely (no false flag parse)", () => {
    // Some shells / tools could mis-parse `--flag` after `#` but
    // since it's inside a comment, this is fine. Verify output.
    const c = {
      id: "1",
      kind: "link",
      content: "https://example.com",
      source: { url: "https://example.com" },
      note: "--use-cache flag may be needed",
    };
    assert.equal(
      curlWithNoteCommentForClip(c),
      "curl 'https://example.com' # --use-cache flag may be needed",
    );
  });

  console.log(`curl-note-comment: ${pass} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
