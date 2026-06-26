// Sanity: day-group header run-counts (lib/day-group.computeDayHeaderInfos).
//
// The list day-dividers now carry a "· N" volume badge showing how many
// clips landed in each contiguous day-bucket. This harness exercises the
// run-counting + label projection in isolation (inline copy, bundler-free)
// so the badge count, the divider placement, and the back-compat
// label-only projection can never drift.
//
// Coverage:
//   1. Counts match contiguous run sizes (pinned tier + day runs).
//   2. Only the first row of a run carries a header; the rest are null.
//   3. Label-only projection equals the infos' labels.
//   4. Edge cases: empty list, single clip, all-same-day, undated tier.

const DAY_MS = 86_400_000;
const PINNED_HEADER = "Pinned";
const UNDATED_HEADER = "Earlier";

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function calendarDayDiff(earlier, later) {
  const a = Date.UTC(earlier.getFullYear(), earlier.getMonth(), earlier.getDate());
  const b = Date.UTC(later.getFullYear(), later.getMonth(), later.getDate());
  return Math.round((b - a) / DAY_MS);
}
function dayLabel(ts, now) {
  if (!Number.isFinite(ts)) return UNDATED_HEADER;
  const then = new Date(ts), today = new Date(now);
  const d = calendarDayDiff(then, today);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d > 1 && d < 7) return then.toLocaleDateString(undefined, { weekday: "long" });
  if (then.getFullYear() === today.getFullYear())
    return then.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return then.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function bucketOf(c, now) {
  const pinned = !!c && c.pinned === true;
  if (pinned) return { key: "pinned", label: PINNED_HEADER };
  const ts = c && Number.isFinite(c.lastSeenAt) ? c.lastSeenAt : NaN;
  if (!Number.isFinite(ts)) return { key: "undated", label: UNDATED_HEADER };
  return { key: dayKey(ts), label: dayLabel(ts, now) };
}
function computeDayHeaderInfos(clips, now = Date.now()) {
  if (!Array.isArray(clips) || clips.length === 0) return [];
  const buckets = clips.map((c) => bucketOf(c, now));
  const out = [];
  let prevKey = null;
  for (let i = 0; i < buckets.length; i++) {
    const { key, label } = buckets[i];
    if (key === prevKey) {
      out.push(null);
    } else {
      let count = 0;
      for (let j = i; j < buckets.length && buckets[j].key === key; j++) count++;
      out.push({ label, count });
    }
    prevKey = key;
  }
  return out;
}
function computeDayHeaders(clips, now = Date.now()) {
  return computeDayHeaderInfos(clips, now).map((h) => (h ? h.label : null));
}

let p = 0, t = 0;
function ck(n, g, w) {
  t++;
  if (JSON.stringify(g) === JSON.stringify(w)) p++;
  else console.error("FAIL", n, "got", JSON.stringify(g), "want", JSON.stringify(w));
}

const NOW = new Date("2026-06-25T12:00:00").getTime();
const today = NOW;
const yesterday = NOW - DAY_MS;
const twoDaysAgo = NOW - 2 * DAY_MS;

// 1 + 2. pinned run (2) + today run (3) + yesterday run (1)
const clips = [
  { pinned: true, lastSeenAt: twoDaysAgo },
  { pinned: true, lastSeenAt: today },
  { lastSeenAt: today },
  { lastSeenAt: today },
  { lastSeenAt: today },
  { lastSeenAt: yesterday },
];
const infos = computeDayHeaderInfos(clips, NOW);
// headers only on run-starts: idx 0 (pinned), 2 (today), 5 (yesterday)
ck("header positions", infos.map((h) => (h ? 1 : 0)), [1, 0, 1, 0, 0, 1]);
ck("pinned count = 2", infos[0], { label: "Pinned", count: 2 });
ck("today count = 3", infos[2], { label: "Today", count: 3 });
ck("yesterday count = 1", infos[5], { label: "Yesterday", count: 1 });

// 3. label-only projection equals infos labels
ck("label projection", computeDayHeaders(clips, NOW), [
  "Pinned", null, "Today", null, null, "Yesterday",
]);

// 4. edges
ck("empty -> []", computeDayHeaderInfos([], NOW), []);
ck("null -> []", computeDayHeaderInfos(null, NOW), []);
ck("single clip count 1", computeDayHeaderInfos([{ lastSeenAt: today }], NOW)[0], {
  label: "Today",
  count: 1,
});
ck(
  "all-same-day single header count N",
  computeDayHeaderInfos(
    [{ lastSeenAt: today }, { lastSeenAt: today + 1 }, { lastSeenAt: today + 2 }],
    NOW,
  ),
  [{ label: "Today", count: 3 }, null, null],
);
ck("undated tier count", computeDayHeaderInfos([{ lastSeenAt: NaN }, { lastSeenAt: NaN }], NOW), [
  { label: "Earlier", count: 2 },
  null,
]);

// 5. non-contiguous same-day runs (a later sort interleaving) each get
//    their OWN header + count — the function groups CONTIGUOUS runs only.
const split = [
  { lastSeenAt: today },
  { lastSeenAt: yesterday },
  { lastSeenAt: today },
];
ck("non-contiguous same day splits", computeDayHeaderInfos(split, NOW).map((h) => h && h.count), [
  1, 1, 1,
]);

console.log(`day-header-count: ${p}/${t}`);
process.exit(p === t ? 0 : 1);
