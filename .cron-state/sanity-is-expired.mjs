// Sanity: `is:expired` operator — strict past-due subset of `is:expiring`.
//
// `is:expiring` surfaces every clip carrying a TTL (any finite expiresAt).
// `is:expired` is the subset whose deadline has ALREADY passed (expiresAt
// <= now) — the clips the GC will sweep at the next capture, perfect for a
// "rescue or let go" review. Evaluated against an injected `now` (mirrors
// the before/after windows) so a clip crossing its deadline starts
// matching without a re-parse.
//
// Mirrors the parser + applyQuery shape from src/lib/search.ts inline so
// we don't need a bundler. Covers parse-side bit-flip, applyQuery filter
// against a pinned `now`, the expiring/expired distinction (expired ⊂
// expiring), the no-TTL exclusion, the exact boundary (expiresAt === now
// counts as expired), describeQuery surface, and misspell-falls-to-freetext.

function parseQuery(raw) {
  const out = {
    freeText: "",
    tags: [],
    pinnedOnly: false,
    expiringOnly: false,
    expiredOnly: false,
    archivedOnly: false,
  };
  const leftover = [];
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
      else if (v === "expiring") out.expiringOnly = true;
      else if (v === "expired") out.expiredOnly = true;
      else if (v === "archived") out.archivedOnly = true;
      else leftover.push(tok);
    } else if (key === "tag") {
      const t = val.trim();
      if (t) out.tags.push(t);
    } else {
      leftover.push(tok);
    }
  }
  out.freeText = leftover.join(" ").trim();
  return out;
}

function applyQuery(clips, q, opts = {}) {
  const nowMs = typeof opts.now === "number" ? opts.now : Date.now();
  const needle = q.freeText.toLowerCase();
  return clips.filter((c) => {
    if (q.pinnedOnly && !c.pinned) return false;
    if (q.expiringOnly && typeof c.expiresAt !== "number") return false;
    if (q.expiredOnly && !(typeof c.expiresAt === "number" && c.expiresAt <= nowMs)) {
      return false;
    }
    if (q.archivedOnly) {
      if (!c.archived) return false;
    } else if (c.archived) {
      return false;
    }
    for (const t of q.tags) if (!c.tags.includes(t)) return false;
    if (needle) {
      const hay = [c.preview || c.content, c.tags.join(" ")].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

function describeQuery(q) {
  const bits = [];
  if (q.pinnedOnly) bits.push("pinned");
  if (q.expiringOnly) bits.push("expiring");
  if (q.expiredOnly) bits.push("expired");
  if (q.archivedOnly) bits.push("archived");
  return bits.join(" \u00b7 ");
}

let pass = 0, total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}

// --- 1. Parse-side bit-flip --------------------------------------------
const p1 = parseQuery("is:expired");
check("parse: is:expired flips expiredOnly=true", p1.expiredOnly, true);
check("parse: is:expired leaves expiringOnly=false", p1.expiringOnly, false);
check("parse: is:expired no leftover freetext", p1.freeText, "");

const p2 = parseQuery("is:expiring");
check("parse: is:expiring flips expiringOnly=true", p2.expiringOnly, true);
check("parse: is:expiring leaves expiredOnly=false", p2.expiredOnly, false);

// Case-insensitive (matches the v.toLowerCase() semantics).
check("parse: case-insensitive IS:EXPIRED", parseQuery("IS:EXPIRED").expiredOnly, true);

// Misspell falls through to freetext (parser doesn't silently swallow).
const p4 = parseQuery("is:expiredd");
check("parse: misspelled is:expiredd -> leftover freetext", p4.freeText, "is:expiredd");
check("parse: misspelled is:expiredd -> expiredOnly stays false", p4.expiredOnly, false);

// Both can coexist; expired ⊂ expiring so the AND equals just-expired.
const p5 = parseQuery("is:expiring is:expired");
check("parse: both coexist (expiringOnly)", p5.expiringOnly, true);
check("parse: both coexist (expiredOnly)", p5.expiredOnly, true);

// --- 2. Apply filter against a pinned `now` ----------------------------
const NOW = 1_700_000_000_000;
const clips = [
  // Past due — expired.
  { id: "past1", content: "old token", tags: ["secret"], expiresAt: NOW - 60_000, lastSeenAt: 100 },
  { id: "past2", content: "stale link", tags: [], expiresAt: NOW - 5, lastSeenAt: 200 },
  // Exactly now — counts as expired (<=).
  { id: "edge", content: "right at deadline", tags: [], expiresAt: NOW, lastSeenAt: 150 },
  // Future TTL — expiring but NOT expired.
  { id: "future", content: "fresh ttl", tags: [], expiresAt: NOW + 3_600_000, lastSeenAt: 250 },
  // No TTL at all — neither expiring nor expired.
  { id: "noTtl", content: "keeps forever", tags: ["code"], lastSeenAt: 300 },
];

const expired = applyQuery(clips, parseQuery("is:expired"), { now: NOW }).map((c) => c.id);
check("apply: is:expired -> past1, past2, edge (<=now)", expired, ["past1", "past2", "edge"]);

const expiring = applyQuery(clips, parseQuery("is:expiring"), { now: NOW }).map((c) => c.id);
check("apply: is:expiring -> every clip with a TTL", expiring, ["past1", "past2", "edge", "future"]);

// expired is a strict subset of expiring.
check("apply: expired count < expiring count", expired.length < expiring.length, true);
check("apply: every expired clip is also expiring", expired.every((id) => expiring.includes(id)), true);

// No-TTL clip is never expired or expiring.
check("apply: no-TTL clip excluded from is:expired", expired.includes("noTtl"), false);
check("apply: no-TTL clip excluded from is:expiring", expiring.includes("noTtl"), false);

// Future-TTL clip is expiring but NOT expired.
check("apply: future-TTL clip is NOT expired", expired.includes("future"), false);
check("apply: future-TTL clip IS expiring", expiring.includes("future"), true);

// --- 3. `now` is rolling: same clips, a later `now` expands the set -----
const LATER = NOW + 2 * 3_600_000; // 2h later — the "future" clip now past due
const expiredLater = applyQuery(clips, parseQuery("is:expired"), { now: LATER }).map((c) => c.id);
check("apply: later now -> future clip is now expired too", expiredLater, ["past1", "past2", "edge", "future"]);

// --- 4. boundary exactness ---------------------------------------------
// expiresAt === now -> expired (the <= boundary).
check("apply: expiresAt === now is expired", applyQuery([{ id: "z", content: "x", tags: [], expiresAt: NOW }], parseQuery("is:expired"), { now: NOW }).length, 1);
// expiresAt === now+1 -> NOT expired.
check("apply: expiresAt === now+1 is NOT expired", applyQuery([{ id: "z", content: "x", tags: [], expiresAt: NOW + 1 }], parseQuery("is:expired"), { now: NOW }).length, 0);

// --- 5. combines with other operators ----------------------------------
const expiredSecret = applyQuery(clips, parseQuery("is:expired tag:secret"), { now: NOW }).map((c) => c.id);
check("apply: is:expired tag:secret -> only past1", expiredSecret, ["past1"]);
const expiredStale = applyQuery(clips, parseQuery("is:expired stale"), { now: NOW }).map((c) => c.id);
check("apply: is:expired + freetext 'stale' -> only past2", expiredStale, ["past2"]);

// --- 6. describeQuery surface ------------------------------------------
check("describe: is:expired -> 'expired'", describeQuery(parseQuery("is:expired")), "expired");
check("describe: is:expiring is:expired -> both bits", describeQuery(parseQuery("is:expiring is:expired")), "expiring \u00b7 expired");
check("describe: is:pinned is:expired -> 'pinned · expired'", describeQuery(parseQuery("is:pinned is:expired")), "pinned \u00b7 expired");

console.log(`is-expired sanity: ${pass}/${total} pass`);
if (pass !== total) process.exit(1);
