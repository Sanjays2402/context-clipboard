// Self-contained sanity test for highlightHtml() — mirrors the impl in
// src/lib/util.ts so we don't need to compile TS to verify behavior.

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightHtml(text, needle) {
  const escaped = escapeHtml(text);
  const n = (needle || "").trim();
  if (!n) return escaped;
  const needleEsc = escapeHtml(n);
  if (!needleEsc) return escaped;
  const re = new RegExp(`(${escapeRegex(needleEsc)})`, "gi");
  return escaped.replace(re, `<mark class="match-hl">$1</mark>`);
}

const cases = [
  { name: "no needle → escaped",
    text: "hello <b>world</b>",
    needle: undefined,
    want: "hello &lt;b&gt;world&lt;/b&gt;" },
  { name: "empty needle → escaped",
    text: "foo & bar",
    needle: "",
    want: "foo &amp; bar" },
  { name: "whitespace needle → escaped",
    text: "foo bar",
    needle: "   ",
    want: "foo bar" },
  { name: "basic case-insensitive",
    text: "Hello world, HELLO friend",
    needle: "hello",
    want: '<mark class="match-hl">Hello</mark> world, <mark class="match-hl">HELLO</mark> friend' },
  { name: "regex meta chars escaped",
    text: "the cost is $4.99 (great)",
    needle: "$4.99",
    want: 'the cost is <mark class="match-hl">$4.99</mark> (great)' },
  { name: "escape html in body before highlight",
    text: "<script>alert(1)</script>",
    needle: "alert",
    want: '&lt;script&gt;<mark class="match-hl">alert</mark>(1)&lt;/script&gt;' },
  { name: "needle with html chars escapes safely",
    text: "use <div> tag",
    needle: "<div>",
    want: 'use <mark class="match-hl">&lt;div&gt;</mark> tag' },
  { name: "no match → plain escape only",
    text: "nothing here",
    needle: "zzz",
    want: "nothing here" },
  { name: "ampersand-aware",
    text: "rock & roll & jazz",
    needle: "&",
    want: 'rock <mark class="match-hl">&amp;</mark> roll <mark class="match-hl">&amp;</mark> jazz' },
];

let pass = 0;
for (const c of cases) {
  const got = highlightHtml(c.text, c.needle);
  if (got !== c.want) {
    console.error("FAIL", c.name);
    console.error("  text:  ", JSON.stringify(c.text));
    console.error("  needle:", JSON.stringify(c.needle));
    console.error("  got:   ", got);
    console.error("  want:  ", c.want);
    process.exit(1);
  }
  pass++;
}
console.log("OK", pass, "/", cases.length);
