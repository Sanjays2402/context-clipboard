// Sanity: locked-since formatter — detail-view breadcrumb tiers
//
// `formatLockedSince(lockedAt, now)` produces the inline label +
// tooltip pair the detail-view shows. Tiered:
//   < 1m   → "Locked just now"
//   < 1h   → "Locked Nm ago"
//   < 24h  → "Locked Nh ago"
//   ~1 day calendar → "Locked yesterday at HH:MM"
//   1–6 calendar days → "Locked <weekday> at HH:MM"
//   7+ days → "Locked on YYYY-MM-DD"
// Tooltip is always the absolute "YYYY-MM-DD HH:MM" stamp.
//
// `now` is injected so the tier boundaries are deterministic;
// negative ages render as "just now" (clock-skew safety); missing
// timestamp falls back to a minimal "Locked".

// --- Inlined module under test (mirrors src/lib/locked-since.ts) --------

function formatLockedSince(lockedAt, now) {
  if (typeof lockedAt !== "number" || !isFinite(lockedAt)) {
    return { label: "Locked", tooltip: "Locked timestamp unavailable" };
  }
  const ageMs = Math.max(0, now - lockedAt);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const tooltip = formatTooltip(lockedAt);
  if (ageMs < minute) return { label: "Locked just now", tooltip };
  if (ageMs < hour) {
    const n = Math.floor(ageMs / minute);
    return { label: `Locked ${n}m ago`, tooltip };
  }
  if (ageMs < day) {
    const n = Math.floor(ageMs / hour);
    return { label: `Locked ${n}h ago`, tooltip };
  }
  const sameLocalDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const lockDate = new Date(lockedAt);
  const nowDate = new Date(now);
  const yesterdayDate = new Date(now - day);
  if (sameLocalDay(lockDate, nowDate)) {
    return { label: `Locked today at ${clockOf(lockDate)}`, tooltip };
  }
  if (sameLocalDay(lockDate, yesterdayDate)) {
    return { label: `Locked yesterday at ${clockOf(lockDate)}`, tooltip };
  }
  const lockDayStart = new Date(
    lockDate.getFullYear(), lockDate.getMonth(), lockDate.getDate(),
  ).getTime();
  const todayStart = new Date(
    nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(),
  ).getTime();
  const daysAgo = Math.floor((todayStart - lockDayStart) / day);
  if (daysAgo > 0 && daysAgo < 7) {
    const weekday = lockDate.toLocaleDateString(undefined, { weekday: "short" });
    return { label: `Locked ${weekday} at ${clockOf(lockDate)}`, tooltip };
  }
  return { label: `Locked on ${isoDateOf(lockDate)}`, tooltip };
}

function clockOf(d) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function isoDateOf(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function formatTooltip(at) {
  const d = new Date(at);
  return `${isoDateOf(d)} ${clockOf(d)}`;
}

// --- Harness -------------------------------------------------------------
let pass = 0, total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}
function checkContains(name, hay, needle) {
  total++;
  if (typeof hay === "string" && hay.includes(needle)) pass++;
  else console.error("FAIL", name, "in", JSON.stringify(hay), "missing", JSON.stringify(needle));
}

// --- Fix an anchor "now" so the day-boundary math is predictable.
// 2026-04-15 (Wednesday) 14:30:00 local time. Picked to be safely
// mid-week so weekday rendering doesn't roll into yesterday/today edge.
const now = new Date(2026, 3, 15, 14, 30, 0, 0).getTime();

// --- 1. Defensive shapes -------------------------------------------------
check("missing lockedAt → fallback 'Locked' label",
  formatLockedSince(undefined, now),
  { label: "Locked", tooltip: "Locked timestamp unavailable" });
check("null lockedAt → fallback 'Locked' label",
  formatLockedSince(null, now),
  { label: "Locked", tooltip: "Locked timestamp unavailable" });
check("NaN lockedAt → fallback 'Locked' label",
  formatLockedSince(NaN, now),
  { label: "Locked", tooltip: "Locked timestamp unavailable" });
check("Infinity lockedAt → fallback 'Locked' label",
  formatLockedSince(Infinity, now),
  { label: "Locked", tooltip: "Locked timestamp unavailable" });
check("string lockedAt → fallback 'Locked' label",
  formatLockedSince("abc", now),
  { label: "Locked", tooltip: "Locked timestamp unavailable" });

// Clock-skew safety: future timestamp clamps to "just now".
const future = now + 7200_000; // 2h in the future
const futureOut = formatLockedSince(future, now);
check("future lockedAt → 'Locked just now' (clamp at 0)",
  futureOut.label, "Locked just now");

// --- 2. Minute tier ------------------------------------------------------
check("0 ms ago → 'Locked just now'",
  formatLockedSince(now, now).label, "Locked just now");
check("30 s ago → 'Locked just now' (still under 1m)",
  formatLockedSince(now - 30_000, now).label, "Locked just now");
check("59 s ago → 'Locked just now' (just under 1m boundary)",
  formatLockedSince(now - 59_000, now).label, "Locked just now");
check("60 s ago → 'Locked 1m ago' (crosses minute boundary)",
  formatLockedSince(now - 60_000, now).label, "Locked 1m ago");
check("5 min ago → 'Locked 5m ago'",
  formatLockedSince(now - 5 * 60_000, now).label, "Locked 5m ago");
check("59 min ago → 'Locked 59m ago' (just under hour)",
  formatLockedSince(now - 59 * 60_000, now).label, "Locked 59m ago");

// --- 3. Hour tier --------------------------------------------------------
check("1 hour ago → 'Locked 1h ago'",
  formatLockedSince(now - 3600_000, now).label, "Locked 1h ago");
check("3 hours ago → 'Locked 3h ago'",
  formatLockedSince(now - 3 * 3600_000, now).label, "Locked 3h ago");
check("13.5 hours ago → 'Locked 13h ago' (floors)",
  formatLockedSince(now - 13.5 * 3600_000, now).label, "Locked 13h ago");
check("23 hours ago → 'Locked 23h ago'",
  formatLockedSince(now - 23 * 3600_000, now).label, "Locked 23h ago");

// --- 4. Day tier: yesterday + weekday ------------------------------------
// Yesterday at 14:30 = exactly 24h ago = anchor is "Locked yesterday at 14:30"
const yesterdaySameClock = now - 24 * 3600_000;
check("24h ago (yesterday same clock) → 'Locked yesterday at HH:MM'",
  formatLockedSince(yesterdaySameClock, now).label, "Locked yesterday at 14:30");

// 2 days ago at 09:12 → Monday at 09:12 (anchor is Wed Apr 15 → Mon Apr 13)
const mon0912 = new Date(2026, 3, 13, 9, 12, 0, 0).getTime();
const mondayOut = formatLockedSince(mon0912, now);
checkContains("2-day-ago (Mon 09:12) → weekday label",
  mondayOut.label, "Mon");
checkContains("2-day-ago (Mon 09:12) → clock 09:12",
  mondayOut.label, "09:12");
checkContains("2-day-ago label starts with 'Locked '", mondayOut.label, "Locked ");

// Sunday April 12 09:00 → 3 calendar days back. Should still be weekday.
const sun0900 = new Date(2026, 3, 12, 9, 0, 0, 0).getTime();
checkContains("3-day-ago (Sun 09:00) → weekday label",
  formatLockedSince(sun0900, now).label, "Sun");

// Day 6 (April 9 = Thursday) → still weekday tier.
const thu = new Date(2026, 3, 9, 18, 0, 0, 0).getTime();
checkContains("6-day-ago (Thu) → still weekday tier",
  formatLockedSince(thu, now).label, "Thu");

// --- 5. ISO date tier (7+ days) ------------------------------------------
// April 8 → 7 calendar days back. Should flip to ISO date label.
const apr8 = new Date(2026, 3, 8, 10, 0, 0, 0).getTime();
const isoOut = formatLockedSince(apr8, now);
check("7-day-ago → ISO date label 'Locked on 2026-04-08'",
  isoOut.label, "Locked on 2026-04-08");

// Way back → ISO date.
const monthsBack = new Date(2025, 11, 1, 14, 0, 0, 0).getTime();
checkContains("months back → ISO date label",
  formatLockedSince(monthsBack, now).label, "Locked on 2025-12-01");

// --- 6. Tooltip is always the absolute stamp -----------------------------
// Even "just now" gets the absolute tooltip.
const justNow = formatLockedSince(now - 5_000, now);
check("just-now tooltip is absolute 'YYYY-MM-DD HH:MM'",
  justNow.tooltip, "2026-04-15 14:29");
// Tooltip for 24h ago.
const yesterdayTip = formatLockedSince(yesterdaySameClock, now);
check("yesterday tooltip is absolute stamp",
  yesterdayTip.tooltip, "2026-04-14 14:30");

// --- 7. Clock formatting padding ----------------------------------------
const morn = new Date(2026, 3, 15, 7, 3, 0, 0).getTime();
const mornOut = formatLockedSince(morn, now); // ~7h ago — "Locked 7h ago"
check("morning lock 07:03 today → 'Locked 7h ago' (hour tier, not weekday)",
  mornOut.label, "Locked 7h ago");
check("morning tooltip pads single-digit hour/min",
  mornOut.tooltip, "2026-04-15 07:03");

// --- 8. Day-boundary edge cases -----------------------------------------
// Now = Wed 14:30. "yesterday at 23:59" should render as yesterday tier
// (calendar day yesterday), but it's <24h ago so it'll actually fall in
// the hour tier — which is the correct behavior because the user reads
// "14h ago" easier than "yesterday at 23:59" when the lock was last
// night. Confirm the tier:
const lastNight = new Date(2026, 3, 14, 23, 59, 0, 0).getTime();
const lastNightOut = formatLockedSince(lastNight, now);
check("last night 23:59 → hour tier (14h ago, not yesterday tier)",
  lastNightOut.label, "Locked 14h ago");

// Locked yesterday morning (08:00 → 30h ago) → yesterday tier with time.
const yestMorn = new Date(2026, 3, 14, 8, 0, 0, 0).getTime();
check("yesterday morning 08:00 → 'Locked yesterday at 08:00'",
  formatLockedSince(yestMorn, now).label, "Locked yesterday at 08:00");

console.log(`locked-since sanity: ${pass}/${total} passed`);
if (pass !== total) process.exit(1);
