// Sanity: force-language drives fenced-code export (lib/lang-override
// .exportFenceLang + the copy-as-Markdown / send-to fence-tag wiring).
//
// Before this, copy-as-Markdown + "Copy as fenced code" re-ran
// detectCodeLang and ignored the user's per-clip force-language
// override — a Rust snippet pinned to "rust" still exported as ```ts (or
// untagged). exportFenceLang folds the override into the export tag so
// the fence language matches what the user sees tinted. This harness
// exercises the pure resolver + the fence-vs-prose decision in isolation
// (inline copies, bundler-free).
//
// Coverage:
//   1. exportFenceLang precedence — forced lang wins; "none" -> "";
//      auto/undefined -> detected (or "").
//   2. The full fence string with an override beats detectCodeLang.
//   3. markdownAsFence decision — forced lang forces a fence; "none"
//      forces prose; auto follows the heuristic.

const OVERRIDE_NONE = "none";
const OVERRIDE_AUTO = "auto";
const LANG_VALUES = [
  "javascript", "typescript", "jsx", "json", "html", "css", "python",
  "go", "rust", "java", "bash", "sql", "yaml", "toml", "ini", "lua",
  "markdown", "diff",
];
const KNOWN = new Set(LANG_VALUES);

function exportFenceLang(override, detected) {
  if (override === OVERRIDE_NONE) return "";
  if (typeof override === "string" && KNOWN.has(override)) return override;
  return typeof detected === "string" && detected !== "" ? detected : "";
}

// A stand-in detector that deliberately "mis-guesses" so we can prove the
// override wins. (The real detectCodeLang is heuristic; the point here is
// the override path, not the detector itself.)
function fakeDetect(body) {
  if (/fn /.test(body)) return "typescript"; // wrong on purpose for Rust
  if (/SELECT/i.test(body)) return undefined; // can't classify
  return "javascript";
}

// model of popup.markdownAsFence (the fence-vs-prose decision)
function looksLikeCode(s) {
  return /\b(function|const|let|var|class|import|export|=>|<\/?\w|def |print\()/.test(s) || /\n/.test(s);
}
function markdownAsFence(c) {
  if (c.langOverride === OVERRIDE_NONE) return false;
  if (typeof c.langOverride === "string" && c.langOverride !== OVERRIDE_AUTO && c.langOverride !== "") {
    return true;
  }
  return (Array.isArray(c.tags) && c.tags.includes("code")) || looksLikeCode(c.content);
}

let p = 0, t = 0;
function ck(n, g, w) {
  t++;
  if (JSON.stringify(g) === JSON.stringify(w)) p++;
  else console.error("FAIL", n, "got", JSON.stringify(g), "want", JSON.stringify(w));
}

// 1. exportFenceLang precedence
ck("forced rust wins over wrong detect", exportFenceLang("rust", "typescript"), "rust");
ck("forced sql wins over undetected", exportFenceLang("sql", undefined), "sql");
ck("'none' -> bare fence", exportFenceLang(OVERRIDE_NONE, "python"), "");
ck("auto -> detected", exportFenceLang(undefined, "go"), "go");
ck("auto + undetected -> ''", exportFenceLang(undefined, undefined), "");
ck("'auto' literal -> detected", exportFenceLang("auto", "css"), "css");
ck("unknown override -> detected", exportFenceLang("cobol", "java"), "java");
ck("empty override -> detected", exportFenceLang("", "lua"), "lua");

// 2. full fence string — override beats the (mis-guessing) detector
const rustBody = "fn main() {\n  println!(\"hi\");\n}";
function fence(c) {
  const lang = exportFenceLang(c.langOverride, fakeDetect(c.content));
  return "```" + lang + "\n" + c.content + "\n```";
}
ck("rust clip exports ```rust not ```typescript",
  fence({ content: rustBody, langOverride: "rust" }),
  "```rust\n" + rustBody + "\n```");
ck("same clip without override falls to (wrong) detect",
  fence({ content: rustBody }),
  "```typescript\n" + rustBody + "\n```");
const sqlBody = "SELECT * FROM users";
ck("forced sql tags the undetectable query",
  fence({ content: sqlBody, langOverride: "sql" }),
  "```sql\n" + sqlBody + "\n```");

// 3. markdownAsFence decision
ck("forced lang forces a fence even for prose-looking body",
  markdownAsFence({ content: "just one line of prose", langOverride: "yaml", tags: [] }), true);
ck("'none' forces prose even for code-looking body",
  markdownAsFence({ content: "const x = () => 1;\nfoo()", langOverride: OVERRIDE_NONE, tags: ["code"] }), false);
ck("auto + code-shaped -> fence",
  markdownAsFence({ content: "const x = 1;\ny()", tags: [] }), true);
ck("auto + plain prose -> no fence",
  markdownAsFence({ content: "hello world", tags: [] }), false);
ck("auto + tag:code -> fence",
  markdownAsFence({ content: "x", tags: ["code"] }), true);

console.log(`code-export-lang: ${p}/${t}`);
process.exit(p === t ? 0 : 1);
