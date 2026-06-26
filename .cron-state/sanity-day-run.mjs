// Sanity: day-run selection helper (lib/day-run).
//
// Clicking a day-group divider ("Today · 6") selects the whole day's
// contiguous run in one tap (toggle: a second tap clears it). This
// harness exercises the pure core (inline copies, bundler-free): the
// run id-collector with its bounds clamping, and the select/deselect
// toggle decision.
//
// Coverage:
//   1. dayRunClipIds — slices the right window; clamps a stale count to
//      the list length; rejects bad start/count; skips malformed rows.
//   2. dayRunToggleAction — "deselect" only when EVERY run id is already
//      selected; "select" otherwise (incl. partial + empty run).

function dayRunClipIds(clips, startIndex, count) {
  if (!Array.isArray(clips) || clips.length === 0) return [];
  if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex >= clips.length) return [];
  if (!Number.isFinite(count) || count <= 0) return [];
  const end = Math.min(clips.length, startIndex + Math.trunc(count));
  const out = [];
  for (let i = startIndex; i < end; i++) {
    const c = clips[i];
    if (c && typeof c.id === "string" && c.id !== "") out.push(c.id);
  }
  return out;
}
function dayRunToggleAction(runIds, selected) {
  if (!Array.isArray(runIds) || runIds.length === 0) return "select";
  const allSelected = runIds.every((id) => selected.has(id));
  return allSelected ? "deselect" : "select";
}

let p = 0, t = 0;
function ck(n, g, w) {
  t++;
  if (JSON.stringify(g) === JSON.stringify(w)) p++;
  else console.error("FAIL", n, "got", JSON.stringify(g), "want", JSON.stringify(w));
}

// A list of 7 clips: pinned tier (1), Today (3), Yesterday (3).
const clips = [
  { id: "p1" },              // 0 pinned run
  { id: "a" }, { id: "b" }, { id: "c" },   // 1..3 today run
  { id: "d" }, { id: "e" }, { id: "f" },   // 4..6 yesterday run
];

// 1. slice windows
ck("pinned run (start 0, count 1)", dayRunClipIds(clips, 0, 1), ["p1"]);
ck("today run (start 1, count 3)", dayRunClipIds(clips, 1, 3), ["a", "b", "c"]);
ck("yesterday run (start 4, count 3)", dayRunClipIds(clips, 4, 3), ["d", "e", "f"]);
// stale count past end -> clamp
ck("count past end clamps to list length", dayRunClipIds(clips, 5, 9), ["e", "f"]);
// bad inputs
ck("negative start -> []", dayRunClipIds(clips, -1, 3), []);
ck("start past end -> []", dayRunClipIds(clips, 99, 3), []);
ck("zero count -> []", dayRunClipIds(clips, 1, 0), []);
ck("non-integer start -> []", dayRunClipIds(clips, 1.5, 3), []);
ck("nullish list -> []", dayRunClipIds(null, 0, 3), []);
// skip a malformed row inside the run
ck("skips malformed row", dayRunClipIds([{ id: "x" }, null, { id: "y" }], 0, 3), ["x", "y"]);

// 2. toggle decision
const sel = new Set(["a", "b", "c"]);
ck("all run selected -> deselect", dayRunToggleAction(["a", "b", "c"], sel), "deselect");
ck("partial selected -> select", dayRunToggleAction(["a", "b", "d"], sel), "select");
ck("none selected -> select", dayRunToggleAction(["d", "e"], sel), "select");
ck("empty run -> select", dayRunToggleAction([], sel), "select");
ck("single already-selected -> deselect", dayRunToggleAction(["a"], sel), "deselect");

console.log(`day-run: ${p}/${t}`);
process.exit(p === t ? 0 : 1);
