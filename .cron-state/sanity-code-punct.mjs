// Sanity: tok-punct token class in lib/code-highlight.ts.
//
// Verifies the structural-punctuation tinting added to the code body
// highlighter: brackets/braces/parens/separators + the arrows `=>`/`->`
// get a tok-punct span, arrows aren't split, punctuation inside strings
// or comments is NOT tinted (the master regex claims those first),
// config langs (yaml) opt out, and everything stays XSS-safe (escaped
// before spanning). Inline copies of the relevant pieces so this runs
// bundler-free, mirroring the module's masterRegex + tintGap logic.

const ENTITY = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function esc(s) { return s.replace(/[&<>"']/g, (c) => ENTITY[c]); }

function masterRegex() {
  const dq = `"(?:\\\\.|[^"\\\\\\n])*"?`;
  const sq = `'(?:\\\\.|[^'\\\\\\n])*'?`;
  const bt = "`(?:\\\\.|[^`\\\\])*`?";
  const strings = `${dq}|${sq}|${bt}`;
  const comments = `/\\*[\\s\\S]*?\\*/|//[^\\n]*`;
  return new RegExp(`(${comments})|(${strings})`, "g");
}

function tintGap(raw, punct) {
  if (raw === "") return "";
  let out = "", last = 0;
  const combined = punct
    ? /(=>|->|[{}()[\];,])|([A-Za-z_]\w*)|(\b(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b)/g
    : /()([A-Za-z_]\w*)|(\b(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b)/g;
  let m;
  while ((m = combined.exec(raw)) !== null) {
    if (m.index > last) out += esc(raw.slice(last, m.index));
    if (m[1] != null && m[1] !== "") out += `<span class="tok-punct">${esc(m[1])}</span>`;
    else if (m[2] != null) out += esc(m[2]);
    else if (m[3] != null) out += `<span class="tok-number">${esc(m[3])}</span>`;
    last = m.index + m[0].length;
    if (m[0] === "") combined.lastIndex++;
  }
  if (last < raw.length) out += esc(raw.slice(last));
  return out;
}

function highlight(content, punct) {
  const master = masterRegex();
  let out = "", last = 0, m;
  while ((m = master.exec(content)) !== null) {
    if (m.index > last) out += tintGap(content.slice(last, m.index), punct);
    if (m[1] != null) out += `<span class="tok-comment">${esc(m[1])}</span>`;
    else if (m[2] != null) out += `<span class="tok-string">${esc(m[2])}</span>`;
    last = m.index + m[0].length;
    if (m[0] === "") master.lastIndex++;
  }
  if (last < content.length) out += tintGap(content.slice(last), punct);
  return out;
}

let p = 0, t = 0;
function ck(n, c, ctx) { t++; if (c) p++; else console.error("FAIL", n, "CTX", ctx); }

const a = highlight("const f = () => x;", true);
ck("=> one span", a.includes('<span class="tok-punct">=&gt;</span>'), a);
ck("paren tinted", a.includes('<span class="tok-punct">(</span>'), a);
ck("semicolon tinted", a.includes('<span class="tok-punct">;</span>'), a);

const s = highlight('let x = "a; b => c";', true);
ck("string escaped one span", s.includes('<span class="tok-string">&quot;a; b =&gt; c&quot;</span>'), s);
ck("no punct span inside string", !/&quot;a<span class="tok-punct">/.test(s), s);

const cm = highlight("// a; b => c\nlet y=1;", true);
ck("comment whole tinted", cm.includes('<span class="tok-comment">// a; b =&gt; c</span>'), cm);

const x = highlight('const t = "</pre><script>z</script>";', true);
ck("no raw </pre>", !x.includes("</pre>"), x);
ck("no raw <script>", !x.includes("<script>"), x);
ck("escaped lt present", x.includes("&lt;"), x);

const y = highlight("key: {inline: 1}", false);
ck("config (punct off) no punct span", !y.includes('class="tok-punct"'), y);

const j = highlight('{"a":[1,2]}', true);
ck("json brace tinted", j.includes('<span class="tok-punct">{</span>'), j);
ck("json bracket tinted", j.includes('<span class="tok-punct">[</span>'), j);

const n = highlight("arr[0] = 42;", true);
ck("number + punct coexist", n.includes('<span class="tok-number">42</span>') && n.includes('<span class="tok-punct">[</span>'), n);

const r = highlight("fn f() -> i32 { 0 }", true);
ck("-> one span", r.includes('<span class="tok-punct">-&gt;</span>'), r);
ck("comma tinted", highlight("f(a, b)", true).includes('<span class="tok-punct">,</span>'), "comma");

console.log(`code-punct: ${p}/${t}`);
process.exit(p === t ? 0 : 1);
