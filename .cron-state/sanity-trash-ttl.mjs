// Sanity: Trash-row retention-urgency model (lib/trash-ttl).
//
// A trashed clip sits in the trash store for a 7-day safety window, then
// the GC purges it for good. The trash row used to show a flat muted "Xd
// left" regardless of whether the clip had 6 days or 4 hours of runway.
// trashTtlState computes a per-row urgency TIER + a precise label from
// deletedAt + the retention window, so the about-to-purge rows can tint +
// sharpen to hours. Mirrors the detail TTL banner's soon/imminent/expired
// tiering applied to the trash deadline.
//
// Coverage:
//   1. normal tier (>= 2 days left) keeps the rounded-up "Xd left" copy.
//   2. soon tier (< 48h) — amber, day grain.
//   3. imminent tier (< 24h) — soft-red, HOUR grain (real runway, not "1d").
//   4. expired tier (past deadline) — "Purges any moment".
//   5. boundary exactness (the 24h / 48h / 0 thresholds).
//   6. hour rounding (ceil, floored at 1) — never tell the user MORE time.
//   7. defensive: non-finite deletedAt / retention -> normal + empty label.

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const DEFAULT_TRASH_RETENTION_MS = 7 * DAY_MS;
const IMMINENT_MS = DAY_MS;
const SOON_MS = 2 * DAY_MS;

function trashTtlState(deletedAt, now = Date.now(), retentionMs = DEFAULT_TRASH_RETENTION_MS) {
  if (!Number.isFinite(deletedAt) || !Number.isFinite(retentionMs) || retentionMs <= 0) {
    return { tier: "normal", remainingMs: NaN, label: "" };
  }
  const deadline = deletedAt + retentionMs;
  const remainingMs = deadline - now;
  if (remainingMs <= 0) {
    return { tier: "expired", remainingMs, label: "Purges any moment" };
  }
  if (remainingMs < IMMINENT_MS) {
    const hours = Math.max(1, Math.ceil(remainingMs / HOUR_MS));
    return { tier: "imminent", remainingMs, label: `${hours}h left` };
  }
  if (remainingMs < SOON_MS) {
    const days = Math.ceil(remainingMs / DAY_MS);
    return { tier: "soon", remainingMs, label: `${days}d left` };
  }
  const days = Math.ceil(remainingMs / DAY_MS);
  return { tier: "normal", remainingMs, label: `${days}d left` };
}

let p = 0, t = 0;
function ck(n, g, w) {
  t++;
  if (g === w) p++;
  else console.error("FAIL", n, "got", JSON.stringify(g), "want", JSON.stringify(w));
}

// Fixed NOW so all the deletedAt offsets are deterministic.
const NOW = 1_700_000_000_000;
// A clip deleted `ago` ms before NOW, with the default 7-day window.
const deletedAgo = (ago) => NOW - ago;

// 1. normal tier — days of runway, rounded-up "Xd left"
const fresh = trashTtlState(deletedAgo(0), NOW); // just deleted -> 7d window
ck("fresh tier normal", fresh.tier, "normal");
ck("fresh label 7d", fresh.label, "7d left");
const mid = trashTtlState(deletedAgo(2 * DAY_MS), NOW); // 5d left
ck("5d-left tier normal", mid.tier, "normal");
ck("5d-left label", mid.label, "5d left");
// 2.5 days left rounds UP to 3d (matches the old popup ceil math).
const fracDays = trashTtlState(deletedAgo(4.5 * DAY_MS), NOW); // 2.5d left
ck("2.5d-left rounds up to 3d", fracDays.label, "3d left");
ck("2.5d-left tier normal", fracDays.tier, "normal");

// 2. soon tier — < 48h, amber, day grain
const soon = trashTtlState(deletedAgo(7 * DAY_MS - 40 * HOUR_MS), NOW); // 40h left
ck("40h-left tier soon", soon.tier, "soon");
ck("40h-left label rounds up to 2d", soon.label, "2d left"); // ceil(40/24)=2
const soonEdge = trashTtlState(deletedAgo(7 * DAY_MS - 47 * HOUR_MS), NOW); // 47h left
ck("47h-left tier soon", soonEdge.tier, "soon");
ck("47h-left label 2d", soonEdge.label, "2d left");

// 3. imminent tier — < 24h, soft-red, HOUR grain (real runway)
const imm = trashTtlState(deletedAgo(7 * DAY_MS - 4 * HOUR_MS), NOW); // 4h left
ck("4h-left tier imminent", imm.tier, "imminent");
ck("4h-left label hour grain", imm.label, "4h left");
const imm23 = trashTtlState(deletedAgo(7 * DAY_MS - 23 * HOUR_MS), NOW); // 23h left
ck("23h-left tier imminent", imm23.tier, "imminent");
ck("23h-left label", imm23.label, "23h left");
// Sub-hour remaining still reads in hours, floored at 1.
const subHour = trashTtlState(deletedAgo(7 * DAY_MS - 20 * 60_000), NOW); // 20m left
ck("20m-left tier imminent", subHour.tier, "imminent");
ck("20m-left label floors at 1h", subHour.label, "1h left");

// 4. expired tier — past the deadline
const exp = trashTtlState(deletedAgo(8 * DAY_MS), NOW); // 1 day past
ck("expired tier", exp.tier, "expired");
ck("expired label", exp.label, "Purges any moment");
const expNeg = trashTtlState(deletedAgo(7 * DAY_MS + 1), NOW); // 1ms past
ck("just-expired tier", expNeg.tier, "expired");

// 5. boundary exactness
// Exactly 24h left -> NOT imminent (>= IMMINENT_MS), falls to soon.
const exactly24h = trashTtlState(deletedAgo(7 * DAY_MS - 24 * HOUR_MS), NOW);
ck("exactly 24h left is soon, not imminent", exactly24h.tier, "soon");
// Exactly 48h left -> NOT soon (>= SOON_MS), falls to normal.
const exactly48h = trashTtlState(deletedAgo(7 * DAY_MS - 48 * HOUR_MS), NOW);
ck("exactly 48h left is normal, not soon", exactly48h.tier, "normal");
// Exactly 0 remaining -> expired.
const exactlyZero = trashTtlState(deletedAgo(7 * DAY_MS), NOW);
ck("exactly 0 remaining is expired", exactlyZero.tier, "expired");
// Just under 24h (23h59m) -> imminent.
const just23h59 = trashTtlState(deletedAgo(7 * DAY_MS - (23 * HOUR_MS + 59 * 60_000)), NOW);
ck("23h59m is imminent", just23h59.tier, "imminent");

// 6. hour rounding never inflates remaining time (ceil)
const h3m59 = trashTtlState(deletedAgo(7 * DAY_MS - (3 * HOUR_MS + 59 * 60_000)), NOW);
ck("3h59m rounds up to 4h (never down to 3h)", h3m59.label, "4h left");

// 7. defensive
ck("NaN deletedAt -> normal", trashTtlState(NaN, NOW).tier, "normal");
ck("NaN deletedAt -> empty label", trashTtlState(NaN, NOW).label, "");
ck("Infinity deletedAt -> empty label", trashTtlState(Infinity, NOW).label, "");
ck("zero retention -> normal+empty", trashTtlState(deletedAgo(0), NOW, 0).label, "");
ck("negative retention -> normal+empty", trashTtlState(deletedAgo(0), NOW, -5).label, "");
ck("non-finite retention -> normal", trashTtlState(deletedAgo(0), NOW, NaN).tier, "normal");

// remainingMs is exposed for the caller (sorting / debugging).
ck("remainingMs reflects deadline", trashTtlState(deletedAgo(7 * DAY_MS - 4 * HOUR_MS), NOW).remainingMs, 4 * HOUR_MS);

console.log(`trash-ttl sanity: ${p}/${t} passed`);
if (p !== t) process.exit(1);
