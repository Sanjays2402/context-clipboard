// Sanity: `is:link` operator — parity twin of `kind:link`.
//
// The `is:` family (pinned/redacted/template/expiring/archived) reads as
// "predicate of the clip" while `kind:` reads as "what is the clip". For
// link clips, users routinely reach for `is:link` out of muscle memory
// from the other operators — so we accept it as a true synonym for
// `kind:link`.
//
// Coverage:
//   1. Parse-side bit-flip + case-insensitivity + freetext fallthrough.
//   2. Apply: links surface alone, non-link kinds drop, ordering preserved.
//   3. Cross-product with `kind:image` lands empty (intentional contradiction).
//   4. Cross-product with `kind:link` is idempotent (no double-filter penalty).
//   5. Combined with other ops (host/tag/after) intersects correctly.
//   6. describeQuery surfaces "link" so the status hint reads naturally.

const DURATION_RE = /^(\d+)([smhdw])$/;
const TOKEN_RE = /\S+/g;

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
    linkOnly: false,
  };
  const leftover = [];
  const now = Date.now();
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
    if (key === "kind") {
      const k = val.toLowerCase();
      if (k === "text" || k === "image" || k === "link") out.kind = k;
      else leftover.push(tok);
    } else if (key === "host") {
      out.host = val.toLowerCase().replace(/^www\./, "");
    } else if (key === "tag") {
      const t = val.trim();
      if (t) out.tags.push(t);
    } else if (key === "is") {
      const v = val.toLowerCase();
      if (v === "pinned") out.pinnedOnly = true;
      else if (v === "redacted") out.redactedOnly = true;
      else if (v === "ocr") out.ocrOnly = true;
      else if (v === "template") out.templateOnly = true;
      else if (v === "notemplate") out.noTemplate = true;
      else if (v === "expiring") out.expiringOnly = true;
      else if (v === "archived") out.archivedOnly = true;
      else if (v === "link") out.linkOnly = true;
      else leftover.push(tok);
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

function hostFrom(u) {
  if (!u) return "";
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function applyQuery(clips, q) {
  const needle = q.freeText.toLowerCase();
  const kind = q.kind;
  return clips.filter((c) => {
    if (q.pinnedOnly && !c.pinned) return false;
    if (kind && c.kind !== kind) return false;
    if (q.linkOnly && c.kind !== "link") return false;
    if (q.host && hostFrom(c.source?.url) !== q.host) return false;
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
    for (const t of q.tags) if (!(c.tags || []).includes(t)) return false;
    if (needle) {
      const hay = [c.preview || c.content, (c.tags || []).join(" ")]
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
  if (q.kind) bits.push(q.kind);
  if (q.host) bits.push(`@${q.host}`);
  for (const t of q.tags) bits.push(`#${t}`);
  if (q.pinnedOnly) bits.push("pinned");
  if (q.redactedOnly) bits.push("redacted");
  if (q.ocrOnly) bits.push("ocr");
  if (q.templateOnly) bits.push("template");
  if (q.noTemplate) bits.push("not-template");
  if (q.expiringOnly) bits.push("expiring");
  if (q.archivedOnly) bits.push("archived");
  if (q.linkOnly) bits.push("link");
  if (q.before) bits.push("older");
  if (q.after) bits.push("recent");
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

// --- 1. Parse-side bit-flip ----------------------------------------------
const p1 = parseQuery("is:link");
check("parse: is:link flips linkOnly=true", p1.linkOnly, true);
check("parse: is:link leaves kind undefined (kept distinct)", p1.kind, undefined);
check("parse: is:link no freetext leftover", p1.freeText, "");

const p2 = parseQuery("is:LINK");
check("parse: case-insensitive IS:LINK → linkOnly", p2.linkOnly, true);

const p3 = parseQuery("Is:Link");
check("parse: case-insensitive Is:Link → linkOnly", p3.linkOnly, true);

// Misspelled token falls through to freetext (parser doesn't silently swallow).
const p4 = parseQuery("is:links");
check("parse: misspelled is:links → leftover freetext", p4.freeText, "is:links");
check("parse: misspelled is:links → linkOnly stays false", p4.linkOnly, false);

// `kind:link` and `is:link` parsed independently (no auto-aliasing in parser).
const p5 = parseQuery("kind:link");
check("parse: kind:link sets kind", p5.kind, "link");
check("parse: kind:link does NOT touch linkOnly", p5.linkOnly, false);

// Stacked: kind:link is:link still works (idempotent at apply time).
const p6 = parseQuery("kind:link is:link");
check("parse: stacked → kind=link", p6.kind, "link");
check("parse: stacked → linkOnly=true", p6.linkOnly, true);

// Mixed with other ops + freetext.
const p7 = parseQuery("github is:link tag:docs");
check("parse: freetext + is:link + tag → linkOnly", p7.linkOnly, true);
check("parse: freetext + is:link + tag → tags", p7.tags, ["docs"]);
check("parse: freetext + is:link + tag → freeText", p7.freeText, "github");

// --- 2. Apply filter -----------------------------------------------------
const clips = [
  { id: "l1", kind: "link", content: "https://github.com/foo", preview: "github.com/foo", tags: ["github"], source: { url: "https://github.com/foo" }, lastSeenAt: 100 },
  { id: "l2", kind: "link", content: "https://example.com/bar", preview: "example.com/bar", tags: [], source: { url: "https://example.com/bar" }, lastSeenAt: 200 },
  { id: "t1", kind: "text", content: "Hello world", tags: ["github"], source: { url: "https://github.com/issues/1" }, lastSeenAt: 150 },
  { id: "i1", kind: "image", content: "data:image/png;base64,xxx", preview: "Screenshot", tags: [], source: { url: "https://example.com/img" }, lastSeenAt: 250 },
  { id: "t2", kind: "text", content: "docs snippet", tags: ["docs"], source: { url: "" }, lastSeenAt: 300 },
];

const onlyLinks = applyQuery(clips, parseQuery("is:link")).map((c) => c.id);
check("apply: is:link → only link kinds", onlyLinks.sort(), ["l1", "l2"]);

// Same set as kind:link (true synonymy).
const kindLinks = applyQuery(clips, parseQuery("kind:link")).map((c) => c.id);
check("apply: kind:link → same set as is:link", kindLinks.sort(), ["l1", "l2"]);

// --- 3. Pathological contradiction ---------------------------------------
const bothImg = applyQuery(clips, parseQuery("kind:image is:link"));
check("apply: kind:image AND is:link → empty (no clip is both)", bothImg.length, 0);

const bothText = applyQuery(clips, parseQuery("kind:text is:link"));
check("apply: kind:text AND is:link → empty (intentional)", bothText.length, 0);

// --- 4. Idempotent self-AND ----------------------------------------------
const stacked = applyQuery(clips, parseQuery("kind:link is:link")).map((c) => c.id);
check("apply: kind:link is:link → same as either alone", stacked.sort(), ["l1", "l2"]);

// --- 5. Combined with other ops ------------------------------------------
const linkAndTag = applyQuery(clips, parseQuery("is:link tag:github")).map((c) => c.id);
check("apply: is:link tag:github → only l1", linkAndTag, ["l1"]);

const linkAndHost = applyQuery(clips, parseQuery("is:link host:example.com")).map((c) => c.id);
check("apply: is:link host:example.com → only l2", linkAndHost, ["l2"]);

const freetextLink = applyQuery(clips, parseQuery("github is:link")).map((c) => c.id);
check("apply: 'github is:link' → only l1 (freetext hits preview)", freetextLink, ["l1"]);

// Empty result for impossible combination of host + link parity.
const noMatchHost = applyQuery(clips, parseQuery("is:link host:nope.com"));
check("apply: is:link host:nope.com → empty", noMatchHost.length, 0);

// --- 6. describeQuery surface --------------------------------------------
check(
  "describe: is:link → 'link'",
  describeQuery(parseQuery("is:link")),
  "link",
);
check(
  "describe: is:link is:pinned → 'pinned · link'",
  describeQuery(parseQuery("is:link is:pinned")),
  "pinned · link",
);
check(
  "describe: kind:link is:link → 'link · link' (parser-honest, both set)",
  describeQuery(parseQuery("kind:link is:link")),
  "link · link",
);

// --- 7. Sanity: empty query still pass-through ---------------------------
const all = applyQuery(clips, parseQuery("")).map((c) => c.id);
check("apply: empty query → all clips", all.sort(), ["i1", "l1", "l2", "t1", "t2"]);

// --- 8. Defensive: clip with missing kind treated as text (drops out) ----
const odd = applyQuery(
  [{ id: "x", content: "no kind", tags: [], source: {}, lastSeenAt: 0 }],
  parseQuery("is:link"),
);
check("apply: clip with missing kind → excluded by is:link", odd.length, 0);

// --- 9. Defensive: link clip with no source URL still surfaces -----------
const noSrc = applyQuery(
  [{ id: "y", kind: "link", content: "https://nowhere", tags: [], source: {}, lastSeenAt: 0 }],
  parseQuery("is:link"),
);
check("apply: link clip with empty source → surfaces (kind is the gate)", noSrc.length, 1);

console.log(`is-link sanity: ${pass}/${total} pass`);
if (pass !== total) process.exit(1);
