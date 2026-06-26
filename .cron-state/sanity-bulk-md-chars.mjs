// Sanity: bulk Copy-as-Markdown char-receipt (lib/bulk-markdown).
//
// The completion toast + button title now surface the joined CHARACTER
// total (separators included) so the Markdown receipt mirrors the plain
// bulk-copy receipt. This harness exercises the pure plan.chars + the
// two formatters (inline copies, bundler-free).
//
// Coverage:
//   1. chars = code-point length of the joined doc (separators counted).
//   2. rule vs blank separator changes the char total.
//   3. toast grammar with the "- N chars" tail, thousands grouping.
//   4. button title grammar with the "(N chars)" tail.
//   5. empty selection: zero chars, "Nothing to copy as Markdown".

const SEPARATORS = { rule: "\n\n---\n\n", blank: "\n\n" };
function bulkMarkdownSeparator(style) {
  return style === "blank" ? SEPARATORS.blank : SEPARATORS.rule;
}
// Minimal clipToMarkdown for text/link (enough for the char-count math).
function clipToMarkdown(c) {
  if (!c) return null;
  const content = typeof c.content === "string" ? c.content : "";
  if (c.kind === "link") {
    const target = content || (c.source && c.source.url) || "";
    if (!target) return null;
    return `[${content || target}](${target})`;
  }
  if (content.trim() === "") return null;
  // prose blockquote (no code/cite for this harness's plain inputs)
  return `> ${content.replace(/\n/g, "\n> ")}`;
}
function planBulkMarkdown(clips, separator = "rule") {
  const blocks = [];
  for (const c of clips) {
    const md = clipToMarkdown(c);
    if (md != null && md !== "") blocks.push(md);
  }
  const text = blocks.join(bulkMarkdownSeparator(separator));
  return { text, rendered: blocks.length, hasContent: blocks.length > 0, chars: [...text].length };
}
function groupThousandsLocal(n) {
  if (!Number.isFinite(n)) return "0";
  return Math.abs(Math.trunc(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function formatBulkMarkdownToast(plan) {
  if (plan.rendered === 0) return "Nothing to copy as Markdown";
  return `Copied ${plan.rendered} clip${plan.rendered === 1 ? "" : "s"} as Markdown \u2014 ${groupThousandsLocal(plan.chars)} char${plan.chars === 1 ? "" : "s"}`;
}
function formatBulkMarkdownButtonTitle(plan) {
  if (!plan.hasContent) return "Copy selected clips as Markdown";
  return `Copy ${plan.rendered} clip${plan.rendered === 1 ? "" : "s"} as Markdown (${groupThousandsLocal(plan.chars)} char${plan.chars === 1 ? "" : "s"})`;
}

const T = (s) => ({ kind: "text", content: s });

let p = 0,
  t = 0;
function ck(n, g, w) {
  t++;
  if (g === w) p++;
  else console.error("FAIL", n, "got", JSON.stringify(g), "want", JSON.stringify(w));
}

// 1. chars accounting — one clip: "> hi" = 4 chars
ck("one clip chars", planBulkMarkdown([T("hi")]).chars, 4);
// two clips, rule sep: "> a" + "\n\n---\n\n" + "> b" = 3 + 7 + 3 = 13
ck("two clips rule-sep chars", planBulkMarkdown([T("a"), T("b")], "rule").chars, 13);
// two clips, blank sep: "> a" + "\n\n" + "> b" = 3 + 2 + 3 = 8
ck("two clips blank-sep chars", planBulkMarkdown([T("a"), T("b")], "blank").chars, 8);

// 2. separator changes the total
ck(
  "rule total > blank total",
  planBulkMarkdown([T("a"), T("b")], "rule").chars > planBulkMarkdown([T("a"), T("b")], "blank").chars,
  true,
);
// chars equals the joined text length exactly
const pl = planBulkMarkdown([T("alpha"), T("beta")], "blank");
ck("chars == joined length", pl.chars, [...pl.text].length);

// 3. toast grammar
ck("toast singular", formatBulkMarkdownToast(planBulkMarkdown([T("hi")])), "Copied 1 clip as Markdown \u2014 4 chars");
ck("toast 1 char singular noun", formatBulkMarkdownToast({ rendered: 1, hasContent: true, chars: 1 }), "Copied 1 clip as Markdown \u2014 1 char");
ck("toast plural", formatBulkMarkdownToast(planBulkMarkdown([T("a"), T("b")], "blank")), "Copied 2 clips as Markdown \u2014 8 chars");
ck("toast groups thousands", formatBulkMarkdownToast({ rendered: 1, hasContent: true, chars: 4200 }), "Copied 1 clip as Markdown \u2014 4,200 chars");
ck("toast empty", formatBulkMarkdownToast(planBulkMarkdown([])), "Nothing to copy as Markdown");

// 4. button title
ck("title with chars", formatBulkMarkdownButtonTitle(planBulkMarkdown([T("hi")])), "Copy 1 clip as Markdown (4 chars)");
ck("title plural", formatBulkMarkdownButtonTitle(planBulkMarkdown([T("a"), T("b")], "blank")), "Copy 2 clips as Markdown (8 chars)");
ck("title empty", formatBulkMarkdownButtonTitle(planBulkMarkdown([])), "Copy selected clips as Markdown");

// 5. empty
ck("empty chars zero", planBulkMarkdown([]).chars, 0);
ck("emoji counts as one", planBulkMarkdown([T("\u{1F370}")]).chars, [..."> \u{1F370}"].length);

console.log(`bulk-md-chars sanity: ${p}/${t} passed`);
if (p !== t) process.exit(1);
