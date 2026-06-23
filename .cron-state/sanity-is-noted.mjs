// Sanity: is:noted operator — parser + applyQuery + describeQuery
//
// `is:noted` joins the is: family (pinned/redacted/template/expiring/
// archived/link/locked/unlocked) and surfaces clips carrying a
// free-form note (the new detail-view textarea field). Gate uses
// hasClipNote() so the predicate matches the detail-view note-row's
// Clear-button visibility — search and paint can't disagree.

// --- Inlined parser/applier (mirrors src/lib/search.ts after this tick) -

const TOKEN_RE = /\S+/g;

function hasClipNote(c) {
  if (!c) return false;
  if (typeof c.note !== "string") return false;
  return c.note.trim().length > 0;
}

function parseQuery(raw) {
  const out = {
    freeText: "",
    tags: [],
    pinnedOnly: false,
    redactedOnly: false,
    ocrOnly: false,
    templateOnly: false,
    noTemplate: false,
    expiringOnly: false,
    archivedOnly: false,
    linkOnly: false,
    lockedOnly: false,
    unlockedOnly: false,
    notedOnly: false,
  };
  const leftover = [];
  TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TOKEN_RE.exec(raw)) !== null) {
    const tok = m[0];
    const colon = tok.indexOf(":");
    if (colon <= 0 || colon === tok.length - 1) {
      leftover.push(tok);
      continue;
    }
    const key = tok.slice(0, colon).toLowerCase();
    const val = tok.slice(colon + 1);
    if (key === "is") {
      const v = val.toLowerCase();
      if (v === "pinned") out.pinnedOnly = true;
      else if (v === "redacted") out.redactedOnly = true;
      else if (v === "locked") out.lockedOnly = true;
      else if (v === "unlocked") out.unlockedOnly = true;
      else if (v === "noted") out.notedOnly = true;
      else leftover.push(tok);
    } else if (key === "tag") {
      out.tags.push(val);
    } else if (key === "host") {
      out.host = val.toLowerCase().replace(/^www\./, "");
    } else {
      leftover.push(tok);
    }
  }
  out.freeText = leftover.join(" ").trim();
  return out;
}

function applyQuery(clips, q) {
  return clips.filter((c) => {
    if (q.lockedOnly && c.locked !== true) return false;
    if (q.unlockedOnly && c.locked === true) return false;
    if (q.notedOnly && !hasClipNote(c)) return false;
    return true;
  });
}

function describeQuery(q) {
  const bits = [];
  if (q.lockedOnly) bits.push("locked");
  if (q.unlockedOnly) bits.push("unlocked");
  if (q.notedOnly) bits.push("noted");
  return bits.join(" · ");
}

let pass = 0;
let fail = 0;
function check(name, ok) {
  if (ok) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

// --- Parser ---
check("parses is:noted", parseQuery("is:noted").notedOnly === true);
check("case-insensitive value", parseQuery("is:NOTED").notedOnly === true);
check("case-insensitive key", parseQuery("IS:noted").notedOnly === true);
check("typo is:noted2 → freeText", parseQuery("is:noted2").freeText === "is:noted2");
check("typo is:not → freeText", parseQuery("is:not").freeText === "is:not");
check("no operator → notedOnly false", parseQuery("foo bar").notedOnly === false);
check("mixed with other is:", (() => {
  const p = parseQuery("is:noted is:locked");
  return p.notedOnly === true && p.lockedOnly === true;
})());
check("with host:", (() => {
  const p = parseQuery("is:noted host:github.com");
  return p.notedOnly === true && p.host === "github.com";
})());
check("freeText preserved alongside", (() => {
  const p = parseQuery("regex is:noted parser");
  return p.notedOnly === true && p.freeText === "regex parser";
})());
check("is:noted alone — freeText empty", parseQuery("is:noted").freeText === "");

// --- applyQuery: predicate matches hasClipNote ---
const clips = [
  { id: "a" },                          // no note field
  { id: "b", note: undefined },         // explicit undefined
  { id: "c", note: "" },                // empty string
  { id: "d", note: "   " },             // whitespace only
  { id: "e", note: "real note" },       // real content
  { id: "f", note: "  trim me  " },     // padded but real
  { id: "g", note: 42 },                // non-string (defensive)
  { id: "h", note: null },              // null
];
const q = parseQuery("is:noted");
const filtered = applyQuery(clips, q);
check("is:noted matches only real notes", filtered.length === 2);
check("includes 'real note'", filtered.find((c) => c.id === "e") !== undefined);
check("includes 'trim me' (padded but real)", filtered.find((c) => c.id === "f") !== undefined);
check("excludes empty note", filtered.find((c) => c.id === "c") === undefined);
check("excludes whitespace note", filtered.find((c) => c.id === "d") === undefined);
check("excludes undefined note", filtered.find((c) => c.id === "b") === undefined);
check("excludes missing field", filtered.find((c) => c.id === "a") === undefined);
check("excludes non-string", filtered.find((c) => c.id === "g") === undefined);
check("excludes null", filtered.find((c) => c.id === "h") === undefined);

// No operator → all pass
const all = applyQuery(clips, parseQuery(""));
check("no operator → all pass", all.length === clips.length);

// Empty input → empty
check("empty input filtered → []", applyQuery([], q).length === 0);

// describeQuery
check("describe 'noted' included", describeQuery({ notedOnly: true }) === "noted");
check("describe combination", describeQuery({ notedOnly: true, lockedOnly: true }) === "locked · noted");
check("describe empty", describeQuery({}) === "");

// hasClipNote defensive
check("hasClipNote: null clip → false", hasClipNote(null) === false);
check("hasClipNote: undefined clip → false", hasClipNote(undefined) === false);
check("hasClipNote: {} → false", hasClipNote({}) === false);
check("hasClipNote: '' → false", hasClipNote({ note: "" }) === false);
check("hasClipNote: '  ' → false", hasClipNote({ note: "  " }) === false);
check("hasClipNote: 'x' → true", hasClipNote({ note: "x" }) === true);

// Symmetry: is:noted gate uses the same hasClipNote() as the
// detail-view Clear-button visibility — search & paint can't disagree.
const noteClip = { id: "x", note: "anything" };
check("symmetry: hasClipNote ↔ filter inclusion", hasClipNote(noteClip) && applyQuery([noteClip], q).length === 1);

console.log(`\n${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
