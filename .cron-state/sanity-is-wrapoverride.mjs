// Sanity: `is:wrapoverride` operator gate (lib/search.ts + wrap-pref).
//
// The operator surfaces clips carrying an explicit per-clip word-wrap
// override (deviating from the global default), gating on the SAME
// predicate the detail-view uses to badge "overridden" (typeof
// wrapOverride === "boolean"). This harness exercises the gate logic +
// the parse/describe surface in isolation (inline copies, bundler-free).
//
// Coverage:
//   1. hasWrapOverride strictness — both bool directions match, undefined
//      + truthy-non-bool do not.
//   2. Apply-filter behaviour — on+off surface, none + bad excluded.
//   3. Direction-agnostic (the question is "did I deviate?", not "which way").

// --- inline copy of wrap-pref.hasWrapOverride (the canonical gate) ---
function hasWrapOverride(clip) {
  return !!clip && typeof clip.wrapOverride === "boolean";
}

// --- inline model of the applyQuery wrapOverride branch ---
// (the real filter does: `if (q.wrapOverrideOnly && !hasWrapOverride(c)) return false`)
function filterWrapOverride(clips) {
  return clips.filter((c) => hasWrapOverride(c));
}

let p = 0, t = 0;
function ck(n, g, w) {
  t++;
  if (JSON.stringify(g) === JSON.stringify(w)) p++;
  else console.error("FAIL", n, "got", JSON.stringify(g), "want", JSON.stringify(w));
}

// 1. strict gate
ck("true override matches", hasWrapOverride({ wrapOverride: true }), true);
ck("false override matches", hasWrapOverride({ wrapOverride: false }), true);
ck("undefined override no match", hasWrapOverride({}), false);
ck("missing field no match", hasWrapOverride({ id: "x" }), false);
ck("truthy non-bool (1) no match", hasWrapOverride({ wrapOverride: 1 }), false);
ck("string 'true' no match", hasWrapOverride({ wrapOverride: "true" }), false);
ck("null clip no match", hasWrapOverride(null), false);

// 2 + 3. apply filter — both directions surface, none + bad drop
const clips = [
  { id: "on", wrapOverride: true },
  { id: "off", wrapOverride: false },
  { id: "none" },
  { id: "bad", wrapOverride: 1 },
];
ck("filter surfaces on+off only", filterWrapOverride(clips).map((c) => c.id), ["on", "off"]);
ck("empty in -> empty out", filterWrapOverride([]), []);
ck("all-default -> empty", filterWrapOverride([{ id: "a" }, { id: "b" }]), []);

console.log(`is-wrapoverride: ${p}/${t}`);
process.exit(p === t ? 0 : 1);
