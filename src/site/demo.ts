/**
 * Interactive popup demo for the project website (docs/index.html).
 *
 * Uses the extension's real search parser (lib/search) and row identity
 * (lib/row-identity), so every operator typed here behaves exactly as it
 * does in the popup. Sample clips only; nothing is stored or sent.
 *
 * Built by scripts/build-site.mjs into docs/assets/demo.js.
 */

import { parseQuery, applyQuery, describeQuery } from "../lib/search";
import { hostMonogram, isRedundantRowTag } from "../lib/row-identity";
import type { ClipItem } from "../lib/types";

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T | null;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function hostOf(url?: string): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function timeAgo(ts: number): string {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

// --- Sample history --------------------------------------------------------

const M = 60_000, H = 3_600_000, D = 86_400_000;

interface DemoClip extends ClipItem {
  code?: boolean;
}

function clip(id: string, ago: number, o: Partial<DemoClip> & { content: string }): DemoClip {
  const t = Date.now() - ago;
  return {
    id,
    kind: "text",
    preview: o.content.replace(/\s+/g, " ").slice(0, 140),
    hash: id,
    createdAt: t,
    lastSeenAt: t,
    hitCount: 1,
    pinned: false,
    tags: [],
    bytes: o.content.length,
    source: {},
    ...o,
  } as DemoClip;
}

const CLIPS: DemoClip[] = [
  clip("1", 2 * M, {
    content: "hello@acme.dev",
    pinned: true,
    hitCount: 7,
    tags: ["email", "github.com"],
    source: { url: "https://github.com/settings/emails", title: "Email settings", nearbyText: "Primary email address: hello@acme.dev — this address is used for account notifications." },
  }),
  clip("2", 6 * M, {
    content: "export async function listClips(limit = 50) {\n  const tx = db.transaction(\"clips\", \"readonly\");\n  return tx.objectStore(\"clips\").getAll(null, limit);\n}",
    code: true,
    tags: ["code", "stackoverflow.com"],
    source: { url: "https://stackoverflow.com/questions/68213940", title: "IndexedDB getAll with a limit", nearbyText: "You can pass a count as the second argument to getAll() to cap the number of records returned." },
  }),
  clip("3", 18 * M, {
    kind: "link",
    content: "https://linear.app/changelog",
    tags: ["url", "linear.app"],
    source: { url: "https://news.ycombinator.com/item?id=41890123", title: "Linear's new changelog | Hacker News", nearbyText: "Linear shipped a redesigned changelog today with per-release videos." },
  }),
  clip("4", 41 * M, {
    content: "Mitochondria are membrane-bound organelles that generate most of the chemical energy needed to power the cell.",
    hitCount: 2,
    tags: ["wikipedia.org", "long"],
    source: { url: "https://en.wikipedia.org/wiki/Mitochondrion", title: "Mitochondrion - Wikipedia", nearbyText: "A mitochondrion is an organelle found in the cells of most eukaryotes. Mitochondria are membrane-bound organelles that generate most of the chemical energy needed to power the cell." },
  }),
  clip("5", 2 * H, {
    content: "ssh -i ~/.ssh/id_ed25519 deploy@bastion.prod.internal",
    code: true,
    hitCount: 5,
    tags: ["code", "notion.so"],
    note: "prod only - do not paste in staging",
    source: { url: "https://www.notion.so/acme/Prod-runbook", title: "Prod runbook", nearbyText: "To reach the prod hosts, hop through the bastion with your deploy key." },
  }),
  clip("6", 4 * H, {
    content: "alice,30,engineer,remote",
    tags: ["docs.google.com"],
    source: { url: "https://docs.google.com/spreadsheets/d/1x", title: "Team roster", nearbyText: "" },
  }),
  clip("7", 9 * H, {
    content: "SELECT id, title FROM clips WHERE pinned = 1 ORDER BY last_seen_at DESC LIMIT 20;",
    code: true,
    tags: ["code", "sqlite.org"],
    source: { url: "https://sqlite.org/lang_select.html", title: "SQLite: SELECT", nearbyText: "The LIMIT clause places an upper bound on the number of rows returned." },
  }),
  clip("8", 26 * H, {
    content: "The best interface is the one you don't notice until you need it.",
    tags: ["quote"],
    source: { url: "https://x.com/designnotes/status/1", title: "Design notes on X", nearbyText: "" },
  }),
  clip("9", 2 * D, {
    content: "Meeting notes {{date}} — {{title}}",
    template: true,
    tags: ["template"],
    source: {},
  }),
  clip("10", 3 * D, {
    kind: "link",
    content: "https://developer.chrome.com/docs/extensions/reference/api/sidePanel",
    tags: ["url", "developer.chrome.com"],
    source: { url: "https://developer.chrome.com/docs/extensions", title: "Chrome Extensions docs", nearbyText: "" },
  }),
];

// --- Rendering -------------------------------------------------------------

type Kind = "all" | "text" | "image" | "link";

const state = { kind: "all" as Kind, active: 0, results: [] as DemoClip[], detail: null as DemoClip | null };

function rowHtml(c: DemoClip, i: number): string {
  const host = hostOf(c.source.url);
  const mono = host ? hostMonogram(host) : null;
  const badge = c.template
    ? `<span class="badge accent">T</span>`
    : c.code
      ? `<span class="badge">{}</span>`
      : c.kind === "link"
        ? `<span class="badge">↗</span>`
        : "";
  const tile = mono
    ? `<span class="tile" style="--hue:${mono.hue}">${escapeHtml(mono.letter)}${badge}</span>`
    : `<span class="tile plain">✎${badge}</span>`;
  const src = [host, c.source.title].filter(Boolean).join(" · ") || "Added manually";
  const hits = c.hitCount > 1 ? ` · ×${c.hitCount}` : "";
  const tags = c.tags.filter((t) => !isRedundantRowTag(t, host)).slice(0, 3);
  return `<li class="row${c.code ? " code" : ""}${i === state.active ? " active" : ""}" data-i="${i}" role="option" aria-selected="${i === state.active}">
    ${tile}
    <span class="body">
      <span class="preview">${escapeHtml(c.preview || c.content)}</span>
      <span class="meta">${c.pinned ? `<span class="pin" title="Pinned">●</span>` : ""}<span class="src">${escapeHtml(src)}</span><span class="when">· ${timeAgo(c.lastSeenAt)}${hits}</span></span>
      ${tags.length ? `<span class="tags">${tags.map((t) => `<span>${escapeHtml(t)}</span>`).join("")}</span>` : ""}
      ${c.note ? `<span class="note">⚠ ${escapeHtml(c.note)}</span>` : ""}
    </span>
  </li>`;
}

function render(): void {
  const input = $<HTMLInputElement>("#demo-search");
  const list = $<HTMLElement>("#demo-list");
  const status = $<HTMLElement>("#demo-status");
  if (!input || !list || !status) return;
  const q = parseQuery(input.value);
  state.results = applyQuery(CLIPS, q, { extraKind: state.kind }) as DemoClip[];
  state.results.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.lastSeenAt - a.lastSeenAt);
  if (state.active >= state.results.length) state.active = Math.max(0, state.results.length - 1);

  if (state.results.length === 0) {
    list.innerHTML = `<li class="empty"><strong>No clips match</strong><span>Try <button type="button" data-op="is:code">is:code</button> or <button type="button" data-op="after:1h">after:1h</button></span></li>`;
  } else {
    list.innerHTML = state.results.map(rowHtml).join("");
  }
  const desc = describeQuery(q);
  const n = state.results.length;
  status.textContent = `${n} clip${n === 1 ? "" : "s"}${desc ? ` · ${desc}` : ""}`;
}

function openDetail(c: DemoClip): void {
  state.detail = c;
  const panel = $<HTMLElement>("#demo-detail");
  if (!panel) return;
  const host = hostOf(c.source.url);
  const nearby = c.source.nearbyText || "";
  const content = escapeHtml(c.content);
  // Highlight where the copied text sat inside its surrounding paragraph.
  const ctx = nearby
    ? escapeHtml(nearby).replace(content, `<mark>${content}</mark>`)
    : "";
  panel.innerHTML = `
    <div class="d-head"><button type="button" class="d-back" aria-label="Back to list">←</button><span>Clip</span></div>
    <pre class="d-body${c.code ? " code" : ""}">${content}</pre>
    <dl class="d-facts">
      <dt>Source</dt><dd>${c.source.url ? `<a href="${escapeHtml(c.source.url)}" target="_blank" rel="noopener">${escapeHtml(host + new URL(c.source.url).pathname)}</a>` : "Added manually"}</dd>
      ${c.source.title ? `<dt>Page</dt><dd>${escapeHtml(c.source.title)}</dd>` : ""}
      <dt>Captured</dt><dd>${timeAgo(c.createdAt)}${c.hitCount > 1 ? ` · copied ${c.hitCount}×` : ""}</dd>
      ${ctx ? `<dt>Context</dt><dd class="ctx">${ctx}</dd>` : ""}
      ${c.note ? `<dt>Note</dt><dd class="note">${escapeHtml(c.note)}</dd>` : ""}
    </dl>
    <div class="d-actions"><button type="button" class="btn primary small" data-copy>Copy</button><button type="button" class="btn small" data-copy-md>Copy as Markdown</button></div>`;
  panel.hidden = false;
  panel.querySelector<HTMLElement>(".d-back")?.focus();
}

function closeDetail(): void {
  const panel = $<HTMLElement>("#demo-detail");
  if (panel) panel.hidden = true;
  state.detail = null;
  $<HTMLInputElement>("#demo-search")?.focus();
}

function asMarkdown(c: DemoClip): string {
  if (c.code) return "```\n" + c.content + "\n```";
  if (c.kind === "link") return `[${c.source.title || c.content}](${c.content})`;
  const cite = c.source.url ? `\n>\n> — [${c.source.title || hostOf(c.source.url)}](${c.source.url})` : "";
  return `> ${c.content}${cite}`;
}

let toastTimer = 0;
function toast(msg: string): void {
  const t = $<HTMLElement>("#demo-toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove("show"), 1600);
}

async function copy(c: DemoClip, markdown = false): Promise<void> {
  const text = markdown ? asMarkdown(c) : c.content;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard access can be denied (insecure context, iframe). The demo
    // still confirms the action; the real extension always has access.
  }
  const host = hostOf(c.source.url);
  toast(`Copied${markdown ? " as Markdown" : ""}${host ? ` · from ${host}` : ""}`);
}

function setQuery(op: string): void {
  const input = $<HTMLInputElement>("#demo-search");
  if (!input) return;
  input.value = op;
  state.active = 0;
  closeDetail();
  render();
  input.focus();
}

function initDemo(): void {
  const input = $<HTMLInputElement>("#demo-search");
  const list = $<HTMLElement>("#demo-list");
  if (!input || !list) return;

  input.addEventListener("input", () => {
    state.active = 0;
    render();
  });
  input.addEventListener("keydown", (e) => {
    const n = state.results.length;
    if (e.key === "ArrowDown" && n) {
      state.active = (state.active + 1) % n;
      render();
      e.preventDefault();
    } else if (e.key === "ArrowUp" && n) {
      state.active = (state.active - 1 + n) % n;
      render();
      e.preventDefault();
    } else if (e.key === "Enter" && n) {
      void copy(state.results[state.active], e.shiftKey);
      e.preventDefault();
    } else if (e.key === "Escape" && input.value) {
      setQuery("");
      e.preventDefault();
    }
    list.querySelector(".row.active")?.scrollIntoView({ block: "nearest" });
  });

  list.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const op = target.closest<HTMLElement>("[data-op]");
    if (op) return setQuery(op.dataset.op || "");
    const row = target.closest<HTMLElement>(".row");
    if (!row) return;
    state.active = Number(row.dataset.i);
    render();
    openDetail(state.results[state.active]);
  });

  document.querySelectorAll<HTMLButtonElement>("#demo-kinds button").forEach((b) => {
    b.addEventListener("click", () => {
      state.kind = (b.dataset.kind as Kind) || "all";
      document.querySelectorAll("#demo-kinds button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      state.active = 0;
      render();
    });
  });

  const detail = $<HTMLElement>("#demo-detail");
  detail?.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest(".d-back")) closeDetail();
    else if (t.closest("[data-copy]") && state.detail) void copy(state.detail);
    else if (t.closest("[data-copy-md]") && state.detail) void copy(state.detail, true);
  });
  detail?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDetail();
  });

  // Operator chips anywhere on the page load into the demo.
  document.querySelectorAll<HTMLElement>("[data-try]").forEach((el) => {
    el.addEventListener("click", () => {
      $("#demo")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
      setQuery(el.dataset.try || "");
    });
  });

  render();
}

// --- Page chrome -----------------------------------------------------------

function initTheme(): void {
  const btn = $<HTMLButtonElement>("#theme-toggle");
  const root = document.documentElement;
  let saved: string | null = null;
  try {
    saved = localStorage.getItem("cc-theme");
  } catch {
    // Storage can be blocked; fall back to the system theme.
  }
  if (saved === "light" || saved === "dark") root.dataset.theme = saved;
  btn?.addEventListener("click", () => {
    const current = root.dataset.theme || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    const next = current === "light" ? "dark" : "light";
    root.dataset.theme = next;
    try {
      localStorage.setItem("cc-theme", next);
    } catch {
      // Not persisted; the toggle still works for this visit.
    }
  });
}

function initCopyButtons(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-copy-text]").forEach((b) => {
    b.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(b.dataset.copyText || "");
        b.classList.add("done");
        setTimeout(() => b.classList.remove("done"), 1200);
      } catch {
        // Leave the command visible for manual copy.
      }
    });
  });
}

function initInstallTabs(): void {
  const tabs = document.querySelectorAll<HTMLButtonElement>("[role=tab]");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute("aria-selected", String(on));
        const panel = document.getElementById(t.getAttribute("aria-controls") || "");
        if (panel) panel.hidden = !on;
      });
    });
  });
  // Pre-select the visitor's browser.
  if (/Firefox\//.test(navigator.userAgent)) {
    document.querySelector<HTMLButtonElement>("#tab-firefox")?.click();
  }
}

initTheme();
initDemo();
initCopyButtons();
initInstallTabs();
