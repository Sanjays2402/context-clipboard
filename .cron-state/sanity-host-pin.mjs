// Sanity: host-pin — Cmd+K "Pin every clip from active tab's host"
// helpers. Covers matching rules, pinned-skip semantics, label
// grammar, and defensive guards.

// --- Module under test (inlined; mirrors src/lib/host-pin.ts) -----------

function normaliseHost(raw) {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase().replace(/^www\./, "");
}

function hostFromUrl(u) {
  if (typeof u !== "string" || u.length === 0) return "";
  try {
    const url = new URL(u);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function idsToPinForHost(host, clips) {
  const target = normaliseHost(host);
  if (!target) return [];
  if (!Array.isArray(clips)) return [];
  const out = [];
  for (const c of clips) {
    if (!c || typeof c.id !== "string" || c.id.length === 0) continue;
    if (c.pinned === true) continue;
    if (hostFromUrl(c.source?.url) !== target) continue;
    out.push(c.id);
  }
  return out;
}

function availableToPin(host, clips) {
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

function matchedClipsForHost(host, clips) {
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

function formatPinFromHostLabel(opts) {
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

// --- Test harness --------------------------------------------------------

let pass = 0;
let total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}

// --- 1. idsToPinForHost: matching basics --------------------------------

const clips = [
  { id: "a", pinned: false, source: { url: "https://github.com/foo" } },
  { id: "b", pinned: true, source: { url: "https://github.com/bar" } },
  { id: "c", pinned: false, source: { url: "https://docs.github.com/x" } },
  { id: "d", source: { url: "https://github.com/baz" } }, // pinned undefined
  { id: "e", pinned: false, source: { url: "https://example.com/foo" } },
  { id: "f", pinned: false, source: {} }, // no url (scrubbed)
  { id: "g", pinned: false, source: { url: "data:text/plain,x" } }, // data: scheme
  { id: "h", pinned: false }, // no source at all
];

check("ids: github.com matches a, d (not pinned b, not subdomain c)",
  idsToPinForHost("github.com", clips), ["a", "d"]);

// Subdomain doesn't collapse — docs.github.com is its own host.
check("ids: docs.github.com matches only c",
  idsToPinForHost("docs.github.com", clips), ["c"]);

// example.com matches e only.
check("ids: example.com matches e", idsToPinForHost("example.com", clips), ["e"]);

// Host with zero matches.
check("ids: unknown.com → []", idsToPinForHost("unknown.com", clips), []);

// --- 2. idsToPinForHost: host normalisation ------------------------------
check("ids: www-strip on input (www.github.com → github.com)",
  idsToPinForHost("www.github.com", clips), ["a", "d"]);
check("ids: case-insensitive input (GITHUB.COM → github.com)",
  idsToPinForHost("GITHUB.COM", clips), ["a", "d"]);
check("ids: trim input ('  github.com  ' → github.com)",
  idsToPinForHost("  github.com  ", clips), ["a", "d"]);
check("ids: combined trim+case+www",
  idsToPinForHost("  WWW.GitHub.COM  ", clips), ["a", "d"]);

// www-strip on the CLIP'S url too — captured from www.example.com should
// match the input example.com (and vice versa).
const wwwClips = [
  { id: "w1", source: { url: "https://www.example.com/foo" } },
  { id: "w2", source: { url: "https://example.com/bar" } },
];
check("ids: clip URLs www-stripped (both surface for example.com)",
  idsToPinForHost("example.com", wwwClips), ["w1", "w2"]);
check("ids: clip URLs www-stripped (both surface for www.example.com input)",
  idsToPinForHost("www.example.com", wwwClips), ["w1", "w2"]);

// --- 3. idsToPinForHost: pinned-skip semantics ---------------------------
// All-pinned host returns empty (the command's whole point is to pin the
// not-yet-pinned ones).
const allPinned = [
  { id: "p1", pinned: true, source: { url: "https://a.com/x" } },
  { id: "p2", pinned: true, source: { url: "https://a.com/y" } },
];
check("ids: all-pinned host → []", idsToPinForHost("a.com", allPinned), []);

// Mix of pinned + unpinned.
const mixed = [
  { id: "u1", pinned: false, source: { url: "https://a.com/1" } },
  { id: "u2", pinned: true, source: { url: "https://a.com/2" } },
  { id: "u3", pinned: undefined, source: { url: "https://a.com/3" } },
  { id: "u4", pinned: null, source: { url: "https://a.com/4" } },
];
check("ids: mixed pinned/unpinned/undefined/null → only unpinned",
  idsToPinForHost("a.com", mixed), ["u1", "u3", "u4"]);

// Strict ===true: pinned:1 (truthy non-boolean) counts as unpinned (=consistent
// with clip-lock's strict gate).
check("ids: pinned:1 (truthy non-boolean) → still pinnable (strict ===true)",
  idsToPinForHost("a.com", [{ id: "x", pinned: 1, source: { url: "https://a.com/" } }]),
  ["x"]);

// --- 4. idsToPinForHost: defensive guards --------------------------------
check("ids: empty host → []", idsToPinForHost("", clips), []);
check("ids: whitespace host → []", idsToPinForHost("   ", clips), []);
check("ids: null host → []", idsToPinForHost(null, clips), []);
check("ids: undefined host → []", idsToPinForHost(undefined, clips), []);
check("ids: non-string host (number) → []", idsToPinForHost(42, clips), []);
check("ids: non-array clips → []", idsToPinForHost("github.com", null), []);
check("ids: clips as object → []", idsToPinForHost("github.com", { id: "x" }), []);

// Bad entries silently dropped.
const bad = [
  null,
  undefined,
  { id: "", source: { url: "https://a.com/" } },
  { id: 42, source: { url: "https://a.com/" } },
  { source: { url: "https://a.com/" } },
  { id: "good", source: { url: "https://a.com/" } },
];
check("ids: bad entries dropped, good survives",
  idsToPinForHost("a.com", bad), ["good"]);

// Malformed source URLs.
const badUrls = [
  { id: "u1", source: { url: "not a url" } },
  { id: "u2", source: { url: "" } },
  { id: "u3", source: { url: null } },
  { id: "u4", source: { url: undefined } },
  { id: "u5", source: { url: "https://valid.com/" } },
];
check("ids: malformed URLs skipped, valid surfaces",
  idsToPinForHost("valid.com", badUrls), ["u5"]);

// --- 5. availableToPin: count parity with ids ----------------------------
check("count: parity with ids.length for github.com",
  availableToPin("github.com", clips), idsToPinForHost("github.com", clips).length);
check("count: parity for unknown.com (0)", availableToPin("unknown.com", clips), 0);
check("count: parity for all-pinned (0)", availableToPin("a.com", allPinned), 0);
check("count: parity for mixed (3)", availableToPin("a.com", mixed), 3);
check("count: empty host → 0", availableToPin("", clips), 0);

// --- 6. matchedClipsForHost: counts include already-pinned ---------------
check("matched: github.com counts all 3 (a, b pinned, d)",
  matchedClipsForHost("github.com", clips), 3);
check("matched: all-pinned host returns true count",
  matchedClipsForHost("a.com", allPinned), 2);
check("matched: unknown host → 0",
  matchedClipsForHost("unknown.com", clips), 0);
check("matched: empty host → 0",
  matchedClipsForHost("", clips), 0);

// --- 7. formatPinFromHostLabel: shape matrix -----------------------------
check("label: no host → 'this site' fallback (greyed)",
  formatPinFromHostLabel({ host: "", matched: 0, pinnable: 0 }),
  {
    label: "Pin every clip from this site",
    hint: "No site context — open this on a normal http(s) tab",
    available: false,
  });

check("label: host, 0 matched → 'no captures yet' (greyed)",
  formatPinFromHostLabel({ host: "github.com", matched: 0, pinnable: 0 }),
  {
    label: "Pin every clip from github.com",
    hint: "No clips captured from this site yet",
    available: false,
  });

check("label: host, 5 matched, 0 pinnable → 'All 5 already pinned' (greyed)",
  formatPinFromHostLabel({ host: "github.com", matched: 5, pinnable: 0 }),
  {
    label: "Pin every clip from github.com",
    hint: "All 5 already pinned",
    available: false,
  });

check("label: host, 1 pinnable → singular 'clip' + available",
  formatPinFromHostLabel({ host: "github.com", matched: 3, pinnable: 1 }),
  {
    label: "Pin 1 clip from github.com",
    hint: "One-shot triage — captures stay sorted to the top of the daily list",
    available: true,
  });

check("label: host, 4 pinnable → plural 'clips' + available",
  formatPinFromHostLabel({ host: "github.com", matched: 7, pinnable: 4 }),
  {
    label: "Pin 4 clips from github.com",
    hint: "One-shot triage — captures stay sorted to the top of the daily list",
    available: true,
  });

// Host normalisation in label (input GITHUB.COM gets displayed as github.com).
check("label: input GITHUB.COM normalised in display",
  formatPinFromHostLabel({ host: "GITHUB.COM", matched: 3, pinnable: 1 }).label,
  "Pin 1 clip from github.com");

check("label: www-strip in display",
  formatPinFromHostLabel({ host: "www.example.com", matched: 0, pinnable: 0 }).label,
  "Pin every clip from example.com");

// --- 8. formatPinFromHostLabel: defensive number coercion ----------------
check("label: NaN matched → 0", 
  formatPinFromHostLabel({ host: "a.com", matched: NaN, pinnable: 0 }).hint,
  "No clips captured from this site yet");
check("label: negative matched coerced to 0",
  formatPinFromHostLabel({ host: "a.com", matched: -5, pinnable: 0 }).hint,
  "No clips captured from this site yet");
check("label: fractional pinnable floors (3.7 → 3)",
  formatPinFromHostLabel({ host: "a.com", matched: 5, pinnable: 3.7 }).label,
  "Pin 3 clips from a.com");
check("label: string-number coerced",
  formatPinFromHostLabel({ host: "a.com", matched: "5", pinnable: "2" }).label,
  "Pin 2 clips from a.com");

// --- 9. End-to-end: realistic 10-clip ring -------------------------------
const realistic = [
  { id: "r1", pinned: false, source: { url: "https://github.com/sanjay/repo" } },
  { id: "r2", pinned: true, source: { url: "https://github.com/sanjay/repo/issues/1" } },
  { id: "r3", pinned: false, source: { url: "https://github.com/sanjay/repo/pull/2" } },
  { id: "r4", pinned: false, source: { url: "https://docs.github.com/rest" } },
  { id: "r5", pinned: false, source: { url: "https://example.com/blog" } },
  { id: "r6", pinned: true, source: { url: "https://example.com/about" } },
  { id: "r7", pinned: false, source: { url: "https://www.github.com/sanjay/notes" } },
  { id: "r8", pinned: false, source: {} },
  { id: "r9", pinned: false, source: { url: "https://news.ycombinator.com/" } },
  { id: "r10", pinned: false, source: { url: "https://github.com/sanjay/wip" } },
];
const githubMatch = matchedClipsForHost("github.com", realistic);
const githubPin = availableToPin("github.com", realistic);
const githubIds = idsToPinForHost("github.com", realistic);
check("realistic: 5 matched on github.com (r1 r2 r3 r7 r10, with www-strip)",
  githubMatch, 5);
check("realistic: 4 pinnable (r2 already pinned)", githubPin, 4);
check("realistic: pinnable ids in order", githubIds, ["r1", "r3", "r7", "r10"]);
const githubLabel = formatPinFromHostLabel({
  host: "github.com",
  matched: githubMatch,
  pinnable: githubPin,
});
check("realistic: label 'Pin 4 clips from github.com'",
  githubLabel.label, "Pin 4 clips from github.com");
check("realistic: available true", githubLabel.available, true);

// docs.github.com is its own host — only r4.
check("realistic: docs.github.com only r4",
  idsToPinForHost("docs.github.com", realistic), ["r4"]);

console.log(`host-pin sanity: ${pass}/${total} pass`);
if (pass !== total) process.exit(1);
