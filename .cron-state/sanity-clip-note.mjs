// Sanity: clip-note pure helpers — sanitize + has + summarize + delta
//
// The note is a free-form user commentary string on a clip. Sanitizer
// trims, caps at 2,000 chars, strips control chars, and returns
// `undefined` for empty input so the IDB field can be deleted rather
// than stored as "". hasClipNote() is the predicate used by the
// detail-view + the is:noted search operator + the export round-trip.

const CLIP_NOTE_MAX_LEN = 2_000;

function sanitizeClipNote(raw) {
  if (typeof raw !== "string") return undefined;
  const cleaned = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  const trimmed = cleaned.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length <= CLIP_NOTE_MAX_LEN) return trimmed;
  return trimmed.slice(0, CLIP_NOTE_MAX_LEN);
}

function hasClipNote(c) {
  if (!c) return false;
  if (typeof c.note !== "string") return false;
  return c.note.trim().length > 0;
}

function summarizeClipNote(note, opts = {}) {
  if (typeof note !== "string") return "";
  const trimmed = note.trim();
  if (trimmed.length === 0) return "";
  const flat = trimmed.replace(/\s+/g, " ");
  const peek =
    typeof opts.peek === "number" && Number.isFinite(opts.peek) && opts.peek > 0
      ? Math.floor(opts.peek)
      : 120;
  if (flat.length <= peek) return flat;
  const cut = flat.slice(0, peek);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > peek * 0.6) return cut.slice(0, lastSpace) + "…";
  return cut + "…";
}

function clipNoteDelta(oldNote, newNote) {
  const a = typeof oldNote === "string" ? oldNote.trim().length : 0;
  const b = typeof newNote === "string" ? newNote.trim().length : 0;
  return b - a;
}

let pass = 0;
let fail = 0;
function check(name, ok) {
  if (ok) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

// Sanitize basics
check("non-string → undefined", sanitizeClipNote(123) === undefined);
check("null → undefined", sanitizeClipNote(null) === undefined);
check("undefined → undefined", sanitizeClipNote(undefined) === undefined);
check("empty string → undefined", sanitizeClipNote("") === undefined);
check("whitespace → undefined", sanitizeClipNote("   \n  \t  ") === undefined);
check("trimmed plain string", sanitizeClipNote("  hello  ") === "hello");
check("preserves internal whitespace", sanitizeClipNote("a   b\nc") === "a   b\nc");

// Control chars
check("strips NUL", sanitizeClipNote("ab\u0000cd") === "abcd");
check("strips ESC", sanitizeClipNote("a\u001bb") === "ab");
check("strips DEL", sanitizeClipNote("a\u007fb") === "ab");
check("keeps tab/newline/CR", sanitizeClipNote("a\tb\nc\rd") === "a\tb\nc\rd");

// Cap
const long = "x".repeat(CLIP_NOTE_MAX_LEN + 500);
const sanLong = sanitizeClipNote(long);
check("over-cap sliced", sanLong.length === CLIP_NOTE_MAX_LEN);
check("at-cap untouched", sanitizeClipNote("y".repeat(CLIP_NOTE_MAX_LEN)).length === CLIP_NOTE_MAX_LEN);

// hasClipNote
check("hasNote: missing → false", hasClipNote({}) === false);
check("hasNote: null → false", hasClipNote(null) === false);
check("hasNote: undefined → false", hasClipNote(undefined) === false);
check("hasNote: empty → false", hasClipNote({ note: "" }) === false);
check("hasNote: whitespace → false", hasClipNote({ note: "   " }) === false);
check("hasNote: real → true", hasClipNote({ note: "hi" }) === true);
check("hasNote: non-string → false", hasClipNote({ note: 42 }) === false);

// summarize
check("summary: non-string → ''", summarizeClipNote(undefined) === "");
check("summary: empty → ''", summarizeClipNote("") === "");
check("summary: short pass-through", summarizeClipNote("short note") === "short note");
check("summary: collapses whitespace", summarizeClipNote("a\n\nb   c") === "a b c");
const long2 = "word ".repeat(50).trim(); // 5 chars/word * 50 = ~250 chars
const s2 = summarizeClipNote(long2);
check("summary: long → ends with …", s2.endsWith("…"));
check("summary: long ≤ peek+1 chars", s2.length <= 121);
check("summary: respects custom peek", summarizeClipNote(long2, { peek: 30 }).length <= 31);
check("summary: no-space giant word slices hard", summarizeClipNote("a".repeat(200)).length === 121);

// delta
check("delta: both empty → 0", clipNoteDelta("", "") === 0);
check("delta: add → positive", clipNoteDelta("", "hi") === 2);
check("delta: remove → negative", clipNoteDelta("hello", "") === -5);
check("delta: change", clipNoteDelta("foo", "longer") === 3);
check("delta: non-string old → treated as empty", clipNoteDelta(null, "hi") === 2);
check("delta: non-string new → treated as empty", clipNoteDelta("hi", undefined) === -2);
check("delta: whitespace trimmed both sides", clipNoteDelta("  hi  ", "  there  ") === 3);

// Symmetric sanitize (re-sanitizing already-sanitized yields the same)
const once = sanitizeClipNote("  hello world  ");
const twice = sanitizeClipNote(once);
check("sanitize: idempotent on real content", once === twice);
check("sanitize: idempotent on undefined", sanitizeClipNote(sanitizeClipNote("")) === undefined);

// Bad-paste defense: zero-width-joiner-laden input doesn't crash
check("ZWJ string still passes", typeof sanitizeClipNote("a\u200dB") === "string");

console.log(`\n${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
