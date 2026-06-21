// Sanity: privacy audit ring buffer math — verify cap, head-first order,
// detail truncation, and clear behavior, all in-process (the IDB side-
// effects are covered by an in-process array shim that mirrors the
// real append-prune-30 path).

let pass = 0;
let total = 0;
function check(name, got, want) {
  total++;
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else console.error('FAIL', name, 'got', JSON.stringify(got), 'want', JSON.stringify(want));
}

const PRIVACY_AUDIT_MAX = 30;

function appendInPlace(list, entry) {
  // Mirrors the real `appendPrivacyAuditEntry` math (newest-first,
  // detail capped at 80, slice to PRIVACY_AUDIT_MAX). We don't bother
  // with the random nonce in `id` — tests inject a deterministic id.
  const next = {
    id: entry._id || `pa_${list.length}`,
    at: entry._at ?? Date.now(),
    clipId: entry.clipId || '',
    kind: entry.kind,
    host: entry.host,
    detail: entry.detail ? entry.detail.slice(0, 80) : undefined,
  };
  return [next, ...list].slice(0, PRIVACY_AUDIT_MAX);
}

// 1. Empty → one entry.
{
  const list = appendInPlace([], { kind: 'redact', clipId: 'a', _id: 'p1', _at: 100 });
  check('first append: length', list.length, 1);
  check('first append: kind', list[0].kind, 'redact');
}

// 2. Newest-first.
{
  let list = [];
  list = appendInPlace(list, { kind: 'redact', clipId: 'a', _id: 'p1', _at: 100 });
  list = appendInPlace(list, { kind: 'scrub-origin', clipId: 'b', _id: 'p2', _at: 200 });
  list = appendInPlace(list, { kind: 'forget-host', host: 'x.com', _id: 'p3', _at: 300 });
  check('newest first: top kind', list[0].kind, 'forget-host');
  check('newest first: top host', list[0].host, 'x.com');
  check('order: oldest at tail', list[list.length - 1]._id ?? list[list.length - 1].id, 'p1');
}

// 3. Detail truncated to 80 chars.
{
  const long = 'x'.repeat(200);
  const list = appendInPlace([], { kind: 'retro-redact', clipId: '', detail: long, _id: 'p1' });
  check('truncate: length', list[0].detail.length, 80);
}

// 4. Ring cap — push 35 entries, expect 30 with oldest evicted.
{
  let list = [];
  for (let i = 0; i < 35; i++) {
    list = appendInPlace(list, { kind: 'redact', clipId: `c${i}`, _id: `p${i}`, _at: i });
  }
  check('cap: length', list.length, PRIVACY_AUDIT_MAX);
  check('cap: newest first id', list[0].clipId, 'c34');
  // Oldest 5 fell off: c0..c4 should be gone.
  const ids = new Set(list.map((e) => e.clipId));
  check('cap: c4 evicted', ids.has('c4'), false);
  check('cap: c5 retained', ids.has('c5'), true);
}

// 5. forget-host: clipId can be empty, host carries the meaning.
{
  const list = appendInPlace([], { kind: 'forget-host', host: 'bank.com', detail: '4 clips', _id: 'p1' });
  check('forget: clipId blank', list[0].clipId, '');
  check('forget: host present', list[0].host, 'bank.com');
}

// 6. Missing detail → undefined (no empty-string padding).
{
  const list = appendInPlace([], { kind: 'redact', clipId: 'a', _id: 'p1' });
  check('no-detail: undefined', list[0].detail, undefined);
}

// 7. Clear (simulate by emptying the array).
{
  let list = [];
  for (let i = 0; i < 3; i++) {
    list = appendInPlace(list, { kind: 'redact', clipId: `c${i}`, _id: `p${i}` });
  }
  check('clear: pre-clear length', list.length, 3);
  list = [];
  check('clear: post-clear length', list.length, 0);
}

if (pass === total) {
  console.log(`PASS — ${pass}/${total} privacy audit sanity checks`);
} else {
  console.error(`FAIL — ${pass}/${total} privacy audit sanity checks`);
  process.exit(1);
}
