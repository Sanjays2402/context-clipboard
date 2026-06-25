// Sanity: detail word-wrap preference coercion from
// src/lib/db.ts (getDetailWrap / setDetailWrap value semantics).
//
// The IDB read/write is environment-coupled, but the DEFAULT-coercion
// contract is pure and worth pinning: any non-boolean / missing /
// corrupt stored value must resolve to wrap-ON (true), and only an
// explicit stored `false` flips to wrap-OFF. The write normalises
// anything !== false to true. These mirror the inline logic in db.ts.

// Mirrors getDetailWrap's resolve(): row?.value === false ? false : true
function coerceStoredWrap(row) {
  return row?.value === false ? false : true;
}

// Mirrors setDetailWrap's normalisation: wrap !== false
function normaliseWriteWrap(wrap) {
  return wrap !== false;
}

let pass = 0;
let total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}

// --- 1. read coercion: explicit booleans --------------------------------
check("stored true -> wrap on", coerceStoredWrap({ value: true }), true);
check("stored false -> wrap off", coerceStoredWrap({ value: false }), false);

// --- 2. read coercion: missing / corrupt defaults to wrap-on ------------
check("missing row -> wrap on", coerceStoredWrap(undefined), true);
check("null row -> wrap on", coerceStoredWrap(null), true);
check("missing value -> wrap on", coerceStoredWrap({}), true);
check("null value -> wrap on", coerceStoredWrap({ value: null }), true);
check("undefined value -> wrap on", coerceStoredWrap({ value: undefined }), true);
check("string 'false' is NOT false -> wrap on", coerceStoredWrap({ value: "false" }), true);
check("number 0 is NOT false -> wrap on", coerceStoredWrap({ value: 0 }), true);
check("string 'true' -> wrap on", coerceStoredWrap({ value: "true" }), true);
check("legacy garbage -> wrap on", coerceStoredWrap({ value: { nested: 1 } }), true);

// --- 3. write normalisation ---------------------------------------------
check("write true -> true", normaliseWriteWrap(true), true);
check("write false -> false", normaliseWriteWrap(false), false);
check("write undefined -> true", normaliseWriteWrap(undefined), true);
check("write null -> true", normaliseWriteWrap(null), true);
check("write truthy string -> true", normaliseWriteWrap("x"), true);
check("write 0 -> true (only literal false flips)", normaliseWriteWrap(0), true);

// --- 4. round-trip: write then read agrees ------------------------------
for (const v of [true, false]) {
  const written = normaliseWriteWrap(v);
  const readBack = coerceStoredWrap({ value: written });
  check(`round-trip ${v}`, readBack, v);
}

// --- 5. default-on invariant: nothing stored = wrap-on -------------------
// The whole point: a brand-new user (no meta row) wraps by default.
check("fresh install wraps", coerceStoredWrap(undefined), true);

console.log(`detail-wrap sanity: ${pass}/${total} passed`);
if (pass !== total) process.exit(1);
