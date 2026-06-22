// Sanity: `is:notemplate` operator — inverse of `is:template`.
//
// Mirrors the parser shape from src/lib/search.ts inline so we don't
// need a bundler. Covers parse-side bit-flip, applyQuery filter, the
// pathological both-on case (always empty), describeQuery surface
// text, and the leftover-as-freetext fallback when the token is
// misspelled.

const DURATION_RE = /^(\d+)([smhdw])$/;

function parseDuration(s) {
  const m = DURATION_RE.exec(s.trim().toLowerCase());
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2];
  const mult =
    unit === "s"
      ? 1000
      : unit === "m"
        ? 60_000
        : unit === "h"
          ? 3_600_000
          : unit === "d"
            ? 86_400_000
            : 7 * 86_400_000;
  return n * mult;
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
  };
  const leftover = [];
  const now = Date.now();
  const re = /\S+/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
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
      else if (v === "ocr") out.ocrOnly = true;
      else if (v === "template") out.templateOnly = true;
      else if (v === "notemplate") out.noTemplate = true;
      else if (v === "expiring") out.expiringOnly = true;
      else if (v === "archived") out.archivedOnly = true;
      else leftover.push(tok);
    } else if (key === "tag") {
      const t = val.trim();
      if (t) out.tags.push(t);
    } else if (key === "before") {
      const d = parseDuration(val);
      if (d != null) out.before = now - d;
      else leftover.push(tok);
    } else if (key === "after") {
      const d = parseDuration(val);
      if (d != null) out.after = now - d;
      else leftover.push(tok);
    } else {
      leftover.push(tok);
    }
  }
  out.freeText = leftover.join(" ").trim();
  return out;
}

function applyQuery(clips, q) {
  const needle = q.freeText.toLowerCase();
  return clips.filter((c) => {
    if (q.pinnedOnly && !c.pinned) return false;
    if (q.redactedOnly && !c.redacted) return false;
    if (q.ocrOnly && !c.ocrText) return false;
    if (q.templateOnly && !c.template) return false;
    if (q.noTemplate && c.template) return false;
    if (q.expiringOnly && typeof c.expiresAt !== "number") return false;
    if (q.archivedOnly) {
      if (!c.archived) return false;
    } else if (c.archived) {
      return false;
    }
    if (q.before != null && c.lastSeenAt >= q.before) return false;
    if (q.after != null && c.lastSeenAt <= q.after) return false;
    for (const t of q.tags) if (!c.tags.includes(t)) return false;
    if (needle) {
      const hay = [
        c.preview || c.content,
        c.tags.join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

function describeQuery(q) {
  const bits = [];
  if (q.pinnedOnly) bits.push("pinned");
  if (q.redactedOnly) bits.push("redacted");
  if (q.templateOnly) bits.push("template");
  if (q.noTemplate) bits.push("not-template");
  if (q.expiringOnly) bits.push("expiring");
  if (q.archivedOnly) bits.push("archived");
  return bits.join(" · ");
}

let pass = 0;
let total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}

// --- 1. Parse-side bit-flip --------------------------------------------
const p1 = parseQuery("is:notemplate");
check("parse: is:notemplate flips noTemplate=true", p1.noTemplate, true);
check("parse: is:notemplate leaves templateOnly=false", p1.templateOnly, false);
check("parse: is:notemplate has no freetext leftover", p1.freeText, "");

const p2 = parseQuery("is:template");
check("parse: is:template flips templateOnly=true", p2.templateOnly, true);
check("parse: is:template leaves noTemplate=false", p2.noTemplate, false);

// Case-insensitive (matches the existing `v.toLowerCase()` semantics).
const p3 = parseQuery("Is:NoTemplate");
check("parse: case-insensitive Is:NoTemplate → noTemplate", p3.noTemplate, true);

// Misspelled token falls through to freetext (parser doesn't silently swallow).
const p4 = parseQuery("is:notemplates");
check("parse: misspelled is:notemplates → leftover freetext", p4.freeText, "is:notemplates");
check("parse: misspelled is:notemplates → noTemplate stays false", p4.noTemplate, false);

// Both flags can coexist (mutually exclusive at apply time, parser is honest).
const p5 = parseQuery("is:template is:notemplate");
check("parse: both flags coexist (templateOnly)", p5.templateOnly, true);
check("parse: both flags coexist (noTemplate)", p5.noTemplate, true);

// Mixed with freetext + other ops.
const p6 = parseQuery("hello is:notemplate tag:code");
check("parse: freetext + is:notemplate + tag:code → noTemplate", p6.noTemplate, true);
check("parse: freetext + is:notemplate + tag:code → tags", p6.tags, ["code"]);
check("parse: freetext + is:notemplate + tag:code → freeText", p6.freeText, "hello");

// --- 2. Apply filter ---------------------------------------------------
const clips = [
  { id: "t1", template: true,  content: "Hello {{name}}", tags: ["snippet"], lastSeenAt: 100 },
  { id: "t2", template: true,  content: "{{date}} · {{host}}", tags: [], lastSeenAt: 200 },
  { id: "p1", template: false, content: "plain text one", tags: ["code"], lastSeenAt: 150 },
  { id: "p2", template: false, content: "plain text two", tags: [], lastSeenAt: 250 },
  // No template bit at all (matches the schema-additive shape).
  { id: "u1", content: "untagged ancient", tags: [], lastSeenAt: 300 },
];

const onlyTemplates = applyQuery(clips, parseQuery("is:template")).map((c) => c.id);
check("apply: is:template → only t1, t2", onlyTemplates, ["t1", "t2"]);

const onlyPlain = applyQuery(clips, parseQuery("is:notemplate")).map((c) => c.id);
check("apply: is:notemplate → only p1, p2, u1 (no template bit)", onlyPlain, ["p1", "p2", "u1"]);

// Undefined `template` field is treated as "not a template" — consistent with
// the schema-additive contract (the bit is only ever true for ingested templates).
const noneSet = applyQuery([{ id: "x", content: "plain", tags: [] }], parseQuery("is:notemplate"));
check("apply: is:notemplate matches clips with no `template` field", noneSet.map((c) => c.id), ["x"]);

// Both flags ON → impossible by design, always empty.
const both = applyQuery(clips, parseQuery("is:template is:notemplate"));
check("apply: is:template AND is:notemplate → empty (intentional)", both.length, 0);

// Combines with other operators.
const plainTagged = applyQuery(clips, parseQuery("is:notemplate tag:code")).map((c) => c.id);
check("apply: is:notemplate tag:code → only p1", plainTagged, ["p1"]);

const plainHello = applyQuery(clips, parseQuery("plain is:notemplate")).map((c) => c.id);
check("apply: 'plain is:notemplate' freetext-matches", plainHello.sort(), ["p1", "p2"]);

// Sanity: no operator at all = pass-through (sanity).
const all = applyQuery(clips, parseQuery("")).map((c) => c.id);
check("apply: empty query → all clips", all, ["t1", "t2", "p1", "p2", "u1"]);

// --- 3. describeQuery surface ------------------------------------------
check(
  "describe: is:notemplate → 'not-template'",
  describeQuery(parseQuery("is:notemplate")),
  "not-template",
);
check(
  "describe: is:template is:pinned → 'pinned · template'",
  describeQuery(parseQuery("is:template is:pinned")),
  "pinned · template",
);
check(
  "describe: is:template is:notemplate → both bits show",
  describeQuery(parseQuery("is:template is:notemplate")),
  "template · not-template",
);

// --- 4. Edge: empty content but template=true still gets filtered out ---
const edge = applyQuery(
  [{ id: "e", template: true, content: "", tags: [] }],
  parseQuery("is:notemplate"),
);
check("apply: empty-content template clip still excluded by is:notemplate", edge.length, 0);

console.log(`no-template sanity: ${pass}/${total} pass`);
if (pass !== total) process.exit(1);
