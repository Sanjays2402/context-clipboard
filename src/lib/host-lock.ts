/**
 * Pure helper for the Cmd+K "Lock every clip from this host" command.
 *
 * Companion to `host-pin.ts` (shipped last tick) with identical
 * shape — same active-tab anchoring, same www-strip / case-insensitive
 * matching, same defensive guards. The only meaningful difference is
 * the verb (lock vs pin) and the SOURCE truth bit (`locked === true`
 * vs `pinned === true`). Keeping the modules separate (instead of
 * generalising over a "bit key") makes the call sites read clearly
 * and lets each have its own strict-bit semantics.
 *
 * Use case: "this site has irreplaceable snippets, mark every
 * captured clip with the ask-before-delete gate in one shot."
 * Classic example — a partner portal with one-off API tokens you've
 * pulled out by hand, or a draft doc with phrasings you can't
 * recover from memory. Pin = "keep on top of the list"; Lock = "ask
 * before I throw it away". Orthogonal intents, sometimes you want
 * both.
 *
 * The popup wires this in three places:
 *   1. `buildPaletteActions()` calls `availableToLockHost(host, clips)`
 *      so the palette can show a live count + self-hide when there's
 *      nothing to lock (no host, host has no clips, or all already
 *      locked).
 *   2. The run handler calls `idsToLockForHost(host, clips)` to get
 *      the exact id list to toggle.
 *   3. The same active-tab refresh path that drives pin-from-host
 *      caches matchedClipsForHost / availableToLockHost in module
 *      scope so render() doesn't hit IDB twice.
 *
 * Both consumers see the same matching rules so the "Lock N clips
 * from host" label always matches the eventual N locked. No
 * surprises.
 */

/** Minimal structural type — id + locked bit + source.url. */
export interface HostLockable {
  id: string;
  locked?: boolean;
  source?: { url?: string };
}

function normaliseHost(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase().replace(/^www\./, "");
}

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
 * Return ids of clips that match `host` AND are NOT already locked.
 *
 * Why exclude already-locked? The command's INTENT is "lock everything
 * from this site". Toggling locked clips back to unlocked would
 * silently unlock clips the user already explicitly locked — a clear
 * footgun. The non-toggle semantics keep the label honest: "Lock 4
 * clips" locks exactly 4.
 *
 * Strict `=== true` for the skip gate so a truthy non-boolean (a
 * stray `locked: 1` from an older import) WOULD get cleaned up to
 * a proper boolean on the next lock pass — same cleanup contract
 * as bulk-lock.decideBulkLockIntent.
 *
 * Defensive against null/non-array input, malformed entries (missing
 * id, missing source, non-string url). Order preserved so the lock
 * loop runs in the user's daily-list order.
 */
export function idsToLockForHost<T extends HostLockable>(
  host: string,
  clips: T[],
): string[] {
  const target = normaliseHost(host);
  if (!target) return [];
  if (!Array.isArray(clips)) return [];
  const out: string[] = [];
  for (const c of clips) {
    if (!c || typeof c.id !== "string" || c.id.length === 0) continue;
    if (c.locked === true) continue;
    if (hostFromUrl(c.source?.url) !== target) continue;
    out.push(c.id);
  }
  return out;
}

/**
 * Predicate: how many of `clips` would be locked by running the command
 * against `host`? Identical matching to `idsToLockForHost` — kept as a
 * separate function so the palette can call it WITHOUT allocating an
 * id array per render.
 */
export function availableToLockHost<T extends HostLockable>(
  host: string,
  clips: T[],
): number {
  const target = normaliseHost(host);
  if (!target) return 0;
  if (!Array.isArray(clips)) return 0;
  let n = 0;
  for (const c of clips) {
    if (!c || typeof c.id !== "string" || c.id.length === 0) continue;
    if (c.locked === true) continue;
    if (hostFromUrl(c.source?.url) !== target) continue;
    n++;
  }
  return n;
}

/**
 * Companion: count how many matching clips exist regardless of lock
 * state. Used to drive the "all N already locked" hint vs the "no
 * captures yet" hint. Shares matching rules so labels stay internally
 * consistent.
 */
export function matchedClipsForHostLock<T extends HostLockable>(
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

/**
 * Build the palette label string for the active-host lock command.
 * Mirrors `formatPinFromHostLabel`'s 4-shape matrix exactly so users
 * who learned the pin-from-host UX recognise the lock variant on
 * sight. Differences are vocabulary only:
 *
 *   - No host: "Lock every clip from this site" (greyed)
 *   - Host known + 0 matched: "Lock every clip from github.com" +
 *     "No clips captured from this site yet" (greyed)
 *   - Host known + matched but 0 lockable: "Lock every clip from
 *     github.com" + "All 5 already locked" (greyed)
 *   - Host known + N lockable: "Lock N clips from github.com" +
 *     triage hint (available)
 *
 * Pure: no DOM, no localisation. The popup decides which of these to
 * surface based on the count + host shape.
 */
export interface LockFromHostLabel {
  label: string;
  hint: string;
  /** True when the command should be available (lockable > 0). */
  available: boolean;
}

export function formatLockFromHostLabel(opts: {
  host: string;
  matched: number;
  lockable: number;
}): LockFromHostLabel {
  const host = normaliseHost(opts.host);
  const matched = Math.max(0, Math.floor(Number(opts.matched) || 0));
  const lockable = Math.max(0, Math.floor(Number(opts.lockable) || 0));
  if (!host) {
    return {
      label: "Lock every clip from this site",
      hint: "No site context — open this on a normal http(s) tab",
      available: false,
    };
  }
  if (lockable === 0) {
    if (matched === 0) {
      return {
        label: `Lock every clip from ${host}`,
        hint: "No clips captured from this site yet",
        available: false,
      };
    }
    return {
      label: `Lock every clip from ${host}`,
      hint: `All ${matched} already locked`,
      available: false,
    };
  }
  const noun = lockable === 1 ? "clip" : "clips";
  return {
    label: `Lock ${lockable} ${noun} from ${host}`,
    hint: `Ask-before-deleting gate for every capture — orthogonal to pin`,
    available: true,
  };
}
