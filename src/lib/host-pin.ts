/**
 * Pure helper for the Cmd+K "Pin every clip from this host" command.
 *
 * The palette command queries the active tab via chrome.tabs.query, but
 * the matching + count logic is host-agnostic and easy to mis-implement
 * (www-stripping, case folding, pinned-skip semantics, the singular /
 * plural label). Keeping it pure lets the unit tests cover every edge
 * without standing up a Chrome session.
 *
 * The popup wires this in two places:
 *   1. `buildPaletteActions()` calls `availableToPin(host, clips)` so the
 *      palette command can show a live count and self-hide when there's
 *      nothing to pin (no host, host has no clips, or all matching clips
 *      are already pinned).
 *   2. The run handler calls `idsToPinForHost(host, clips)` to get the
 *      exact id list to toggle.
 *
 * Both consumers see the same matching rules, so the "Pin N clips from
 * host" label always matches the eventual N pinned. No surprises.
 */

/** Minimal structural type — id + pinned bit + source.url. */
export interface HostPinnable {
  id: string;
  pinned?: boolean;
  source?: { url?: string };
}

/**
 * Normalise a host string the same way the rest of the codebase does:
 * trim, lowercase, strip leading `www.`. Returns "" for anything not a
 * non-empty string — defensive against api.tabs.query returning a tab
 * without a url, an undefined hostname, or accidental whitespace.
 */
function normaliseHost(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase().replace(/^www\./, "");
}

/**
 * Extract a host from a URL string. Mirrors `hostFrom(url)` in lib/util.ts
 * but inlined here so this module is a leaf (no cyclic import via
 * util → icons → ...). Returns "" on any parse failure (chrome:// /
 * about: / data: / file: / empty string).
 */
function hostFromUrl(u: unknown): string {
  if (typeof u !== "string" || u.length === 0) return "";
  try {
    const url = new URL(u);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Return ids of clips that match `host` AND are NOT already pinned.
 *
 * Why exclude already-pinned? The command's INTENT is "pin everything
 * from this site". Toggling pinned clips back to unpinned would
 * silently unpin clips the user already explicitly pinned — a clear
 * footgun. The non-toggle semantics also keep the label honest: "Pin 4
 * clips" pins exactly 4.
 *
 * Defensive against null/non-array input, malformed entries (missing
 * id, missing source, non-string url). Order preserved so the pin
 * loop runs in the user's daily-list order.
 *
 * Empty `host` short-circuits to `[]` — no host means no command
 * available, so the run path should never even be reached, but
 * defense-in-depth.
 */
export function idsToPinForHost<T extends HostPinnable>(
  host: string,
  clips: T[],
): string[] {
  const target = normaliseHost(host);
  if (!target) return [];
  if (!Array.isArray(clips)) return [];
  const out: string[] = [];
  for (const c of clips) {
    if (!c || typeof c.id !== "string" || c.id.length === 0) continue;
    if (c.pinned === true) continue;
    if (hostFromUrl(c.source?.url) !== target) continue;
    out.push(c.id);
  }
  return out;
}

/**
 * Predicate: how many of `clips` would be pinned by running the command
 * against `host`? Identical matching to `idsToPinForHost` — kept as a
 * separate function so the palette can call it WITHOUT allocating an
 * id array per render. Returns 0 for empty host / no clips / all
 * matching already pinned.
 */
export function availableToPin<T extends HostPinnable>(
  host: string,
  clips: T[],
): number {
  const target = normaliseHost(host);
  if (!target) return 0;
  if (!Array.isArray(clips)) return 0;
  let n = 0;
  for (const c of clips) {
    if (!c || typeof c.id !== "string" || c.id.length === 0) continue;
    if (c.pinned === true) continue;
    if (hostFromUrl(c.source?.url) !== target) continue;
    n++;
  }
  return n;
}

/**
 * Build the palette label string for the active-host pin command.
 * Three shapes:
 *
 *   - No host (chrome://, about:, empty tab): "Pin every clip from
 *     this site" — command is greyed out anyway; this is the
 *     "shouldn't see this" fallback.
 *   - Host known but nothing to pin (count=0, all-pinned or zero
 *     matches): "Pin every clip from github.com — all 3 already pinned"
 *     when we know the all-pinned reason; otherwise "...no captures
 *     yet". Caller passes the matched-vs-pinnable counts so we can
 *     pick the right hint.
 *   - Host known + N pinnable: "Pin 4 clips from github.com" — singular
 *     handled too.
 *
 * Pure: no DOM, no localisation. The popup decides which of these to
 * surface based on the count + host shape.
 */
export interface PinFromHostLabel {
  label: string;
  hint: string;
  /** True when the command should be available (pinnable > 0). */
  available: boolean;
}

export function formatPinFromHostLabel(opts: {
  host: string;
  matched: number;
  pinnable: number;
}): PinFromHostLabel {
  const host = normaliseHost(opts.host);
  const matched = Math.max(0, Math.floor(Number(opts.matched) || 0));
  const pinnable = Math.max(0, Math.floor(Number(opts.pinnable) || 0));
  if (!host) {
    return {
      label: "Pin every clip from this site",
      hint: "No site context — open this on a normal http(s) tab",
      available: false,
    };
  }
  if (pinnable === 0) {
    if (matched === 0) {
      return {
        label: `Pin every clip from ${host}`,
        hint: "No clips captured from this site yet",
        available: false,
      };
    }
    // matched > 0 but nothing pinnable → already all pinned.
    return {
      label: `Pin every clip from ${host}`,
      hint: `All ${matched} already pinned`,
      available: false,
    };
  }
  const noun = pinnable === 1 ? "clip" : "clips";
  return {
    label: `Pin ${pinnable} ${noun} from ${host}`,
    hint: `One-shot triage — captures stay sorted to the top of the daily list`,
    available: true,
  };
}

/**
 * Companion: count how many matching clips exist regardless of pin
 * state. Used to drive the "all N already pinned" hint vs the "no
 * captures yet" hint in `formatPinFromHostLabel`. Cheap (single pass)
 * and shares the same matching rules so the label is internally
 * consistent.
 */
export function matchedClipsForHost<T extends HostPinnable>(
  host: string,
  clips: T[],
): number {
  const target = normaliseHost(host);
  if (!target) return 0;
  if (!Array.isArray(clips)) return 0;
  let n = 0;
  for (const c of clips) {
    if (!c || typeof c.id !== "string" || c.id.length === 0) continue;
    if (hostFromUrl(c.source?.url) !== target) continue;
    n++;
  }
  return n;
}
