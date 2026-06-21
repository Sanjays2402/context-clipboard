/**
 * Sanity: send-to reorderSendActionsByLast.
 *
 * Bundles src/lib/send-to.ts via esbuild and probes the new pure
 * reorder helper that bumps the user's last-picked action to the
 * top of the menu (muscle-memory feature). Verifies stability of
 * the rest of the order, no-op behaviour for unknown/empty ids,
 * unavailable-action skip, and that the original array isn't
 * mutated.
 */
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const dir = mkdtempSync(join(tmpdir(), "ctxclip-sendto-reorder-"));
try {
  await build({
    entryPoints: ["src/lib/send-to.ts"],
    bundle: true,
    format: "esm",
    outfile: join(dir, "sendto.mjs"),
    platform: "neutral",
    target: "es2022",
    sourcemap: false,
  });
  const mod = await import("file://" + join(dir, "sendto.mjs"));

  let pass = 0,
    total = 0;
  function check(name, got, want) {
    total++;
    if (got === want) pass++;
    else
      console.error(
        "FAIL",
        name,
        "got",
        JSON.stringify(got),
        "want",
        JSON.stringify(want),
      );
  }
  function checkEq(name, a, b) {
    total++;
    if (JSON.stringify(a) === JSON.stringify(b)) pass++;
    else
      console.error("FAIL", name, "got", JSON.stringify(a), "want", JSON.stringify(b));
  }

  // Use a representative actions list — text clip with a source URL,
  // so most rows are available.
  const textClip = {
    id: "t1",
    kind: "text",
    content: "function hello() { return 42; }",
    preview: "function hello() { return 42; }",
    source: { url: "https://github.com/foo/bar", title: "Foo" },
  };
  const actions = mod.buildSendActions(textClip);
  const ids = actions.map((a) => a.id);

  // Sanity: precondition — natural order has open-source first.
  check("precond: natural order starts with open-source", ids[0], "open-source");

  // 1. Empty lastId is a no-op (same id order, but a new array).
  const r0 = mod.reorderSendActionsByLast(actions, "");
  checkEq("empty lastId preserves order", r0.map((a) => a.id), ids);
  check("empty lastId returns a NEW array (not same ref)", r0 === actions, false);

  // 2. lastId matching the FIRST row is a no-op (already on top).
  const r1 = mod.reorderSendActionsByLast(actions, "open-source");
  checkEq("first-row lastId preserves order", r1.map((a) => a.id), ids);

  // 3. lastId matching a middle row bumps it to index 0; everything
  //    else shifts down one slot, preserving relative order.
  const r2 = mod.reorderSendActionsByLast(actions, "md-link");
  check("md-link bumped to top", r2[0].id, "md-link");
  check("md-link bump: open-source now at index 1", r2[1].id, "open-source");
  check("md-link bump: list length unchanged", r2.length, actions.length);
  // Verify the rest stayed in original order — drop md-link from
  // the original ids and prepend it; result should match r2 ids.
  const expected = ["md-link", ...ids.filter((i) => i !== "md-link")];
  checkEq("md-link bump preserves rest of order", r2.map((a) => a.id), expected);

  // 4. Unknown id is a no-op.
  const r3 = mod.reorderSendActionsByLast(actions, "no-such-id");
  checkEq("unknown lastId preserves order", r3.map((a) => a.id), ids);

  // 5. The original array is never mutated.
  const idsBefore = actions.map((a) => a.id).join(",");
  mod.reorderSendActionsByLast(actions, "json");
  const idsAfter = actions.map((a) => a.id).join(",");
  check("original array untouched after reorder", idsBefore, idsAfter);

  // 6. Unavailable action is never bumped — even if it's the last
  //    pick. Construct a clip where "google" should be unavailable
  //    (image clip → no google search) and confirm we don't bump.
  const imageClip = {
    id: "i1",
    kind: "image",
    content: "data:image/png;base64,AAAA",
    preview: "Image",
    source: { url: "https://example.com" },
  };
  const imgActs = mod.buildSendActions(imageClip);
  const googleIdx = imgActs.findIndex((a) => a.id === "google");
  check("precondition: google row exists in image actions", googleIdx >= 0, true);
  check(
    "precondition: google is unavailable for image clip",
    imgActs[googleIdx].available,
    false,
  );
  const r4 = mod.reorderSendActionsByLast(imgActs, "google");
  checkEq(
    "unavailable lastId is NOT bumped (preserves order)",
    r4.map((a) => a.id),
    imgActs.map((a) => a.id),
  );

  // 7. Bumping an available row works for image clip too (sanity:
  //    json IS available for images because the data URL is the
  //    content payload).
  const jsonIdx = imgActs.findIndex((a) => a.id === "json");
  check("precondition: json row exists in image actions", jsonIdx >= 0, true);
  check(
    "precondition: json is available for image clip",
    imgActs[jsonIdx].available,
    true,
  );
  const r5 = mod.reorderSendActionsByLast(imgActs, "json");
  check("image+json: json bumped to top", r5[0].id, "json");

  // 8. Stability across two bumps of the same id (idempotent).
  const r6a = mod.reorderSendActionsByLast(actions, "fenced-code");
  const r6b = mod.reorderSendActionsByLast(r6a, "fenced-code");
  checkEq(
    "double-bump same id is idempotent",
    r6b.map((a) => a.id),
    r6a.map((a) => a.id),
  );

  // 9. Whitespace / weird id strings are no-ops (won't accidentally
  //    match anything).
  const r7 = mod.reorderSendActionsByLast(actions, "   ");
  checkEq("whitespace lastId preserves order (no trim collision)", r7.map((a) => a.id), ids);

  if (pass === total) {
    console.log(`PASS — ${pass}/${total} send-to-reorder sanity checks`);
  } else {
    console.error(`FAIL — ${pass}/${total} send-to-reorder sanity checks`);
    process.exit(1);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
