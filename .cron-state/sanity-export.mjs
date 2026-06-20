// Self-contained sanity-test for applyExportFilter logic.
// Mirrors src/lib/export.ts applyExportFilter so we don't pull util/types.

function parseLocalDateStart(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0).getTime();
}
function parseLocalDateEnd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999).getTime();
}
function applyExportFilter(clips, f) {
  if (!f) return clips;
  const tagNeedle = f.tag?.trim().toLowerCase();
  const afterMs = f.afterDate ? parseLocalDateStart(f.afterDate) : null;
  const beforeMs = f.beforeDate ? parseLocalDateEnd(f.beforeDate) : null;
  return clips.filter((c) => {
    if (f.pinnedOnly && !c.pinned) return false;
    if (f.redactedOnly && !c.redacted) return false;
    if (f.skipImages && c.kind === "image") return false;
    if (tagNeedle) {
      const hit = c.tags.some((t) => t.toLowerCase() === tagNeedle);
      if (!hit) return false;
    }
    if (afterMs != null && c.createdAt < afterMs) return false;
    if (beforeMs != null && c.createdAt > beforeMs) return false;
    return true;
  });
}

function mkClip(over) {
  return {
    id: over.id || "x",
    kind: over.kind || "text",
    pinned: !!over.pinned,
    createdAt: over.createdAt || Date.now(),
    tags: over.tags || [],
    redacted: !!over.redacted,
  };
}

const clips = [
  mkClip({ id: "a", pinned: true, tags: ["code"], createdAt: new Date(2026,5,10,10,0,0).getTime() }),
  mkClip({ id: "b", pinned: false, tags: ["note"], createdAt: new Date(2026,5,12,10,0,0).getTime() }),
  mkClip({ id: "c", pinned: true, tags: ["code","x"], kind: "image", createdAt: new Date(2026,5,15,10,0,0).getTime() }),
  mkClip({ id: "d", redacted: true, tags: ["secret"], createdAt: new Date(2026,5,20,10,0,0).getTime() }),
];

const cases = [
  { name: "no filter", filter: undefined, want: ["a","b","c","d"] },
  { name: "pinned only", filter: { pinnedOnly: true }, want: ["a","c"] },
  { name: "skip images", filter: { skipImages: true }, want: ["a","b","d"] },
  { name: "redacted only", filter: { redactedOnly: true }, want: ["d"] },
  { name: "tag code", filter: { tag: "code" }, want: ["a","c"] },
  { name: "tag case-insensitive", filter: { tag: "CODE" }, want: ["a","c"] },
  { name: "pinned + skip-img", filter: { pinnedOnly: true, skipImages: true }, want: ["a"] },
  { name: "after 6-12", filter: { afterDate: "2026-06-12" }, want: ["b","c","d"] },
  { name: "before 6-12", filter: { beforeDate: "2026-06-12" }, want: ["a","b"] },
  { name: "range 6-12 to 6-15", filter: { afterDate: "2026-06-12", beforeDate: "2026-06-15" }, want: ["b","c"] },
  { name: "tag no match", filter: { tag: "noexist" }, want: [] },
];

let pass = 0;
for (const c of cases) {
  const got = applyExportFilter(clips, c.filter).map((x) => x.id).sort();
  const want = [...c.want].sort();
  const ok = got.length === want.length && got.every((v, i) => v === want[i]);
  if (!ok) {
    console.error("FAIL", c.name, "got", got, "want", want);
    process.exit(1);
  }
  pass++;
}
console.log("OK", pass, "/", cases.length);
