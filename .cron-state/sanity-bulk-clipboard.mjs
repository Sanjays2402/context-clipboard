// Sanity: planBulkCopy + formatBulkCopyToast + formatBulkCopyButtonTitle
// from src/lib/bulk-clipboard.ts. Inline copies so this runs bundler-free.
//
// Covers join separator, image skipping, raw template bodies, trailing-
// whitespace trim, empty-body skip, all-images empty result, defensive
// nullish handling, toast grammar (singular/plural/skip-tail), button
// title states, char + UTF-8 byte accounting (the new weight figure),
// and a realistic end-to-end.

const JOIN_SEPARATOR = "\n\n";

function utf8ByteLength(s) {
  if (typeof s !== "string" || s.length === 0) return 0;
  if (typeof TextEncoder !== "undefined") {
    try {
      return new TextEncoder().encode(s).length;
    } catch {
      // fall through
    }
  }
  let bytes = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp <= 0x7f) bytes += 1;
    else if (cp <= 0x7ff) bytes += 2;
    else if (cp <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

function formatCopyBytes(n) {
  if (!Number.isFinite(n) || n < 0) return "0 B";
  if (n < 1024) return `${Math.floor(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function planBulkCopy(clips) {
  const bodies = [];
  let skippedImages = 0;
  for (const c of clips) {
    if (!c) continue;
    if (c.kind === "image") {
      skippedImages++;
      continue;
    }
    const body = typeof c.content === "string" ? c.content.replace(/\s+$/, "") : "";
    if (body === "") continue;
    bodies.push(body);
  }
  const text = bodies.join(JOIN_SEPARATOR);
  return {
    text,
    copied: bodies.length,
    skippedImages,
    hasContent: bodies.length > 0,
    chars: [...text].length,
    bytes: utf8ByteLength(text),
  };
}

function formatBulkCopyToast(plan) {
  const { copied, skippedImages, chars, bytes } = plan;
  if (copied === 0) {
    if (skippedImages > 0) {
      return `Nothing to copy \u2014 ${skippedImages} image${skippedImages === 1 ? "" : "s"} skipped`;
    }
    return "Nothing to copy";
  }
  const head = `Copied ${copied} clip${copied === 1 ? "" : "s"} \u2014 ${groupThousandsLocal(chars)} char${chars === 1 ? "" : "s"} \u2014 ${formatCopyBytes(bytes)}`;
  if (skippedImages > 0) {
    return `${head} \u2014 ${skippedImages} image${skippedImages === 1 ? "" : "s"} skipped`;
  }
  return head;
}

function formatBulkCopyButtonTitle(plan) {
  if (!plan.hasContent) {
    if (plan.skippedImages > 0) {
      return "Copy selected as text (selection is all images \u2014 nothing to copy)";
    }
    return "Copy selected clips as text";
  }
  const base = `Copy ${plan.copied} clip${plan.copied === 1 ? "" : "s"} as text (${groupThousandsLocal(plan.chars)} char${plan.chars === 1 ? "" : "s"} \u00b7 ${formatCopyBytes(plan.bytes)})`;
  if (plan.skippedImages > 0) {
    return `${base} (${plan.skippedImages} image${plan.skippedImages === 1 ? "" : "s"} skipped)`;
  }
  return base;
}

function groupThousandsLocal(n) {
  if (!Number.isFinite(n)) return "0";
  const digits = Math.abs(Math.trunc(n)).toString();
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

let pass = 0;
let total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}

const T = (content) => ({ kind: "text", content });
const L = (content) => ({ kind: "link", content });
const I = () => ({ kind: "image", content: "data:image/png;base64,AAA" });

// --- 1. basic join -------------------------------------------------------
check("two text clips joined", planBulkCopy([T("alpha"), T("beta")]).text, "alpha\n\nbeta");
check("join copied count", planBulkCopy([T("a"), T("b"), T("c")]).copied, 3);
check("single clip no separator", planBulkCopy([T("only")]).text, "only");
check("link clips join", planBulkCopy([L("https://a.com"), L("https://b.com")]).text, "https://a.com\n\nhttps://b.com");
check("mixed text + link", planBulkCopy([T("note"), L("https://x.com")]).text, "note\n\nhttps://x.com");

// --- 2. image skipping ---------------------------------------------------
check("image skipped from join", planBulkCopy([T("a"), I(), T("b")]).text, "a\n\nb");
check("image skip count", planBulkCopy([T("a"), I(), T("b")]).skippedImages, 1);
check("two images skipped", planBulkCopy([T("a"), I(), I()]).skippedImages, 2);
check("copied excludes images", planBulkCopy([T("a"), I(), T("b")]).copied, 2);

// --- 3. all-images empty result -----------------------------------------
const allImg = planBulkCopy([I(), I()]);
check("all images no content", allImg.hasContent, false);
check("all images empty text", allImg.text, "");
check("all images copied zero", allImg.copied, 0);
check("all images skip count", allImg.skippedImages, 2);

// --- 4. template raw (un-expanded) --------------------------------------
check("template body stays raw", planBulkCopy([T("Hi {{name}}, see {{url}}")]).text, "Hi {{name}}, see {{url}}");
check("template joins raw", planBulkCopy([T("{{date}}"), T("plain")]).text, "{{date}}\n\nplain");

// --- 5. trailing-whitespace trim + internal preservation ----------------
check("trailing newline trimmed", planBulkCopy([T("a\n\n"), T("b")]).text, "a\n\nb");
check("trailing spaces trimmed", planBulkCopy([T("hello   "), T("world")]).text, "hello\n\nworld");
check("internal newlines preserved", planBulkCopy([T("line1\nline2"), T("x")]).text, "line1\nline2\n\nx");
check("internal indentation preserved", planBulkCopy([T("  indented\n    more")]).text, "  indented\n    more");

// --- 6. empty-body skip --------------------------------------------------
check("empty text skipped", planBulkCopy([T(""), T("real")]).text, "real");
check("whitespace-only skipped", planBulkCopy([T("   "), T("real")]).copied, 1);
check("empty not counted as image", planBulkCopy([T(""), T("real")]).skippedImages, 0);

// --- 7. defensive nullish ------------------------------------------------
check("null entries skipped", planBulkCopy([T("a"), null, T("b"), undefined]).text, "a\n\nb");
check("non-string content skipped", planBulkCopy([{ kind: "text", content: null }, T("ok")]).text, "ok");
check("empty array", planBulkCopy([]), { text: "", copied: 0, skippedImages: 0, hasContent: false, chars: 0, bytes: 0 });

// --- 8. toast grammar ----------------------------------------------------
check("toast 1 clip singular", formatBulkCopyToast(planBulkCopy([T("a")])), "Copied 1 clip \u2014 1 char \u2014 1 B");
check("toast 3 clips plural", formatBulkCopyToast(planBulkCopy([T("a"), T("b"), T("c")])), "Copied 3 clips \u2014 7 chars \u2014 7 B");
check("toast with image tail singular", formatBulkCopyToast(planBulkCopy([T("a"), I()])), "Copied 1 clip \u2014 1 char \u2014 1 B \u2014 1 image skipped");
check("toast with image tail plural", formatBulkCopyToast(planBulkCopy([T("a"), I(), I()])), "Copied 1 clip \u2014 1 char \u2014 1 B \u2014 2 images skipped");
check("toast nothing to copy", formatBulkCopyToast(planBulkCopy([])), "Nothing to copy");
check("toast nothing but images", formatBulkCopyToast(planBulkCopy([I(), I()])), "Nothing to copy \u2014 2 images skipped");
check("toast nothing one image", formatBulkCopyToast(planBulkCopy([I()])), "Nothing to copy \u2014 1 image skipped");
check("toast groups thousands", formatBulkCopyToast(planBulkCopy([T("y".repeat(1500))])), "Copied 1 clip \u2014 1,500 chars \u2014 1.5 KB");

// --- 9. button title -----------------------------------------------------
check("title default no content", formatBulkCopyButtonTitle(planBulkCopy([])), "Copy selected clips as text");
check("title all images", formatBulkCopyButtonTitle(planBulkCopy([I(), I()])), "Copy selected as text (selection is all images \u2014 nothing to copy)");
check("title 1 clip with char + byte total", formatBulkCopyButtonTitle(planBulkCopy([T("a")])), "Copy 1 clip as text (1 char \u00b7 1 B)");
check("title 3 clips with char + byte total", formatBulkCopyButtonTitle(planBulkCopy([T("a"), T("b"), T("c")])), "Copy 3 clips as text (7 chars \u00b7 7 B)");
check("title with image skip + totals", formatBulkCopyButtonTitle(planBulkCopy([T("a"), I()])), "Copy 1 clip as text (1 char \u00b7 1 B) (1 image skipped)");
check("title with images skip plural + totals", formatBulkCopyButtonTitle(planBulkCopy([T("ab"), T("cd"), I(), I()])), "Copy 2 clips as text (6 chars \u00b7 6 B) (2 images skipped)");

// --- 9b. char total accounting ------------------------------------------
// chars is the code-point length of the joined text, seams included.
check("chars single clip", planBulkCopy([T("hello")]).chars, 5);
check("chars two clips count both bodies + 2-char seam", planBulkCopy([T("ab"), T("cd")]).chars, 6); // "ab\n\ncd" = 6
check("chars all images zero", planBulkCopy([I(), I()]).chars, 0);
check("chars empty bodies zero", planBulkCopy([T(""), T("  ")]).chars, 0);
check("chars matches joined text length", planBulkCopy([T("alpha"), T("beta")]).chars, [...("alpha\n\nbeta")].length);
// Emoji counts as one code point, not two UTF-16 units.
check("chars counts emoji as one", planBulkCopy([T("\u{1F370}")]).chars, 1);
// Thousands grouping shows up in the title for big joins.
check("title groups thousands", formatBulkCopyButtonTitle(planBulkCopy([T("x".repeat(2500))])), "Copy 1 clip as text (2,500 chars \u00b7 2.4 KB)");

// --- 9c. UTF-8 byte total accounting ------------------------------------
// bytes is the UTF-8 weight of the joined text, seams included. ASCII is
// 1 byte/char, so plain ASCII bodies match chars exactly.
check("bytes ascii single clip", planBulkCopy([T("hello")]).bytes, 5);
check("bytes ascii equals chars", planBulkCopy([T("ab"), T("cd")]).bytes, planBulkCopy([T("ab"), T("cd")]).chars);
check("bytes all images zero", planBulkCopy([I(), I()]).bytes, 0);
check("bytes empty bodies zero", planBulkCopy([T(""), T("  ")]).bytes, 0);
// A cake emoji is 1 code point but 4 UTF-8 bytes — bytes > chars exactly
// where the "is this a heavy paste?" signal matters.
check("bytes counts emoji as four", planBulkCopy([T("\u{1F370}")]).bytes, 4);
check("bytes exceed chars for multibyte", planBulkCopy([T("\u{1F370}")]).bytes > planBulkCopy([T("\u{1F370}")]).chars, true);
// A 3-byte CJK glyph: 1 char, 3 bytes.
check("bytes counts CJK as three", planBulkCopy([T("\u4e2d")]).bytes, 3);
// formatCopyBytes tiers (mirror formatExportBytes byte-for-byte).
check("formatCopyBytes B tier", formatCopyBytes(742), "742 B");
check("formatCopyBytes KB tier", formatCopyBytes(1536), "1.5 KB");
check("formatCopyBytes MB tier", formatCopyBytes(4 * 1024 * 1024 + 200000), "4.2 MB");
check("formatCopyBytes zero", formatCopyBytes(0), "0 B");
check("formatCopyBytes negative defensive", formatCopyBytes(-5), "0 B");
check("formatCopyBytes NaN defensive", formatCopyBytes(NaN), "0 B");

// --- 10. realistic end-to-end -------------------------------------------
const selection = [
  T("export TOKEN=abc123"),
  I(),
  L("https://docs.example.com/auth"),
  T("curl -H 'Authorization: Bearer xyz' \\\n  https://api.example.com/me"),
];
const plan = planBulkCopy(selection);
check("e2e copied 3", plan.copied, 3);
check("e2e skipped 1 image", plan.skippedImages, 1);
check("e2e toast", formatBulkCopyToast(plan), `Copied 3 clips \u2014 ${groupThousandsLocal(plan.chars)} chars \u2014 ${formatCopyBytes(plan.bytes)} \u2014 1 image skipped`);
check(
  "e2e joined text",
  plan.text,
  "export TOKEN=abc123\n\nhttps://docs.example.com/auth\n\ncurl -H 'Authorization: Bearer xyz' \\\n  https://api.example.com/me",
);
// Idempotence: re-running the plan yields the same join.
check("e2e deterministic", planBulkCopy(selection).text, plan.text);

console.log(`bulk-clipboard sanity: ${pass}/${total} passed`);
if (pass !== total) process.exit(1);
