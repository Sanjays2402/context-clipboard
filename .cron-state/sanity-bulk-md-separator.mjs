// Sanity: bulk Copy-as-Markdown clip separator (lib/bulk-markdown).
//
// The bulk "Copy selected as Markdown" join used a hard-coded `---`
// horizontal rule between clips. Some doc/wiki/slide targets render a
// standalone `---` as a thematic break / front-matter fence / new
// slide, mangling a multi-clip paste — so the separator is now a
// setting (rule vs blank line). This harness exercises the pure
// separator resolver + the planBulkMarkdown join under each style.
//
// Coverage:
//   1. bulkMarkdownSeparator — "blank" -> "\n\n", anything else (incl.
//      undefined / junk) -> the rule default "\n\n---\n\n".
//   2. planBulkMarkdown join — two clips joined with rule vs blank; the
//      block CONTENT is identical across styles (only the seam differs);
//      single clip has no seam either way.

const SEPARATORS = { rule: "\n\n---\n\n", blank: "\n\n" };
function bulkMarkdownSeparator(style) {
  return style === "blank" ? SEPARATORS.blank : SEPARATORS.rule;
}
// Minimal stand-in for clipToMarkdown's text-blockquote branch (no
// source URL) so we can verify the JOIN without re-deriving the whole
// renderer — the join is the only thing this slice changed.
function block(content) {
  return `> ${content}`;
}
function planJoin(contents, separator) {
  const blocks = contents.map(block);
  return blocks.join(bulkMarkdownSeparator(separator));
}

let p = 0, t = 0;
function ck(n, g, w) {
  t++;
  if (JSON.stringify(g) === JSON.stringify(w)) p++;
  else console.error("FAIL", n, "got", JSON.stringify(g), "want", JSON.stringify(w));
}

// 1. resolver
ck("blank -> blank line", bulkMarkdownSeparator("blank"), "\n\n");
ck("rule -> rule", bulkMarkdownSeparator("rule"), "\n\n---\n\n");
ck("undefined -> rule default", bulkMarkdownSeparator(undefined), "\n\n---\n\n");
ck("null -> rule default", bulkMarkdownSeparator(null), "\n\n---\n\n");
ck("junk -> rule default", bulkMarkdownSeparator("zzz"), "\n\n---\n\n");

// 2. join under each style
ck(
  "two clips, rule seam",
  planJoin(["one", "two"], "rule"),
  "> one\n\n---\n\n> two",
);
ck(
  "two clips, blank seam",
  planJoin(["one", "two"], "blank"),
  "> one\n\n> two",
);
// blank join must NOT contain a horizontal rule
ck("blank join has no --- rule", planJoin(["a", "b"], "blank").includes("---"), false);
// rule join DOES carry the rule
ck("rule join carries --- rule", planJoin(["a", "b"], "rule").includes("\n---\n"), true);
// single clip: no seam either way (identical output)
ck("single clip rule == blank", planJoin(["solo"], "rule") === planJoin(["solo"], "blank"), true);
ck("single clip output", planJoin(["solo"], "blank"), "> solo");
// three clips: two seams of the chosen kind
ck(
  "three clips blank seams",
  planJoin(["a", "b", "c"], "blank"),
  "> a\n\n> b\n\n> c",
);

console.log(`bulk-md-separator: ${p}/${t}`);
process.exit(p === t ? 0 : 1);
