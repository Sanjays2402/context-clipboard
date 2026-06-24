// Sanity tests for src/lib/note-warning.ts — the in-page palette's
// warning-keyword detector for per-clip notes.
//
// Run with: node .cron-state/sanity-note-warning.mjs

import assert from "node:assert/strict";
import { build } from "esbuild";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "ctxclip-nw-"));
try {
  await build({
    entryPoints: ["src/lib/note-warning.ts"],
    bundle: true,
    format: "esm",
    outfile: join(tmp, "note-warning.mjs"),
    platform: "neutral",
    target: "es2022",
    logLevel: "silent",
  });
  const {
    hasNoteWarning,
    firstWarningKeyword,
    formatNoteWarningTooltip,
    NOTE_WARNING_KEYWORDS,
  } = await import(join(tmp, "note-warning.mjs"));

  let pass = 0;
  const t = (msg, fn) => {
    try {
      fn();
      pass++;
    } catch (e) {
      console.error(`FAIL ${msg}: ${e.message}`);
      process.exit(1);
    }
  };

  // -------------------- hasNoteWarning: defensive --------------------
  t("undefined → false", () => assert.equal(hasNoteWarning(undefined), false));
  t("null → false", () => assert.equal(hasNoteWarning(null), false));
  t("number → false", () => assert.equal(hasNoteWarning(42), false));
  t("object → false", () => assert.equal(hasNoteWarning({}), false));
  t("empty string → false", () => assert.equal(hasNoteWarning(""), false));
  t("whitespace-only → false", () =>
    assert.equal(hasNoteWarning("   \n\t  "), false));
  t("plain note no keywords → false", () =>
    assert.equal(hasNoteWarning("This is a regular reminder."), false));

  // -------------------- hasNoteWarning: positive cases --------------------
  t("'prod' lowercase → true", () =>
    assert.equal(hasNoteWarning("for prod only"), true));
  t("'PROD' uppercase → true (case-insensitive)", () =>
    assert.equal(hasNoteWarning("for PROD only"), true));
  t("'Prod' titlecase → true", () =>
    assert.equal(hasNoteWarning("for Prod only"), true));
  t("'production' → true", () =>
    assert.equal(hasNoteWarning("production token"), true));
  t("'staging' → true", () =>
    assert.equal(hasNoteWarning("staging URL only"), true));
  t("'beta' → true", () =>
    assert.equal(hasNoteWarning("beta endpoint"), true));
  t("'sandbox' → true", () =>
    assert.equal(hasNoteWarning("sandbox env credentials"), true));
  t("'do not' → true (multi-word)", () =>
    assert.equal(hasNoteWarning("do not paste this anywhere"), true));
  t("'don't paste' → true (apostrophe)", () =>
    assert.equal(hasNoteWarning("don't paste in chat"), true));
  t("'never use' → true", () =>
    assert.equal(hasNoteWarning("never use in production"), true));
  t("'never paste' → true", () =>
    assert.equal(hasNoteWarning("never paste this elsewhere"), true));
  t("'caution' → true", () =>
    assert.equal(hasNoteWarning("caution: token expires soon"), true));
  t("'warning' → true", () =>
    assert.equal(hasNoteWarning("warning - draft only"), true));
  t("'danger' → true", () =>
    assert.equal(hasNoteWarning("danger! prod creds"), true));
  t("'deprecated' → true", () =>
    assert.equal(hasNoteWarning("deprecated as of June"), true));
  t("'draft' → true", () =>
    assert.equal(hasNoteWarning("draft - needs review"), true));
  t("'wip' → true", () =>
    assert.equal(hasNoteWarning("wip - paste at own risk"), true));
  t("'todo' → true", () =>
    assert.equal(hasNoteWarning("todo: revisit before shipping"), true));
  t("'fixme' → true", () =>
    assert.equal(hasNoteWarning("fixme - broken example"), true));
  t("'secret' → true", () =>
    assert.equal(hasNoteWarning("secret token"), true));
  t("'private' → true", () =>
    assert.equal(hasNoteWarning("private channel only"), true));
  t("'confidential' → true", () =>
    assert.equal(hasNoteWarning("confidential - do not share"), true));
  t("'internal only' → true (multi-word)", () =>
    assert.equal(hasNoteWarning("internal only - not for clients"), true));

  // -------------------- hasNoteWarning: word-boundary discipline --------------------
  t("'preproduction' → false (no boundary inside word)", () =>
    assert.equal(hasNoteWarning("preproduction phase note"), false));
  t("'reproduction' → false", () =>
    assert.equal(hasNoteWarning("a reproduction case"), false));
  t("'sandbox' inside 'pandboxing' → false", () =>
    assert.equal(hasNoteWarning("ipandboxing"), false));
  t("'todo' inside 'pseudotoday' → false", () =>
    assert.equal(hasNoteWarning("pseudotodayish"), false));
  t("'secret' inside 'secretarial' → false", () =>
    assert.equal(hasNoteWarning("secretarial role"), false));
  t("'staging' at end of word 'restaging' → false", () =>
    assert.equal(hasNoteWarning("restaging the test"), false));

  // -------------------- hasNoteWarning: punctuation boundaries --------------------
  t("'prod' followed by comma → true", () =>
    assert.equal(hasNoteWarning("for prod, then test"), true));
  t("'prod' followed by period → true", () =>
    assert.equal(hasNoteWarning("for prod."), true));
  t("'prod' followed by exclamation → true", () =>
    assert.equal(hasNoteWarning("prod!"), true));
  t("'prod' at start of string → true", () =>
    assert.equal(hasNoteWarning("prod only"), true));
  t("'prod' at end of string → true", () =>
    assert.equal(hasNoteWarning("for prod"), true));
  t("'#prod' hashtag form → true", () =>
    assert.equal(hasNoteWarning("be careful #prod"), true));
  t("'#staging' hashtag form → true", () =>
    assert.equal(hasNoteWarning("only on #staging environment"), true));

  // -------------------- hasNoteWarning: multi-word edge cases --------------------
  t("'do not' with extra whitespace → true (double space)", () =>
    assert.equal(hasNoteWarning("do  not paste"), true));
  t("'do not' with tab → true", () =>
    assert.equal(hasNoteWarning("do\tnot paste"), true));
  t("'do' alone → false (multi-word requires 'not')", () =>
    assert.equal(hasNoteWarning("just do it"), false));
  t("'do' and 'not' in different order → false", () =>
    assert.equal(hasNoteWarning("not do this"), false));
  t("'internal' alone → false (requires 'only')", () =>
    assert.equal(hasNoteWarning("internal docs"), false));
  t("'internal only' multi-word match → true", () =>
    assert.equal(hasNoteWarning("internal only please"), true));

  // -------------------- hasNoteWarning: stateful regex safety --------------------
  t("repeated calls don't drift (stateful regex reset)", () => {
    const note = "prod only";
    assert.equal(hasNoteWarning(note), true);
    assert.equal(hasNoteWarning(note), true);
    assert.equal(hasNoteWarning(note), true);
    assert.equal(hasNoteWarning(note), true);
    assert.equal(hasNoteWarning(note), true);
  });
  t("interleaved positive/negative calls stay correct", () => {
    assert.equal(hasNoteWarning("prod"), true);
    assert.equal(hasNoteWarning("clean text"), false);
    assert.equal(hasNoteWarning("staging"), true);
    assert.equal(hasNoteWarning("nope"), false);
    assert.equal(hasNoteWarning("WARNING"), true);
  });

  // -------------------- firstWarningKeyword --------------------
  t("firstWarningKeyword: returns null for clean", () =>
    assert.equal(firstWarningKeyword("ordinary text"), null));
  t("firstWarningKeyword: returns null for undefined", () =>
    assert.equal(firstWarningKeyword(undefined), null));
  t("firstWarningKeyword: returns 'prod' for prod-only", () =>
    assert.equal(firstWarningKeyword("for prod use"), "prod"));
  t("firstWarningKeyword: returns 'staging' for staging-only", () =>
    assert.equal(firstWarningKeyword("staging URL"), "staging"));
  t("firstWarningKeyword: canonical lowercase form regardless of case", () =>
    assert.equal(firstWarningKeyword("PROD"), "prod"));
  t("firstWarningKeyword: returns 'do not' for multi-word", () =>
    assert.equal(firstWarningKeyword("do not paste"), "do not"));
  t("firstWarningKeyword: returns first in declaration order when multiple", () => {
    // 'prod' is before 'staging' in NOTE_WARNING_KEYWORDS — when both
    // appear, 'prod' wins. Verifies stable ordering.
    const result = firstWarningKeyword("prod and staging both");
    assert.equal(result, "prod");
  });
  t("firstWarningKeyword: returns 'production' when only 'production'", () =>
    assert.equal(firstWarningKeyword("production env"), "production"));

  // -------------------- formatNoteWarningTooltip --------------------
  t("tooltip: empty string for clean note", () =>
    assert.equal(formatNoteWarningTooltip("hello world"), ""));
  t("tooltip: empty string for undefined", () =>
    assert.equal(formatNoteWarningTooltip(undefined), ""));
  t("tooltip: includes keyword name", () =>
    assert.equal(
      formatNoteWarningTooltip("for prod only"),
      "Warning: prod — check the note before pasting",
    ));
  t("tooltip: multi-word keyword", () =>
    assert.equal(
      formatNoteWarningTooltip("do not paste"),
      "Warning: do not — check the note before pasting",
    ));
  t("tooltip: canonical lowercase form regardless of case input", () =>
    assert.equal(
      formatNoteWarningTooltip("STAGING"),
      "Warning: staging — check the note before pasting",
    ));

  // -------------------- realistic note scenarios --------------------
  t("realistic: long natural note with embedded warning", () => {
    const note =
      "This snippet is great for testing the new flow, but please remember it points at the staging URL — production is on a different host entirely.";
    assert.equal(hasNoteWarning(note), true);
    // Walks NOTE_WARNING_KEYWORDS in declaration order; 'production'
    // is declared before 'staging' in the env-name group, so when
    // both appear 'production' wins.
    assert.equal(firstWarningKeyword(note), "production");
  });
  t("realistic: note with NO warning keywords", () => {
    const note =
      "Reminder: this clip was captured from the docs page during the onboarding writeup. Use freely.";
    assert.equal(hasNoteWarning(note), false);
    assert.equal(firstWarningKeyword(note), null);
    assert.equal(formatNoteWarningTooltip(note), "");
  });
  t("realistic: deprecated marker", () => {
    const note = "deprecated as of v2.0 — see new API docs";
    assert.equal(hasNoteWarning(note), true);
    assert.equal(firstWarningKeyword(note), "deprecated");
  });
  t("realistic: secret token caveat", () => {
    const note = "secret rotation key - rotate weekly";
    assert.equal(hasNoteWarning(note), true);
    assert.equal(firstWarningKeyword(note), "secret");
  });
  t("realistic: harmless 'do' that ISN'T a 'do not'", () => {
    const note = "I do this every Tuesday";
    assert.equal(hasNoteWarning(note), false);
  });
  t("realistic: harmless 'donut' (substring match must not fire)", () => {
    const note = "donut shop receipt";
    assert.equal(hasNoteWarning(note), false);
  });

  // -------------------- NOTE_WARNING_KEYWORDS constant --------------------
  t("NOTE_WARNING_KEYWORDS is non-empty array", () => {
    assert.ok(Array.isArray(NOTE_WARNING_KEYWORDS));
    assert.ok(NOTE_WARNING_KEYWORDS.length > 0);
  });
  t("NOTE_WARNING_KEYWORDS includes core entries", () => {
    assert.ok(NOTE_WARNING_KEYWORDS.includes("prod"));
    assert.ok(NOTE_WARNING_KEYWORDS.includes("staging"));
    assert.ok(NOTE_WARNING_KEYWORDS.includes("do not"));
    assert.ok(NOTE_WARNING_KEYWORDS.includes("deprecated"));
    assert.ok(NOTE_WARNING_KEYWORDS.includes("secret"));
  });
  t("NOTE_WARNING_KEYWORDS all lowercase (canonical form)", () => {
    for (const kw of NOTE_WARNING_KEYWORDS) {
      assert.equal(kw, kw.toLowerCase(), `keyword "${kw}" should be lowercase`);
    }
  });

  console.log(`note-warning: ${pass} checks passed`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
