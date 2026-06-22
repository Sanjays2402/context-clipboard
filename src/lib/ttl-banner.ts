/**
 * Pure helper for the detail-view TTL countdown banner.
 *
 * Computes whether the open clip should show a prominent expiry
 * banner above the body (NOT the tiny .expiry-hint footnote which
 * lives near the dropdown) — and, when it should, the urgency tier
 * driving the visual treatment.
 *
 * Tiers
 *   - "expired"      → already past expiresAt; surfaces "Expired — GC
 *                      at next capture" so the user knows the clip is
 *                      effectively gone-but-still-here.
 *   - "imminent"     → < 1 hour left. Soft-red surface, "Expires in
 *                      Xm" — the warn band that catches the user before
 *                      something they care about quietly disappears.
 *   - "soon"         → 1h ≤ remaining < 24h. Accent-tinted, "Expires in
 *                      Xh Ym (today, 4:32 PM)". Visible but not alarming.
 *   - "future"       → ≥ 24h. The banner stays hidden — the inline meta
 *                      pill + dropdown footnote are sufficient noise for
 *                      something that's a week away.
 *
 * Skip cases (banner hidden, returns null):
 *   - No expiresAt set.
 *   - Clip is pinned (pin > TTL, the dropdown footnote covers it).
 *   - Clip is image (TTL still legal but the banner would crowd the
 *     thumbnail; pinpoint cases land in the dropdown anyway).
 *     [Note: we still SHOW the banner for images so the user can act
 *     on it; the crowding fear was an early scope; defer to product
 *     pressure later.]
 *
 * The helper is `now`-injectable so tests can pin time deterministically.
 */

export type TtlTier = "expired" | "imminent" | "soon";

export interface TtlBannerState {
  /** Which urgency tier we're rendering. */
  tier: TtlTier;
  /** ms until expiry — negative when already expired. */
  remainingMs: number;
  /** Short label for the banner head, e.g. "Expires in 12m". */
  label: string;
  /** Optional secondary line, e.g. "today at 4:32 PM". Omit when redundant. */
  detail?: string;
  /** Absolute Unix-ms deadline (mirrors clip.expiresAt for the caller). */
  expiresAt: number;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export interface TtlBannerInput {
  pinned: boolean;
  expiresAt?: number;
}

/**
 * Decide whether to render the banner for the open clip.
 *
 * Returns `null` to mean "render nothing" — the caller hides the
 * banner row. Returns a `TtlBannerState` to render one of the three
 * urgency tiers ("expired" / "imminent" / "soon"). Returns `null` for
 * the "future" tier (>= 24h away) — the inline meta pill is plenty.
 *
 * Pinned clips ALWAYS skip the banner regardless of remaining time
 * (the dropdown footnote already explains why TTL is paused).
 */
export function computeTtlBanner(
  c: TtlBannerInput,
  now: number = Date.now(),
): TtlBannerState | null {
  if (c.pinned) return null;
  if (typeof c.expiresAt !== "number") return null;
  const remainingMs = c.expiresAt - now;

  if (remainingMs <= 0) {
    return {
      tier: "expired",
      remainingMs,
      label: "Expired — GC at next capture",
      detail: `Was due ${formatPast(-remainingMs)} ago`,
      expiresAt: c.expiresAt,
    };
  }

  if (remainingMs < HOUR_MS) {
    return {
      tier: "imminent",
      remainingMs,
      label: `Expires in ${formatShort(remainingMs)}`,
      detail: `at ${formatClock(c.expiresAt)}`,
      expiresAt: c.expiresAt,
    };
  }

  if (remainingMs < DAY_MS) {
    return {
      tier: "soon",
      remainingMs,
      label: `Expires in ${formatShort(remainingMs)}`,
      detail: `today at ${formatClock(c.expiresAt)}`,
      expiresAt: c.expiresAt,
    };
  }

  // ≥ 24h away — inline meta pill is sufficient; don't crowd the panel.
  return null;
}

/** Short countdown — caps at two units. "12m", "47m", "3h 12m", "1d 4h". */
export function formatShort(ms: number): string {
  if (ms <= 0) return "0s";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/** Short past tense — "23m", "4h", "2d". Always positive ms. */
export function formatPast(ms: number): string {
  return formatShort(Math.max(0, ms));
}

/**
 * "4:32 PM" / "16:32" depending on locale. We use the runtime's
 * Intl.DateTimeFormat with hour+minute only — keeps the banner short.
 * Falls back to a manual HH:MM string in exotic envs (e.g. node test
 * without ICU).
 */
export function formatClock(at: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(at));
  } catch {
    const d = new Date(at);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }
}
