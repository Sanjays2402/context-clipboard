// Sanity: lib/lang-override.ts (per-clip force-language for code tinting).
// Inline copies so this runs bundler-free. Covers the three-state
// effectiveLang precedence, store/read normalizers, round-trips, labels.

const OVERRIDE_NONE = "none";
const OVERRIDE_AUTO = "auto";
const LANG_OPTIONS = [
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "jsx", label: "JSX / TSX" },
  { value: "json", label: "JSON" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "python", label: "Python" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "java", label: "Java" },
  { value: "bash", label: "Shell / Bash" },
  { value: "sql", label: "SQL" },
  { value: "yaml", label: "YAML" },
  { value: "toml", label: "TOML" },
  { value: "ini", label: "INI" },
  { value: "lua", label: "Lua" },
  { value: "markdown", label: "Markdown" },
  { value: "diff", label: "Diff" },
];
const KNOWN = new Set(LANG_OPTIONS.map((o) => o.value));
function isKnownLang(lang) {
  return typeof lang === "string" && KNOWN.has(lang);
}
function langLabel(lang) {
  if (typeof lang !== "string") return "";
  const hit = LANG_OPTIONS.find((o) => o.value === lang);
  return hit ? hit.label : lang;
}
function effectiveLang(override, detected) {
  const det = typeof detected === "string" && detected !== "" ? detected : undefined;
  if (override === OVERRIDE_NONE) return { lang: undefined, tint: false, overridden: true };
  if (typeof override === "string" && KNOWN.has(override)) return { lang: override, tint: true, overridden: true };
  if (det) return { lang: det, tint: true, overridden: false };
  return { lang: undefined, tint: false, overridden: false };
}
function normalizeLangChoice(raw) {
  if (raw === OVERRIDE_NONE) return OVERRIDE_NONE;
  if (typeof raw === "string" && KNOWN.has(raw)) return raw;
  return undefined;
}
function selectValueFor(override) {
  if (override === OVERRIDE_NONE) return OVERRIDE_NONE;
  if (typeof override === "string" && KNOWN.has(override)) return override;
  return OVERRIDE_AUTO;
}

let p = 0, t = 0;
function ck(n, g, w) {
  t++;
  if (JSON.stringify(g) === JSON.stringify(w)) p++;
  else console.error("FAIL", n, "got", JSON.stringify(g), "want", JSON.stringify(w));
}

ck("override wins over detected", effectiveLang("rust", "typescript"), { lang: "rust", tint: true, overridden: true });
ck("none forces off", effectiveLang("none", "typescript"), { lang: undefined, tint: false, overridden: true });
ck("undefined follows detected", effectiveLang(undefined, "go"), { lang: "go", tint: true, overridden: false });
ck("undefined + no detect -> no tint", effectiveLang(undefined, undefined), { lang: undefined, tint: false, overridden: false });
ck("auto sentinel follows detect", effectiveLang("auto", "python"), { lang: "python", tint: true, overridden: false });
ck("garbage override follows detect", effectiveLang("zzz", "css"), { lang: "css", tint: true, overridden: false });
ck("override == detected still overridden", effectiveLang("go", "go"), { lang: "go", tint: true, overridden: true });
ck("empty detected treated as none", effectiveLang(undefined, ""), { lang: undefined, tint: false, overridden: false });

ck("auto -> undefined", normalizeLangChoice("auto"), undefined);
ck("none -> none", normalizeLangChoice("none"), "none");
ck("known -> itself", normalizeLangChoice("rust"), "rust");
ck("garbage -> undefined", normalizeLangChoice("nope"), undefined);
ck("null -> undefined", normalizeLangChoice(null), undefined);

ck("undefined -> auto", selectValueFor(undefined), "auto");
ck("none -> none", selectValueFor("none"), "none");
ck("rust -> rust", selectValueFor("rust"), "rust");
ck("garbage stored -> auto", selectValueFor("xx"), "auto");

ck("roundtrip rust", selectValueFor(normalizeLangChoice("rust")), "rust");
ck("roundtrip auto", selectValueFor(normalizeLangChoice("auto")), "auto");
ck("roundtrip none", selectValueFor(normalizeLangChoice("none")), "none");

ck("label rust", langLabel("rust"), "Rust");
ck("label unknown falls back", langLabel("xx"), "xx");
ck("isKnown rust", isKnownLang("rust"), true);
ck("isKnown none not a lang", isKnownLang("none"), false);
ck("options nonempty", LANG_OPTIONS.length > 10, true);

console.log(`lang-override: ${p}/${t}`);
process.exit(p === t ? 0 : 1);
