// Sanity: jsonLineEnvelopeForClip + isSingleLine + buildSendActions row.
//
// Bundles src/lib/send-to.ts via esbuild and probes the new json-line
// row against representative clips. Same pattern as sanity-send-to.mjs
// — covers envelope shape, single-line invariant, defensive gates,
// and round-trip with multi-line content (newlines inside CONTENT
// must be escaped to \n by JSON.stringify so the envelope itself
// stays on one row).

import { build } from "esbuild";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const dir = mkdtempSync(join(tmpdir(), "ctxclip-jsonline-"));
try {
  await build({
    entryPoints: ["src/lib/send-to.ts"],
    bundle: true,
    format: "esm",
    outfile: join(dir, "sendto.mjs"),
    platform: "neutral",
    target: "es2022",
    sourcemap: false,
  });
  const mod = await import("file://" + join(dir, "sendto.mjs"));

  // Also bundle json-line directly so isSingleLine is reachable
  // (send-to.ts only re-exports the builder, not the helper).
  await build({
    entryPoints: ["src/lib/json-line.ts"],
    bundle: true,
    format: "esm",
    outfile: join(dir, "jsonline.mjs"),
    platform: "neutral",
    target: "es2022",
    sourcemap: false,
  });
  const jsonLineMod = await import("file://" + join(dir, "jsonline.mjs"));

  let pass = 0;
  let total = 0;
  function check(name, got, want) {
    total++;
    if (got === want) pass++;
    else
      console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
  }
  function checkTruthy(name, got) {
    total++;
    if (got) pass++;
    else console.error("FAIL", name, "got", JSON.stringify(got));
  }

  // --- 1. isSingleLine: defensive ---------------------------------------
  check("isSingleLine: null → false", jsonLineMod.isSingleLine(null), false);
  check("isSingleLine: undefined → false", jsonLineMod.isSingleLine(undefined), false);
  check("isSingleLine: empty → false", jsonLineMod.isSingleLine(""), false);
  check("isSingleLine: number → false", jsonLineMod.isSingleLine(42), false);
  check("isSingleLine: object → false", jsonLineMod.isSingleLine({}), false);

  // --- 2. isSingleLine: positive ----------------------------------------
  check("isSingleLine: plain text → true", jsonLineMod.isSingleLine("hello"), true);
  check("isSingleLine: with spaces → true", jsonLineMod.isSingleLine("a b c"), true);
  check("isSingleLine: JSON-ish → true", jsonLineMod.isSingleLine('{"a":1}'), true);

  // --- 3. isSingleLine: rejects newlines --------------------------------
  check("isSingleLine: LF → false", jsonLineMod.isSingleLine("a\nb"), false);
  check("isSingleLine: CR → false", jsonLineMod.isSingleLine("a\rb"), false);
  check("isSingleLine: CRLF → false", jsonLineMod.isSingleLine("a\r\nb"), false);
  check("isSingleLine: trailing LF → false", jsonLineMod.isSingleLine("a\n"), false);

  // --- 4. Fixtures (mirror sanity-send-to.mjs) --------------------------
  const textClip = {
    id: "t1",
    kind: "text",
    content: "function hello() {\n  return 42;\n}",
    preview: "function hello() { return 42; }",
    source: { url: "https://github.com/foo/bar", title: "Foo - GitHub" },
  };
  const emptyClip = { id: "e1", kind: "text", content: "", source: {} };
  const imageClip = {
    id: "i1",
    kind: "image",
    content: "data:image/png;base64,iVBORw0K...",
    source: { url: "https://imgur.com/foo" },
  };

  // --- 5. jsonLineEnvelopeForClip: shape --------------------------------
  const line1 = jsonLineMod.jsonLineEnvelopeForClip(textClip);
  checkTruthy("jsonLine: text returns non-empty string", line1);
  check("jsonLine: parses as JSON", JSON.parse(line1).version, 1);
  const parsed1 = JSON.parse(line1);
  check("jsonLine: clips array length 1", parsed1.clips.length, 1);
  check("jsonLine: source marker", parsed1.source, "send-to-json-line");
  check("jsonLine: clip payload has content", parsed1.clips[0].content, "function hello() {\n  return 42;\n}");

  // --- 6. CRITICAL: single-line invariant despite multi-line content ----
  // The clip body contains \n characters but the envelope itself must
  // stay on one row — JSON.stringify escapes those to \n literals.
  check("jsonLine: envelope is single-line even with multi-line body",
    jsonLineMod.isSingleLine(line1),
    true);
  check("jsonLine: NO literal newlines in envelope",
    /\n/.test(line1),
    false);

  // --- 7. jsonLineEnvelopeForClip: defensive gates ----------------------
  check("jsonLine: empty content → undefined", jsonLineMod.jsonLineEnvelopeForClip(emptyClip), undefined);
  check("jsonLine: no content key → undefined",
    jsonLineMod.jsonLineEnvelopeForClip({ id: "x", kind: "text", source: {} }),
    undefined);

  // --- 8. Image clip carries data URL through ---------------------------
  const lineImg = jsonLineMod.jsonLineEnvelopeForClip(imageClip);
  checkTruthy("jsonLine: image returns envelope", lineImg);
  check("jsonLine: image envelope single-line", jsonLineMod.isSingleLine(lineImg), true);
  const parsedImg = JSON.parse(lineImg);
  check("jsonLine: image data URL preserved", parsedImg.clips[0].content, "data:image/png;base64,iVBORw0K...");

  // --- 9. `full` override round-trips untouched -------------------------
  const fullClip = {
    id: "f1",
    kind: "text",
    content: "short",
    source: { url: "https://x.com" },
    full: {
      id: "f1",
      kind: "text",
      content: "short",
      source: { url: "https://x.com" },
      pinned: true,
      tags: ["important"],
      hitCount: 7,
    },
  };
  const lineFull = jsonLineMod.jsonLineEnvelopeForClip(fullClip);
  const parsedFull = JSON.parse(lineFull);
  check("jsonLine: full override carries pinned", parsedFull.clips[0].pinned, true);
  check("jsonLine: full override carries hitCount", parsedFull.clips[0].hitCount, 7);
  check("jsonLine: full override carries tags",
    Array.isArray(parsedFull.clips[0].tags) && parsedFull.clips[0].tags[0] === "important",
    true);
  check("jsonLine: full override still single-line", jsonLineMod.isSingleLine(lineFull), true);

  // --- 10. No-`full` fallback shape carries SendableClip fields ---------
  const noFull = { id: "x", kind: "text", content: "hello", source: {} };
  const parsedNoFull = JSON.parse(jsonLineMod.jsonLineEnvelopeForClip(noFull));
  check("jsonLine: no-full fallback has id", parsedNoFull.clips[0].id, "x");
  check("jsonLine: no-full fallback has content", parsedNoFull.clips[0].content, "hello");

  // --- 11. Pretty vs line: same shape, different formatting -------------
  const pretty = mod.jsonEnvelopeForClip(textClip);
  const line = jsonLineMod.jsonLineEnvelopeForClip(textClip);
  const prettyParsed = JSON.parse(pretty);
  const lineParsed = JSON.parse(line);
  // exportedAt differs because both call Date.now() — strip before compare.
  delete prettyParsed.exportedAt;
  delete lineParsed.exportedAt;
  // source markers differ by design (json vs json-line) — strip too.
  delete prettyParsed.source;
  delete lineParsed.source;
  check("pretty + line parse to identical shape (modulo source/exportedAt)",
    JSON.stringify(prettyParsed),
    JSON.stringify(lineParsed));
  // Pretty has whitespace; line does not.
  check("pretty has indentation", /\n  /.test(pretty), true);
  check("line has no indentation", /\n  /.test(line), false);

  // --- 12. send-to: action row presence ---------------------------------
  const acts = mod.buildSendActions(textClip);
  // table-row + json + json-line + curl + bg-tab = 14 total (was 13
  // before the bg-tab row landed; bg-tab sits between incognito and
  // site-search).
  total++;
  if (acts.length === 14) pass++;
  else console.error("FAIL acts.length got", acts.length, "want 14");

  const jsonLineRow = acts.find((a) => a.id === "json-line");
  checkTruthy("actions: json-line row exists", jsonLineRow);
  check("actions: json-line kind is copy", jsonLineRow.kind, "copy");
  check("actions: json-line available for text+url", jsonLineRow.available, true);
  check("actions: json-line label", jsonLineRow.label, "Copy as JSON line");
  check("actions: json-line hint", jsonLineRow.hint, "single-line minified");

  // --- 13. Row ordering: json-line follows json ------------------------
  check("actions: json-line follows json",
    acts.findIndex((a) => a.id === "json-line") - acts.findIndex((a) => a.id === "json"),
    1);

  // --- 14. Empty clip: json-line unavailable ----------------------------
  const emptyActs = mod.buildSendActions(emptyClip);
  const emptyJsonLine = emptyActs.find((a) => a.id === "json-line");
  check("actions: json-line unavailable for empty clip", emptyJsonLine.available, false);

  // --- 15. Image clip: json-line available (mirrors json) --------------
  const imgActs = mod.buildSendActions(imageClip);
  const imgJsonLine = imgActs.find((a) => a.id === "json-line");
  check("actions: json-line available for image", imgJsonLine.available, true);

  // --- 16. Reorder by last-used promotes json-line correctly ------------
  const reordered = mod.reorderSendActionsByLast(acts, "json-line");
  check("reorder: json-line bumped to position 0",
    reordered[0].id,
    "json-line");

  // --- 17. Realistic terminal/jsonl workflow ---------------------------
  // The whole point of json-line is `echo '...' | jq` style pipelines.
  // Confirm the output is shell-safe: no embedded literal newlines.
  const codeClip = {
    id: "c1",
    kind: "text",
    content: "const x = 1;\nconst y = 2;\nconst sum = x + y;",
    source: { url: "https://example.com" },
  };
  const codeLine = jsonLineMod.jsonLineEnvelopeForClip(codeClip);
  check("jsonl: multi-line code stays one row", jsonLineMod.isSingleLine(codeLine), true);
  // Verify the body round-trips when parsed.
  const codeParsed = JSON.parse(codeLine);
  check("jsonl: parsed content matches original",
    codeParsed.clips[0].content,
    "const x = 1;\nconst y = 2;\nconst sum = x + y;");

  console.log(`json-line sanity: ${pass}/${total} pass`);
  if (pass !== total) process.exit(1);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
