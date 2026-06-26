// Sanity: `is:wrapoverride:on` / `is:wrapoverride:off` direction variants
// (lib/search.ts parser + applyQuery + lib/wrap-pref.wrapOverrideMatches).
//
// The bare `is:wrapoverride` operator is presence-only. These variants
// narrow it to a SPECIFIC forced state — "show me everything I forced to
// NOWRAP" (the wide TSV/log clips pinned to scroll). This harness models
// the parser branch + the directional apply gate (inline copies,
// bundler-free).
//
// Coverage:
//   1. wrapOverrideMatches — "on" matches true only, "off" matches false
//      only; undefined / non-bool / null match neither direction.
//   2. Parser branch — is:wrapoverride sets presence; :on / :off set
//      presence AND direction; the directional form still satisfies the
//      presence flag (so describe + presence readers see the filter).
//   3. Apply gate — directional filter REPLACES presence: :off drops the
//      forced-on clips and the default clips; :on drops forced-off; bare
//      keeps both.

// --- inline copy of wrap-pref.wrapOverrideMatches ---
function wrapOverrideMatches(clip, dir) {
  if (!clip || typeof clip.wrapOverride !== "boolean") return false;
  return dir === "on" ? clip.wrapOverride === true : clip.wrapOverride === false;
}
function hasWrapOverride(clip) {
  return !!clip && typeof clip.wrapOverride === "boolean";
}

// --- inline model of the parser `is:` branch for wrapoverride ---
function parseWrap(v) {
  const out = { wrapOverrideOnly: false, wrapOverrideDir: undefined };
  if (v === "wrapoverride") out.wrapOverrideOnly = true;
  else if (v === "wrapoverride:on" || v === "wrapoverride:off") {
    out.wrapOverrideOnly = true;
    out.wrapOverrideDir = v.endsWith(":on") ? "on" : "off";
  }
  return out;
}

// --- inline model of the applyQuery gate ---
// if (q.wrapOverrideOnly) { if (dir) keep matches(dir); else keep presence }
function applyWrap(clips, q) {
  return clips.filter((c) => {
    if (!q.wrapOverrideOnly) return true;
    if (q.wrapOverrideDir) return wrapOverrideMatches(c, q.wrapOverrideDir);
    return hasWrapOverride(c);
  });
}

let p = 0, t = 0;
function ck(n, g, w) {
  t++;
  if (JSON.stringify(g) === JSON.stringify(w)) p++;
  else console.error("FAIL", n, "got", JSON.stringify(g), "want", JSON.stringify(w));
}

// 1. directional predicate
ck("on matches forced-on", wrapOverrideMatches({ wrapOverride: true }, "on"), true);
ck("on rejects forced-off", wrapOverrideMatches({ wrapOverride: false }, "on"), false);
ck("off matches forced-off", wrapOverrideMatches({ wrapOverride: false }, "off"), true);
ck("off rejects forced-on", wrapOverrideMatches({ wrapOverride: true }, "off"), false);
ck("default matches neither (on)", wrapOverrideMatches({}, "on"), false);
ck("default matches neither (off)", wrapOverrideMatches({}, "off"), false);
ck("non-bool matches neither", wrapOverrideMatches({ wrapOverride: 1 }, "off"), false);
ck("null clip no match", wrapOverrideMatches(null, "on"), false);

// 2. parser branch
ck("bare sets presence only", parseWrap("wrapoverride"), { wrapOverrideOnly: true, wrapOverrideDir: undefined });
ck("on sets presence + dir on", parseWrap("wrapoverride:on"), { wrapOverrideOnly: true, wrapOverrideDir: "on" });
ck("off sets presence + dir off", parseWrap("wrapoverride:off"), { wrapOverrideOnly: true, wrapOverrideDir: "off" });

// 3. apply gate over a mixed list
const clips = [
  { id: "on", wrapOverride: true },
  { id: "off", wrapOverride: false },
  { id: "default" },
  { id: "bad", wrapOverride: "x" },
];
ck("bare keeps both forced", applyWrap(clips, parseWrap("wrapoverride")).map((c) => c.id), ["on", "off"]);
ck("dir off keeps forced-off only", applyWrap(clips, parseWrap("wrapoverride:off")).map((c) => c.id), ["off"]);
ck("dir on keeps forced-on only", applyWrap(clips, parseWrap("wrapoverride:on")).map((c) => c.id), ["on"]);
// on + off partition the forced set (their union == bare, intersection empty)
{
  const on = applyWrap(clips, parseWrap("wrapoverride:on")).map((c) => c.id);
  const off = applyWrap(clips, parseWrap("wrapoverride:off")).map((c) => c.id);
  ck("on+off union == bare forced set", [...on, ...off].sort(), ["off", "on"]);
  ck("on/off disjoint", on.filter((id) => off.includes(id)), []);
}

console.log(`is-wrapoverride-dir: ${p}/${t}`);
process.exit(p === t ? 0 : 1);
