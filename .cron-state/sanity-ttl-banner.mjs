// Sanity: computeTtlBanner urgency tiers.
//
// Inline copy of src/lib/ttl-banner.ts so the test runs without a
// bundler. Validates the tier math (expired / imminent / soon /
// future-hidden), pinned-clip short-circuit, missing-expiresAt
// short-circuit, boundary cases (exactly 1h, exactly 24h, exactly
// at expiresAt), and the formatShort helper.

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

function formatShort(ms) {
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

function formatPast(ms) {
  return formatShort(Math.max(0, ms));
}

function formatClock(at) {
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

function computeTtlBanner(c, now = Date.now()) {
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
  return null;
}

let pass = 0;
let total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}

const NOW = 1_700_000_000_000;

// --- 1. Short-circuit cases (banner hidden) ---------------------------
check(
  "pinned clip → null (TTL paused, hint covers it)",
  computeTtlBanner({ pinned: true, expiresAt: NOW + 1000 }, NOW),
  null,
);
check(
  "no expiresAt → null",
  computeTtlBanner({ pinned: false }, NOW),
  null,
);
check(
  "expiresAt=undefined → null",
  computeTtlBanner({ pinned: false, expiresAt: undefined }, NOW),
  null,
);
check(
  "far future (≥ 24h) → null (inline pill is enough)",
  computeTtlBanner({ pinned: false, expiresAt: NOW + 7 * DAY_MS }, NOW),
  null,
);

// --- 2. Expired tier --------------------------------------------------
const expired = computeTtlBanner({ pinned: false, expiresAt: NOW - 5 * 60_000 }, NOW);
check("expired tier name", expired?.tier, "expired");
check("expired label", expired?.label, "Expired — GC at next capture");
check("expired detail mentions past", expired?.detail, "Was due 5m ago");
check("expired carries through expiresAt", expired?.expiresAt, NOW - 5 * 60_000);
check("expired remainingMs is negative", expired?.remainingMs < 0, true);

// Exactly at the deadline still counts as expired (remainingMs===0).
const atDeadline = computeTtlBanner({ pinned: false, expiresAt: NOW }, NOW);
check("exactly at deadline → expired (boundary)", atDeadline?.tier, "expired");

// --- 3. Imminent tier (< 1 hour) --------------------------------------
const imminent12m = computeTtlBanner({ pinned: false, expiresAt: NOW + 12 * 60_000 }, NOW);
check("12m → imminent tier", imminent12m?.tier, "imminent");
check("12m label", imminent12m?.label, "Expires in 12m");
check("12m detail starts with 'at '", imminent12m?.detail?.startsWith("at "), true);

const imminent59m59s = computeTtlBanner(
  { pinned: false, expiresAt: NOW + 59 * 60_000 + 59_000 },
  NOW,
);
check("59m59s → imminent", imminent59m59s?.tier, "imminent");
check("59m59s label rounds down", imminent59m59s?.label, "Expires in 59m");

// Exactly 1h is the boundary → soon (not imminent). The < check is strict.
const exactly1h = computeTtlBanner({ pinned: false, expiresAt: NOW + HOUR_MS }, NOW);
check("exactly 1h → soon tier (boundary)", exactly1h?.tier, "soon");

// --- 4. Soon tier (1h ≤ remaining < 24h) -------------------------------
const soon3h = computeTtlBanner({ pinned: false, expiresAt: NOW + 3 * HOUR_MS + 12 * 60_000 }, NOW);
check("3h 12m → soon tier", soon3h?.tier, "soon");
check("3h 12m label", soon3h?.label, "Expires in 3h 12m");
check("3h 12m detail starts with 'today at '", soon3h?.detail?.startsWith("today at "), true);

const soonAlmost24h = computeTtlBanner(
  { pinned: false, expiresAt: NOW + DAY_MS - 1 },
  NOW,
);
check("just under 24h → soon", soonAlmost24h?.tier, "soon");

// Exactly 24h → boundary → future (hidden).
const exactly24h = computeTtlBanner({ pinned: false, expiresAt: NOW + DAY_MS }, NOW);
check("exactly 24h → null (hidden, far future)", exactly24h, null);

// --- 5. formatShort -------------------------------------------------------
check("formatShort 0", formatShort(0), "0s");
check("formatShort 30s", formatShort(30_000), "30s");
check("formatShort 5m", formatShort(5 * 60_000), "5m");
check("formatShort 59m59s", formatShort(59 * 60_000 + 59_000), "59m");
check("formatShort 1h", formatShort(HOUR_MS), "1h");
check("formatShort 1h 30m", formatShort(HOUR_MS + 30 * 60_000), "1h 30m");
check("formatShort 23h 59m", formatShort(23 * HOUR_MS + 59 * 60_000), "23h 59m");
check("formatShort 1d", formatShort(DAY_MS), "1d");
check("formatShort 2d 4h", formatShort(2 * DAY_MS + 4 * HOUR_MS), "2d 4h");
check("formatShort 7d (drops hours when h=0)", formatShort(7 * DAY_MS), "7d");
check("formatShort negative → 0s", formatShort(-100), "0s");

// --- 6. Pinned wins even when expired --------------------------------
const pinnedExpired = computeTtlBanner({ pinned: true, expiresAt: NOW - 1000 }, NOW);
check("pinned + expired → still null", pinnedExpired, null);

// --- 7. expiresAt=0 is a valid (very old) deadline → expired tier ----
const zeroDeadline = computeTtlBanner({ pinned: false, expiresAt: 0 }, NOW);
check("expiresAt=0 → expired (truthiness gotcha guarded by typeof check)", zeroDeadline?.tier, "expired");

console.log(`ttl-banner sanity: ${pass}/${total} pass`);
if (pass !== total) process.exit(1);
