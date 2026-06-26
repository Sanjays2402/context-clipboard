// Sanity: `is:langoverride` operator gate (lib/search + lang-override).
//
// The operator surfaces clips carrying an explicit per-clip force-
// language override (a pinned syntax-tinting language, or the "none"
// forced-off sentinel), gating on the SAME hasLangOverride predicate the
// detail control uses to decide whether the dropdown reads "Auto" vs a
// pinned choice. This harness exercises the gate + the apply-filter
// branch in isolation (inline copies, bundler-free).
//
// Coverage:
//   1. hasLangOverride strictness — known lang + "none" sentinel match;
//      undefined / "auto" / empty / unknown / non-string do not.
//   2. Apply-filter behaviour — pinned + forced-off surface; auto excluded.
//   3. Direction-agnostic (forced-to-X and forced-off both match).

const OVERRIDE_NONE = "none";
const LANG_VALUES = [
  "javascript", "typescript", "jsx", "json", "html", "css", "python",
  "go", "rust", "java", "bash", "sql", "yaml", "toml", "ini", "lua",
  "markdown", "diff",
];
const KNOWN = new Set(LANG_VALUES);

function hasLangOverride(override) {
  return override === OVERRIDE_NONE || (typeof override === "string" && KNOWN.has(override));
}
// model of: `if (q.langOverrideOnly && !hasLangOverride(c.langOverride)) return false`
function filterLangOverride(clips) {
  return clips.filter((c) => hasLangOverride(c.langOverride));
}

let p = 0, t = 0;
function ck(n, g, w) {
  t++;
  if (JSON.stringify(g) === JSON.stringify(w)) p++;
  else console.error("FAIL", n, "got", JSON.stringify(g), "want", JSON.stringify(w));
}

// 1. strict gate
ck("rust override matches", hasLangOverride("rust"), true);
ck("sql override matches", hasLangOverride("sql"), true);
ck("'none' sentinel matches", hasLangOverride(OVERRIDE_NONE), true);
ck("undefined no match", hasLangOverride(undefined), false);
ck("'auto' no match", hasLangOverride("auto"), false);
ck("empty string no match", hasLangOverride(""), false);
ck("unknown lang no match", hasLangOverride("cobol"), false);
ck("number no match", hasLangOverride(1), false);
ck("null no match", hasLangOverride(null), false);

// 2 + 3. apply filter — pinned-lang + forced-off surface; auto + bad drop
const clips = [
  { id: "rust", langOverride: "rust" },
  { id: "off", langOverride: OVERRIDE_NONE },
  { id: "auto", langOverride: "auto" },
  { id: "none-field" },
  { id: "bad", langOverride: "cobol" },
];
ck(
  "filter surfaces pinned + forced-off only",
  filterLangOverride(clips).map((c) => c.id),
  ["rust", "off"],
);
ck("empty in -> empty out", filterLangOverride([]), []);
ck("all-auto -> empty", filterLangOverride([{ id: "a" }, { id: "b", langOverride: "auto" }]), []);

console.log(`is-langoverride: ${p}/${t}`);
process.exit(p === t ? 0 : 1);
