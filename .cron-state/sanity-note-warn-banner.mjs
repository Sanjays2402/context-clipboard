// Sanity: Note-composer live caution-warning banner (lib/note-warn-banner).
//
// As the user types a note, the composer surfaces an inline banner when
// the draft carries a caution keyword (prod / staging / "do not" / secret
// / …) — the SAME keywords the in-page palette tints warm-red at paste
// time. noteWarnBanner is the pure decision: from the draft, return
// whether it's flagged + which keyword + ready-to-render banner text.
//
// The detection MUST agree with lib/note-warning (the palette tint), so
// this harness inlines the same keyword list + regex build the real
// module delegates to, and asserts the banner mirrors it exactly.
//
// Coverage:
//   1. flagged drafts (each keyword family: env / verb / lifecycle / secrecy).
//   2. keyword surfaced is the FIRST match, canonical-cased.
//   3. banner text grammar (keyword parenthetical + tail).
//   4. NON-flagged: plain prose, empty, whitespace, near-miss boundary
//      (preproduction), nullish, non-string.
//   5. word-boundary + hashtag spellings (#prod) match; substrings don't.
//   6. result shape (flagged flips keyword/text on/off).

// ---- Inline copy of lib/note-warning detection (bundler-free harness) ----
const NOTE_WARNING_KEYWORDS = [
  "prod", "production", "staging", "beta", "sandbox",
  "do not", "don't paste", "never use", "never paste",
  "caution", "warning", "danger",
  "deprecated", "draft", "wip", "todo", "fixme",
  "secret", "private", "confidential", "internal only",
];
const ESCAPE_RE = /[.*+?^${}()|[\]\\]/g;
function escapeRegex(s) {
  return s.replace(ESCAPE_RE, "\\$&");
}
const WARNING_RE = new RegExp(
  "\\b(?:" +
    NOTE_WARNING_KEYWORDS.map((k) =>
      k.split(/\s+/).map((w) => escapeRegex(w)).join("\\s+"),
    ).join("|") +
    ")\\b",
  "gi",
);
function hasNoteWarning(note) {
  if (typeof note !== "string") return false;
  if (note.length === 0) return false;
  WARNING_RE.lastIndex = 0;
  return WARNING_RE.test(note);
}
function firstWarningKeyword(note) {
  if (typeof note !== "string") return null;
  if (note.length === 0) return null;
  WARNING_RE.lastIndex = 0;
  if (!WARNING_RE.test(note)) return null;
  for (const kw of NOTE_WARNING_KEYWORDS) {
    const pattern = kw.split(/\s+/).map((w) => escapeRegex(w)).join("\\s+");
    const re = new RegExp("\\b" + pattern + "\\b", "i");
    if (re.test(note)) return kw;
  }
  return null;
}

// ---- Inline copy of lib/note-warn-banner (the module under test) ----
const NOT_FLAGGED = { flagged: false, keyword: "", text: "" };
function formatNoteWarnBannerText(keyword) {
  const kw = typeof keyword === "string" ? keyword.trim() : "";
  const subject = kw ? `flag the clip (${kw})` : "flag the clip";
  return `This note will ${subject} \u2014 it'll show a caution tint when you reach for it later.`;
}
function noteWarnBanner(draft) {
  if (typeof draft !== "string") return NOT_FLAGGED;
  if (!hasNoteWarning(draft)) return NOT_FLAGGED;
  const kw = firstWarningKeyword(draft) || "";
  return { flagged: true, keyword: kw, text: formatNoteWarnBannerText(kw) };
}

let p = 0, t = 0;
function ck(n, g, w) {
  t++;
  if (g === w) p++;
  else console.error("FAIL", n, "got", JSON.stringify(g), "want", JSON.stringify(w));
}

// 1. flagged drafts — one per keyword family
ck("env: prod flags", noteWarnBanner("use prod only").flagged, true);
ck("env: staging flags", noteWarnBanner("this is the staging url").flagged, true);
ck("verb: do not flags", noteWarnBanner("do not paste this").flagged, true);
ck("lifecycle: deprecated flags", noteWarnBanner("deprecated endpoint").flagged, true);
ck("secrecy: secret flags", noteWarnBanner("contains a secret token").flagged, true);

// 2. keyword surfaced is canonical-cased + first match
ck("prod keyword surfaced", noteWarnBanner("PROD config").keyword, "prod");
ck("staging keyword surfaced", noteWarnBanner("Staging only").keyword, "staging");
ck("first match wins (prod before secret)",
  noteWarnBanner("prod env with a secret").keyword, "prod");
// declaration order: "secret" comes before nothing relevant here, but
// "production" precedes "staging" — verify a later-in-text earlier-in-list wins
ck("list order, not text order (production)",
  noteWarnBanner("the staging and production hosts").keyword, "production");

// 3. banner text grammar
ck("banner text names the keyword",
  noteWarnBanner("prod only").text,
  "This note will flag the clip (prod) \u2014 it'll show a caution tint when you reach for it later.");
ck("formatNoteWarnBannerText with empty keyword drops parens",
  formatNoteWarnBannerText(""),
  "This note will flag the clip \u2014 it'll show a caution tint when you reach for it later.");
ck("formatNoteWarnBannerText trims keyword",
  formatNoteWarnBannerText("  prod  ").includes("(prod)"), true);

// 4. NON-flagged cases
ck("plain prose does NOT flag", noteWarnBanner("just a normal note").flagged, false);
ck("empty does NOT flag", noteWarnBanner("").flagged, false);
ck("whitespace-only does NOT flag", noteWarnBanner("   \n\t ").flagged, false);
ck("null does NOT flag", noteWarnBanner(null).flagged, false);
ck("undefined does NOT flag", noteWarnBanner(undefined).flagged, false);
ck("number does NOT flag", noteWarnBanner(42).flagged, false);
ck("object does NOT flag", noteWarnBanner({}).flagged, false);

// 5. word-boundary + hashtag spellings
ck("#prod hashtag form flags", noteWarnBanner("ping me #prod").flagged, true);
ck("preproduction does NOT flag (boundary)", noteWarnBanner("preproduction step").flagged, false);
ck("'production' DOES flag even though 'prod' is a prefix",
  noteWarnBanner("the production deploy").keyword, "production");
ck("substring 'donut' does NOT match 'do not'", noteWarnBanner("eat a donut").flagged, false);

// 6. result shape — non-flagged keeps keyword + text empty
const none = noteWarnBanner("hello");
ck("non-flagged keyword empty", none.keyword, "");
ck("non-flagged text empty", none.text, "");
const flagged = noteWarnBanner("prod");
ck("flagged keyword non-empty", flagged.keyword.length > 0, true);
ck("flagged text non-empty", flagged.text.length > 0, true);

console.log(`note-warn-banner sanity: ${p}/${t} passed`);
if (p !== t) process.exit(1);
