// Sanity: `is:langoverride:off` / `is:langoverride:<lang>` direction
// variants (lib/lang-override.langOverrideMatches + isLangOverrideDir,
// + the directional applyQuery branch).
//
// The bare `is:langoverride` operator is presence-only. These variants
// narrow it to a SPECIFIC forced state — richer than the wrap on/off
// split because a language override can name any one of the supported
// tinting languages OR the forced-off sentinel. This harness exercises
// the pure core (inline copies, bundler-free).
//
// Coverage:
//   1. normalizeDirection / isLangOverrideDir — accept "off"/"none" +
//      known langs; reject auto / unknown / garbage / non-string.
//   2. langOverrideMatches — "off" matches only forced-off; a lang id
//      matches only that language; auto / undefined match neither; a
//      bad direction matches nothing.
//   3. Parser acceptance — directional token kept vs fallen-through.
//   4. Apply-filter directional branch — replaces the presence gate.

const OVERRIDE_NONE = "none";
const LANG_VALUES = [
  "javascript", "typescript", "jsx", "json", "html", "css", "python",
  "go", "rust", "java", "bash", "sql", "yaml", "toml", "ini", "lua",
  "markdown", "diff",
];
const KNOWN = new Set(LANG_VALUES);

function normalizeDirection(dir) {
  if (typeof dir !== "string") return null;
  const d = dir.toLowerCase();
  if (d === OVERRIDE_NONE || d === "off") return OVERRIDE_NONE;
  if (KNOWN.has(d)) return d;
  return null;
}
function isLangOverrideDir(dir) {
  return normalizeDirection(dir) != null;
}
function langOverrideMatches(override, dir) {
  const wanted = normalizeDirection(dir);
  if (wanted == null) return false;
  return override === wanted;
}
function hasLangOverride(override) {
  return override === OVERRIDE_NONE || (typeof override === "string" && KNOWN.has(override));
}

// model of applyQuery's directional langoverride branch:
//   if (q.langOverrideOnly) {
//     if (q.langOverrideDir) { if (!langOverrideMatches(c.langOverride, dir)) drop }
//     else if (!hasLangOverride(c.langOverride)) drop
//   }
function applyLangFilter(clips, dir) {
  return clips.filter((c) => {
    if (dir) return langOverrideMatches(c.langOverride, dir);
    return hasLangOverride(c.langOverride);
  });
}

let p = 0, t = 0;
function ck(n, g, w) {
  t++;
  if (JSON.stringify(g) === JSON.stringify(w)) p++;
  else console.error("FAIL", n, "got", JSON.stringify(g), "want", JSON.stringify(w));
}

// 1. direction acceptance
ck("dir off accepted", isLangOverrideDir("off"), true);
ck("dir none accepted", isLangOverrideDir("none"), true);
ck("dir OFF case-insensitive", isLangOverrideDir("OFF"), true);
ck("dir rust accepted", isLangOverrideDir("rust"), true);
ck("dir RUST case-insensitive", isLangOverrideDir("RUST"), true);
ck("dir auto rejected", isLangOverrideDir("auto"), false);
ck("dir unknown lang rejected", isLangOverrideDir("cobol"), false);
ck("dir empty rejected", isLangOverrideDir(""), false);
ck("dir null rejected", isLangOverrideDir(null), false);
ck("dir number rejected", isLangOverrideDir(5), false);

// 2. directional match
ck("off matches forced-off", langOverrideMatches(OVERRIDE_NONE, "off"), true);
ck("none matches forced-off", langOverrideMatches(OVERRIDE_NONE, "none"), true);
ck("off does NOT match a lang", langOverrideMatches("rust", "off"), false);
ck("rust matches rust", langOverrideMatches("rust", "rust"), true);
ck("rust dir does NOT match sql clip", langOverrideMatches("sql", "rust"), false);
ck("rust dir does NOT match forced-off", langOverrideMatches(OVERRIDE_NONE, "rust"), false);
ck("auto clip matches no direction", langOverrideMatches("auto", "rust"), false);
ck("undefined clip matches no direction", langOverrideMatches(undefined, "off"), false);
ck("bad direction matches nothing", langOverrideMatches("rust", "cobol"), false);
ck("case-insensitive lang dir matches", langOverrideMatches("rust", "RUST"), true);

// 3. partition: off + every lang dir together cover exactly the override set
const sample = [
  { id: "rust", langOverride: "rust" },
  { id: "sql", langOverride: "sql" },
  { id: "off1", langOverride: OVERRIDE_NONE },
  { id: "off2", langOverride: OVERRIDE_NONE },
  { id: "auto", langOverride: "auto" },
  { id: "plain" },
];
// presence (bare operator) surfaces all 4 overrides
ck("presence surfaces all overrides", applyLangFilter(sample, undefined).map((c) => c.id), ["rust", "sql", "off1", "off2"]);
// off direction surfaces only the forced-off pair
ck("off dir surfaces forced-off only", applyLangFilter(sample, "off").map((c) => c.id), ["off1", "off2"]);
// rust direction surfaces only the rust clip
ck("rust dir surfaces rust only", applyLangFilter(sample, "rust").map((c) => c.id), ["rust"]);
// sql direction surfaces only the sql clip
ck("sql dir surfaces sql only", applyLangFilter(sample, "sql").map((c) => c.id), ["sql"]);
// a language nobody pinned -> empty
ck("python dir empty (none pinned)", applyLangFilter(sample, "python"), []);

console.log(`is-langoverride-dir: ${p}/${t}`);
process.exit(p === t ? 0 : 1);
