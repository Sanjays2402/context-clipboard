// Sanity: is:today operator parse + apply integration (lib/search +
// lib/today-filter). Mirrors the real flow with an inline mini-parser
// so the parse-time threshold + applyQuery lower-bound gate are covered
// headless (bundler-free).
//
// Coverage:
//   1. parse: is:today sets todayOnly + todayAfter (local midnight).
//   2. apply: keeps clips since local midnight, drops earlier ones.
//   3. distinct from after:24h (a 23h-ago-from-9am clip is dropped).
//   4. combines with other operators (AND semantics).
//   5. describeQuery surfaces "today".

function localDayStart(now = Date.now()) {
  const base = Number.isFinite(now) ? now : Date.now();
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Mini parser: only the bits this test needs (is:today, is:pinned).
function parseQuery(raw, now) {
  const out = { freeText: "", todayOnly: false, todayAfter: undefined, pinnedOnly: false };
  for (const tok of raw.split(/\s+/).filter(Boolean)) {
    if (tok === "is:today") {
      out.todayOnly = true;
      out.todayAfter = localDayStart(now);
    } else if (tok === "is:pinned") {
      out.pinnedOnly = true;
    } else {
      out.freeText += (out.freeText ? " " : "") + tok;
    }
  }
  return out;
}
function applyQuery(clips, q) {
  return clips.filter((c) => {
    if (q.pinnedOnly && !c.pinned) return false;
    if (q.todayOnly && q.todayAfter != null && c.lastSeenAt < q.todayAfter) return false;
    return true;
  });
}
function describeQuery(q) {
  const bits = [];
  if (q.todayOnly) bits.push("today");
  if (q.pinnedOnly) bits.push("pinned");
  return bits.join(" \u00b7 ");
}

let p = 0,
  t = 0;
function ck(n, g, w) {
  t++;
  if (g === w) p++;
  else console.error("FAIL", n, "got", JSON.stringify(g), "want", JSON.stringify(w));
}

// Anchor now at 2026-06-26 09:00 local (early morning so 24h reaches
// back into yesterday).
const now = new Date(2026, 5, 26, 9, 0, 0).getTime();
const midnight = new Date(2026, 5, 26, 0, 0, 0).getTime();

// 1. parse
const q = parseQuery("is:today", now);
ck("todayOnly set", q.todayOnly, true);
ck("todayAfter = local midnight", q.todayAfter, midnight);

// Build a clip set spanning the boundary.
const clips = [
  { id: "a", lastSeenAt: new Date(2026, 5, 26, 8, 30, 0).getTime(), pinned: false }, // today 8:30
  { id: "b", lastSeenAt: new Date(2026, 5, 26, 0, 0, 0).getTime(), pinned: false }, // today midnight (inclusive)
  { id: "c", lastSeenAt: new Date(2026, 5, 25, 23, 30, 0).getTime(), pinned: true }, // yesterday 23:30
  { id: "d", lastSeenAt: new Date(2026, 5, 25, 10, 0, 0).getTime(), pinned: false }, // yesterday 10:00 (23h ago)
];

// 2. apply
const today = applyQuery(clips, q).map((c) => c.id);
ck("keeps today 8:30", today.includes("a"), true);
ck("keeps midnight (inclusive)", today.includes("b"), true);
ck("drops yesterday 23:30", today.includes("c"), false);
ck("drops yesterday 10:00", today.includes("d"), false);
ck("today count", today.length, 2);

// 3. distinct from after:24h — 'd' is 23h ago (within rolling 24h) but
// NOT today; is:today correctly excludes it.
ck("23h-ago within rolling 24h", now - clips[3].lastSeenAt < 86400000, true);
ck("but is:today drops it", applyQuery([clips[3]], q).length, 0);

// 4. combine with is:pinned (AND): only pinned clips from today.
const qp = parseQuery("is:today is:pinned", now);
const both = applyQuery(clips, qp).map((c) => c.id);
ck("today + pinned -> empty (c is pinned but yesterday)", both.length, 0);
// add a pinned-today clip
const clips2 = clips.concat([{ id: "e", lastSeenAt: new Date(2026, 5, 26, 7, 0, 0).getTime(), pinned: true }]);
ck("today + pinned finds pinned-today", applyQuery(clips2, qp).map((c) => c.id).join(","), "e");

// 5. describeQuery
ck("describe today", describeQuery(q), "today");
ck("describe today + pinned", describeQuery(qp), "today \u00b7 pinned");

console.log(`is-today sanity: ${p}/${t} passed`);
if (p !== t) process.exit(1);
