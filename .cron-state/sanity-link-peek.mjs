// Sanity: lib/list-peek.ts linkPeekTooltip (rich hover-peek for links).
// Inline copy so this runs bundler-free. Covers fold-in for short links,
// row-dedup, identical title/url collapse, long-body append, whitespace
// flatten, url-only, cap+ellipsis.

const DEFAULT_ROW_SLICE = 140;
const DEFAULT_CAP = 500;
function normaliseLen(v, fallback) {
  if (v == null || !Number.isFinite(v)) return fallback;
  const n = Math.trunc(v);
  return n > 0 ? n : fallback;
}
function cleanField(v, cap) {
  if (typeof v !== "string") return "";
  const s = v.replace(/\s+/g, " ").trim();
  if (s === "") return "";
  return s.length <= cap ? s : s.slice(0, cap).trimEnd() + "\u2026";
}
function linkPeekTooltip(fullPreview, source, opts = {}) {
  const rowSlice = normaliseLen(opts.rowSliceLength, DEFAULT_ROW_SLICE);
  const cap = normaliseLen(opts.cap, DEFAULT_CAP);
  const body = typeof fullPreview === "string" ? fullPreview : "";
  const flatBody = body.replace(/\s+/g, " ").trim();
  const visible = flatBody.slice(0, rowSlice).toLowerCase();
  const parts = [];
  const seen = new Set();
  const pushUnique = (raw) => {
    if (!raw) return;
    const key = raw.toLowerCase();
    if (seen.has(key)) return;
    if (visible.length > 0 && visible.includes(key)) return;
    seen.add(key);
    parts.push(raw);
  };
  pushUnique(cleanField(source && source.title, 200));
  pushUnique(cleanField(source && source.url, 300));
  if (flatBody.length > rowSlice) {
    const bodyPeek = flatBody.length <= cap ? flatBody : flatBody.slice(0, cap).trimEnd() + "\u2026";
    pushUnique(bodyPeek);
  }
  if (parts.length === 0) return null;
  const joined = parts.join("  \u00b7  ");
  return joined.length <= cap ? joined : joined.slice(0, cap).trimEnd() + "\u2026";
}

let p = 0, t = 0;
function ck(n, c, w) {
  t++;
  if (c) p++;
  else console.error("FAIL", n, "GOT", w);
}

ck("title+url folded for short link", linkPeekTooltip("Repo", { title: "My Repo", url: "https://github.com/a/b" }) === "My Repo  \u00b7  https://github.com/a/b", linkPeekTooltip("Repo", { title: "My Repo", url: "https://github.com/a/b" }));
ck("dedup title shown in row", linkPeekTooltip("My Repo", { title: "My Repo", url: "https://github.com/a/b" }) === "https://github.com/a/b", "x");
ck("no source short body -> null", linkPeekTooltip("hi", {}) === null, "x");
ck("nullish source -> null", linkPeekTooltip("hi", null) === null, "x");
ck("identical title+url collapses", linkPeekTooltip("x", { title: "https://a.com", url: "https://a.com" }) === "https://a.com", "x");
const long = "Z" + "abcdefghij".repeat(20);
const out = linkPeekTooltip(long, { title: "T", url: "https://u.com" });
ck("long body appended", out.startsWith("T  \u00b7  https://u.com  \u00b7  Z"), out);
ck("long body present full (<cap)", out.includes(long), out);
ck("flatten whitespace", linkPeekTooltip("x", { title: "  spaced   title  ", url: "" }) === "spaced title", "x");
ck("url only", linkPeekTooltip("x", { url: "https://only.com" }) === "https://only.com", "x");
const bigurl = "https://x.com/" + "q".repeat(500);
const capped = linkPeekTooltip("x", { url: bigurl });
ck("url capped <=500 + ellipsis", capped.length <= 500 && capped.endsWith("\u2026"), capped.length);

console.log(`link-peek: ${p}/${t}`);
process.exit(p === t ? 0 : 1);
