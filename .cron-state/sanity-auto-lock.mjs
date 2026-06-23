// Sanity: autoLock site-rule wiring — ingest + dedup stickiness + IO round-trip
//
// `autoLock: true` on a per-host rule should flip the per-clip
// `locked: true` bit BEFORE the ingest write hits IDB. On the dedup
// path it's STICKY: an existing clip without the lock bit picks it
// up from a newer rule, but an explicitly-unlocked-by-user clip
// shouldn't suddenly flip back (we treat existing.locked !== true
// as "needs lock"; if the user has previously locked + unlocked,
// they keep their explicit choice via the toggleLock path — there's
// no separate "user-overrode-rule" flag because the use case is
// "lock all captures from this host" which always wants the bit set
// on capture even if a stale entry got cleared elsewhere).
//
// The IO round-trip layer (serializeRules / parseRulesJson /
// mergeRules) needs to carry autoLock the same way it carries
// autoPin / autoRedact: emit when true, drop when false, validate
// strictly on parse, normalise on merge.

// --- Pure helpers (mirror background.ts + site-rules-io.ts) -------------

// Mirrors the new ingest branch in background.ts for the FRESH clip
// path (no existing dedup hit). Returns the ingested clip's locked
// field — that's the contract we care about for the autoLock bit.
function ingestFreshLocked(rule) {
  // ...(rule?.autoLock ? { locked: true } : {})
  return rule?.autoLock ? true : undefined;
}

// Mirrors the dedup-path mutation for an existing clip seeing a
// fresh capture under a rule. existing.locked stays unchanged unless
// the rule sets autoLock AND the bit isn't already true.
function dedupApplyLock(existing, rule) {
  const next = { ...existing };
  // Mirror the actual code: `if (rule?.autoLock && existing.locked !== true) existing.locked = true;`
  if (rule?.autoLock && next.locked !== true) next.locked = true;
  return next;
}

// Mirrors site-rules-io.ts normaliseForExport (the export branch).
function normaliseForExport(r) {
  const out = { hostPattern: r.hostPattern };
  if (r.autoPin) out.autoPin = true;
  if (r.autoLock) out.autoLock = true;
  if (r.autoRedact) out.autoRedact = true;
  if (r.skipCapture) out.skipCapture = true;
  if (r.autoScrubOrigin) out.autoScrubOrigin = true;
  return out;
}

// Mirrors site-rules-io.ts validateRule's boolean strictness for autoLock.
function validateBooleanFields(raw) {
  const r = raw;
  const out = { hostPattern: r.hostPattern };
  if (r.autoPin === true) out.autoPin = true;
  if (r.autoLock === true) out.autoLock = true;
  if (r.autoRedact === true) out.autoRedact = true;
  if (r.skipCapture === true) out.skipCapture = true;
  if (r.autoScrubOrigin === true) out.autoScrubOrigin = true;
  return out;
}

// Mirrors site-rules-io.ts liveRuleFrom (the merge path).
function liveRuleFrom(r) {
  return {
    hostPattern: r.hostPattern,
    autoPin: !!r.autoPin,
    autoLock: !!r.autoLock,
    autoRedact: !!r.autoRedact,
    skipCapture: !!r.skipCapture,
    autoScrubOrigin: !!r.autoScrubOrigin,
  };
}

// --- Test harness --------------------------------------------------------
let pass = 0, total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}

// --- 1. fresh-clip ingest with autoLock ----------------------------------
check("ingest fresh: no rule → locked undefined", ingestFreshLocked(undefined), undefined);
check("ingest fresh: rule without autoLock → locked undefined",
  ingestFreshLocked({ autoPin: true, autoRedact: true }), undefined);
check("ingest fresh: rule with autoLock:true → locked true",
  ingestFreshLocked({ autoLock: true }), true);
check("ingest fresh: rule with autoLock + autoPin → locked true (lock independent)",
  ingestFreshLocked({ autoLock: true, autoPin: true }), true);
check("ingest fresh: rule with autoLock:false (explicit) → locked undefined",
  ingestFreshLocked({ autoLock: false }), undefined);

// --- 2. dedup path stickiness --------------------------------------------
// Unlocked clip + rule with autoLock → newly locked.
check("dedup: unlocked clip + autoLock rule → flip to locked",
  dedupApplyLock({ id: "a", locked: undefined }, { autoLock: true }).locked, true);
check("dedup: unlocked clip (locked:false) + autoLock rule → flip to locked",
  dedupApplyLock({ id: "a", locked: false }, { autoLock: true }).locked, true);
// Already-locked clip + same rule → no-op.
check("dedup: already-locked clip + autoLock rule → stay locked",
  dedupApplyLock({ id: "a", locked: true }, { autoLock: true }).locked, true);
// Unlocked clip + rule WITHOUT autoLock → no change.
check("dedup: unlocked clip + non-autoLock rule → stay unlocked (undefined)",
  dedupApplyLock({ id: "a", locked: undefined }, { autoPin: true }).locked, undefined);
check("dedup: unlocked clip + no rule at all → stay unlocked",
  dedupApplyLock({ id: "a", locked: undefined }, undefined).locked, undefined);
// Truthy non-boolean lock counts as "needs lock" because we use strict !== true.
check("dedup: clip with truthy non-bool locked:1 + autoLock rule → flip to proper true",
  dedupApplyLock({ id: "a", locked: 1 }, { autoLock: true }).locked, true);

// --- 3. IO export: emit only when true -----------------------------------
check("export: rule with autoLock:true emits autoLock",
  normaliseForExport({ hostPattern: "github.com", autoLock: true }),
  { hostPattern: "github.com", autoLock: true });
check("export: rule with autoLock:false drops the field",
  normaliseForExport({ hostPattern: "github.com", autoLock: false }),
  { hostPattern: "github.com" });
check("export: rule with autoPin + autoLock emits both",
  normaliseForExport({ hostPattern: "github.com", autoPin: true, autoLock: true }),
  { hostPattern: "github.com", autoPin: true, autoLock: true });
check("export: rule with everything",
  normaliseForExport({
    hostPattern: "github.com",
    autoPin: true,
    autoLock: true,
    autoRedact: true,
    skipCapture: true,
    autoScrubOrigin: true,
  }),
  {
    hostPattern: "github.com",
    autoPin: true,
    autoLock: true,
    autoRedact: true,
    skipCapture: true,
    autoScrubOrigin: true,
  });

// --- 4. IO parse: strict boolean validation ------------------------------
check("parse: autoLock === true sets field",
  validateBooleanFields({ hostPattern: "x.com", autoLock: true }),
  { hostPattern: "x.com", autoLock: true });
check("parse: autoLock as string 'true' drops field (strict)",
  validateBooleanFields({ hostPattern: "x.com", autoLock: "true" }),
  { hostPattern: "x.com" });
check("parse: autoLock as 1 drops field (strict)",
  validateBooleanFields({ hostPattern: "x.com", autoLock: 1 }),
  { hostPattern: "x.com" });
check("parse: autoLock as null drops field",
  validateBooleanFields({ hostPattern: "x.com", autoLock: null }),
  { hostPattern: "x.com" });
check("parse: missing autoLock drops field",
  validateBooleanFields({ hostPattern: "x.com" }),
  { hostPattern: "x.com" });

// --- 5. liveRuleFrom (merge path) ---------------------------------------
check("liveRule: autoLock:true propagates as true",
  liveRuleFrom({ hostPattern: "x.com", autoLock: true }).autoLock, true);
check("liveRule: missing autoLock → false (defensive coercion)",
  liveRuleFrom({ hostPattern: "x.com" }).autoLock, false);
check("liveRule: autoLock:false → false",
  liveRuleFrom({ hostPattern: "x.com", autoLock: false }).autoLock, false);

// --- 6. round-trip end-to-end --------------------------------------------
// Live rule → serialized → parsed → live rule again.
const original = {
  hostPattern: "secrets.example.com",
  autoPin: true,
  autoLock: true,
  autoRedact: true,
  autoScrubOrigin: true,
};
const serialized = normaliseForExport(original);
const parsed = validateBooleanFields(serialized);
const re = liveRuleFrom(parsed);
check("round-trip: autoLock survives serialize→parse→liveRule",
  { autoPin: re.autoPin, autoLock: re.autoLock, autoRedact: re.autoRedact, autoScrubOrigin: re.autoScrubOrigin },
  { autoPin: true, autoLock: true, autoRedact: true, autoScrubOrigin: true });

// And the autoLock:false case round-trips to autoLock undefined on
// the wire and autoLock:false on rehydrate.
const rt2 = liveRuleFrom(validateBooleanFields(normaliseForExport({
  hostPattern: "open.example.com",
  autoLock: false,
})));
check("round-trip: autoLock:false → autoLock:false (defensive)", rt2.autoLock, false);

// --- 7. realistic combo with all rule effects ---------------------------
// Capture happens on a rule with autoPin + autoLock + autoRedact +
// customPatterns. The clip should end up pinned + locked + redacted.
const comboRule = {
  autoPin: true,
  autoLock: true,
  autoRedact: true,
};
const freshClip = {
  pinned: !!comboRule.autoPin,
  ...(comboRule.autoLock ? { locked: true } : {}),
  redacted: comboRule.autoRedact,
};
check("realistic: full-combo rule → pinned + locked + redacted",
  { pinned: freshClip.pinned, locked: freshClip.locked, redacted: freshClip.redacted },
  { pinned: true, locked: true, redacted: true });

console.log(`autoLock sanity: ${pass}/${total} passed`);
if (pass !== total) process.exit(1);
