// Sanity: bulk-export tag-filter helpers — filterClipsByTag + formatBulkExportTagToast
//
// The tag filter is an OPTIONAL refinement on top of the existing
// bulk-bar selection - empty tag input falls through to the full
// selection. Tag matching is case-insensitive + trimmed (matches the
// rest of the codebase's tag handling).

function filterClipsByTag(clips, tag) {
  if (!Array.isArray(clips)) return [];
  const needle = typeof tag === "string" ? tag.trim().toLowerCase() : "";
  if (!needle) return clips.slice();
  const out = [];
  for (const c of clips) {
    if (!c || typeof c.id !== "string" || c.id.length === 0) continue;
    if (!Array.isArray(c.tags)) continue;
    let hit = false;
    for (const t of c.tags) {
      if (typeof t !== "string") continue;
      if (t.trim().toLowerCase() === needle) {
        hit = true;
        break;
      }
    }
    if (hit) out.push(c);
  }
  return out;
}

function formatBulkExportToast(opts) {
  const exported = Math.max(0, Math.floor(Number(opts.exported) || 0));
  const selected = Math.max(0, Math.floor(Number(opts.selected) || 0));
  if (exported === 0) return "Nothing to export";
  const noun = exported === 1 ? "clip" : "clips";
  if (exported === selected || selected === 0) {
    return `Exported ${exported} ${noun}`;
  }
  const skipped = Math.max(0, selected - exported);
  return `Exported ${exported} of ${selected} ${noun} (${skipped} skipped)`;
}

function formatBulkExportTagToast(opts) {
  const exported = Math.max(0, Math.floor(Number(opts.exported) || 0));
  const selected = Math.max(0, Math.floor(Number(opts.selected) || 0));
  const tag = (typeof opts.tag === "string" ? opts.tag : "").trim();
  if (!tag) return formatBulkExportToast({ exported, selected });
  if (exported === 0) return `No selected clips tagged "${tag}"`;
  const noun = exported === 1 ? "clip" : "clips";
  if (exported === selected) return `Exported ${exported} ${noun} (tag: ${tag})`;
  return `Exported ${exported} of ${selected} selected ${noun} (tag: ${tag})`;
}

let pass = 0, fail = 0;
function check(name, ok) {
  if (ok) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

// Defensive
check("non-array → []", filterClipsByTag(null, "x").length === 0);
check("undefined → []", filterClipsByTag(undefined, "x").length === 0);

// Empty tag → pass-through (slice, not reference)
const all = [{ id: "a", tags: [] }, { id: "b", tags: ["foo"] }];
check("empty tag → full pass-through", filterClipsByTag(all, "").length === 2);
check("whitespace tag → full pass-through", filterClipsByTag(all, "   ").length === 2);
check("null tag → full pass-through", filterClipsByTag(all, null).length === 2);
check("undefined tag → full pass-through", filterClipsByTag(all, undefined).length === 2);
check("non-string tag → full pass-through", filterClipsByTag(all, 42).length === 2);
const sliced = filterClipsByTag(all, "");
check("pass-through is a copy (slice)", sliced !== all);

// Real tag matching
const tagged = [
  { id: "a", tags: ["foo"] },
  { id: "b", tags: ["bar", "baz"] },
  { id: "c", tags: ["BAZ"] },             // case-insensitive
  { id: "d", tags: ["  baz  "] },         // trimmed
  { id: "e", tags: [] },                  // no tags
  { id: "f", tags: ["other"] },           // doesn't match
];
const baz = filterClipsByTag(tagged, "baz");
check("baz matches 3 (b, c, d)", baz.length === 3);
check("baz includes b", baz.find((c) => c.id === "b") !== undefined);
check("baz includes c (case-insensitive)", baz.find((c) => c.id === "c") !== undefined);
check("baz includes d (trimmed)", baz.find((c) => c.id === "d") !== undefined);
check("baz excludes e (no tags)", baz.find((c) => c.id === "e") === undefined);
check("baz excludes f (other tag)", baz.find((c) => c.id === "f") === undefined);

// Order preserved
const ordered = [
  { id: "1", tags: ["x"] },
  { id: "2", tags: ["y"] },
  { id: "3", tags: ["x"] },
  { id: "4", tags: ["x"] },
];
const x = filterClipsByTag(ordered, "x");
check("preserves input order", x.map((c) => c.id).join("") === "134");

// Tag input is also case-insensitive (matches uppercase needle)
check("uppercase needle matches lowercase tag", filterClipsByTag([{ id: "a", tags: ["foo"] }], "FOO").length === 1);
check("padded needle matches", filterClipsByTag([{ id: "a", tags: ["foo"] }], "  foo  ").length === 1);

// Defensive against bad entries
const broken = [
  null,
  undefined,
  { id: "", tags: ["foo"] },         // empty id
  { tags: ["foo"] },                 // missing id
  { id: "good", tags: ["foo"] },
  { id: "weird", tags: "foo" },      // non-array tags
  { id: "weirder", tags: [42, "foo"] }, // non-string tag in array
];
const filtered = filterClipsByTag(broken, "foo");
check("broken entries dropped, weirder still matches via 'foo'", filtered.length === 2);
check("good included", filtered.find((c) => c.id === "good") !== undefined);
check("weirder included (string 'foo' survives non-string sibling)", filtered.find((c) => c.id === "weirder") !== undefined);

// --- Toast helper ---
check("empty tag toast falls back", formatBulkExportTagToast({ exported: 3, selected: 5, tag: "" }) === "Exported 3 of 5 clips (2 skipped)");
check("zero export: no-match honest", formatBulkExportTagToast({ exported: 0, selected: 5, tag: "secrets" }) === 'No selected clips tagged "secrets"');
check("all-selected match", formatBulkExportTagToast({ exported: 5, selected: 5, tag: "code" }) === "Exported 5 clips (tag: code)");
check("partial-selected match", formatBulkExportTagToast({ exported: 2, selected: 5, tag: "code" }) === "Exported 2 of 5 selected clips (tag: code)");
check("singular noun", formatBulkExportTagToast({ exported: 1, selected: 1, tag: "x" }) === "Exported 1 clip (tag: x)");
check("singular partial", formatBulkExportTagToast({ exported: 1, selected: 4, tag: "x" }) === "Exported 1 of 4 selected clip (tag: x)");

// Defensive on numbers
check("negative exported clamped → no-match", formatBulkExportTagToast({ exported: -5, selected: 10, tag: "x" }) === 'No selected clips tagged "x"');
check("NaN selected clamped", formatBulkExportTagToast({ exported: 2, selected: NaN, tag: "x" }).includes("Exported 2"));
check("non-string tag → fallback toast", typeof formatBulkExportTagToast({ exported: 2, selected: 5, tag: 42 }) === "string");

console.log(`\n${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
