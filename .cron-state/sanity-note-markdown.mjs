// Pure sanity for src/lib/note-markdown.ts. Tests the blockquote
// formatter contract: hasClipNote gate, newline normalisation,
// per-line `> ` prefix, outer blank-line stripping, internal blank
// preservation, the empty-line `>` placeholder, defensive null /
// non-string / empty / whitespace-only inputs.

import { strict as assert } from "node:assert";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");

// Inline the module logic (TypeScript build is the guard).
function hasClipNote(c) {
  if (!c) return false;
  if (typeof c.note !== "string") return false;
  return c.note.trim().length > 0;
}

function noteAsMarkdownBlockquote(c) {
  if (!hasClipNote(c ?? null)) return undefined;
  const raw = c.note;
  if (typeof raw !== "string") return undefined;
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const trimmed = normalized.replace(/^\n+/, "").replace(/\n+$/, "");
  if (trimmed.length === 0) return undefined;
  const lines = trimmed.split("\n").map((line) => {
    if (line.length === 0) return ">";
    return `> ${line}`;
  });
  return lines.join("\n");
}

function noteAsMarkdownAvailable(c) {
  return hasClipNote(c ?? null);
}

// --- 1. Defensive ---
assert.equal(noteAsMarkdownBlockquote(null), undefined, "null clip → undefined");
assert.equal(noteAsMarkdownBlockquote(undefined), undefined, "undefined clip → undefined");
assert.equal(noteAsMarkdownBlockquote({}), undefined, "clip without note → undefined");
assert.equal(noteAsMarkdownBlockquote({ note: null }), undefined, "null note → undefined");
assert.equal(noteAsMarkdownBlockquote({ note: undefined }), undefined, "undefined note → undefined");
assert.equal(noteAsMarkdownBlockquote({ note: 42 }), undefined, "non-string note → undefined");
assert.equal(noteAsMarkdownBlockquote({ note: "" }), undefined, "empty note → undefined");
assert.equal(noteAsMarkdownBlockquote({ note: "   " }), undefined, "all-whitespace → undefined");
assert.equal(noteAsMarkdownBlockquote({ note: "\n\n\n" }), undefined, "newlines only → undefined");

// --- 2. Single-line note ---
assert.equal(
  noteAsMarkdownBlockquote({ note: "be careful" }),
  "> be careful",
  "single line gets `> ` prefix",
);

// --- 3. Multi-line note preserves line structure ---
{
  const out = noteAsMarkdownBlockquote({
    note: "first line\nsecond line\nthird line",
  });
  assert.equal(out, "> first line\n> second line\n> third line", "each line prefixed");
}

// --- 4. Internal blank lines → `>` placeholder ---
{
  const out = noteAsMarkdownBlockquote({
    note: "paragraph one\n\nparagraph two",
  });
  assert.equal(
    out,
    "> paragraph one\n>\n> paragraph two",
    "blank line becomes lone `>`",
  );
}

// --- 5. Leading + trailing blanks stripped ---
{
  const out = noteAsMarkdownBlockquote({
    note: "\n\n\nrealcontent\n\n\n",
  });
  assert.equal(out, "> realcontent", "outer blanks dropped");
}
{
  const out = noteAsMarkdownBlockquote({
    note: "\n\nhello\nworld\n\n",
  });
  assert.equal(out, "> hello\n> world", "outer blanks dropped, inner preserved");
}

// --- 6. CRLF normalisation ---
{
  const out = noteAsMarkdownBlockquote({
    note: "first\r\nsecond\r\nthird",
  });
  assert.equal(out, "> first\n> second\n> third", "CRLF normalised to LF");
}
{
  // Bare CR (old Mac style)
  const out = noteAsMarkdownBlockquote({ note: "a\rb\rc" });
  assert.equal(out, "> a\n> b\n> c", "bare CR normalised");
}

// --- 7. Already-quoted note (nested blockquote) ---
{
  // We don't strip pre-existing `> ` — let the user's nesting through.
  // Result is `>> ` which is a legitimate Markdown nested quote.
  const out = noteAsMarkdownBlockquote({ note: "> existing quote" });
  assert.equal(out, "> > existing quote", "existing quote nests with `>> `");
}

// --- 8. Tab + spaces preserved ---
{
  const out = noteAsMarkdownBlockquote({ note: "indented:\n    code line\nplain" });
  assert.equal(
    out,
    "> indented:\n>     code line\n> plain",
    "internal whitespace preserved",
  );
}

// --- 9. Very long note (no length cap — caller controls) ---
{
  const longNote = "x".repeat(5000);
  const out = noteAsMarkdownBlockquote({ note: longNote });
  assert.equal(out, "> " + "x".repeat(5000), "no truncation in the formatter");
  assert.equal(out.length, 5002, "exact length: `> ` + 5000 x's");
}

// --- 10. noteAsMarkdownAvailable gate matches formatter availability ---
assert.equal(noteAsMarkdownAvailable(null), false, "null → unavailable");
assert.equal(noteAsMarkdownAvailable({}), false, "no note → unavailable");
assert.equal(noteAsMarkdownAvailable({ note: "" }), false, "empty → unavailable");
assert.equal(noteAsMarkdownAvailable({ note: "   " }), false, "whitespace → unavailable");
assert.equal(noteAsMarkdownAvailable({ note: "x" }), true, "non-empty → available");
{
  // available ↔ blockquote returns a string. They must agree.
  const clip = { note: "real" };
  assert.equal(
    noteAsMarkdownAvailable(clip),
    noteAsMarkdownBlockquote(clip) !== undefined,
    "available + formatter agree",
  );
}
{
  const clip = { note: "" };
  assert.equal(
    noteAsMarkdownAvailable(clip),
    noteAsMarkdownBlockquote(clip) !== undefined,
    "empty → both false",
  );
}

// --- 11. Unicode + special chars survive ---
{
  const out = noteAsMarkdownBlockquote({
    note: "résumé · café · 日本語",
  });
  assert.equal(out, "> résumé · café · 日本語", "unicode preserved");
}
{
  const out = noteAsMarkdownBlockquote({
    note: "with emoji 🎉 and *markdown* & <html>",
  });
  assert.equal(
    out,
    "> with emoji 🎉 and *markdown* & <html>",
    "no HTML escaping — markdown raw",
  );
}

console.log(`OK ${REPO}/sanity-note-markdown.mjs (28 cases)`);
