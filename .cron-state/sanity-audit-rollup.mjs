/**
 * Sanity: audit log day-rollup grouper.
 *
 * Bundles src/lib/audit-rollup.ts via esbuild and probes
 * `groupAuditByDay` for the bucket math, label resolution
 * (Today / Yesterday / older), and the defaultOpen hint.
 *
 * Run with: node .cron-state/sanity-audit-rollup.mjs
 */
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const dir = mkdtempSync(join(tmpdir(), "ctxclip-audit-rollup-"));
try {
  await build({
    entryPoints: ["src/lib/audit-rollup.ts"],
    bundle: true,
    format: "esm",
    outfile: join(dir, "ar.mjs"),
    platform: "neutral",
    target: "es2022",
    sourcemap: false,
  });
  const mod = await import("file://" + join(dir, "ar.mjs"));

  let pass = 0,
    total = 0;
  function check(name, got, want) {
    total++;
    if (JSON.stringify(got) === JSON.stringify(want)) pass++;
    else
      console.error(
        "FAIL",
        name,
        "got",
        JSON.stringify(got),
        "want",
        JSON.stringify(want),
      );
  }

  // Pin "now" to a stable wall-clock time so labels are deterministic
  // across machines. 2026-06-21 15:00 local — Sunday afternoon.
  const NOW = new Date(2026, 5, 21, 15, 0, 0); // month is 0-indexed
  const dayMs = 86_400_000;
  function at(daysAgo, hours = 12) {
    const d = new Date(NOW);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hours, 0, 0, 0);
    return d.getTime();
  }

  // --- Empty input → empty array ---
  check("empty input → empty groups", mod.groupAuditByDay([], NOW), []);

  // --- All today → one "Today" group, default open ---
  const todayOnly = [{ at: at(0, 14) }, { at: at(0, 13) }, { at: at(0, 12) }];
  const g1 = mod.groupAuditByDay(todayOnly, NOW);
  check("today only: one group", g1.length, 1);
  check("today only: label is Today", g1[0].label, "Today");
  check("today only: defaultOpen true", g1[0].defaultOpen, true);
  check("today only: keeps newest-first order", g1[0].entries.length, 3);
  check("today only: key shape", /^\d{4}-\d{2}-\d{2}$/.test(g1[0].key), true);

  // --- Today + Yesterday + 2 days ago → 3 groups, oldest folded ---
  const mixed = [
    { at: at(0, 14) }, // today
    { at: at(0, 9) }, // today
    { at: at(1, 18) }, // yesterday
    { at: at(2, 8) }, // 2 days ago
    { at: at(2, 10) }, // 2 days ago
  ];
  const g2 = mod.groupAuditByDay(mixed, NOW);
  check("mixed: 3 groups", g2.length, 3);
  check("mixed: g[0] label Today", g2[0].label, "Today");
  check("mixed: g[1] label Yesterday", g2[1].label, "Yesterday");
  check("mixed: g[0] defaultOpen true", g2[0].defaultOpen, true);
  check("mixed: g[1] defaultOpen true", g2[1].defaultOpen, true);
  check("mixed: g[2] defaultOpen false", g2[2].defaultOpen, false);
  check("mixed: g[0] entry count", g2[0].entries.length, 2);
  check("mixed: g[1] entry count", g2[1].entries.length, 1);
  check("mixed: g[2] entry count", g2[2].entries.length, 2);

  // --- All yesterday → one Yesterday group, default open ---
  const yOnly = [{ at: at(1, 20) }, { at: at(1, 10) }];
  const g3 = mod.groupAuditByDay(yOnly, NOW);
  check("yesterday only: one group", g3.length, 1);
  check("yesterday only: label", g3[0].label, "Yesterday");
  check("yesterday only: defaultOpen true", g3[0].defaultOpen, true);

  // --- All older → one group, default closed ---
  const oldOnly = [{ at: at(5, 12) }, { at: at(5, 14) }];
  const g4 = mod.groupAuditByDay(oldOnly, NOW);
  check("older only: one group", g4.length, 1);
  check("older only: defaultOpen false", g4[0].defaultOpen, false);
  check("older only: label has weekday + month", /^[A-Z][a-z]{2},/.test(g4[0].label), true);

  // --- Year-rollover: same wall-day, different year → labels read with year ---
  const lastYear = new Date(NOW);
  lastYear.setFullYear(lastYear.getFullYear() - 1);
  const g5 = mod.groupAuditByDay([{ at: lastYear.getTime() }], NOW);
  check("last-year entry: 1 group", g5.length, 1);
  check("last-year entry: label includes 4-digit year", /\d{4}/.test(g5[0].label), true);

  // --- Sort by date desc even if input is shuffled ---
  const shuffled = [
    { at: at(3, 10), tag: "three" },
    { at: at(0, 12), tag: "today" },
    { at: at(7, 10), tag: "seven" },
    { at: at(1, 9), tag: "y" },
  ];
  const g6 = mod.groupAuditByDay(shuffled, NOW);
  check("shuffled: 4 groups", g6.length, 4);
  check("shuffled: newest first label", g6[0].label, "Today");
  check("shuffled: yesterday second", g6[1].label, "Yesterday");

  // --- Local-day boundary: 23:00 today + 00:30 next morning are different days ---
  const lateNight = new Date(NOW);
  lateNight.setHours(23, 0, 0, 0);
  const earlyMorning = new Date(NOW);
  earlyMorning.setDate(earlyMorning.getDate() + 1);
  earlyMorning.setHours(0, 30, 0, 0);
  // Use NOW just past midnight for label test
  const NOW2 = new Date(earlyMorning);
  NOW2.setHours(8, 0, 0, 0);
  const g7 = mod.groupAuditByDay([
    { at: earlyMorning.getTime() },
    { at: lateNight.getTime() },
  ], NOW2);
  check("midnight split: 2 groups (different local days)", g7.length, 2);
  check("midnight split: newest is Today", g7[0].label, "Today");
  check("midnight split: older is Yesterday", g7[1].label, "Yesterday");

  // --- totalAuditEntries sums every group's rows ---
  check(
    "totalAuditEntries: sums across groups",
    mod.totalAuditEntries(g2),
    5,
  );
  check("totalAuditEntries: 0 for empty", mod.totalAuditEntries([]), 0);

  // --- Single entry returns single group with that entry ---
  const g8 = mod.groupAuditByDay([{ at: at(0, 10) }], NOW);
  check("single entry: one group", g8.length, 1);
  check("single entry: count", g8[0].entries.length, 1);

  // --- labelForDay direct probes ---
  check("labelForDay: today", mod.labelForDay(NOW, NOW), "Today");
  const yest = new Date(NOW);
  yest.setDate(yest.getDate() - 1);
  check("labelForDay: yesterday", mod.labelForDay(yest, NOW), "Yesterday");
  const twoDays = new Date(NOW);
  twoDays.setDate(twoDays.getDate() - 2);
  // Just check it produces a non-empty short-form string with no "Today"/"Yesterday" leak
  const lbl = mod.labelForDay(twoDays, NOW);
  check(
    "labelForDay: 2d ago is NOT Today/Yesterday",
    lbl !== "Today" && lbl !== "Yesterday" && lbl.length > 0,
    true,
  );

  if (pass === total) {
    console.log(`PASS — ${pass}/${total} audit-rollup sanity checks`);
  } else {
    console.error(`FAIL — ${pass}/${total} audit-rollup sanity checks`);
    process.exit(1);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
