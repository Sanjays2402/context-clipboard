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
