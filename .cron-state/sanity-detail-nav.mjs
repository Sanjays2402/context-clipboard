// Sanity: nextDetailIndex + formatWrapToast from src/lib/detail-nav.ts.
// Inline copies so this runs bundler-free.
//
// Covers in-range stepping, edge wrap (last->first / first->last) with
// the wrapped flag, wrap-off dead-ends (null), single-item / empty
// lists, defensive bad inputs, and the looped-toast grammar.

function nextDetailIndex(current, direction, total, wrap) {
  if (direction !== -1 && direction !== 1) return null;
  if (!Number.isFinite(total)) return null;
  const t = Math.trunc(total);
  if (t <= 1) return null;
  if (!Number.isFinite(current)) return null;
  const cur = Math.trunc(current);
  if (cur < 0 || cur > t - 1) return null;
  const raw = cur + direction;
  if (raw >= 0 && raw <= t - 1) {
    return { index: raw, wrapped: false };
  }
  if (!wrap) return null;
  const wrapped = raw < 0 ? t - 1 : 0;
  return { index: wrapped, wrapped: true };
}

function formatWrapToast(direction) {
  return direction === 1 ? "Looped to the first clip" : "Looped to the last clip";
}

let pass = 0;
let total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}

// --- 1. in-range stepping (no wrap) -------------------------------------
check("next from 0", nextDetailIndex(0, 1, 5, true), { index: 1, wrapped: false });
check("next from middle", nextDetailIndex(2, 1, 5, true), { index: 3, wrapped: false });
check("prev from middle", nextDetailIndex(2, -1, 5, true), { index: 1, wrapped: false });
check("prev from last", nextDetailIndex(4, -1, 5, true), { index: 3, wrapped: false });
check("next to last (no wrap yet)", nextDetailIndex(3, 1, 5, true), { index: 4, wrapped: false });

// --- 2. edge wrap (wrap on) ---------------------------------------------
check("next off the end wraps to 0", nextDetailIndex(4, 1, 5, true), { index: 0, wrapped: true });
check("prev off the start wraps to last", nextDetailIndex(0, -1, 5, true), { index: 4, wrapped: true });
check("two-item next wraps", nextDetailIndex(1, 1, 2, true), { index: 0, wrapped: true });
check("two-item prev wraps", nextDetailIndex(0, -1, 2, true), { index: 1, wrapped: true });
check("two-item next in-range", nextDetailIndex(0, 1, 2, true), { index: 1, wrapped: false });

// --- 3. wrap off -> dead-end (null) -------------------------------------
check("next off end, wrap off -> null", nextDetailIndex(4, 1, 5, false), null);
check("prev off start, wrap off -> null", nextDetailIndex(0, -1, 5, false), null);
check("in-range still works wrap off", nextDetailIndex(1, 1, 5, false), { index: 2, wrapped: false });

// --- 4. single-item / empty lists ---------------------------------------
check("single item next -> null (wrap)", nextDetailIndex(0, 1, 1, true), null);
check("single item prev -> null (wrap)", nextDetailIndex(0, -1, 1, true), null);
check("single item wrap off -> null", nextDetailIndex(0, 1, 1, false), null);
check("empty list -> null", nextDetailIndex(0, 1, 0, true), null);

// --- 5. defensive bad inputs --------------------------------------------
check("bad direction 0 -> null", nextDetailIndex(1, 0, 5, true), null);
check("bad direction 2 -> null", nextDetailIndex(1, 2, 5, true), null);
check("NaN total -> null", nextDetailIndex(1, 1, NaN, true), null);
check("Infinity total -> null", nextDetailIndex(1, 1, Infinity, true), null);
check("NaN current -> null", nextDetailIndex(NaN, 1, 5, true), null);
check("negative current -> null", nextDetailIndex(-1, 1, 5, true), null);
check("current out of range -> null", nextDetailIndex(5, 1, 5, true), null);
check("current way out of range -> null", nextDetailIndex(99, -1, 5, true), null);
// Float inputs truncate.
check("float current truncates", nextDetailIndex(2.9, 1, 5, true), { index: 3, wrapped: false });
check("float total truncates", nextDetailIndex(3, 1, 5.9, true), { index: 4, wrapped: false });

// --- 6. wrap toast grammar ----------------------------------------------
check("forward wrap toast", formatWrapToast(1), "Looped to the first clip");
check("backward wrap toast", formatWrapToast(-1), "Looped to the last clip");

// --- 7. full-loop integration -------------------------------------------
// Walk forward from 0 around a 3-item list and back to 0; count wraps.
let i = 0;
let wraps = 0;
for (let s = 0; s < 6; s++) {
  const r = nextDetailIndex(i, 1, 3, true);
  i = r.index;
  if (r.wrapped) wraps++;
}
check("two full forward loops land back at 0", i, 0);
check("two wrap events in 6 forward steps of a 3-list", wraps, 2);

console.log(`detail-nav sanity: ${pass}/${total} passed`);
if (pass !== total) process.exit(1);
