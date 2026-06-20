import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const dir = mkdtempSync(join(tmpdir(), 'ctxclip-tt-'));
try {
  await build({
    entryPoints: ['src/lib/templates.ts'],
    bundle: true,
    format: 'esm',
    outfile: join(dir, 'templates.mjs'),
    platform: 'neutral',
    target: 'es2022',
    sourcemap: false,
  });
  const mod = await import('file://' + join(dir, 'templates.mjs'));
  const fail = (msg) => { console.error('FAIL', msg); process.exit(1); };

  if (!mod.hasTemplateTokens('Hello {{name}}')) fail('hasTemplateTokens missed');
  if (mod.hasTemplateTokens('plain text')) fail('hasTemplateTokens false positive');
  if (mod.hasTemplateTokens('')) fail('empty should be false');

  const fixedNow = new Date('2026-06-19T17:30:45Z');
  const t1 = mod.expandTemplate('on {{date}} at {{time}}', { now: fixedNow });
  if (!/^on \d{4}-\d{2}-\d{2} at \d{2}:\d{2}$/.test(t1)) fail('date/time pattern: ' + t1);

  const t2 = mod.expandTemplate('hi from {{host}} -> {{url}}', {
    host: 'example.com', url: 'https://example.com/x', title: 'X',
  });
  if (t2 !== 'hi from example.com -> https://example.com/x') fail('host/url: ' + t2);

  const t3 = mod.expandTemplate('hello {{name|stranger}}', {});
  if (t3 !== 'hello stranger') fail('fallback: ' + t3);

  const t4 = mod.expandTemplate('keep {{unknownToken}} please', {});
  if (t4 !== 'keep {{unknownToken}} please') fail('unknown intact: ' + t4);

  const t5 = mod.expandTemplate('{{year}}-{{month}}-{{day}}', { now: new Date('2026-01-05T00:00:00') });
  if (t5 !== '2026-01-05') fail('year/month/day: ' + t5);

  const t6 = mod.expandTemplate('id={{uuid}}', {});
  if (!/^id=[0-9a-f-]{8,}/i.test(t6)) fail('uuid: ' + t6);

  const tk = mod.listTokens('a {{Date}} b {{date}} c {{Host}}');
  if (tk.length !== 2 || !tk.includes('date') || !tk.includes('host')) fail('listTokens: ' + JSON.stringify(tk));

  if (mod.expandTemplate('', {}) !== '') fail('empty expand');
  if (mod.expandTemplate('no braces here', {}) !== 'no braces here') fail('no braces');

  const t7 = mod.expandTemplate('multi\nline {{date}}\nend', { now: fixedNow });
  if (!t7.includes('\n')) fail('multiline broken: ' + t7);

  const t8 = mod.expandTemplate('{{host|nowhere}}', {});
  if (t8 !== 'nowhere') fail('host fallback: ' + t8);

  console.log('PASS — 11 template checks');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
