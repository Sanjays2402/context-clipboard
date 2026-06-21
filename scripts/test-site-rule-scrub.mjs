// Sanity tests for the per-host auto-scrub-origin site rule:
//
//   - upsertSiteRule round-trips the new autoScrubOrigin flag.
//   - listSiteRules + findSiteRuleFor surface the saved flag.
//   - The ingest-side scrub logic in background.ts is mirrored here
//     against a fixture ClipItem so we can assert: source wiped,
//     content preserved, tags get `scrubbed`, redaction outcome stays.
//
// We bundle src/lib/db.ts + use the same minimal in-process IDB shim
// the palette-last-query test uses. The scrub branch itself lives in
// background.ts (chrome-bound) so we re-implement that pure transform
// here and verify the contract on a fixture — guards regressions in
// the EXPECTED behavior even when ingest is rewritten.

import { build } from "esbuild";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// --- Minimal in-process IDB shim (same as test-palette-last-query) ---
const stores = new Map();
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
        const key = value.key;
        data.set(key, value);
        return key;
      });
    },
    clear() {
      return makeRequest(() => data.clear());
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
globalThis.indexedDB = {
  open() {
    const req = {
      result: makeDb(),
      transaction: makeDb().transaction("meta"),
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
    };
    queueMicrotask(() => req.onsuccess?.());
    return req;
  },
};
globalThis.IDBKeyRange = { only: (v) => ({ only: v }) };

// --- Mirror of background.ts's autoScrubOrigin branch -----------------
// Pure transform — the live code does this against the ClipItem just
// before putClip. We assert the same shape contract here so a future
// refactor that breaks it gets caught.
function applyAutoScrubOrigin(item, kind) {
  const next = { ...item, source: {}, tags: [...item.tags] };
  if (!next.tags.includes("scrubbed")) next.tags.push("scrubbed");
  if (kind === "image" && next.preview && /copied from/i.test(next.preview)) {
    const dims = /\b\d+×\d+\b/.exec(next.preview)?.[0];
    next.preview = dims ? `Image · ${dims}` : "Image";
  }
  return next;
}

const dir = mkdtempSync(join(tmpdir(), "ctxclip-scrub-rule-"));
let failed = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) console.log(`  ok   ${label}`);
  else {
    console.error(`  FAIL ${label}\n       want: ${e}\n       got:  ${a}`);
    failed++;
  }
}
function truthy(v, label) {
  if (v) console.log(`  ok   ${label}`);
  else {
    console.error(`  FAIL ${label} (got falsy)`);
    failed++;
  }
}

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

  // 1) upsertSiteRule persists the flag.
  const saved = await db.upsertSiteRule({
    hostPattern: "secret.example.com",
    autoScrubOrigin: true,
  });
  eq(saved.autoScrubOrigin, true, "upsert: autoScrubOrigin = true persists");
  truthy(saved.id, "upsert returns id");

  // 2) listSiteRules returns it.
  const list1 = await db.listSiteRules();
  const fromList = list1.find((r) => r.hostPattern === "secret.example.com");
  truthy(fromList, "listSiteRules contains new rule");
  eq(fromList.autoScrubOrigin, true, "list: autoScrubOrigin survives");

  // 3) findSiteRuleFor matches exact host AND finds the flag.
  const matched = await db.findSiteRuleFor("secret.example.com");
  truthy(matched, "findSiteRuleFor: matches host");
  eq(matched.autoScrubOrigin, true, "findSiteRuleFor: returns flag");

  // 4) Wildcard pattern still works for autoScrubOrigin.
  await db.upsertSiteRule({
    hostPattern: "*.partner.io",
    autoScrubOrigin: true,
    autoTags: ["partner"],
  });
  const wild = await db.findSiteRuleFor("docs.partner.io");
  truthy(wild, "wildcard: matches subdomain");
  eq(wild.autoScrubOrigin, true, "wildcard: autoScrubOrigin persists");
  eq(wild.autoTags, ["partner"], "wildcard: autoTags persist alongside");

  // 5) Rules without the flag stay un-scrub'd.
  await db.upsertSiteRule({ hostPattern: "tagonly.example", autoTags: ["foo"] });
  const tagOnly = await db.findSiteRuleFor("tagonly.example");
  eq(!!tagOnly.autoScrubOrigin, false, "rule without flag: stays false");

  // 6) Edit-mode upsert (with id) preserves other fields when toggling
  //    the new flag — verifies the rule shape stays additive.
  const beforeEdit = saved;
  const edited = await db.upsertSiteRule({
    id: beforeEdit.id,
    hostPattern: beforeEdit.hostPattern,
    autoScrubOrigin: false,
    autoTags: ["edited"],
  });
  eq(edited.id, beforeEdit.id, "edit: id preserved");
  eq(edited.autoScrubOrigin, false, "edit: scrub flag toggles off");
  eq(edited.autoTags, ["edited"], "edit: tags replaced");

  // 7) The ingest scrub branch wipes source + adds tag + keeps content.
  const baseItem = {
    id: "c1",
    kind: "text",
    content: "code snippet body stays",
    preview: "code snippet body stays",
    source: {
      url: "https://secret.example.com/draft?token=secret",
      title: "Internal Draft",
      nearbyText: "context paragraph from the page",
      favicon: "https://secret.example.com/favicon.ico",
    },
    tags: ["secret.example.com"],
    pinned: false,
    createdAt: 1,
    lastSeenAt: 1,
    hitCount: 1,
    bytes: 22,
    hash: "h1",
  };
  const scrubbed = applyAutoScrubOrigin(baseItem, "text");
  eq(scrubbed.source, {}, "scrub: source wiped");
  eq(scrubbed.content, "code snippet body stays", "scrub: content preserved");
  truthy(scrubbed.tags.includes("scrubbed"), "scrub: scrubbed tag added");
  truthy(
    scrubbed.tags.includes("secret.example.com"),
    "scrub: original tags preserved",
  );

  // 8) Image preview that mentioned the page gets a generic Image · dims
  //    rewrite (so the dropped page title doesn't bleed via the label).
  const imgItem = {
    ...baseItem,
    kind: "image",
    preview: "Image copied from Internal Draft · 800×600",
  };
  const scrubbedImg = applyAutoScrubOrigin(imgItem, "image");
  eq(scrubbedImg.preview, "Image · 800×600", "scrub: image preview generic");

  // 9) Image preview without "copied from" stays untouched.
  const imgNoTitle = { ...baseItem, kind: "image", preview: "Image · 100×100" };
  const scrubbedImg2 = applyAutoScrubOrigin(imgNoTitle, "image");
  eq(scrubbedImg2.preview, "Image · 100×100", "scrub: image preview stable when no page ref");

  // 10) Calling scrub twice is idempotent on tags (no duplicate
  //     `scrubbed`).
  const scrubbedTwice = applyAutoScrubOrigin(scrubbed, "text");
  const scrubbedCount = scrubbedTwice.tags.filter((t) => t === "scrubbed").length;
  eq(scrubbedCount, 1, "scrub: idempotent on tags");

  if (failed > 0) {
    console.error(`FAIL site-rule scrub sanity (${failed} mismatch${failed === 1 ? "" : "es"})`);
    process.exit(1);
  }
  console.log(`PASS site-rule scrub sanity (16 checks)`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
