// Sanity tests for the language-detection used by copy-as-markdown and
// the markdown export. Pure helper — we just bundle util.ts and assert
// the detector hits the right tag for representative snippets and
// returns undefined on ambiguous prose.

import { build } from "esbuild";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const dir = mkdtempSync(join(tmpdir(), "ctxclip-lang-"));
let failed = 0;
function eq(actual, expected, label) {
  if (actual === expected) {
    console.log(`  ok   ${label} → ${actual ?? "(none)"}`);
  } else {
    console.error(`  FAIL ${label} → expected ${expected ?? "(none)"}, got ${actual ?? "(none)"}`);
    failed++;
  }
}

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
  const det = util.detectCodeLang;

  // JSON
  eq(det('{"a": 1, "b": [2,3]}'), "json", "JSON object");
  eq(det("[1,2,3]"), "json", "JSON array");

  // Diff
  eq(det("diff --git a/x b/x\n@@ -1 +1 @@\n-foo\n+bar"), "diff", "git diff");

  // Markdown
  eq(det("# Heading\n\nsome text\n\n## Sub\n"), "markdown", "MD heading");

  // Shebangs
  eq(det("#!/usr/bin/env bash\nset -e\necho hi"), "bash", "bash shebang");
  eq(det("#!/usr/bin/env python3\nprint('hi')"), "python", "python shebang");

  // SQL
  eq(
    det("SELECT id, name FROM users WHERE active = TRUE ORDER BY id;"),
    "sql",
    "SELECT statement",
  );

  // Python (no shebang)
  eq(
    det("def hello(name):\n    return f'hi {name}'\n\nclass A:\n    pass"),
    "python",
    "python def/class",
  );

  // Go
  eq(
    det("package main\n\nimport \"fmt\"\n\nfunc main() {\n  fmt.Println(\"hi\")\n}"),
    "go",
    "go program",
  );

  // Rust
  eq(
    det("fn add(a: i32, b: i32) -> i32 {\n    a + b\n}"),
    "rust",
    "rust fn",
  );

  // Shell (no shebang) — common command preface
  eq(det("$ npm run build\n$ git status"), "bash", "shell prompt");
  eq(det("export PATH=/usr/local/bin:$PATH"), "bash", "shell export");

  // YAML
  eq(
    det("name: cake\nversion: 1.2.3\ndependencies:\n  foo: ^1\n  bar: ~2"),
    "yaml",
    "yaml flat keys",
  );

  // HTML / JSX
  eq(det("<div class=\"box\">hi</div>"), "html", "plain HTML");
  eq(
    det("function App() { return <div className=\"x\">{name}</div>; }"),
    "jsx",
    "JSX with className",
  );

  // CSS
  eq(
    det(".btn {\n  color: red;\n  padding: 4px 8px;\n}"),
    "css",
    "CSS selector",
  );

  // TypeScript
  eq(
    det("interface Foo { id: string; name?: string; }\nconst f: Foo = { id: 'a' };"),
    "typescript",
    "TS interface",
  );
  eq(det("type Kind = 'a' | 'b' | 'c';"), "typescript", "TS type alias");

  // JavaScript fallback
  eq(
    det("const x = 1;\nfunction y() { return x + 1; }"),
    "javascript",
    "JS const/function",
  );

  // Prose / ambiguous — must NOT claim a language
  eq(det("just a regular sentence with no code in it"), undefined, "plain prose");
  eq(det(""), undefined, "empty string");
  eq(det("ok"), undefined, "too short");

  if (failed > 0) {
    console.error(`FAIL lang-detect sanity (${failed} mismatch${failed === 1 ? "" : "es"})`);
    process.exit(1);
  }
  console.log(`PASS lang-detect sanity (${22} checks)`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
