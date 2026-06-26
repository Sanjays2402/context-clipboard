/**
 * Per-clip "force language" resolution for the detail-body code tinting.
 *
 * The detail view tints code clips using lib/util.detectCodeLang to
 * guess the language. That heuristic is deliberately conservative — it
 * refuses to guess when it isn't confident — so two things happen in
 * practice:
 *   - it sometimes guesses WRONG (a Rust snippet that reads as
 *     TypeScript, a templating fragment read as HTML), and
 *   - it sometimes can't classify a short clip at all, leaving the body
 *     a flat grey wall when the user knows perfectly well it's YAML.
 *
 * This module is the pure resolver + option model behind a detail-view
 * "force language" control: a dropdown that lets the user pin the
 * language by hand (or explicitly say "this isn't code") for one clip,
 * overriding the auto-detection. No DOM, no IDB — the popup renders the
 * <select> from LANG_OPTIONS, persists the choice on the clip's
 * `langOverride` field, and asks `effectiveLang` what to actually tint
 * with. Keeping the precedence + the canonical language list here means
 * the resolution rule lives in exactly one place and is exercised
 * headless.
 *
 * Design decisions:
 *   - Three-state override, matching the wrap-override pattern:
 *       * a real language id (e.g. "rust")  -> force that language
 *       * the sentinel OVERRIDE_NONE ("none") -> force tinting OFF
 *         (the clip detectCodeLang false-positived as code but the
 *         user knows it's prose / a plain paste)
 *       * undefined / "auto" / unknown        -> fall through to the
 *         supplied auto-detected language (the default)
 *     The explicit-off state matters: without it, a user stuck with a
 *     mis-detected prose clip could only swap ONE wrong tint for
 *     another, never turn it off.
 *   - The language list is the set lib/code-highlight actually has a
 *     spec for (its specFor switch) PLUS the common aliases
 *     detectCodeLang emits ("javascript", "typescript", etc.). A
 *     language the highlighter doesn't special-case still tints via the
 *     C-family fallback, which is correct — forcing "java" on a Java
 *     clip is better than no tint even though specFor folds it into the
 *     default branch.
 *   - `effectiveLang` returns BOTH the language to tint with AND whether
 *     to tint at all (`tint: false` for the explicit-off case and for a
 *     clip with no override and no detected language), so the caller has
 *     a single source of truth for the `.code-tinted` class + the
 *     highlightCode call.
 *   - Defensive: a nullish/garbage override coerces to "follow auto";
 *     the popup can pass the raw stored value straight in.
 */

/** Sentinel override meaning "force tinting OFF for this clip". */
export const OVERRIDE_NONE = "none";
/** Sentinel option value meaning "follow auto-detection" (the default). */
export const OVERRIDE_AUTO = "auto";

/**
 * The languages the user can force, in menu order. Values are the ids
 * lib/code-highlight + detectCodeLang use; labels are the human names.
 * This is the canonical list the detail <select> renders from.
 */
export const LANG_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
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

/** Fast membership set for validating a forced language id. */
const KNOWN = new Set(LANG_OPTIONS.map((o) => o.value));

/** True when `lang` is a language id the force-control offers. */
export function isKnownLang(lang: string | null | undefined): boolean {
  return typeof lang === "string" && KNOWN.has(lang);
}

/**
 * True when a clip carries an explicit per-clip force-language override
 * (i.e. it is NOT following auto-detection). Strict gate: the stored
 * `langOverride` must be a non-empty string — either a known language
 * id OR the OVERRIDE_NONE ("none") sentinel (forced-off counts as an
 * override; the user pinned it on purpose). A clip following
 * auto-detection (undefined / empty / non-string) returns false.
 *
 * Mirrors the read path: `selectValueFor` shows the dropdown as "Auto"
 * for exactly the values this returns false for, so the `is:langoverride`
 * search filter and the detail control's "is this pinned?" state can
 * never disagree.
 */
export function hasLangOverride(override: string | null | undefined): boolean {
  return (
    override === OVERRIDE_NONE ||
    (typeof override === "string" && KNOWN.has(override))
  );
}

/** Human label for a language id (falls back to the raw id). */
export function langLabel(lang: string | null | undefined): string {
  if (typeof lang !== "string") return "";
  const hit = LANG_OPTIONS.find((o) => o.value === lang);
  return hit ? hit.label : lang;
}

export interface EffectiveLang {
  /** The language id to pass to highlightCode (undefined when not tinting). */
  lang: string | undefined;
  /** Whether the body should be tinted at all. */
  tint: boolean;
  /** True when an explicit per-clip override is steering the result. */
  overridden: boolean;
}

/**
 * Resolve what the detail body should tint with, given the user's
 * per-clip `override` (the stored `langOverride` field) and the
 * auto-`detected` language (whatever detectCodeLang returned, possibly
 * undefined).
 *
 * Precedence:
 *   1. override === OVERRIDE_NONE      -> { tint: false } (force off)
 *   2. override is a known language    -> tint that language
 *   3. otherwise (auto / undefined / garbage):
 *        detected language  -> tint it
 *        no detected lang   -> { tint: false }
 *
 * `overridden` is true in cases 1 and 2 so the caller can badge the
 * control as "forced" (and offer a reset). An override that equals the
 * detected language still counts as overridden — the user pinned it on
 * purpose, and it should survive a future change to the detector.
 */
export function effectiveLang(
  override: string | null | undefined,
  detected: string | null | undefined,
): EffectiveLang {
  const det =
    typeof detected === "string" && detected !== "" ? detected : undefined;
  if (override === OVERRIDE_NONE) {
    return { lang: undefined, tint: false, overridden: true };
  }
  if (typeof override === "string" && KNOWN.has(override)) {
    return { lang: override, tint: true, overridden: true };
  }
  // No usable override -> follow auto-detection.
  if (det) return { lang: det, tint: true, overridden: false };
  return { lang: undefined, tint: false, overridden: false };
}

/**
 * Coerce a raw <select> value into the value to STORE on the clip:
 *   - OVERRIDE_AUTO            -> undefined (clear the override; follow auto)
 *   - OVERRIDE_NONE            -> "none" (force off)
 *   - a known language id      -> that id
 *   - anything else            -> undefined (defensive: treat as auto)
 *
 * The popup hands the result to db.setLangOverride, whose undefined case
 * deletes the field so a cleared override doesn't linger in the export.
 */
export function normalizeLangChoice(raw: string | null | undefined): string | undefined {
  if (raw === OVERRIDE_NONE) return OVERRIDE_NONE;
  if (typeof raw === "string" && KNOWN.has(raw)) return raw;
  return undefined; // OVERRIDE_AUTO, empty, or anything unrecognised
}

/**
 * The <select> value that should be SELECTED for a given stored
 * override — the inverse of normalizeLangChoice for the read path.
 * Maps undefined back to OVERRIDE_AUTO so the dropdown shows "Auto".
 */
export function selectValueFor(override: string | null | undefined): string {
  if (override === OVERRIDE_NONE) return OVERRIDE_NONE;
  if (typeof override === "string" && KNOWN.has(override)) return override;
  return OVERRIDE_AUTO;
}

/**
 * Tooltip for the force-language control, reflecting whether the clip
 * is following auto-detection or pinned to a forced choice.
 */
export function langControlTitle(
  override: string | null | undefined,
  detected: string | null | undefined,
): string {
  if (override === OVERRIDE_NONE) {
    return "Syntax tinting forced off for this clip \u2014 pick a language to tint, or Auto to detect";
  }
  if (typeof override === "string" && KNOWN.has(override)) {
    return `Forced to ${langLabel(override)} for this clip \u2014 choose Auto to detect again`;
  }
  const det =
    typeof detected === "string" && detected !== "" ? detected : undefined;
  return det
    ? `Auto-detected ${langLabel(det)} \u2014 override the language for this clip`
    : "No code language detected \u2014 force one for this clip";
}
