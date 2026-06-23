// Sanity: is:unlocked operator — parser + applyQuery + describeQuery
//
// `is:unlocked` is the inverse twin of `is:locked`: strict gate over
// `c.locked === true`, so unlocked surfaces everything where the bit
// is undefined, false, or a truthy non-boolean (which is also what
// the strict `is:locked` rejects → exact complement, no overlap,
// no leftover universe).
//
// The natural use case is the "what should I lock?" review pass:
// after auditing `is:locked` clips the user flips to `is:unlocked
// tag:irreplaceable` (or similar) to surface unlock candidates.

// --- Inlined parser/applier (mirrors src/lib/search.ts) ------------------

const TOKEN_RE = /\S+/g;

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
      else if (v === "locked") out.lockedOnly = true;
      else if (v === "unlocked") out.unlockedOnly = true;
      else if (v === "link") out.linkOnly = true;
      else if (v === "archived") out.archivedOnly = true;
      else leftover.push(tok);
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
    if (q.linkOnly && c.kind !== "link") return false;
    if (q.archivedOnly) {
      if (!c.archived) return false;
    } else if (c.archived) {
      return false;
    }
    return true;
  });
}

function describeQuery(q) {
  const bits = [];
  if (q.lockedOnly) bits.push("locked");
  if (q.unlockedOnly) bits.push("unlocked");
  if (q.linkOnly) bits.push("link");
  if (q.pinnedOnly) bits.push("pinned");
  return bits.join(" · ");
}

// --- Harness -------------------------------------------------------------
let pass = 0, total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}

// --- 1. parser flag ------------------------------------------------------
check("parser: is:unlocked → unlockedOnly=true", parseQuery("is:unlocked").unlockedOnly, true);
check("parser: is:unlocked leaves freeText empty", parseQuery("is:unlocked").freeText, "");
check("parser: is:locked unaffected by unlocked branch", parseQuery("is:locked").lockedOnly, true);
check("parser: is:locked does NOT set unlockedOnly", parseQuery("is:locked").unlockedOnly, false);
check("parser: is:unlocked does NOT set lockedOnly", parseQuery("is:unlocked").lockedOnly, false);
check("parser: free text 'unlocked' (no is:) leaves flag off",
  parseQuery("unlocked").unlockedOnly, false);
check("parser: free text 'unlocked' stays in freeText",
  parseQuery("unlocked").freeText, "unlocked");

// --- 2. parser combinations ----------------------------------------------
const both = parseQuery("is:locked is:unlocked");
check("parser: is:locked is:unlocked → both flags set", { l: both.lockedOnly, u: both.unlockedOnly }, { l: true, u: true });

const withFree = parseQuery("foo is:unlocked bar");
check("parser: free text around is:unlocked → unlockedOnly true, freeText 'foo bar'",
  { u: withFree.unlockedOnly, f: withFree.freeText }, { u: true, f: "foo bar" });

const mixedCase = parseQuery("Is:UnLocKeD");
check("parser: case-insensitive 'Is:UnLocKeD' → unlockedOnly true", mixedCase.unlockedOnly, true);

// Mistyped operators fall through to freeText (no silent partial match).
check("parser: is:unlocke (typo) does NOT set flag",
  parseQuery("is:unlocke").unlockedOnly, false);
check("parser: is:unlockedX (typo) does NOT set flag",
  parseQuery("is:unlockedX").unlockedOnly, false);

// --- 3. applyQuery: lock-bit truth table ---------------------------------

const clips = [
  { id: "a", locked: true },         // explicit lock
  { id: "b", locked: false },        // explicit unlock
  { id: "c" },                       // undefined → unlocked
  { id: "d", locked: 1 },            // truthy non-boolean → unlocked (strict)
  { id: "e", locked: "yes" },        // truthy non-boolean → unlocked (strict)
  { id: "f", locked: null },         // falsy → unlocked
];

const lockedQ = parseQuery("is:locked");
const unlockedQ = parseQuery("is:unlocked");

check("apply: is:locked surfaces only locked:true",
  applyQuery(clips, lockedQ).map((c) => c.id), ["a"]);

check("apply: is:unlocked surfaces every NON-locked:true (incl truthy non-bool)",
  applyQuery(clips, unlockedQ).map((c) => c.id), ["b", "c", "d", "e", "f"]);

// Exact complement check: every clip is in EXACTLY ONE of the two sets.
const lockedSet = new Set(applyQuery(clips, lockedQ).map((c) => c.id));
const unlockedSet = new Set(applyQuery(clips, unlockedQ).map((c) => c.id));
const overlap = [...lockedSet].filter((id) => unlockedSet.has(id));
const missing = clips.map((c) => c.id).filter((id) => !lockedSet.has(id) && !unlockedSet.has(id));
check("complement: no overlap between is:locked and is:unlocked", overlap, []);
check("complement: no clip falls through both filters", missing, []);
check("complement: union size equals clips length",
  lockedSet.size + unlockedSet.size, clips.length);

// AND-semantics check — both flags set means empty result.
const bothQ = parseQuery("is:locked is:unlocked");
check("apply: is:locked is:unlocked → empty result (AND-semantics)",
  applyQuery(clips, bothQ).length, 0);

// --- 4. describeQuery surface --------------------------------------------
check("describe: is:unlocked → 'unlocked'", describeQuery(parseQuery("is:unlocked")), "unlocked");
check("describe: is:locked → 'locked' (unchanged)", describeQuery(parseQuery("is:locked")), "locked");
check("describe: is:unlocked is:link → 'unlocked · link'",
  describeQuery(parseQuery("is:unlocked is:link")), "unlocked · link");
check("describe: is:locked is:unlocked → 'locked · unlocked' (both reported)",
  describeQuery(parseQuery("is:locked is:unlocked")), "locked · unlocked");

// --- 5. realistic use cases ----------------------------------------------

// "what should I lock?" — surface kind=link unlock candidates.
const realistic = [
  { id: "1", kind: "link", locked: true },
  { id: "2", kind: "link" },
  { id: "3", kind: "link", locked: false },
  { id: "4", kind: "text" },
  { id: "5", kind: "image", locked: true },
];
const linkUnlockedQ = parseQuery("is:unlocked is:link");
check("realistic: is:unlocked is:link narrows to link clips without lock",
  applyQuery(realistic, linkUnlockedQ).map((c) => c.id), ["2", "3"]);

// archive default still hides archived rows even when is:unlocked active.
const archMix = [
  { id: "a1", locked: false, archived: true },
  { id: "a2", locked: false },
];
check("apply: archived clips hidden when is:unlocked active (default arch=off)",
  applyQuery(archMix, unlockedQ).map((c) => c.id), ["a2"]);

console.log(`is-unlocked sanity: ${pass}/${total} passed`);
if (pass !== total) process.exit(1);
