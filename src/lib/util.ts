/** Tiny utilities: id generation, hashing, hostname, time ago, auto-tagging. */

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** djb2 hash, base36 — fast, good-enough for dedup keying. */
export function quickHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

export function hostFrom(url?: string): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c] as string,
  );
}

/** Escape a string so it can be embedded literally in a RegExp. */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Render `text` as HTML-safe, with case-insensitive occurrences of `needle`
 * wrapped in `<mark class="match-hl">`. Used by the popup to bold search
 * matches inside clip previews and detail bodies — readability wins big
 * when scanning a busy list. Empty / whitespace needles → plain escaped
 * text (no markup), so callers can pass `parseQuery(...).freeText` without
 * guarding.
 *
 * Both sides go through `escapeHtml` BEFORE the regex search so a needle
 * like `<script>` matches an escaped `&lt;script&gt;` in the body — and
 * we never inject raw user input into the DOM.
 */
export function highlightHtml(text: string, needle?: string): string {
  const escaped = escapeHtml(text);
  const n = (needle || "").trim();
  if (!n) return escaped;
  const needleEsc = escapeHtml(n);
  // If escaping made the needle empty (it shouldn't, but defensive), bail.
  if (!needleEsc) return escaped;
  const re = new RegExp(`(${escapeRegex(needleEsc)})`, "gi");
  return escaped.replace(re, `<mark class="match-hl">$1</mark>`);
}

const SENSITIVE_ASSIGNMENT_RE =
  /\b(api[_-]?key|secret|token|password|passwd|pwd|bearer)\b\s*[:=]\s*["']?[^\s,;"']{8,}["']?/gi;
const JWT_RE = /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g;
const COMMON_SECRET_RE =
  /\b(?:sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|AIza[A-Za-z0-9_-]{20,})\b/g;

// PII patterns — conservative, won't match common false positives.
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_RE =
  /(?<!\d)(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g;
// Card numbers: 13–19 digits separated by space/dash, with Luhn validation
// applied at match time. Bare regex catches candidates, isCardLikely() filters.
const CARD_CANDIDATE_RE = /(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g;
const SSN_RE = /(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)/g;

function luhnOk(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum > 0 && sum % 10 === 0;
}

function hasMatch(re: RegExp, content: string): boolean {
  re.lastIndex = 0;
  return re.test(content);
}

export function looksSensitive(content: string): boolean {
  return (
    hasMatch(SENSITIVE_ASSIGNMENT_RE, content) ||
    hasMatch(JWT_RE, content) ||
    hasMatch(COMMON_SECRET_RE, content)
  );
}

/** Mask likely secrets in snippets while keeping the full local clip intact. */
export function redactSensitivePreview(content: string, max = 200): string {
  return content
    .replace(SENSITIVE_ASSIGNMENT_RE, (_match, key: string) => `${key}=••••••`)
    .replace(JWT_RE, "[redacted jwt]")
    .replace(COMMON_SECRET_RE, "[redacted secret]")
    .slice(0, max);
}

export interface RedactOptions {
  /** Mask secrets (assignments, JWTs, sk-/ghp_/AIza tokens). Default true. */
  secrets?: boolean;
  /** Mask email addresses. Default true. */
  emails?: boolean;
  /** Mask phone numbers. Default true. */
  phones?: boolean;
  /** Mask card numbers (Luhn-validated) and US SSNs. Default true. */
  cards?: boolean;
}

const REDACT_DEFAULTS: Required<RedactOptions> = {
  secrets: true,
  emails: true,
  phones: true,
  cards: true,
};

/**
 * Aggressively mask PII + secrets in the FULL clip body (not just preview).
 * Use for per-clip redaction stored in the DB or capture-time redaction.
 */
export function redactPii(content: string, opts: RedactOptions = {}): string {
  const o = { ...REDACT_DEFAULTS, ...opts };
  let out = content;
  if (o.secrets) {
    out = out
      .replace(SENSITIVE_ASSIGNMENT_RE, (_match, key: string) => `${key}=••••••`)
      .replace(JWT_RE, "[redacted jwt]")
      .replace(COMMON_SECRET_RE, "[redacted secret]");
  }
  if (o.cards) {
    // SSN first (smaller, more specific).
    out = out.replace(SSN_RE, "[redacted ssn]");
    out = out.replace(CARD_CANDIDATE_RE, (m) => {
      const digits = m.replace(/\D/g, "");
      if (digits.length < 13 || digits.length > 19) return m;
      return luhnOk(digits) ? "[redacted card]" : m;
    });
  }
  if (o.emails) {
    out = out.replace(EMAIL_RE, "[redacted email]");
  }
  if (o.phones) {
    out = out.replace(PHONE_RE, "[redacted phone]");
  }
  return out;
}

/** True if anything in `content` would be redacted under `opts`. */
export function hasPii(content: string, opts: RedactOptions = {}): boolean {
  const o = { ...REDACT_DEFAULTS, ...opts };
  if (o.secrets && looksSensitive(content)) return true;
  if (o.emails && hasMatch(EMAIL_RE, content)) return true;
  if (o.phones && hasMatch(PHONE_RE, content)) return true;
  if (o.cards) {
    if (hasMatch(SSN_RE, content)) return true;
    CARD_CANDIDATE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CARD_CANDIDATE_RE.exec(content)) !== null) {
      const digits = m[0].replace(/\D/g, "");
      if (digits.length >= 13 && digits.length <= 19 && luhnOk(digits)) return true;
    }
  }
  return false;
}

/** Cap how many user-supplied regexes we'll compile per capture. */
const MAX_CUSTOM_PATTERNS = 32;
/** Cap on individual pattern length so a pathological regex can't eat the worker. */
const MAX_PATTERN_LEN = 200;
/** What we substitute for every match. Same string for all patterns — keeps
 *  the redacted output scannable. */
const CUSTOM_REPLACEMENT = "[redacted]";

/**
 * Apply user-supplied regex patterns to `content`. Each pattern is a
 * regex *source* (no slashes/flags) compiled with `gi`. Invalid patterns
 * are skipped silently so a single bad entry can't break capture.
 *
 * Returns the rewritten string AND a count of how many patterns
 * actually matched — callers use the count to decide whether the clip
 * earned the `redacted` flag (and the `redacted` tag).
 */
export function applyCustomPatterns(
  content: string,
  patterns: string[] | undefined,
): { content: string; matched: number } {
  if (!patterns || patterns.length === 0) return { content, matched: 0 };
  let out = content;
  let matched = 0;
  let n = 0;
  for (const raw of patterns) {
    if (n++ >= MAX_CUSTOM_PATTERNS) break;
    const src = (raw || "").trim();
    if (!src || src.length > MAX_PATTERN_LEN) continue;
    let re: RegExp;
    try {
      re = new RegExp(src, "gi");
    } catch {
      continue;
    }
    let hitThisPattern = false;
    out = out.replace(re, () => {
      hitThisPattern = true;
      return CUSTOM_REPLACEMENT;
    });
    if (hitThisPattern) matched++;
  }
  return { content: out, matched };
}

export interface CustomPatternHit {
  /** 0-based start offset in the ORIGINAL (un-redacted) string. */
  start: number;
  /** Exclusive end offset. */
  end: number;
  /** Which regex source matched (helpful for tooltips / debugging). */
  pattern: string;
}

/**
 * Locate every match of every (valid) pattern in `content`. Returns
 * non-overlapping hits sorted by start offset — when two patterns
 * overlap, the EARLIER + LONGER match wins so the test panel paints a
 * single non-flickery highlight per region.
 *
 * Separate from `applyCustomPatterns` because the test panel needs
 * positions for highlight HTML, not just a rewritten string. Reuses
 * the same caps so behavior matches what ingest actually does.
 */
export function findCustomPatternHits(
  content: string,
  patterns: string[] | undefined,
): { hits: CustomPatternHit[]; invalid: number; matchedPatterns: number } {
  if (!content || !patterns || patterns.length === 0) {
    return { hits: [], invalid: 0, matchedPatterns: 0 };
  }
  const raw: CustomPatternHit[] = [];
  let invalid = 0;
  let n = 0;
  const matchedSet = new Set<string>();
  for (const p of patterns) {
    if (n++ >= MAX_CUSTOM_PATTERNS) break;
    const src = (p || "").trim();
    if (!src || src.length > MAX_PATTERN_LEN) {
      if (src) invalid++;
      continue;
    }
    let re: RegExp;
    try {
      re = new RegExp(src, "gi");
    } catch {
      invalid++;
      continue;
    }
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    let safety = 0;
    while ((m = re.exec(content)) !== null) {
      // Empty-match guard — required for zero-width regexes; otherwise
      // we'd loop forever.
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      raw.push({ start: m.index, end: m.index + m[0].length, pattern: src });
      matchedSet.add(src);
      if (++safety > 5000) break; // pathological-input guard
    }
  }
  // Sort by start, then prefer the longer match so overlap-merge picks
  // the bigger one.
  raw.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: CustomPatternHit[] = [];
  for (const h of raw) {
    const last = merged[merged.length - 1];
    if (last && h.start < last.end) {
      // Overlap: extend the earlier hit if this one stretches further.
      if (h.end > last.end) last.end = h.end;
    } else {
      merged.push({ ...h });
    }
  }
  return { hits: merged, invalid, matchedPatterns: matchedSet.size };
}

/** Pure validator for the settings UI. True when `src` compiles as a regex. */
export function isValidPattern(src: string): boolean {
  const trimmed = (src || "").trim();
  if (!trimmed || trimmed.length > MAX_PATTERN_LEN) return false;
  try {
    new RegExp(trimmed, "gi");
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect a Markdown fence language from a code snippet's body. Returns a
 * short identifier suitable for a fenced block (` ```python `, ` ```ts `,
 * etc.) or undefined when nothing convincing matches — caller falls back
 * to an unannotated fence.
 *
 * Deliberately conservative: high-precision keyword + structural cues,
 * not a full tokenizer. Order matters — earlier branches win when a
 * snippet has weak overlap (e.g. JSX wins over plain HTML when both
 * shapes appear). Languages covered:
 *
 *   json · yaml · sql · diff · markdown · python · go · rust ·
 *   shell (bash/sh) · css · html · jsx · typescript · javascript
 *
 * The list is bounded: adding a new lang is a few lines but every
 * branch is cheap (one regex test). We never claim a language without
 * concrete evidence — false positives are worse than ungated fences
 * because they make the rendered code colour-broken.
 *
 * Pure; no IO. Caller passes the raw string.
 */
export function detectCodeLang(content: string): string | undefined {
  const s = content;
  if (!s || s.length < 4) return undefined;
  const t = s.trim();
  if (!t) return undefined;
  const head = t.slice(0, 4096); // bound the work — last bytes can't change the verdict

  // --- structural one-shots first (cheap, high-precision) ---
  // JSON: starts with { or [, parses round-trip-ish.
  if (/^[\[{]/.test(t) && /[}\]]\s*$/.test(t)) {
    try {
      JSON.parse(t);
      return "json";
    } catch {
      // fall through — not valid JSON, maybe JS object literal
    }
  }
  // Unified diff: leading +++/--- + @@ hunks.
  if (/^(diff --git |@@ |\+\+\+ |--- )/m.test(head)) return "diff";
  // Markdown: heading or fenced block inside the snippet.
  if (/^(#{1,6} \S|```|\* \S|- \S)/m.test(head) && !/^\s*[{<(]/.test(t)) {
    if (/^#{1,6} \S/m.test(head) || /^```/m.test(head)) return "markdown";
  }
  // Shebang trumps everything.
  if (/^#!\s*\/.*\b(?:bash|sh|zsh|fish)\b/.test(head)) return "bash";
  if (/^#!\s*\/.*\b(?:python|python3)\b/.test(head)) return "python";
  if (/^#!\s*\/.*\bnode\b/.test(head)) return "javascript";

  // --- keyword-based detection ---
  // SQL — keyword set + statement separators.
  if (
    /\b(SELECT|INSERT|UPDATE|DELETE|CREATE TABLE|ALTER TABLE|DROP TABLE|JOIN|FROM|WHERE)\b/i.test(
      head,
    ) &&
    /\bFROM\b|\bINTO\b|\bSET\b|\bVALUES\b|\bWHERE\b/i.test(head)
  ) {
    return "sql";
  }
  // Go — package + func + import-paren signatures. Checked BEFORE Python
  // because `import "fmt"` would otherwise match Python's `import \S+`.
  if (
    /^\s*package \w+\s*$/m.test(head) ||
    (/^\s*func\s+(\w+\s*\()/m.test(head) && /\bimport (?:\(|")/.test(head))
  ) {
    return "go";
  }
  // Rust — fn / let / use combinations with semicolons. Checked early so
  // Rust's `let mut x: i32 = …` doesn't get swept up by the TypeScript
  // type-annotation branch.
  if (
    /\bfn\s+\w+\s*\([^)]*\)\s*(->|\{)/.test(head) ||
    /^\s*use\s+\w+(::\w+)+\s*;/m.test(head)
  ) {
    return "rust";
  }
  // Python — def / import patterns + colon-terminated headers. Python's
  // `import foo` and `from foo import bar` are the giveaways; we only
  // claim Python when one of those shows up so a bare `import "fmt"`
  // (Go) doesn't false-positive.
  if (
    /^\s*(def |class \w+:?|from [\w.]+ import|import [a-zA-Z_][\w.]*|@\w[\w.]*\s*$)/m.test(
      head,
    ) ||
    (/:\s*$/m.test(head) &&
      /^\s*(if|for|while|elif|else|def|class|try|with)\b/m.test(head))
  ) {
    return "python";
  }
  // Shell — common command prefixes + flag patterns.
  if (
    /^\s*(?:\$|#)\s*\w/.test(head) ||
    /^\s*(?:export |alias |if \[|fi\b|then\b|done\b|case \$\w|for \w+ in )/m.test(
      head,
    ) ||
    /^\s*(?:sudo |curl |git |npm |yarn |pnpm |brew |apt(?:-get)? )/m.test(head)
  ) {
    return "bash";
  }
  // YAML — flat key: value lines with no JS braces / parens leading the snippet.
  if (
    /^[a-zA-Z_][\w-]*\s*:\s*\S/m.test(head) &&
    !/[{};()]/.test(head.split("\n")[0] || "") &&
    /\n[a-zA-Z_][\w-]*\s*:\s*/.test(head)
  ) {
    return "yaml";
  }
  // HTML / JSX — angle-bracket tags. JSX has braces too.
  if (/<\/?[a-zA-Z][\w-]*[\s/>]/.test(head)) {
    if (/\{[\w]+\}/.test(head) || /\bclassName=/.test(head)) return "jsx";
    return "html";
  }
  // CSS — selector + braces.
  if (
    /^\s*(?:[.#]?[a-zA-Z][\w-]*|\*)\s*\{[^}]*[a-zA-Z-]+\s*:/m.test(head) &&
    /;\s*\}/.test(head)
  ) {
    return "css";
  }
  // TypeScript — type/interface/generic syntax.
  if (
    /\binterface\s+\w+\s*\{/.test(head) ||
    /:\s*\w+(\s*\|\s*\w+)+/.test(head) ||
    /\btype\s+\w+\s*=\s*/.test(head) ||
    /\b(?:as\s+\w+|<\w+>)\b/.test(head) && /\bconst |let |function /.test(head)
  ) {
    return "typescript";
  }
  // JavaScript — broad fallback for function/const/etc.
  if (
    /\b(?:function|const|let|var|class|import|export|=>)\b/.test(head) ||
    /^\s*[a-zA-Z_$][\w$]*\s*\(/m.test(head)
  ) {
    return "javascript";
  }
  return undefined;
}

/** Heuristic auto-tags. Avoid LLMs; keep this local + instant. */
export function autoTag(content: string, kind: string, host?: string): string[] {
  const tags = new Set<string>();
  if (host) tags.add(host);
  if (kind === "image") tags.add("image");
  if (kind === "link") tags.add("link");

  if (kind === "text") {
    const t = content.trim();
    if (/^https?:\/\//.test(t) && !t.includes(" ")) tags.add("url");
    if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(t)) tags.add("email");
    if (/^[\+\d][\d\s\-().]{7,}$/.test(t)) tags.add("phone");
    if (/^[A-F0-9]{32,}$/i.test(t)) tags.add("hash");
    if (/^[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}$/.test(t)) tags.add("jwt");
    if (looksSensitive(t)) tags.add("secret");
    if (
      /\b(function|const|let|var|class|import|export|=>|<\/?\w|def |print\()/.test(t)
    )
      tags.add("code");
    if (t.split(/\s+/).length > 80) tags.add("long");
    if (/^\d+([.,]\d+)?$/.test(t)) tags.add("number");
  }

  return Array.from(tags);
}
