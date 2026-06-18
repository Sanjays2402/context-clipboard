// Quick round-trip test for src/lib/crypto.ts using Node's WebCrypto.
// Run: node scripts/test-crypto.mjs
// `crypto` is already a global in modern Node (and is the same WebCrypto API).
// btoa/atob exist on globalThis in Node ≥ 16. Defensively polyfill if absent.
if (typeof globalThis.btoa !== "function")
  globalThis.btoa = (s) => Buffer.from(s, "binary").toString("base64");
if (typeof globalThis.atob !== "function")
  globalThis.atob = (s) => Buffer.from(s, "base64").toString("binary");

// We're hand-loading the compiled output to avoid a TS toolchain dance.
import { build } from "esbuild";
const result = await build({
  entryPoints: ["src/lib/crypto.ts"],
  bundle: true,
  format: "esm",
  platform: "neutral",
  write: false,
  target: "es2022",
});
const code = result.outputFiles[0].text;
const mod = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));

const { encryptJson, decryptJson, isEncryptedEnvelope } = mod;

let fails = 0;
function ok(name, cond, extra = "") {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    fails++;
    console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`);
  }
}

// 1. round-trip
const payload = { clips: [{ id: "a", content: "hello world" }], settings: { theme: "dark" } };
const env = await encryptJson(payload, "correct horse battery staple");
ok("envelope kind", env.kind === "context-clipboard-encrypted");
ok("envelope version", env.v === 1);
ok("envelope detected", isEncryptedEnvelope(env));
ok("envelope detected (not plain object)", !isEncryptedEnvelope({ foo: 1 }));

const decoded = await decryptJson(env, "correct horse battery staple");
ok("decrypted matches", JSON.stringify(decoded) === JSON.stringify(payload));

// 2. wrong passphrase
let threw = false;
try {
  await decryptJson(env, "wrong");
} catch (e) {
  threw = /passphrase|corrupt/i.test(e.message);
}
ok("wrong passphrase throws", threw);

// 3. tampered ciphertext
const tampered = { ...env, ciphertext: env.ciphertext.slice(0, -2) + "AA" };
let tamperedThrew = false;
try {
  await decryptJson(tampered, "correct horse battery staple");
} catch (e) {
  tamperedThrew = /passphrase|corrupt/i.test(e.message);
}
ok("tampered ciphertext throws", tamperedThrew);

// 4. short passphrase rejected
let shortThrew = false;
try {
  await encryptJson(payload, "abc");
} catch (e) {
  shortThrew = /at least 4/.test(e.message);
}
ok("short passphrase rejected", shortThrew);

// 5. encrypting twice with same passphrase gives different ciphertext (random IV/salt)
const env2 = await encryptJson(payload, "correct horse battery staple");
ok("different ciphertext each run", env.ciphertext !== env2.ciphertext);
ok("different salt each run", env.kdf.salt !== env2.kdf.salt);
ok("different iv each run", env.cipher.iv !== env2.cipher.iv);

// 6. unsupported version rejected
let badVerThrew = false;
try {
  await decryptJson({ ...env, v: 99 }, "correct horse battery staple");
} catch (e) {
  badVerThrew = /version/i.test(e.message);
}
ok("unsupported version rejected", badVerThrew);

if (fails) {
  console.error(`\n${fails} test(s) failed`);
  process.exit(1);
} else {
  console.log("\nAll crypto tests passed.");
}
