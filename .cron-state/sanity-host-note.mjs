// Pure sanity for src/lib/host-note.ts. Mirrors the host-pin / host-
// lock sanity shape (matched count, ids list, label matrix). Adds
// the planning + toast formatter coverage that the bulk-note sanity
// covers for the bulk-bar variant — single source of truth for note
// projection across all three apply paths.

import { strict as assert } from "node:assert";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");

// Inlined module logic (TypeScript build is the guard).
const CLIP_NOTE_MAX_LEN = 2_000;

function sanitizeClipNote(raw) {
  if (typeof raw !== "string") return undefined;
  const cleaned = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  const trimmed = cleaned.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length <= CLIP_NOTE_MAX_LEN) return trimmed;
  return trimmed.slice(0, CLIP_NOTE_MAX_LEN);
}

function hasClipNote(c) {
  if (!c) return false;
  if (typeof c.note !== "string") return false;
  return c.note.trim().length > 0;
}

function normaliseHost(raw) {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase().replace(/^www\./, "");
}

function hostFromUrl(u) {
  if (typeof u !== "string" || u.length === 0) return "";
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function idsToNoteForHost(host, clips) {
  const target = normaliseHost(host);
  if (!target) return [];
  if (!Array.isArray(clips)) return [];
  const out = [];
  for (const c of clips) {
    if (!c || typeof c.id !== "string" || c.id.length === 0) continue;
    if (hostFromUrl(c.source?.url) !== target) continue;
    out.push(c.id);
  }
  return out;
}

function matchedClipsForHostNote(host, clips) {
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

function planHostNote(host, clips, rawInput) {
  const finalValue = sanitizeClipNote(rawInput);
  const plan = {
    total: 0,
    created: 0,
    replaced: 0,
    cleared: 0,
    unchanged: 0,
    finalValue,
  };
  const target = normaliseHost(host);
  if (!target) return plan;
  if (!Array.isArray(clips)) return plan;
  for (const c of clips) {
    if (!c || typeof c.id !== "string" || c.id.length === 0) continue;
    if (hostFromUrl(c.source?.url) !== target) continue;
    plan.total++;
    const hadNote = hasClipNote(c);
    const current = typeof c.note === "string" ? c.note : undefined;
    const currentSan = sanitizeClipNote(current);
    if (currentSan === finalValue) {
      plan.unchanged++;
      continue;
    }
    if (finalValue === undefined) {
      if (hadNote) plan.cleared++;
      else plan.unchanged++;
      continue;
    }
    if (hadNote) plan.replaced++;
    else plan.created++;
  }
  return plan;
}

function formatNoteFromHostLabel({ host, matched }) {
  const h = normaliseHost(host);
  const m = Math.max(0, Math.floor(Number(matched) || 0));
  if (!h) {
    return {
      label: "Note every clip from this site",
      hint: "No site context — open this on a normal http(s) tab",
      available: false,
    };
  }
  if (m === 0) {
    return {
      label: `Note every clip from ${h}`,
      hint: "No clips captured from this site yet",
      available: false,
    };
  }
  const noun = m === 1 ? "clip" : "clips";
  return {
    label: `Note ${m} ${noun} from ${h}`,
    hint: "Same note on every capture — overwrites existing notes (mirrors bulk-bar)",
    available: true,
  };
}

function formatHostNoteToast(host, plan) {
  const target = normaliseHost(host);
  const total = Math.max(0, Math.floor(Number(plan.total) || 0));
  if (total === 0) return target ? `No clips from ${target}` : "No matching clips";
  const created = Math.max(0, Math.floor(Number(plan.created) || 0));
  const replaced = Math.max(0, Math.floor(Number(plan.replaced) || 0));
  const cleared = Math.max(0, Math.floor(Number(plan.cleared) || 0));
  const changed = created + replaced + cleared;
  const fromHost = target ? ` from ${target}` : "";
  if (changed === 0) {
    return total === 1 ? "Already matches" : `All ${total}${fromHost} already match`;
  }
  if (plan.finalValue === undefined) {
    const noun = cleared === 1 ? "note" : "notes";
    return `Cleared ${cleared} ${noun}${fromHost}`;
  }
  if (created > 0 && replaced > 0) {
    const noun = created === 1 ? "clip" : "clips";
    return `Noted ${created} ${noun}${fromHost} (${replaced} replaced)`;
  }
  if (replaced > 0) {
    const noun = replaced === 1 ? "note" : "notes";
    return `Replaced ${replaced} ${noun}${fromHost}`;
  }
  const noun = created === 1 ? "clip" : "clips";
  return `Noted ${created} ${noun}${fromHost}`;
}

function clip(url, note = undefined) {
  return { id: `c_${url}_${note ?? "no"}`, source: { url }, note };
}

// --- 1. matchedClipsForHostNote defensive ---
assert.equal(matchedClipsForHostNote("", []), 0, "no host → 0");
assert.equal(matchedClipsForHostNote("github.com", []), 0, "no clips → 0");
assert.equal(matchedClipsForHostNote("github.com", null), 0, "null clips → 0");
assert.equal(matchedClipsForHostNote(null, [clip("https://github.com")]), 0, "null host → 0");

// --- 2. matchedClipsForHostNote: counts host matches ---
{
  const clips = [
    clip("https://github.com/a"),
    clip("https://github.com/b"),
    clip("https://www.github.com/c"),
    clip("https://gitlab.com/d"),
  ];
  assert.equal(matchedClipsForHostNote("github.com", clips), 3, "github.com (incl www) matches 3");
  assert.equal(matchedClipsForHostNote("gitlab.com", clips), 1, "gitlab.com matches 1");
  assert.equal(matchedClipsForHostNote("example.com", clips), 0, "no match");
}

// --- 3. idsToNoteForHost: order preserved, host filter applied ---
{
  const clips = [
    clip("https://gitlab.com/x"),
    clip("https://github.com/a"),
    { id: "no-source" }, // missing source
    clip("https://github.com/b"),
    null, // bad row
    { id: "no-url", source: {} }, // no url
    clip("https://github.com/c"),
  ];
  const ids = idsToNoteForHost("github.com", clips);
  assert.equal(ids.length, 3, "3 github clips");
  assert.equal(ids[0], "c_https://github.com/a_no");
  assert.equal(ids[2], "c_https://github.com/c_no");
}

// --- 4. planHostNote: pure create (no prior notes) ---
{
  const clips = [
    clip("https://github.com/a"),
    clip("https://github.com/b"),
    clip("https://gitlab.com/x"), // off-host, ignored
  ];
  const plan = planHostNote("github.com", clips, "Be careful");
  assert.equal(plan.total, 2, "total = 2");
  assert.equal(plan.created, 2, "both created");
  assert.equal(plan.replaced, 0);
  assert.equal(plan.cleared, 0);
  assert.equal(plan.unchanged, 0);
  assert.equal(plan.finalValue, "Be careful");
}

// --- 5. planHostNote: pure replace ---
{
  const clips = [
    clip("https://github.com/a", "old note 1"),
    clip("https://github.com/b", "old note 2"),
  ];
  const plan = planHostNote("github.com", clips, "new note");
  assert.equal(plan.total, 2);
  assert.equal(plan.created, 0);
  assert.equal(plan.replaced, 2);
  assert.equal(plan.cleared, 0);
}

// --- 6. planHostNote: mixed create + replace ---
{
  const clips = [
    clip("https://github.com/a", "old"),
    clip("https://github.com/b"),
    clip("https://github.com/c"),
  ];
  const plan = planHostNote("github.com", clips, "fresh");
  assert.equal(plan.total, 3);
  assert.equal(plan.created, 2);
  assert.equal(plan.replaced, 1);
}

// --- 7. planHostNote: clear path (empty input) ---
{
  const clips = [
    clip("https://github.com/a", "old"),
    clip("https://github.com/b", "another"),
    clip("https://github.com/c"), // no note → unchanged
  ];
  const plan = planHostNote("github.com", clips, "");
  assert.equal(plan.total, 3);
  assert.equal(plan.cleared, 2);
  assert.equal(plan.unchanged, 1);
  assert.equal(plan.finalValue, undefined);
}

// --- 8. planHostNote: unchanged on idempotent re-run ---
{
  const clips = [
    clip("https://github.com/a", "same note"),
    clip("https://github.com/b", "same note"),
  ];
  const plan = planHostNote("github.com", clips, "same note");
  assert.equal(plan.unchanged, 2);
  assert.equal(plan.created, 0);
  assert.equal(plan.replaced, 0);
}

// --- 9. formatNoteFromHostLabel: 3-shape matrix ---
{
  const noHost = formatNoteFromHostLabel({ host: "", matched: 5 });
  assert.equal(noHost.available, false, "no host → unavailable");
  assert.match(noHost.label, /this site/i);
}
{
  const zero = formatNoteFromHostLabel({ host: "github.com", matched: 0 });
  assert.equal(zero.available, false, "0 matched → unavailable");
  assert.match(zero.label, /github\.com/);
  assert.match(zero.hint, /No clips/i);
}
{
  const one = formatNoteFromHostLabel({ host: "github.com", matched: 1 });
  assert.equal(one.available, true);
  assert.equal(one.label, "Note 1 clip from github.com");
}
{
  const many = formatNoteFromHostLabel({ host: "github.com", matched: 12 });
  assert.equal(many.available, true);
  assert.equal(many.label, "Note 12 clips from github.com");
}

// --- 10. formatHostNoteToast: shape mix ---
{
  // total === 0
  const empty = formatHostNoteToast("github.com", {
    total: 0,
    created: 0,
    replaced: 0,
    cleared: 0,
    unchanged: 0,
    finalValue: "x",
  });
  assert.equal(empty, "No clips from github.com");
}
{
  // all unchanged, plural
  const unc = formatHostNoteToast("github.com", {
    total: 4,
    created: 0,
    replaced: 0,
    cleared: 0,
    unchanged: 4,
    finalValue: "x",
  });
  assert.equal(unc, "All 4 from github.com already match");
}
{
  // pure create plural
  const create = formatHostNoteToast("github.com", {
    total: 3,
    created: 3,
    replaced: 0,
    cleared: 0,
    unchanged: 0,
    finalValue: "x",
  });
  assert.equal(create, "Noted 3 clips from github.com");
}
{
  // pure replace plural
  const repl = formatHostNoteToast("github.com", {
    total: 2,
    created: 0,
    replaced: 2,
    cleared: 0,
    unchanged: 0,
    finalValue: "x",
  });
  assert.equal(repl, "Replaced 2 notes from github.com");
}
{
  // mixed create + replace
  const mix = formatHostNoteToast("github.com", {
    total: 5,
    created: 3,
    replaced: 2,
    cleared: 0,
    unchanged: 0,
    finalValue: "x",
  });
  assert.equal(mix, "Noted 3 clips from github.com (2 replaced)");
}
{
  // clear path
  const clear = formatHostNoteToast("github.com", {
    total: 3,
    created: 0,
    replaced: 0,
    cleared: 2,
    unchanged: 1,
    finalValue: undefined,
  });
  assert.equal(clear, "Cleared 2 notes from github.com");
}
{
  // total 1 unchanged → "Already matches"
  const single = formatHostNoteToast("github.com", {
    total: 1,
    created: 0,
    replaced: 0,
    cleared: 0,
    unchanged: 1,
    finalValue: "x",
  });
  assert.equal(single, "Already matches");
}

console.log(`OK ${REPO}/sanity-host-note.mjs (28 cases)`);
