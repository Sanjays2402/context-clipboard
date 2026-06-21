// Sanity tests for the retroactive-redact selection logic. The IDB-
// bound `retroactiveAutoRedact()` helper uses redactPii() to decide
// which existing clips need rewriting, so we exercise the underlying
// predicate against representative clip bodies + verify the
// rewrite preserves non-PII surrounding context. Pure shape-test —
// no DOM, no IndexedDB needed.

import { build } from "esbuild";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const dir = mkdtempSync(join(tmpdir(), "ctxclip-retro-"));
try {
  await build({
    entryPoints: ["src/lib/util.ts"],
    bundle: true,
    format: "esm",
    outfile: join(dir, "util.mjs"),
    platform: "neutral",
    target: "es2022",
    sourcemap: false,
  });
  const util = await import("file://" + join(dir, "util.mjs"));
  const fail = (msg) => {
    console.error("FAIL", msg);
    process.exit(1);
  };

  // Simulate the inline scan that runRetroactiveAutoRedact does:
  // "would redactPii(content) produce different output?"
  const candidate = (content) => util.redactPii(content) !== content;

  // 1) Plain text with no PII shouldn't be a candidate.
  if (candidate("just some notes about the project")) fail("plain text picked");
  if (candidate("")) fail("empty picked");

  // 2) Email captures should be candidates.
  if (!candidate("contact me at sanjay@example.com about it")) fail("email missed");
  if (!candidate("foo@bar.co")) fail("short email missed");

  // 3) Phone numbers should be picked.
  if (!candidate("call 415-555-0100 tomorrow")) fail("phone missed");

  // 4) JWT-style + common secret prefixes should be picked.
  const jwtLike =
    "eyJhbGciOi" + "JIUzI1NiJ9.eyJzdWIiOi" + "JmYWtlIn0.abcde" + "fghijklmnopq";
  if (!candidate("token=" + jwtLike)) fail("jwt missed");
  const ghpLike = "ghp_" + "AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHH";
  if (!candidate("export PAT=" + ghpLike)) fail("ghp_ missed");
  const skLike = "sk-" + "AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHH";
  if (!candidate("openai key " + skLike)) fail("sk- missed");

  // 5) Card numbers with Luhn-valid sequence should be picked.
  if (!candidate("card: 4242 4242 4242 4242")) fail("visa missed");
  // Random 16-digit-ish number that's NOT Luhn-valid should be left alone.
  if (candidate("ticket 1234567812345678 in tracker")) fail("non-Luhn picked");

  // 6) The rewrite preserves the rest of the string and replaces only
  // the matched PII — verify a representative redacted output.
  const original = "ping sanjay@example.com and call 415-555-0100";
  const after = util.redactPii(original);
  if (after === original) fail("rewrite no-op when it shouldn't be");
  if (!after.includes("[redacted email]")) fail("email token missing");
  if (!after.includes("[redacted phone]")) fail("phone token missing");
  if (!after.startsWith("ping ")) fail("prefix mangled: " + after);
  if (!after.includes(" and call ")) fail("middle mangled: " + after);

  // 7) An already-fully-redacted body should be a no-op (the helper
  // would skip already-redacted=true clips, but defensive check).
  const stable = util.redactPii(after);
  if (stable !== after) fail("redact not idempotent: " + stable);

  // 8) Mixed: secret-assignment + email together should both be redacted.
  const mixed = "see api_key=ABCDEFGH12345678 mailto:test@x.com";
  const mixedOut = util.redactPii(mixed);
  if (!/redacted|••••/.test(mixedOut)) fail("mixed: no redaction marker");
  if (mixedOut.includes("test@x.com")) fail("mixed: email leaked: " + mixedOut);

  // 9) Bytes/preview path — verify redactSensitivePreview also rewrites
  // for known secret-assignment keys (api_key, secret, token, etc.).
  const previewIn = "api_key=ABCDEFGH12345678";
  const previewOut = util.redactSensitivePreview(previewIn);
  if (previewOut === previewIn) fail("preview rewrite no-op: " + previewOut);

  console.log("PASS retro-redact sanity (9 checks)");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
