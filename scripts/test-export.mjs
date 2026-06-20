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
console.log('--- MARKDOWN ---');
console.log(toMarkdown(clips));
console.log('--- CSV ---');
console.log(toCsv(clips));
