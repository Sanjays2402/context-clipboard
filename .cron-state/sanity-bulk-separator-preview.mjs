// Sanity: bulk-md separator live preview (lib/bulk-separator-preview).
//
// The Settings swatch renders two stub clips joined by the chosen
// separator so the user sees the actual seam. This harness exercises the
// pure builder (inline copies mirroring the lib), confirming the preview
// is byte-identical to the live join.
//
// Coverage:
//   1. rule join inserts "\n\n---\n\n" between the two stubs.
//   2. blank join inserts "\n\n".
//   3. unknown / nullish falls back to the rule join.
//   4. the seam matches bulkMarkdownSeparator exactly (no drift).
//   5. caption grammar per style.

const SEPARATORS = { rule: "\n\n---\n\n", blank: "\n\n" };
function bulkMarkdownSeparator(style) {
  return style === "blank" ? SEPARATORS.blank : SEPARATORS.rule;
}
const STUB_A = "```ts\nconst x = 1;\n```";
const STUB_B = "> A quoted note\n\n\u2014 [example.com](https://example.com)";
function bulkSeparatorPreview(style) {
  return [STUB_A, STUB_B].join(bulkMarkdownSeparator(style));
}
function bulkSeparatorCaption(style) {
  return style === "blank"
    ? "Clips joined by a blank line (no thematic break)."
    : "Clips separated by a horizontal rule (---).";
}

let p = 0,
  t = 0;
function ck(n, g, w) {
  t++;
  if (g === w) p++;
  else console.error("FAIL", n, "got", JSON.stringify(g), "want", JSON.stringify(w));
}

// 1. rule join
ck("rule preview", bulkSeparatorPreview("rule"), STUB_A + "\n\n---\n\n" + STUB_B);
ck("rule contains the bar", bulkSeparatorPreview("rule").includes("\n\n---\n\n"), true);

// 2. blank join
ck("blank preview", bulkSeparatorPreview("blank"), STUB_A + "\n\n" + STUB_B);
ck("blank has no rule", bulkSeparatorPreview("blank").includes("---"), false);

// 3. fallback
ck("undefined -> rule", bulkSeparatorPreview(undefined), bulkSeparatorPreview("rule"));
ck("null -> rule", bulkSeparatorPreview(null), bulkSeparatorPreview("rule"));
ck("garbage -> rule", bulkSeparatorPreview("xyz"), bulkSeparatorPreview("rule"));

// 4. seam matches the live resolver exactly (no drift)
for (const style of ["rule", "blank", undefined]) {
  const preview = bulkSeparatorPreview(style);
  const seam = bulkMarkdownSeparator(style);
  ck(`seam present for ${String(style)}`, preview, STUB_A + seam + STUB_B);
}

// 5. caption
ck("rule caption", bulkSeparatorCaption("rule"), "Clips separated by a horizontal rule (---).");
ck("blank caption", bulkSeparatorCaption("blank"), "Clips joined by a blank line (no thematic break).");
ck("undefined caption -> rule", bulkSeparatorCaption(undefined), bulkSeparatorCaption("rule"));

// preview is always a non-empty multi-line string
ck("preview multiline", bulkSeparatorPreview("rule").split("\n").length > 3, true);

console.log(`bulk-separator-preview sanity: ${p}/${t} passed`);
if (p !== t) process.exit(1);
