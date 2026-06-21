// Sanity: mergeDuplicatesByHash merge math (survivor selection, tag
// union, hitCount sum, pinned OR, earliest createdAt).
//
// Re-implements the merge math in-process. The IDB side-effects (trash
// + putClip) are covered by an in-process fake.

function mergeDuplicatesByHashSync(clips, fakeTrash) {
  const byHash = new Map();
  for (const c of clips) {
    if (!c.hash) continue;
    const arr = byHash.get(c.hash);
    if (arr) arr.push(c);
    else byHash.set(c.hash, [c]);
  }
  let groups = 0;
  let merged = 0;
  const survivors = [];
  for (const [, members] of byHash) {
    if (members.length < 2) continue;
    groups++;
    members.sort(
      (a, b) =>
        (b.lastSeenAt || 0) - (a.lastSeenAt || 0) ||
        (b.createdAt || 0) - (a.createdAt || 0),
    );
    const survivor = { ...members[0] };
    const losers = members.slice(1);
    let earliestCreated = survivor.createdAt;
    let totalHits = survivor.hitCount || 1;
    let pinned = !!survivor.pinned;
    const tagSet = new Set(survivor.tags || []);
    for (const l of losers) {
      totalHits += l.hitCount || 1;
      pinned = pinned || !!l.pinned;
      if ((l.createdAt || 0) < earliestCreated) earliestCreated = l.createdAt;
      for (const t of l.tags || []) tagSet.add(t);
    }
    survivor.hitCount = totalHits;
    survivor.pinned = pinned;
    survivor.createdAt = earliestCreated;
    survivor.tags = Array.from(tagSet);
    survivors.push(survivor);
    for (const l of losers) {
      fakeTrash.push(l.id);
      merged++;
    }
  }
  return { groups, merged, hashesScanned: byHash.size, survivors };
}

let pass = 0;
let total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}

// 1. No duplicates → no change.
{
  const trash = [];
  const r = mergeDuplicatesByHashSync(
    [
      { id: "a", hash: "h1", lastSeenAt: 1, createdAt: 1, hitCount: 1, tags: [] },
      { id: "b", hash: "h2", lastSeenAt: 2, createdAt: 2, hitCount: 1, tags: [] },
    ],
    trash,
  );
  check("nodup: groups", r.groups, 0);
  check("nodup: merged", r.merged, 0);
  check("nodup: trash list", trash, []);
}

// 2. Survivor is most-recently-seen.
{
  const trash = [];
  const r = mergeDuplicatesByHashSync(
    [
      { id: "old", hash: "h", lastSeenAt: 100, createdAt: 100, hitCount: 1, tags: ["a"] },
      { id: "new", hash: "h", lastSeenAt: 500, createdAt: 200, hitCount: 1, tags: ["b"] },
    ],
    trash,
  );
  check("survivor: groups", r.groups, 1);
  check("survivor: merged", r.merged, 1);
  check("survivor: trash list", trash, ["old"]);
  check("survivor: id is most recent", r.survivors[0].id, "new");
  // tags unioned
  check("survivor: tags unioned", r.survivors[0].tags.sort(), ["a", "b"]);
  // earliest createdAt preserved
  check("survivor: earliest createdAt", r.survivors[0].createdAt, 100);
  // hitCount summed
  check("survivor: hits summed", r.survivors[0].hitCount, 2);
}

// 3. Pinned OR-merge: loser was pinned, survivor wasn't → survivor inherits pin.
{
  const trash = [];
  const r = mergeDuplicatesByHashSync(
    [
      { id: "pinned", hash: "h", lastSeenAt: 100, createdAt: 50, hitCount: 1, tags: [], pinned: true },
      { id: "fresh", hash: "h", lastSeenAt: 500, createdAt: 200, hitCount: 1, tags: [], pinned: false },
    ],
    trash,
  );
  check("pin-OR: survivor id", r.survivors[0].id, "fresh");
  check("pin-OR: survivor pinned", r.survivors[0].pinned, true);
  // earliestCreated still wins from loser
  check("pin-OR: earliest createdAt 50", r.survivors[0].createdAt, 50);
}

// 4. Multiple losers in one group.
{
  const trash = [];
  const r = mergeDuplicatesByHashSync(
    [
      { id: "a", hash: "h", lastSeenAt: 100, createdAt: 100, hitCount: 3, tags: ["one"] },
      { id: "b", hash: "h", lastSeenAt: 200, createdAt: 200, hitCount: 2, tags: ["two"] },
      { id: "c", hash: "h", lastSeenAt: 300, createdAt: 50, hitCount: 5, tags: ["three"] },
    ],
    trash,
  );
  check("multi: 1 group", r.groups, 1);
  check("multi: 2 losers", r.merged, 2);
  check("multi: survivor id (latest lastSeen)", r.survivors[0].id, "c");
  check("multi: tags all unioned", r.survivors[0].tags.sort(), ["one", "three", "two"]);
  check("multi: hits summed (3+2+5)", r.survivors[0].hitCount, 10);
  check("multi: earliest createdAt 50", r.survivors[0].createdAt, 50);
  check("multi: trash includes a + b", trash.sort(), ["a", "b"]);
}

// 5. Clips without hash are skipped entirely.
{
  const trash = [];
  const r = mergeDuplicatesByHashSync(
    [
      { id: "n1", hash: "", lastSeenAt: 1, createdAt: 1, hitCount: 1, tags: [] },
      { id: "n2", hash: undefined, lastSeenAt: 2, createdAt: 2, hitCount: 1, tags: [] },
    ],
    trash,
  );
  check("hashless: 0 groups", r.groups, 0);
  check("hashless: 0 trash", trash, []);
}

// 6. Three groups, mixed sizes.
{
  const trash = [];
  const r = mergeDuplicatesByHashSync(
    [
      { id: "1", hash: "x", lastSeenAt: 1, createdAt: 1, hitCount: 1, tags: [] },
      { id: "2", hash: "x", lastSeenAt: 2, createdAt: 2, hitCount: 1, tags: [] },
      { id: "3", hash: "y", lastSeenAt: 3, createdAt: 3, hitCount: 1, tags: [] },
      { id: "4", hash: "y", lastSeenAt: 4, createdAt: 4, hitCount: 1, tags: [] },
      { id: "5", hash: "y", lastSeenAt: 5, createdAt: 5, hitCount: 1, tags: [] },
      { id: "6", hash: "z", lastSeenAt: 6, createdAt: 6, hitCount: 1, tags: [] },
    ],
    trash,
  );
  check("mixed: 2 dup groups (x,y)", r.groups, 2);
  check("mixed: 3 losers (1 from x, 2 from y)", r.merged, 3);
  check("mixed: hashesScanned = 3", r.hashesScanned, 3);
}

console.log(`${pass}/${total} passed`);
if (pass !== total) process.exit(1);
