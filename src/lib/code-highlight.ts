/**
 * Lightweight, dependency-free syntax tinting for the detail body.
 *
 * The popup already DETECTS a clip's language (lib/util.detectCodeLang,
 * used for fenced-code export + copy-as-Markdown), but the on-screen
 * detail body renders every code clip as flat monochrome text. A
 * config dump, a SQL query, a JSON blob — all the same grey wall.
 * Soft syntax tinting (strings, comments, numbers, keywords in
 * distinct hues) makes a code clip scannable at a glance without
 * pulling in a 100KB highlighter or a WASM grammar.
 *
 * This module is the pure tokenizer + HTML emitter behind that. Given
 * the raw clip body and a language hint (whatever detectCodeLang
 * returned), it produces escaped HTML with `<span class="tok-*">`
 * wrappers the popup drops straight into the `<pre>`. No DOM, no deps.
 *
 * Design decisions:
 *   - CONSERVATIVE by construction. We tint a small set of high-signal,
 *     low-ambiguity token classes — strings, comments, numbers, a
 *     curated keyword set, and (for code-ish langs) structural
 *     punctuation — because mis-tinting reads worse than not tinting at
 *     all (the same rationale detectCodeLang documents for refusing to
 *     guess a language). Operators beyond the structural set,
 *     identifiers, function names etc. stay plain text.
 *   - Strings + comments are matched by a SINGLE master regex scanned
 *     left-to-right, so a keyword sitting INSIDE a string or comment is
 *     never falsely highlighted (the string/comment claims those bytes
 *     first). Keyword + number tinting happens only in the plain-text
 *     gaps between those matches.
 *   - Everything is escaped via the same entity map the rest of the
 *     popup uses BEFORE any span is added, so a clip containing
 *     `</pre><script>` can never break out of the body. The span tags
 *     are the only markup we introduce, and only around already-escaped
 *     text.
 *   - Comment syntax + keyword set are chosen from the language hint.
 *     An unknown / absent hint falls back to a C-family default
 *     (`//` + `/* *​/` comments, a broad keyword union) which is a safe
 *     superset for the bulk of code clips. The caller decides WHETHER
 *     to tint (it only calls this for langs detectCodeLang recognised);
 *     this module decides HOW.
 *   - Returns plain escaped text (no spans) for empty / nullish input
 *     so the caller can call it unconditionally.
 *
 * This is intentionally NOT a real lexer — it's a regex pass that
 * trades grammatical precision for zero dependencies and total safety.
 * Good enough to make code readable; never wrong enough to mislead.
 */

const ENTITY: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ENTITY[c] as string);
}

export type CommentStyle = "c" | "hash" | "sql" | "lua";

interface LangSpec {
  /** Which line/block comment forms apply. */
  comment: CommentStyle;
  /** Keyword set (lowercase-compared for case-insensitive langs like SQL). */
  keywords: Set<string>;
  /** True when keyword matching ignores case (SQL). */
  caseInsensitive?: boolean;
  /**
   * Whether to softly tint structural punctuation (brackets / braces /
   * parens / arrows / statement separators). Helps the eye trace nesting
   * + call structure in code. Off for config-ish langs (yaml/toml/ini)
   * where `{ } [ ] :` are rare-or-meaningful and a punctuation tint
   * reads as noise rather than structure. Defaults to on for the
   * C-family + scripting langs where braces + arrows carry real
   * structural weight.
   */
  punct?: boolean;
}

// Broad C-family keyword union — covers JS/TS/Java/C/C++/Go/Rust/etc.
// well enough for tinting. Deliberately a superset; a stray keyword in
// the "wrong" language tints a word that IS a keyword somewhere, which
// reads fine.
const C_FAMILY = new Set([
  "abstract", "as", "async", "await", "break", "case", "catch", "class",
  "const", "continue", "debugger", "default", "defer", "delete", "do",
  "else", "enum", "export", "extends", "false", "final", "finally", "fn",
  "for", "from", "func", "function", "go", "if", "impl", "implements",
  "import", "in", "instanceof", "interface", "let", "match", "mod", "move",
  "mut", "namespace", "new", "nil", "null", "of", "package", "private",
  "protected", "public", "pub", "return", "self", "static", "struct",
  "super", "switch", "this", "throw", "trait", "true", "try", "type",
  "typeof", "undefined", "use", "var", "void", "where", "while", "with",
  "yield",
]);

const PYTHON_KW = new Set([
  "and", "as", "assert", "async", "await", "break", "class", "continue",
  "def", "del", "elif", "else", "except", "False", "finally", "for",
  "from", "global", "if", "import", "in", "is", "lambda", "None",
  "nonlocal", "not", "or", "pass", "raise", "return", "True", "try",
  "while", "with", "yield", "self",
]);

const SHELL_KW = new Set([
  "if", "then", "else", "elif", "fi", "for", "while", "do", "done",
  "case", "esac", "function", "in", "return", "exit", "export", "local",
  "readonly", "echo", "cd", "set", "unset", "source", "alias",
]);

const SQL_KW = new Set([
  "select", "from", "where", "insert", "into", "values", "update", "set",
  "delete", "create", "table", "alter", "drop", "join", "inner", "left",
  "right", "outer", "on", "group", "by", "order", "having", "limit",
  "offset", "as", "and", "or", "not", "null", "is", "in", "like",
  "between", "distinct", "count", "sum", "avg", "min", "max", "union",
  "all", "primary", "key", "foreign", "references", "index", "default",
]);

function specFor(lang: string | undefined): LangSpec {
  switch (lang) {
    case "python":
      return { comment: "hash", keywords: PYTHON_KW, punct: true };
    case "bash":
    case "shell":
    case "sh":
      return { comment: "hash", keywords: SHELL_KW, punct: true };
    case "yaml":
    case "toml":
    case "ini":
      // Config langs: punctuation is sparse/semantic (a `:` is a
      // key/value separator, not structure), so tinting it adds noise.
      return { comment: "hash", keywords: new Set(), punct: false };
    case "sql":
      return { comment: "sql", keywords: SQL_KW, caseInsensitive: true, punct: true };
    case "lua":
      return { comment: "lua", keywords: C_FAMILY, punct: true };
    default:
      // js / ts / json / go / rust / java / c / cpp / diff / markdown / ...
      return { comment: "c", keywords: C_FAMILY, punct: true };
  }
}

/**
 * Build the master regex that claims strings + comments (the spans
 * that must win over keyword tinting). Order matters: comments before
 * strings so a `#` inside a string isn't read as a comment start, and
 * block comments before line comments.
 */
function masterRegex(style: CommentStyle): RegExp {
  // Strings: double, single, and backtick (template) — each allowing
  // backslash escapes, non-greedy to the closing quote, tolerant of an
  // unterminated string running to end-of-line (so a half-typed clip
  // still tints sensibly rather than swallowing the rest of the body).
  const dq = `"(?:\\\\.|[^"\\\\\\n])*"?`;
  const sq = `'(?:\\\\.|[^'\\\\\\n])*'?`;
  const bt = "`(?:\\\\.|[^`\\\\])*`?";
  const strings = `${dq}|${sq}|${bt}`;

  let comments = "";
  switch (style) {
    case "hash":
      comments = `#[^\\n]*`;
      break;
    case "sql":
      comments = `--[^\\n]*|/\\*[\\s\\S]*?\\*/`;
      break;
    case "lua":
      comments = `--\\[\\[[\\s\\S]*?\\]\\]|--[^\\n]*`;
      break;
    case "c":
    default:
      comments = `/\\*[\\s\\S]*?\\*/|//[^\\n]*`;
      break;
  }
  // Comments first so they win over a same-prefix string edge case.
  return new RegExp(`(${comments})|(${strings})`, "g");
}

/** Number literal: ints, decimals, hex, with optional sign-less form. */
const NUMBER_RE = /\b(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g;
/** Identifier-ish word for keyword lookup. */
const WORD_RE = /[A-Za-z_]\w*/g;

/**
 * Tint the plain-text gaps between strings/comments: wrap keywords and
 * numbers. Operates on a RAW (un-escaped) substring; escapes each
 * emitted piece. Everything not a keyword/number passes through escaped
 * and unwrapped.
 */
function tintGap(raw: string, spec: LangSpec): string {
  if (raw === "") return "";
  let out = "";
  let last = 0;
  // We walk word + number matches in one merged sweep by scanning for
  // whichever comes first. Simpler: do words first into a marker map is
  // overkill — instead scan numbers and words separately would risk
  // double-wrapping. So we tokenise the gap with a combined regex.
  //
  // When the language tints punctuation (spec.punct), a third
  // alternation claims structural glyphs — arrows (`=> ->`), brackets/
  // braces/parens, and statement separators (`; ,`). Multi-char arrows
  // come first in the alternation so `=>` isn't split into `=` + `>`.
  // The punct group only ever matches in these plain-text gaps (strings
  // + comments are already claimed by the master regex), so a `;` inside
  // a string is never tinted. When punct is off the group is omitted
  // entirely and the regex behaves exactly as before.
  const combined = spec.punct
    ? /(=>|->|[{}()[\];,])|([A-Za-z_]\w*)|(\b(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b)/g
    : /()([A-Za-z_]\w*)|(\b(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b)/g;
  let m: RegExpExecArray | null;
  while ((m = combined.exec(raw)) !== null) {
    if (m.index > last) out += esc(raw.slice(last, m.index));
    if (m[1] != null && m[1] !== "") {
      // Structural punctuation — soft tint to trace nesting/calls.
      out += `<span class="tok-punct">${esc(m[1])}</span>`;
    } else if (m[2] != null) {
      // Word — keyword?
      const word = m[2];
      const key = spec.caseInsensitive ? word.toLowerCase() : word;
      if (spec.keywords.has(key)) {
        out += `<span class="tok-keyword">${esc(word)}</span>`;
      } else {
        out += esc(word);
      }
    } else if (m[3] != null) {
      out += `<span class="tok-number">${esc(m[3])}</span>`;
    }
    last = m.index + m[0].length;
    // Guard against a zero-width match (the empty `()` capture group in
    // the punct-off branch can't produce one because the alternation
    // always consumes a word/number, but be defensive).
    if (m[0] === "") combined.lastIndex++;
  }
  if (last < raw.length) out += esc(raw.slice(last));
  // reset lastIndex defensively (combined is local, but be tidy)
  NUMBER_RE.lastIndex = 0;
  WORD_RE.lastIndex = 0;
  return out;
}

/**
 * Highlight `content` as code in language `lang`, returning escaped
 * HTML with `<span class="tok-*">` wrappers. The caller drops the
 * result straight inside the detail `<pre>`.
 *
 * Token classes emitted: `tok-comment`, `tok-string`, `tok-keyword`,
 * `tok-number`, `tok-punct`. Everything else is plain escaped text.
 *
 * Defensive: empty / nullish input returns "" / escaped text so the
 * caller can invoke it unconditionally.
 */
export function highlightCode(
  content: string | null | undefined,
  lang?: string,
): string {
  if (typeof content !== "string" || content === "") return "";
  const spec = specFor(lang);
  const master = masterRegex(spec.comment);
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = master.exec(content)) !== null) {
    // Plain-text gap before this string/comment → keyword + number tint.
    if (m.index > last) out += tintGap(content.slice(last, m.index), spec);
    if (m[1] != null) {
      // Comment.
      out += `<span class="tok-comment">${esc(m[1])}</span>`;
    } else if (m[2] != null) {
      // String.
      out += `<span class="tok-string">${esc(m[2])}</span>`;
    }
    last = m.index + m[0].length;
    // Guard against a zero-width match (shouldn't happen with our
    // patterns, but a malformed edge could) to avoid an infinite loop.
    if (m[0] === "") master.lastIndex++;
  }
  if (last < content.length) out += tintGap(content.slice(last), spec);
  return out;
}
