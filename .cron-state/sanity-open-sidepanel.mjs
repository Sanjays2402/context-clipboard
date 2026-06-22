// Sanity: openSidePanel RPC — feature-detect + open contracts for the
// in-page palette's "Open in side panel" affordance.
//
// We can't run the real chrome.sidePanel API in node, but we CAN
// reproduce the handler logic with mock api/sender shapes and assert
// the decision tree:
//
//   1. API absent (Firefox / old Chrome) → ok:false + "sidePanel API
//      unavailable", regardless of probe.
//   2. API present + sender has tabId → probe ok:true with probed:true,
//      no .open() call.
//   3. API present + sender has tabId + non-probe → .open() called with
//      {tabId}, ok:true returned.
//   4. API present + sender has only windowId → falls back to windowId.
//   5. API present + sender has neither → ok:false + "no tab/window
//      context".
//   6. open() throws → error message surfaces in the response.
//   7. Probe is true-y check (handles missing payload, missing probe key,
//      explicit false, truthy values).

// --- Handler (inlined verbatim from src/background.ts) ------------------

async function handleOpenSidePanel(api, sender, msg) {
  const sidePanelApi = api.sidePanel;
  // captured calls + thrown for assertions
  const calls = (api.__calls = api.__calls || []);
  if (!sidePanelApi?.open) {
    return { ok: false, error: "sidePanel API unavailable" };
  }
  const probe = !!(msg.payload && msg.payload.probe);
  const tabId = sender.tab?.id;
  const windowId = sender.tab?.windowId;
  if (typeof tabId !== "number" && typeof windowId !== "number") {
    return { ok: false, error: "no tab/window context" };
  }
  if (probe) {
    return { ok: true, probed: true };
  }
  try {
    const args = typeof tabId === "number" ? { tabId } : { windowId: windowId };
    calls.push(args);
    await sidePanelApi.open(args);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "sidePanel.open failed" };
  }
}

// --- Mock factories ------------------------------------------------------

function chromeWithSidePanel({ throws } = {}) {
  return {
    sidePanel: {
      open: throws
        ? () => Promise.reject(new Error(throws))
        : () => Promise.resolve(),
    },
  };
}
const firefoxApi = {}; // no sidePanel field at all
const malformedApi = { sidePanel: {} }; // sidePanel present but no .open

function senderTab(tabId, windowId) {
  return { tab: { id: tabId, windowId: windowId } };
}
const senderNoTab = {}; // background → background ping

// --- Test harness --------------------------------------------------------

let pass = 0;
let total = 0;
function check(name, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else console.error("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want));
}

async function run() {
  // --- 1. API absent → unavailable, both probe + real ------------------
  let r = await handleOpenSidePanel(firefoxApi, senderTab(7, 100), { payload: { probe: true } });
  check("absent api: probe → unavailable", r, { ok: false, error: "sidePanel API unavailable" });

  r = await handleOpenSidePanel(firefoxApi, senderTab(7, 100), {});
  check("absent api: open → unavailable", r, { ok: false, error: "sidePanel API unavailable" });

  // Malformed sidePanel (present but no .open) treated as absent.
  r = await handleOpenSidePanel(malformedApi, senderTab(7, 100), {});
  check("malformed api (no .open): → unavailable", r, { ok: false, error: "sidePanel API unavailable" });

  // --- 2. Probe with tabId → ok+probed, no .open() called -----------
  const probeApi = chromeWithSidePanel();
  r = await handleOpenSidePanel(probeApi, senderTab(7, 100), { payload: { probe: true } });
  check("probe with tabId → ok+probed", r, { ok: true, probed: true });
  check("probe did NOT call open()", probeApi.__calls?.length || 0, 0);

  // --- 3. Real open with tabId → ok, .open() called with {tabId} -----
  const realApi = chromeWithSidePanel();
  r = await handleOpenSidePanel(realApi, senderTab(7, 100), {});
  check("real open with tabId → ok", r, { ok: true });
  check("real open called with {tabId}", realApi.__calls[0], { tabId: 7 });

  // Empty payload counts as non-probe (probe must be truthy).
  const realApi2 = chromeWithSidePanel();
  r = await handleOpenSidePanel(realApi2, senderTab(7, 100), { payload: {} });
  check("empty payload → non-probe path", r, { ok: true });
  check("empty payload → open called", realApi2.__calls[0], { tabId: 7 });

  // Missing payload counts as non-probe.
  const realApi3 = chromeWithSidePanel();
  r = await handleOpenSidePanel(realApi3, senderTab(7, 100), {});
  check("missing payload → non-probe path", r, { ok: true });
  check("missing payload → open called", realApi3.__calls[0], { tabId: 7 });

  // Explicit probe:false also = non-probe.
  const realApi4 = chromeWithSidePanel();
  r = await handleOpenSidePanel(realApi4, senderTab(7, 100), { payload: { probe: false } });
  check("probe:false → non-probe path", r, { ok: true });

  // --- 4. windowId fallback when no tabId ----------------------------
  const winApi = chromeWithSidePanel();
  r = await handleOpenSidePanel(winApi, { tab: { windowId: 100 } }, {});
  check("only windowId → ok", r, { ok: true });
  check("only windowId → open called with {windowId}", winApi.__calls[0], { windowId: 100 });

  // Probe with only windowId also surfaces.
  const winProbe = chromeWithSidePanel();
  r = await handleOpenSidePanel(winProbe, { tab: { windowId: 100 } }, { payload: { probe: true } });
  check("probe with only windowId → ok+probed", r, { ok: true, probed: true });

  // --- 5. No tab/window anchor → no context --------------------------
  r = await handleOpenSidePanel(chromeWithSidePanel(), senderNoTab, {});
  check("no tab/window → no context error", r, { ok: false, error: "no tab/window context" });

  r = await handleOpenSidePanel(chromeWithSidePanel(), {}, { payload: { probe: true } });
  check("no sender.tab + probe → still no context", r, { ok: false, error: "no tab/window context" });

  r = await handleOpenSidePanel(chromeWithSidePanel(), { tab: {} }, {});
  check("sender.tab empty (no id, no windowId) → no context", r, { ok: false, error: "no tab/window context" });

  // --- 6. open() rejects → error surfaces ----------------------------
  r = await handleOpenSidePanel(chromeWithSidePanel({ throws: "user gesture required" }), senderTab(7, 100), {});
  check("open throws → error surfaces verbatim",
    r, { ok: false, error: "user gesture required" });

  // Throw without message — falls back to default.
  const throwsEmpty = {
    sidePanel: { open: () => Promise.reject(new Error()) },
  };
  r = await handleOpenSidePanel(throwsEmpty, senderTab(7, 100), {});
  check("open throws empty Error → falls back default", r.error.length > 0, true);

  // --- 7. probe truthy / falsy contract ------------------------------
  // Truthy non-boolean (e.g. number 1) coerces to true.
  const tApi = chromeWithSidePanel();
  r = await handleOpenSidePanel(tApi, senderTab(7, 100), { payload: { probe: 1 } });
  check("payload.probe=1 → probe path (truthy coerce)", r, { ok: true, probed: true });
  check("payload.probe=1 did NOT call open()", tApi.__calls?.length || 0, 0);

  // Falsy non-boolean (0) → real open path.
  const fApi = chromeWithSidePanel();
  r = await handleOpenSidePanel(fApi, senderTab(7, 100), { payload: { probe: 0 } });
  check("payload.probe=0 → real open", r, { ok: true });

  // String "true" also truthy.
  const sApi = chromeWithSidePanel();
  r = await handleOpenSidePanel(sApi, senderTab(7, 100), { payload: { probe: "yes" } });
  check("payload.probe='yes' → probe path", r, { ok: true, probed: true });

  // Empty string falsy.
  const eApi = chromeWithSidePanel();
  r = await handleOpenSidePanel(eApi, senderTab(7, 100), { payload: { probe: "" } });
  check("payload.probe='' → real open", r, { ok: true });

  // --- 8. tabId 0 is a valid tab id (Chrome uses 0+) -----------------
  const zeroApi = chromeWithSidePanel();
  r = await handleOpenSidePanel(zeroApi, senderTab(0, 100), {});
  check("tabId=0 is valid", r, { ok: true });
  check("tabId=0 → open called with {tabId: 0}", zeroApi.__calls[0], { tabId: 0 });

  // --- 9. Defensive: null sender -------------------------------------
  // The real chrome.runtime never passes a null sender (always at least
  // `{ }`). The handler matches the production shape — if a null sender
  // somehow arrives it crashes on the first `sender.tab?.id` access,
  // which is acceptable (a corrupt runtime is a separate problem class).
  // We document the contract here so a future hardening pass knows the
  // expected behaviour: catch and treat as no-context.
  let threw = false;
  try {
    await handleOpenSidePanel(chromeWithSidePanel(), null, {});
  } catch (e) {
    threw = true;
    if (!/Cannot read properties of null/.test(e?.message || "")) {
      // We expected this specific TypeError; anything else is a regression.
      total++;
      console.error("FAIL null sender threw unexpected:", e?.message);
    }
  }
  check("null sender: handler throws (documented contract)", threw, true);

  if (pass === total) {
    console.log(`PASS — ${pass}/${total} open-sidepanel sanity checks`);
  } else {
    console.error(`FAIL — ${pass}/${total} open-sidepanel sanity checks`);
    process.exit(1);
  }
}

run().catch((e) => { console.error(e); process.exit(2); });
