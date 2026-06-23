// Sanity tests for src/lib/host-rule-flags.ts — the host-rule operator
// family (`is:hostpinned` / `is:hostredacted` / `is:hostscrubbed`).
// Mirrors the structure of sanity-host-locked-style coverage that
// the existing sanity-is-hostlocked.mjs provides for `is:hostlocked`.
//
// Run with: node .cron-state/sanity-host-rule-flags.mjs

import assert from "node:assert/strict";
import { build } from "esbuild";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "ctxclip-hostrule-"));
try {
  await build({
    entryPoints: ["src/lib/host-rule-flags.ts"],
    bundle: true,
    format: "esm",
    outfile: join(tmp, "host-rule-flags.mjs"),
    platform: "neutral",
    target: "es2022",
    logLevel: "silent",
  });
  const {
    buildHostRulePredicate,
    countHostRuleClips,
    flaggedHostsForClips,
  } = await import(join(tmp, "host-rule-flags.mjs"));

  let pass = 0;
  const t = (msg, fn) => {
    try {
      fn();
      pass++;
    } catch (e) {
      console.error(`FAIL ${msg}: ${e.message}`);
      process.exit(1);
    }
  };

  const rule = (id, hostPattern, flags = {}) => ({
    id,
    hostPattern,
    createdAt: 0,
    ...flags,
  });

  const clip = (id, url) => ({ id, source: { url } });

  // -------------------- defensive empty cases --------------------
  t("null rules → predicate always false", () => {
    const pred = buildHostRulePredicate(null, "autoPin");
    assert.equal(pred(clip("a", "https://x.com")), false);
  });

  t("empty rules → predicate always false", () => {
    const pred = buildHostRulePredicate([], "autoPin");
    assert.equal(pred(clip("a", "https://x.com")), false);
  });

  t("rules without hostPattern → predicate false", () => {
    const pred = buildHostRulePredicate(
      [{ id: "r1", createdAt: 0, autoPin: true }],
      "autoPin",
    );
    assert.equal(pred(clip("a", "https://x.com")), false);
  });

  t("rules with empty hostPattern → predicate false", () => {
    const pred = buildHostRulePredicate(
      [rule("r1", "", { autoPin: true })],
      "autoPin",
    );
    assert.equal(pred(clip("a", "https://x.com")), false);
  });

  t("clip without source → predicate false", () => {
    const pred = buildHostRulePredicate(
      [rule("r1", "x.com", { autoPin: true })],
      "autoPin",
    );
    assert.equal(pred({ id: "a" }), false);
  });

  t("clip with non-string url → predicate false", () => {
    const pred = buildHostRulePredicate(
      [rule("r1", "x.com", { autoPin: true })],
      "autoPin",
    );
    assert.equal(pred({ id: "a", source: { url: undefined } }), false);
  });

  // -------------------- autoPin matching --------------------
  t("autoPin rule matches exact host", () => {
    const pred = buildHostRulePredicate(
      [rule("r1", "github.com", { autoPin: true })],
      "autoPin",
    );
    assert.equal(pred(clip("a", "https://github.com/foo")), true);
  });

  t("autoPin rule matches www-stripped host", () => {
    const pred = buildHostRulePredicate(
      [rule("r1", "github.com", { autoPin: true })],
      "autoPin",
    );
    assert.equal(pred(clip("a", "https://www.github.com/foo")), true);
  });

  t("autoPin rule with autoPin:false → predicate false", () => {
    const pred = buildHostRulePredicate(
      [rule("r1", "github.com", { autoPin: false })],
      "autoPin",
    );
    assert.equal(pred(clip("a", "https://github.com/foo")), false);
  });

  t("autoPin rule missing autoPin → predicate false", () => {
    const pred = buildHostRulePredicate(
      [rule("r1", "github.com", { autoLock: true })],
      "autoPin",
    );
    assert.equal(pred(clip("a", "https://github.com/foo")), false);
  });

  t("autoPin: strict gate rejects truthy non-boolean", () => {
    const pred = buildHostRulePredicate(
      [rule("r1", "github.com", { autoPin: 1 })],
      "autoPin",
    );
    assert.equal(pred(clip("a", "https://github.com/foo")), false);
  });

  t("autoPin: wildcard hostPattern matches subdomain", () => {
    const pred = buildHostRulePredicate(
      [rule("r1", "*.github.com", { autoPin: true })],
      "autoPin",
    );
    assert.equal(pred(clip("a", "https://docs.github.com/x")), true);
  });

  t("non-matching host → predicate false even with rules", () => {
    const pred = buildHostRulePredicate(
      [rule("r1", "github.com", { autoPin: true })],
      "autoPin",
    );
    assert.equal(pred(clip("a", "https://gitlab.com/foo")), false);
  });

  // -------------------- first-match-wins --------------------
  t("first-match-wins: non-flagged rule before flagged → false", () => {
    const pred = buildHostRulePredicate(
      [
        rule("r1", "*.github.com", { autoPin: false }),
        rule("r2", "docs.github.com", { autoPin: true }),
      ],
      "autoPin",
    );
    assert.equal(
      pred(clip("a", "https://docs.github.com/foo")),
      false,
      "specific rule loses to earlier broad rule",
    );
  });

  t("first-match-wins: flagged rule before non-flagged → true", () => {
    const pred = buildHostRulePredicate(
      [
        rule("r1", "docs.github.com", { autoPin: true }),
        rule("r2", "*.github.com", { autoPin: false }),
      ],
      "autoPin",
    );
    assert.equal(
      pred(clip("a", "https://docs.github.com/foo")),
      true,
    );
  });

  // -------------------- autoRedact / autoScrubOrigin --------------------
  t("autoRedact flag: predicate matches", () => {
    const pred = buildHostRulePredicate(
      [rule("r1", "x.com", { autoRedact: true })],
      "autoRedact",
    );
    assert.equal(pred(clip("a", "https://x.com")), true);
  });

  t("autoRedact flag: autoPin rule does NOT match autoRedact predicate", () => {
    const pred = buildHostRulePredicate(
      [rule("r1", "x.com", { autoPin: true })],
      "autoRedact",
    );
    assert.equal(pred(clip("a", "https://x.com")), false);
  });

  t("autoScrubOrigin flag: predicate matches", () => {
    const pred = buildHostRulePredicate(
      [rule("r1", "x.com", { autoScrubOrigin: true })],
      "autoScrubOrigin",
    );
    assert.equal(pred(clip("a", "https://x.com")), true);
  });

  t("autoScrubOrigin: rules with other flags don't accidentally match", () => {
    const pred = buildHostRulePredicate(
      [rule("r1", "x.com", { autoPin: true, autoRedact: true })],
      "autoScrubOrigin",
    );
    assert.equal(pred(clip("a", "https://x.com")), false);
  });

  // -------------------- counting --------------------
  t("countHostRuleClips: no clips → 0", () => {
    const n = countHostRuleClips(
      [rule("r1", "x.com", { autoPin: true })],
      [],
      "autoPin",
    );
    assert.equal(n, 0);
  });

  t("countHostRuleClips: null clips → 0", () => {
    const n = countHostRuleClips(
      [rule("r1", "x.com", { autoPin: true })],
      null,
      "autoPin",
    );
    assert.equal(n, 0);
  });

  t("countHostRuleClips: matches counted accurately", () => {
    const clips = [
      clip("a", "https://github.com/1"),
      clip("b", "https://github.com/2"),
      clip("c", "https://gitlab.com/3"),
      clip("d", "https://github.com/4"),
    ];
    const n = countHostRuleClips(
      [rule("r1", "github.com", { autoPin: true })],
      clips,
      "autoPin",
    );
    assert.equal(n, 3);
  });

  t("countHostRuleClips: independent flag count", () => {
    const clips = [
      clip("a", "https://github.com/1"),
      clip("b", "https://gitlab.com/2"),
    ];
    const rules = [
      rule("r1", "github.com", { autoPin: true, autoRedact: false }),
      rule("r2", "gitlab.com", { autoRedact: true, autoPin: false }),
    ];
    assert.equal(countHostRuleClips(rules, clips, "autoPin"), 1);
    assert.equal(countHostRuleClips(rules, clips, "autoRedact"), 1);
  });

  // -------------------- distinct hosts list --------------------
  t("flaggedHostsForClips: no rules → []", () => {
    const out = flaggedHostsForClips(null, [clip("a", "https://x.com")], "autoPin");
    assert.deepEqual(out, []);
  });

  t("flaggedHostsForClips: no clips → []", () => {
    const out = flaggedHostsForClips(
      [rule("r1", "x.com", { autoPin: true })],
      [],
      "autoPin",
    );
    assert.deepEqual(out, []);
  });

  t("flaggedHostsForClips: dedups + sorts by host", () => {
    const clips = [
      clip("a", "https://github.com/1"),
      clip("b", "https://github.com/2"),
      clip("c", "https://gitlab.com/3"),
      clip("d", "https://example.com/4"),
    ];
    const rules = [
      rule("r1", "github.com", { autoPin: true }),
      rule("r2", "gitlab.com", { autoPin: true }),
      rule("r3", "example.com", { autoPin: false }), // shouldn't surface
    ];
    const out = flaggedHostsForClips(rules, clips, "autoPin");
    assert.deepEqual(out, ["github.com", "gitlab.com"]);
  });

  t("flaggedHostsForClips: per-flag independence", () => {
    const clips = [
      clip("a", "https://github.com/1"),
      clip("b", "https://gitlab.com/2"),
    ];
    const rules = [
      rule("r1", "github.com", { autoPin: true }),
      rule("r2", "gitlab.com", { autoRedact: true }),
    ];
    assert.deepEqual(
      flaggedHostsForClips(rules, clips, "autoPin"),
      ["github.com"],
    );
    assert.deepEqual(
      flaggedHostsForClips(rules, clips, "autoRedact"),
      ["gitlab.com"],
    );
    assert.deepEqual(
      flaggedHostsForClips(rules, clips, "autoScrubOrigin"),
      [],
    );
  });

  // -------------------- per-host caching --------------------
  t("cache: same host probed twice yields same verdict (consistent)", () => {
    const clips = [
      clip("a", "https://github.com/1"),
      clip("b", "https://github.com/2"),
      clip("c", "https://github.com/3"),
    ];
    const pred = buildHostRulePredicate(
      [rule("r1", "github.com", { autoPin: true })],
      "autoPin",
    );
    assert.equal(pred(clips[0]), true);
    assert.equal(pred(clips[1]), true);
    assert.equal(pred(clips[2]), true);
  });

  // -------------------- realistic 4-flag matrix --------------------
  t("realistic: 4 hosts × 4 flags, only one combo matches each", () => {
    const clips = [
      clip("p", "https://pin.com/1"),
      clip("r", "https://redact.com/1"),
      clip("s", "https://scrub.com/1"),
      clip("l", "https://lock.com/1"),
    ];
    const rules = [
      rule("r1", "pin.com", { autoPin: true }),
      rule("r2", "redact.com", { autoRedact: true }),
      rule("r3", "scrub.com", { autoScrubOrigin: true }),
      rule("r4", "lock.com", { autoLock: true }),
    ];
    assert.equal(countHostRuleClips(rules, clips, "autoPin"), 1);
    assert.equal(countHostRuleClips(rules, clips, "autoRedact"), 1);
    assert.equal(countHostRuleClips(rules, clips, "autoScrubOrigin"), 1);
  });

  console.log(`host-rule-flags sanity: ${pass}/${pass} pass`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
