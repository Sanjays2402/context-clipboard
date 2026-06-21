// Sanity tests for the in-page-palette last-query persistence:
//   - get returns "" when nothing stored
//   - set + get round-trips the trimmed string
//   - set caps at 200 chars
//   - empty/whitespace set clears the slot
//   - set("   foo   ") stores "foo" (trim)
//
// We run lib/db's get/setPaletteLastQuery against an in-process
// IDB shim so the test stays hermetic (no fake-indexeddb dep).
// Only the `meta` object store paths matter — the shim implements
// just enough surface (open, transaction, get, put) to make the
// helpers happy.

import { build } from "esbuild";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// --- Minimal in-process IDB shim ------------------------------------
// Only good enough for the meta keyPath="key" store used by
// getPaletteLastQuery / setPaletteLastQuery. Real IDB events
// fire after a microtask; we emulate that with queueMicrotask.

const stores = new Map(); // storeName -> Map<key, value>

function makeRequest(executor) {
  const req = { result: undefined, error: undefined, onsuccess: null, onerror: null };
  queueMicrotask(() => {
    try {
      req.result = executor();
      req.onsuccess?.();
    } catch (e) {
      req.error = e;
      req.onerror?.();
    }
  });
  return req;
}

function makeStore(storeName) {
  if (!stores.has(storeName)) stores.set(storeName, new Map());
  const data = stores.get(storeName);
  return {
    get(key) {
      return makeRequest(() => data.get(key));
    },
    put(value) {
      return makeRequest(() => {
        // meta uses keyPath="key"
        const key = value.key;
        data.set(key, value);
        return key;
      });
    },
    clear() {
      return makeRequest(() => {
        data.clear();
      });
    },
    createIndex() {
      return {};
    },
  };
}

function makeTransaction(name) {
  const store = makeStore(name);
  return { objectStore: () => store };
}

function makeDb() {
  return {
    objectStoreNames: { contains: () => true },
    transaction: (name) => makeTransaction(name),
    createObjectStore: (name) => makeStore(name),
  };
}

const fakeIDB = {
  open() {
    const req = {
      result: makeDb(),
      transaction: makeDb().transaction("meta"),
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
    };
    queueMicrotask(() => {
      // No upgrade needed since our shim creates stores on demand.
      req.onsuccess?.();
    });
    return req;
  },
};

globalThis.indexedDB = fakeIDB;
globalThis.IDBKeyRange = { only: (v) => ({ only: v }) };

// ------------------------------------------------------------------

const dir = mkdtempSync(join(tmpdir(), "ctxclip-palq-"));
try {
  await build({
    entryPoints: ["src/lib/db.ts"],
    bundle: true,
    format: "esm",
    outfile: join(dir, "db.mjs"),
    platform: "neutral",
    target: "es2022",
    sourcemap: false,
  });
  const db = await import("file://" + join(dir, "db.mjs"));
  const fail = (msg) => {
    console.error("FAIL", msg);
    process.exit(1);
  };

  // 1) Empty store → empty string.
  const empty1 = await db.getPaletteLastQuery();
  if (empty1 !== "") fail(`expected empty initial, got: ${JSON.stringify(empty1)}`);

  // 2) Round-trip a normal query.
  await db.setPaletteLastQuery("kind:image host:github.com");
  const r1 = await db.getPaletteLastQuery();
  if (r1 !== "kind:image host:github.com") fail(`round-trip: ${JSON.stringify(r1)}`);

  // 3) Trim leading/trailing whitespace.
  await db.setPaletteLastQuery("   tag:code   ");
  const r2 = await db.getPaletteLastQuery();
  if (r2 !== "tag:code") fail(`trim: ${JSON.stringify(r2)}`);

  // 4) Cap at 200 chars on write.
  const huge = "x".repeat(500);
  await db.setPaletteLastQuery(huge);
  const r3 = await db.getPaletteLastQuery();
  if (r3.length !== 200) fail(`cap: length ${r3.length}`);
  if (r3 !== huge.slice(0, 200)) fail("cap: content mismatch");

  // 5) Empty string clears the slot (intentional — user cleared
  // search before close).
  await db.setPaletteLastQuery("");
  const r4 = await db.getPaletteLastQuery();
  if (r4 !== "") fail(`clear: ${JSON.stringify(r4)}`);

  // 6) Whitespace-only also clears (no point storing only spaces).
  await db.setPaletteLastQuery("foo");
  await db.setPaletteLastQuery("   \t  \n  ");
  const r5 = await db.getPaletteLastQuery();
  if (r5 !== "") fail(`ws clear: ${JSON.stringify(r5)}`);

  // 7) Re-set after clear works.
  await db.setPaletteLastQuery("after:24h");
  const r6 = await db.getPaletteLastQuery();
  if (r6 !== "after:24h") fail(`re-set: ${JSON.stringify(r6)}`);

  // 8) Null/undefined handled (shouldn't throw).
  await db.setPaletteLastQuery(undefined);
  const r7 = await db.getPaletteLastQuery();
  if (r7 !== "") fail(`undefined-set: ${JSON.stringify(r7)}`);

  // 9) Read still returns empty after multiple writes/clears.
  await db.setPaletteLastQuery("");
  await db.setPaletteLastQuery("");
  const r8 = await db.getPaletteLastQuery();
  if (r8 !== "") fail(`double clear: ${JSON.stringify(r8)}`);

  console.log("PASS palette last-query sanity (9 checks)");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
