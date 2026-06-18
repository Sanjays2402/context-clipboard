// Unit tests for src/lib/util.ts redactPii() + hasPii().
// Run: node scripts/test-redact.mjs
if (typeof globalThis.btoa !== "function")
  globalThis.btoa = (s) => Buffer.from(s, "binary").toString("base64");
if (typeof globalThis.atob !== "function")
  globalThis.atob = (s) => Buffer.from(s, "base64").toString("binary");

import { build } from "esbuild";
const result = await build({
  entryPoints: ["src/lib/util.ts"],
  bundle: true,
  format: "esm",
  platform: "neutral",
  write: false,
  target: "es2022",
});
const mod = await import(
  "data:text/javascript;base64," +
    Buffer.from(result.outputFiles[0].text).toString("base64")
);
const { redactPii, hasPii, redactSensitivePreview, looksSensitive } = mod;

let fails = 0;
function ok(name, cond, extra = "") {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    fails++;
    console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`);
  }
}

// --- Emails ----------------------------------------------------------------
ok(
  "redacts simple email",
  redactPii("contact me at jane.doe@example.com please") ===
    "contact me at [redacted email] please",
);
ok(
  "redacts +alias email",
  redactPii("notif+work@gmail.co.uk") === "[redacted email]",
);
ok("hasPii detects email", hasPii("a@b.co"));

// --- Phones ----------------------------------------------------------------
ok(
  "redacts US 10-digit phone",
  redactPii("Call (415) 555-1234 today") === "Call [redacted phone] today",
);
ok(
  "redacts +1 phone",
  redactPii("My cell: +1 415-555-1234") === "My cell: [redacted phone]",
);
ok(
  "redacts dotted phone",
  redactPii("415.555.1234") === "[redacted phone]",
);
ok(
  "leaves random 7-digit alone",
  redactPii("order 1234567") === "order 1234567",
);

// --- Credit cards (Luhn) ---------------------------------------------------
// Visa test number 4111 1111 1111 1111 (Luhn-valid).
ok(
  "redacts valid Visa",
  redactPii("Card: 4111 1111 1111 1111") === "Card: [redacted card]",
);
ok(
  "redacts dashed Mastercard",
  redactPii("5500-0000-0000-0004") === "[redacted card]",
);
ok(
  "leaves non-Luhn 16-digit alone",
  redactPii("ref 1234567890123456") === "ref 1234567890123456",
);

// --- SSN --------------------------------------------------------------------
ok(
  "redacts SSN",
  redactPii("SSN: 123-45-6789") === "SSN: [redacted ssn]",
);

// --- Secrets ----------------------------------------------------------------
ok(
  "redacts api_key assignment",
  redactPii('api_key = "sk_live_abcdef1234567890"') ===
    "api_key=••••••",
);
ok(
  "redacts sk- token",
  redactPii("token sk-abcdefghij1234567890XYZ here") ===
    "token [redacted secret] here",
);
ok(
  "redacts JWT-shaped",
  redactPii(
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
  ) === "[redacted jwt]",
);

// --- Combined / opts -------------------------------------------------------
const mixed = "Hi jane@a.com, call (415) 555-1234, card 4111 1111 1111 1111";
const allRedacted = redactPii(mixed);
ok(
  "combined redaction",
  allRedacted ===
    "Hi [redacted email], call [redacted phone], card [redacted card]",
  allRedacted,
);
ok(
  "opts.emails:false leaves email",
  redactPii("a@b.co + (415) 555-1234", { emails: false }) ===
    "a@b.co + [redacted phone]",
);
ok(
  "opts.phones:false leaves phone",
  redactPii("a@b.co + (415) 555-1234", { phones: false }) ===
    "[redacted email] + (415) 555-1234",
);

// --- Empty / no-op ----------------------------------------------------------
ok("empty string", redactPii("") === "");
ok("no PII passthrough", redactPii("hello world") === "hello world");
ok("hasPii false on clean", !hasPii("hello world"));

// --- Preview backstop unchanged --------------------------------------------
ok(
  "preview still trims",
  redactSensitivePreview("a".repeat(500)).length === 200,
);
ok(
  "looksSensitive on token still works",
  looksSensitive("sk-abcdefghij1234567890XYZ"),
);

if (fails) {
  console.error(`\n${fails} test(s) failed`);
  process.exit(1);
} else {
  console.log("\nAll redaction tests passed.");
}
