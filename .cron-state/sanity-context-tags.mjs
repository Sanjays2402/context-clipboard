// Sanity: context-tags helper for the note composer.
//
// Bundles src/lib/context-tags.ts via esbuild then probes
// tagFromHost / tagsFromUrl / contextTagsForTab against a fixture
// of real-ish URLs. Pure helpers — no DOM.

import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const dir = mkdtempSync(join(tmpdir(), 'ctxclip-ctxtags-'));
try {
  await build({
    entryPoints: ['src/lib/context-tags.ts'],
    bundle: true,
    format: 'esm',
    outfile: join(dir, 'ctxtags.mjs'),
    platform: 'neutral',
    target: 'es2022',
    sourcemap: false,
  });
  const mod = await import('file://' + join(dir, 'ctxtags.mjs'));

  let pass = 0, total = 0;
  function check(name, got, want) {
    total++;
    if (JSON.stringify(got) === JSON.stringify(want)) pass++;
    else console.error('FAIL', name, 'got', JSON.stringify(got), 'want', JSON.stringify(want));
  }

  // tagFromHost
  check('host: github.com -> github', mod.tagFromHost('github.com'), 'github');
  check('host: docs.github.com -> github', mod.tagFromHost('docs.github.com'), 'github');
  check('host: www.github.com -> github', mod.tagFromHost('www.github.com'), 'github');
  check('host: www.bbc.co.uk -> bbc', mod.tagFromHost('www.bbc.co.uk'), 'bbc');
  check('host: news.bbc.co.uk -> bbc', mod.tagFromHost('news.bbc.co.uk'), 'bbc');
  check('host: shop.example.com.au -> example', mod.tagFromHost('shop.example.com.au'), 'example');
  check('host: localhost -> ""', mod.tagFromHost('localhost'), '');
  check('host: 127.0.0.1 -> ""', mod.tagFromHost('127.0.0.1'), '');
  check('host: localhost:3000 -> ""', mod.tagFromHost('localhost:3000'), '');
  check('host: empty -> ""', mod.tagFromHost(''), '');
  check('host: undefined -> ""', mod.tagFromHost(undefined), '');
  check('host: single TLD -> single', mod.tagFromHost('single'), 'single');

  // tagsFromUrl
  check(
    'url: github PR path',
    mod.tagsFromUrl('https://github.com/NousResearch/hermes-agent/pull/123'),
    ['nousresearch', 'hermes', 'agent', 'pull'],
  );
  check(
    'url: github issues path',
    mod.tagsFromUrl('https://github.com/foo/bar/issues'),
    ['foo', 'bar', 'issues'],
  );
  check(
    'url: drops pure-numeric ids (issue 123)',
    mod.tagsFromUrl('https://example.com/foo/123'),
    ['foo'],
  );
  check(
    'url: drops 4+ digit ids',
    mod.tagsFromUrl('https://example.com/2024/01/post-name'),
    ['post', 'name'],
  );
  check(
    'url: drops hex 12+',
    mod.tagsFromUrl('https://example.com/foo/abcdef0123456789'),
    ['foo'],
  );
  check(
    'url: drops long slugs (>24 chars)',
    mod.tagsFromUrl('https://example.com/' + 'x'.repeat(30) + '/short'),
    ['short'],
  );
  check(
    'url: drops PATH_STOP tokens',
    mod.tagsFromUrl('https://example.com/index.html/article'),
    ['article'],
  );
  check(
    'url: cap at maxTokens',
    mod.tagsFromUrl('https://example.com/a/b/c/d/e/f/g', 3),
    ['a', 'b', 'c'],
  );
  check(
    'url: empty path -> []',
    mod.tagsFromUrl('https://example.com/'),
    [],
  );
  check(
    'url: undefined -> []',
    mod.tagsFromUrl(undefined),
    [],
  );
  check(
    'url: malformed -> []',
    mod.tagsFromUrl('not a url'),
    [],
  );
  check(
    'url: dedupes within the result',
    mod.tagsFromUrl('https://example.com/foo/foo/bar'),
    ['foo', 'bar'],
  );

  // contextTagsForTab — combines host + path, host first.
  check(
    'tab: github PR',
    mod.contextTagsForTab({ url: 'https://github.com/foo/bar/pull/42', title: 'PR #42' }),
    ['github', 'foo', 'bar', 'pull'],
  );
  check(
    'tab: localhost dev -> path tags only (host noisy)',
    mod.contextTagsForTab({ url: 'http://localhost:3000/admin/users' }),
    ['admin', 'users'],
  );
  check(
    'tab: undefined -> []',
    mod.contextTagsForTab(undefined),
    [],
  );
  check(
    'tab: null -> []',
    mod.contextTagsForTab(null),
    [],
  );
  check(
    'tab: empty tab obj -> []',
    mod.contextTagsForTab({}),
    [],
  );
  check(
    'tab: cap at max=2 (host first)',
    mod.contextTagsForTab({ url: 'https://github.com/foo/bar/baz' }, 2),
    ['github', 'foo'],
  );
  check(
    'tab: host present, path empty',
    mod.contextTagsForTab({ url: 'https://example.com/' }),
    ['example'],
  );
  check(
    'tab: dedupes host token from path',
    mod.contextTagsForTab({ url: 'https://github.com/github/dotfiles' }),
    ['github', 'dotfiles'],
  );

  if (pass === total) {
    console.log(`PASS — ${pass}/${total} context-tags sanity checks`);
  } else {
    console.error(`FAIL — ${pass}/${total} context-tags sanity checks`);
    process.exit(1);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
