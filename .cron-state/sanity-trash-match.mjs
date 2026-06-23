// Sanity: trash-match helper — find live re-capture by hash + format tooltip
//
// When a clip is trashed, the user may have already re-captured the
// same content (re-copy after trash, or duplicate that already had a
// live twin). Surfacing this in the hover-tooltip removes the "what
// if I lose this forever?" friction from trash housekeeping.

function findLiveRecaptureForTrash(trashedHash, liveClips) {
  if (typeof trashedHash !== "string" || trashedHash.length === 0) return null;
  if (!Array.isArray(liveClips)) return null;
  let best = null;
  let bestAt = -Infinity;
  for (const c of liveClips) {
    if (!c || typeof c.id !== "string" || c.id.length === 0) continue;
    if (typeof c.hash !== "string" || c.hash !== trashedHash) continue;
    const at =
      typeof c.lastSeenAt === "number" && Number.isFinite(c.lastSeenAt)
        ? c.lastSeenAt
        : -Infinity;
    if (at > bestAt) {
      bestAt = at;
      best = c;
    }
  }
  return best;
}

function formatShortAge(diffMs) {
  if (!Number.isFinite(diffMs)) return "recently";
  if (diffMs < 60_000) return "just now";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  if (diffMs < 7 * 86_400_000) return `${Math.floor(diffMs / 86_400_000)}d ago`;
  return `${Math.floor(diffMs / (7 * 86_400_000))} weeks ago`;
}

function formatTrashRecaptureTooltip(opts) {
  const match = opts.match;
  if (!match) {
    return "No live re-capture — purging this is permanent.";
  }
  const now =
    typeof opts.now === "number" && Number.isFinite(opts.now)
      ? opts.now
      : Date.now();
  const previewPeek =
    typeof opts.previewPeek === "number" &&
    Number.isFinite(opts.previewPeek) &&
    opts.previewPeek > 0
      ? Math.floor(opts.previewPeek)
      : 60;
  const at =
    typeof match.lastSeenAt === "number" && Number.isFinite(match.lastSeenAt)
      ? match.lastSeenAt
      : NaN;
  let head;
  if (Number.isFinite(at)) {
    head = `Live re-capture exists — ${formatShortAge(now - at)}. Safe to purge.`;
  } else {
    head = "Live re-capture exists — safe to purge.";
  }
  const peekSource = match.preview || match.content || "";
  if (typeof peekSource === "string" && peekSource.trim().length > 0) {
    const flat = peekSource.trim().replace(/\s+/g, " ");
    const cut =
      flat.length <= previewPeek
        ? flat
        : flat.slice(0, previewPeek).replace(/\s+\S*$/, "") + "…";
    return `${head}\n"${cut}"`;
  }
  return head;
}

let pass = 0, fail = 0;
function check(name, ok) {
  if (ok) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

const NOW = 1_700_000_000_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

// --- findLiveRecaptureForTrash ---

// Defensive shapes
check("missing hash → null", findLiveRecaptureForTrash(undefined, []) === null);
check("empty hash → null", findLiveRecaptureForTrash("", []) === null);
check("non-string hash → null", findLiveRecaptureForTrash(42, []) === null);
check("non-array live → null", findLiveRecaptureForTrash("h", null) === null);

// No match
const noMatch = [{ id: "a", hash: "other", lastSeenAt: NOW }];
check("no hash match → null", findLiveRecaptureForTrash("target", noMatch) === null);

// Single match
const single = [{ id: "a", hash: "target", lastSeenAt: NOW - HOUR }];
const m1 = findLiveRecaptureForTrash("target", single);
check("single match returned", m1 && m1.id === "a");

// Multiple matches → newest lastSeenAt wins
const multi = [
  { id: "old", hash: "target", lastSeenAt: NOW - 3 * DAY },
  { id: "new", hash: "target", lastSeenAt: NOW - HOUR },
  { id: "mid", hash: "target", lastSeenAt: NOW - DAY },
];
const m2 = findLiveRecaptureForTrash("target", multi);
check("newest match wins", m2 && m2.id === "new");

// Match with missing lastSeenAt loses to one with a real stamp
const partial = [
  { id: "no-stamp", hash: "target" },
  { id: "stamped", hash: "target", lastSeenAt: NOW - DAY },
];
const m3 = findLiveRecaptureForTrash("target", partial);
check("stamped beats unstamped", m3 && m3.id === "stamped");

// All unstamped → null wins (none satisfies > -Infinity? No, the first wins via -Infinity tie-break)
// Actually: bestAt starts at -Infinity, first iteration sees -Infinity > -Infinity = false. So no winner.
// Let me verify: ALL unstamped → best stays null.
const allUnstamped = [
  { id: "a", hash: "target" },
  { id: "b", hash: "target" },
];
const m4 = findLiveRecaptureForTrash("target", allUnstamped);
check("all-unstamped → null (no > strict win)", m4 === null);

// Defensive bad entries
const broken = [
  null,
  undefined,
  { hash: "target" }, // no id
  { id: "", hash: "target" }, // empty id
  { id: "real", hash: "target", lastSeenAt: NOW - HOUR },
  { id: "wrong-type", hash: 42, lastSeenAt: NOW - HOUR }, // non-string hash
];
const m5 = findLiveRecaptureForTrash("target", broken);
check("broken entries dropped, real wins", m5 && m5.id === "real");

// Hash with no value just doesn't match (cant compare undefined)
const noHash = [{ id: "a", lastSeenAt: NOW }];
check("clip without hash → no match", findLiveRecaptureForTrash("target", noHash) === null);

// --- formatTrashRecaptureTooltip ---

check("null match → permanent warning", formatTrashRecaptureTooltip({ match: null }) === "No live re-capture — purging this is permanent.");
check("undefined match → permanent warning", formatTrashRecaptureTooltip({ match: undefined }) === "No live re-capture — purging this is permanent.");

const matchFresh = { id: "x", lastSeenAt: NOW - 30 * 60_000 };
const tooltipFresh = formatTrashRecaptureTooltip({ match: matchFresh, now: NOW });
check("fresh match tooltip mentions Safe to purge", tooltipFresh.includes("Safe to purge"));
check("fresh match has age '30m ago'", tooltipFresh.includes("30m ago"));

const matchOld = { id: "y", lastSeenAt: NOW - 5 * DAY };
const tooltipOld = formatTrashRecaptureTooltip({ match: matchOld, now: NOW });
check("days-old match has 'd ago'", tooltipOld.includes("5d ago"));

const matchJust = { id: "z", lastSeenAt: NOW - 5_000 };
check("under 60s → just now", formatTrashRecaptureTooltip({ match: matchJust, now: NOW }).includes("just now"));

const matchNoStamp = { id: "w" };
const tooltipNoStamp = formatTrashRecaptureTooltip({ match: matchNoStamp, now: NOW });
check("no lastSeenAt → 'safe to purge' without age", tooltipNoStamp.includes("safe to purge") && !tooltipNoStamp.includes("ago"));

// Preview included when present
const matchPreview = { id: "p", preview: "hello world", lastSeenAt: NOW - HOUR };
const tooltipPreview = formatTrashRecaptureTooltip({ match: matchPreview, now: NOW });
check("preview included in tooltip", tooltipPreview.includes('"hello world"'));

// Long preview truncated with ellipsis
const longContent = "word ".repeat(50).trim();
const tooltipLong = formatTrashRecaptureTooltip({
  match: { id: "p", preview: longContent, lastSeenAt: NOW - HOUR },
  now: NOW,
});
check("long preview truncated", tooltipLong.includes("…"));

// Falls back to content when no preview
const matchContent = { id: "p", content: "from content", lastSeenAt: NOW - HOUR };
check("content used as preview fallback", formatTrashRecaptureTooltip({ match: matchContent, now: NOW }).includes('"from content"'));

// Empty preview/content skipped (just head, no extra quote)
const matchEmpty = { id: "p", preview: "   ", content: "", lastSeenAt: NOW - HOUR };
check("empty preview skipped", !formatTrashRecaptureTooltip({ match: matchEmpty, now: NOW }).includes('"'));

// Custom peek length
const tooltipPeek = formatTrashRecaptureTooltip({
  match: { id: "p", preview: "abcdefghijklmnopqrstuvwxyz", lastSeenAt: NOW - HOUR },
  now: NOW,
  previewPeek: 10,
});
// Length includes the head + "..." truncation
check("custom previewPeek truncates", tooltipPeek.includes("abcde") && tooltipPeek.includes("…"));

// Bad previewPeek falls back to default
const tooltipBadPeek = formatTrashRecaptureTooltip({
  match: { id: "p", preview: "short", lastSeenAt: NOW - HOUR },
  now: NOW,
  previewPeek: -5,
});
check("bad previewPeek doesn't crash", tooltipBadPeek.includes('"short"'));

// Future lastSeenAt (clock skew) → "just now"
const matchFuture = { id: "f", lastSeenAt: NOW + HOUR };
check("future lastSeenAt → just now", formatTrashRecaptureTooltip({ match: matchFuture, now: NOW }).includes("just now"));

console.log(`\n${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
