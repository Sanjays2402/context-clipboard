// Sanity: bulk Copy-as-Markdown honors the per-clip force-language
// override (lib/bulk-markdown.clipToMarkdown + bulkMarkdownAsFence).
//
// The single-clip "Copy as Markdown" already folds langOverride into the
// fence (a clip pinned to "rust" exports ```rust; a clip forced OFF
// renders a prose blockquote). The bulk path used to re-run detectCodeLang
// and ignore the override, so a batch paste disagreed with the single
// paste. This harness exercises the pure fence decision + language tag
// (inline copies of the relevant logic, bundler-free).
//
// Coverage:
//   1. forced LANGUAGE -> always a fence, tagged with that language
//      (even when the body doesn't look like code).
//   2. forced OFF ("none") -> never a fence (prose blockquote), even
//      when the body DOES look like code.
//   3. no override (auto) -> the heuristic decides; fence lang = detected.
//   4. override "rust" overrides a wrong auto-detection in the tag.

const OVERRIDE_NONE = "none";
const OVERRIDE_AUTO = "auto";
const KNOWN = new Set([
  "javascript", "typescript", "jsx", "json", "html", "css", "python",
  "go", "rust", "java", "bash", "sql", "yaml", "toml", "ini", "lua",
  "markdown", "diff",
]);

function exportFenceLang(override, detected) {
  if (override === OVERRIDE_NONE) return "";
  if (typeof override === "string" && KNOWN.has(override)) return override;
  return typeof detected === "string" && detected !== "" ? detected : "";
}
function looksLikeCode(s) {
  return (
    /\b(function|const|let|var|class|import|export|=>|<\/?\w|def |print\()/.test(s) ||
    /\n/.test(s)
  );
}
function bulkMarkdownAsFence(c, content, tags) {
  if (c.langOverride === OVERRIDE_NONE) return false;
  if (typeof c.langOverride === "string" && c.langOverride !== OVERRIDE_AUTO && c.langOverride !== "") {
    return true;
  }
  return tags.includes("code") || looksLikeCode(content);
}
// A tiny stub detector: pretend everything single-line non-empty reads as
// "javascript" so we can prove the override wins over a WRONG guess.
function fakeDetect(content) {
  return content.trim() ? "javascript" : "";
}
// model of clipToMarkdown's text branch
function textBlock(c) {
  const content = typeof c.content === "string" ? c.content : "";
  if (content.trim() === "") return null;
  const tags = Array.isArray(c.tags) ? c.tags : [];
  if (bulkMarkdownAsFence(c, content, tags)) {
    const lang = exportFenceLang(c.langOverride, fakeDetect(content) ?? "");
    return "```" + lang + "\n" + content + "\n```";
  }
  const url = c.source?.url || "";
  const title = c.source?.title || "";
  const cite = url ? `\n\n\u2014 [${title || url}](${url})` : "";
  return `> ${content.replace(/\n/g, "\n> ")}${cite}`;
}

let p = 0, t = 0;
function ck(n, g, w) {
  t++;
  if (g === w) p++;
  else console.error("FAIL", n, "\n  got ", JSON.stringify(g), "\n  want", JSON.stringify(w));
}

// 1. forced language -> fence with that lang, even for a prose-looking body
ck(
  "forced rust -> ```rust fence on plain body",
  textBlock({ content: "hello world", langOverride: "rust" }),
  "```rust\nhello world\n```",
);
ck(
  "forced sql -> ```sql fence",
  textBlock({ content: "select 1", langOverride: "sql" }),
  "```sql\nselect 1\n```",
);

// 2. forced OFF -> prose blockquote even for code-shaped body
ck(
  "forced off -> blockquote despite code shape",
  textBlock({ content: "const x = 1", langOverride: OVERRIDE_NONE }),
  "> const x = 1",
);
ck(
  "forced off + url -> cited blockquote",
  textBlock({ content: "function f(){}", langOverride: OVERRIDE_NONE, source: { url: "http://x", title: "X" } }),
  "> function f(){}\n\n\u2014 [X](http://x)",
);

// 3. no override -> heuristic; code-shaped uses the (fake) detected lang
ck(
  "auto code-shaped -> detected lang",
  textBlock({ content: "const x = 1" }),
  "```javascript\nconst x = 1\n```",
);
ck(
  "auto prose -> blockquote",
  textBlock({ content: "just a sentence" }),
  "> just a sentence",
);
ck(
  "explicit auto sentinel behaves as no-override",
  textBlock({ content: "const x = 1", langOverride: OVERRIDE_AUTO }),
  "```javascript\nconst x = 1\n```",
);

// 4. override beats a WRONG auto-detection in the tag
ck(
  "rust override beats the javascript guess",
  textBlock({ content: "let mut x = 1", langOverride: "rust" }),
  "```rust\nlet mut x = 1\n```",
);

// 5. tag:code with no override still fences (auto path), detected lang
ck(
  "tag:code single-line -> fence via tag",
  textBlock({ content: "x", tags: ["code"] }),
  "```javascript\nx\n```",
);

console.log(`bulk-md-langoverride: ${p}/${t}`);
process.exit(p === t ? 0 : 1);
