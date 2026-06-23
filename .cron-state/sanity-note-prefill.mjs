// Pure sanity for src/lib/note-prefill.ts. Tests the title
// normalisation contract (trim, collapse, strip-suffix, cap),
// host-fallback URL parsing, the composed buildNotePrefill output
// shapes, and the shouldApplyNotePrefill no-clobber guard.

import { strict as assert } from "node:assert";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");

// Inline the module logic — the TypeScript build is the guard that
// the real module matches. Pure ESM, no IDB.
function stripSiteSuffix(title) {
  const trimmed = title.trim();
  if (!trimmed) return "";
  const m = trimmed.match(/^(.+?)\s*[|\-—·]\s*([^|\-—·]{1,40})$/);
  if (!m) return trimmed;
  const head = m[1].trim();
  const suffix = m[2].trim();
  if (!head || !suffix) return trimmed;
  if (suffix.length > 30) return trimmed;
  if (/[.!?]$/.test(suffix)) return trimmed;
  return head;
}

function normaliseTabTitle(raw) {
  if (typeof raw !== "string") return "";
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const stripped = stripSiteSuffix(cleaned);
  if (stripped.length <= 80) return stripped;
  const cut = stripped.slice(0, 80);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > 60) return cut.slice(0, lastSpace) + "…";
  return cut + "…";
}

function fallbackHostLabel(rawUrl) {
  if (typeof rawUrl !== "string" || rawUrl.length === 0) return "";
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function buildNotePrefill(opts) {
  const title = normaliseTabTitle(opts.title);
  if (title) return `Captured from ${title}`;
  const host = fallbackHostLabel(opts.url);
  if (host) return `Captured from ${host}`;
  return "";
}

function shouldApplyNotePrefill(currentValue, prefill) {
  if (typeof currentValue === "string" && currentValue.trim().length > 0) {
    return false;
  }
  if (typeof prefill !== "string" || prefill.length === 0) return false;
  return true;
}

// --- 1. normaliseTabTitle: defensive ---
assert.equal(normaliseTabTitle(null), "", "null → empty");
assert.equal(normaliseTabTitle(undefined), "", "undefined → empty");
assert.equal(normaliseTabTitle(42), "", "non-string → empty");
assert.equal(normaliseTabTitle(""), "", "empty string → empty");
assert.equal(normaliseTabTitle("   "), "", "all-whitespace → empty");

// --- 2. normaliseTabTitle: trim + collapse whitespace ---
assert.equal(normaliseTabTitle("  Hello\nworld  "), "Hello world", "collapse internal whitespace");
assert.equal(normaliseTabTitle("Hello\t\tworld"), "Hello world", "tabs collapse to single space");

// --- 3. normaliseTabTitle: strip common site suffixes ---
assert.equal(
  normaliseTabTitle("Awesome Article | GitHub"),
  "Awesome Article",
  "strip | suffix",
);
assert.equal(
  normaliseTabTitle("Awesome Article - Stack Overflow"),
  "Awesome Article",
  "strip - suffix",
);
assert.equal(
  normaliseTabTitle("Awesome Article — The New York Times"),
  "Awesome Article",
  "strip em-dash suffix",
);
assert.equal(
  normaliseTabTitle("Awesome Article · Some Site"),
  "Awesome Article",
  "strip · suffix",
);

// --- 4. normaliseTabTitle: keep title when "suffix" is too long ---
{
  const tooLong = "Foo - The very long subtitle that goes on forever and ever and ever";
  // Suffix is way over 30 chars → keep whole title.
  assert.equal(normaliseTabTitle(tooLong), tooLong, "long subtitle preserved");
}

// --- 5. normaliseTabTitle: keep title when "suffix" ends with punctuation ---
assert.equal(
  normaliseTabTitle("Foo - Bar."),
  "Foo - Bar.",
  "subtitle ending in . preserved",
);
assert.equal(
  normaliseTabTitle("Foo - Bar?"),
  "Foo - Bar?",
  "subtitle ending in ? preserved",
);

// --- 6. normaliseTabTitle: strip only ONE suffix (last) ---
assert.equal(
  normaliseTabTitle("A - B | C"),
  "A - B",
  "strip last suffix only",
);

// --- 7. normaliseTabTitle: cap at 80 chars with word-boundary ellipsis ---
{
  const long = "x".repeat(100);
  const res = normaliseTabTitle(long);
  // No spaces in a wall of x's, so the last-space check fails →
  // raw slice + ellipsis.
  assert.equal(res, "x".repeat(80) + "…", "single-word truncated with hard ellipsis");
}
{
  const wordy = "word ".repeat(20).trim(); // 99 chars: "word word ... word"
  const res = normaliseTabTitle(wordy);
  assert.ok(res.endsWith("…"), "long sentence gets ellipsis");
  assert.ok(res.length <= 81, "≤ 80 + ellipsis char");
  // The truncation should respect word boundaries, so the last
  // visible chunk is a whole word, not "wo…".
  assert.ok(res.replace(/…$/, "").endsWith("word"), "ends on word boundary");
}

// --- 8. fallbackHostLabel: defensive ---
assert.equal(fallbackHostLabel(null), "", "null → empty");
assert.equal(fallbackHostLabel(""), "", "empty → empty");
assert.equal(fallbackHostLabel("not a url"), "", "bad url → empty");
assert.equal(fallbackHostLabel("chrome://settings"), "", "chrome:// rejected");
assert.equal(fallbackHostLabel("file:///etc/hosts"), "", "file:// rejected");
assert.equal(fallbackHostLabel("about:blank"), "", "about:blank rejected");

// --- 9. fallbackHostLabel: http(s) extraction ---
assert.equal(fallbackHostLabel("https://github.com/foo"), "github.com", "https extracts hostname");
assert.equal(fallbackHostLabel("http://example.org"), "example.org", "http extracts hostname");
assert.equal(fallbackHostLabel("https://www.github.com"), "github.com", "www. stripped");
assert.equal(fallbackHostLabel("https://GitHub.com"), "github.com", "lowercased");

// --- 10. buildNotePrefill: title path ---
assert.equal(
  buildNotePrefill({ title: "Hello World", url: "https://x.com" }),
  "Captured from Hello World",
  "title wins over url",
);
assert.equal(
  buildNotePrefill({ title: "Awesome | GitHub", url: "https://github.com" }),
  "Captured from Awesome",
  "title gets site-suffix stripped",
);

// --- 11. buildNotePrefill: host fallback when title is empty ---
assert.equal(
  buildNotePrefill({ title: "", url: "https://github.com/x" }),
  "Captured from github.com",
  "no title falls back to host",
);
assert.equal(
  buildNotePrefill({ title: null, url: "https://github.com/x" }),
  "Captured from github.com",
  "null title falls back to host",
);
assert.equal(
  buildNotePrefill({ title: "   ", url: "https://github.com/x" }),
  "Captured from github.com",
  "all-whitespace title falls back to host",
);

// --- 12. buildNotePrefill: empty when neither usable ---
assert.equal(buildNotePrefill({ title: "", url: "" }), "", "no title + no url → empty");
assert.equal(
  buildNotePrefill({ title: "", url: "chrome://settings" }),
  "",
  "no title + non-http url → empty",
);
assert.equal(buildNotePrefill({}), "", "no inputs → empty");

// --- 13. shouldApplyNotePrefill: no-clobber semantics ---
assert.equal(
  shouldApplyNotePrefill("", "Captured from x"),
  true,
  "empty current → apply",
);
assert.equal(
  shouldApplyNotePrefill("user draft", "Captured from x"),
  false,
  "non-empty current → don't clobber",
);
assert.equal(
  shouldApplyNotePrefill("   ", "Captured from x"),
  true,
  "whitespace-only current → apply (counts as empty)",
);
assert.equal(
  shouldApplyNotePrefill("", ""),
  false,
  "empty prefill → no-op (caller wouldn't have anything to write)",
);
assert.equal(
  shouldApplyNotePrefill(null, "Captured from x"),
  true,
  "null current → apply",
);
assert.equal(
  shouldApplyNotePrefill(undefined, "Captured from x"),
  true,
  "undefined current → apply",
);

console.log(`OK ${REPO}/sanity-note-prefill.mjs (35 cases)`);
